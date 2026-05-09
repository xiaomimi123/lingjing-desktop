#!/usr/bin/env node
/**
 * 灵境发版前一键冒烟 —— 串起 5 步验证, 任一失败即 exit 步骤号
 *
 * 用法:
 *   npm run smoke:full              (假定 electron:dev 已在跑)
 *   npm run smoke:full -- --boot    (自动 spawn electron:dev + 跑完关掉)
 *   npm run smoke:full -- --skip-chat  (跳真聊天, 不消耗配额)
 *
 * 步骤:
 *   1. env  : 静态环境检查 (Node/CLI/网络) —— scripts/win-smoke.mjs
 *   2. boot : (可选) spawn electron:dev 并等就绪
 *   3. ports: 端口活性 —— scripts/win-endpoints.mjs
 *   4. login: 云端登录闭环 (Jax 账号 .env.test)
 *   5. chat : 真发一条消息 —— playwright tests/chat-send.spec.ts
 *
 * 退出码: 0 全过, 非 0 = 失败步骤号 (1-5)
 */

import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import https from 'node:https'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const args = new Set(process.argv.slice(2))
const BOOT = args.has('--boot')
const SKIP_CHAT = args.has('--skip-chat')

const log = (tag, msg) => console.log(`[${tag}] ${msg}`)
const fail = (step, msg) => {
  console.error(`\n\x1b[31m✗ 步骤 ${step} 失败\x1b[0m: ${msg}`)
  console.error('  发版被阻断. 修好后重跑 npm run smoke:full')
  teardownBoot()
  process.exit(step)
}

function pingTcp(port, timeout = 2000) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: '127.0.0.1', port })
    const done = (v) => { sock.removeAllListeners(); sock.destroy(); resolve(v) }
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.setTimeout(timeout, () => done(false))
  })
}

async function waitFor(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await pingTcp(port, 1500)) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

function runStep(name, cmd, cmdArgs) {
  log('RUN', `${name}: ${cmd} ${cmdArgs.join(' ')}`)
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', cwd: ROOT, shell: true })
  return r.status === 0
}

function loginProbe() {
  return new Promise((resolve) => {
    const u = process.env.LINGJING_TEST_EMAIL
    const p = process.env.LINGJING_TEST_PASSWORD
    if (!u || !p) {
      resolve({ ok: false, detail: '.env.test 缺 LINGJING_TEST_EMAIL/PASSWORD' })
      return
    }
    const body = JSON.stringify({ username: u, password: p })
    const req = https.request(
      {
        hostname: 'api.aitoken.homes',
        path: '/api/user/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Origin: 'http://localhost:3001',
        },
        timeout: 30000,
      },
      (res) => {
        let buf = ''
        res.on('data', (c) => (buf += c))
        res.on('end', () => {
          let j = null
          try { j = JSON.parse(buf) } catch {}
          const cookies = res.headers['set-cookie'] || []
          const hasSession = cookies.some((c) => c.includes('session'))
          if (j?.success && hasSession) {
            resolve({ ok: true, detail: `user=${j.data?.username} role=${j.data?.role}` })
          } else {
            resolve({
              ok: false,
              detail: `status=${res.statusCode} success=${j?.success} message=${j?.message || ''} session=${hasSession}`,
            })
          }
        })
      },
    )
    req.on('error', (e) => resolve({ ok: false, detail: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: 'timeout 30s' }) })
    req.write(body)
    req.end()
  })
}

let bootChild = null
async function bootIfNeeded() {
  const viteUp = await pingTcp(3001)
  const expressUp = await pingTcp(3000)
  if (viteUp && expressUp) {
    log('BOOT', 'electron:dev 已在跑, 复用')
    return
  }
  if (!BOOT) {
    fail(2, `vite:3001=${viteUp ? 'up' : 'down'} express:3000=${expressUp ? 'up' : 'down'}; 请先 npm run electron:dev 或加 --boot`)
  }
  log('BOOT', 'spawn npm run electron:dev')
  bootChild = spawn('npm', ['run', 'electron:dev'], {
    cwd: ROOT, shell: true, detached: false, stdio: 'ignore',
  })
  log('BOOT', '等 vite:3001 (90s) ...')
  const ok3001 = await waitFor(3001, 90_000)
  log('BOOT', `vite:3001 = ${ok3001 ? 'up' : 'down'}; 等 express:3000 (30s) ...`)
  const ok3000 = await waitFor(3000, 30_000)
  if (!ok3001 || !ok3000) {
    fail(2, `boot 超时 vite:3001=${ok3001} express:3000=${ok3000}`)
  }
  // OpenClaw Gateway 仅在跑真聊天时强制要求 (daemon 冷启可达 60-120s, 见 main.js 注释).
  // --skip-chat 时让 gateway 异步起,不阻断脚手架其余验证.
  if (!SKIP_CHAT) {
    log('BOOT', '等 OpenClaw Gateway :18789 (180s, daemon 冷启 60-120s) ...')
    const ok18789 = await waitFor(18789, 180_000)
    if (!ok18789) fail(2, 'OpenClaw Gateway :18789 超时 180s 未就绪; 查 main.log/openclaw.log 看 daemon 状态')
    log('BOOT', `gateway:18789 = up`)
  } else {
    log('BOOT', '跳 :18789 检查 (--skip-chat)')
  }
  log('BOOT', '就绪')
}

function teardownBoot() {
  if (!bootChild) return
  log('BOOT', '关闭 electron:dev (pid ' + bootChild.pid + ')')
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(bootChild.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
    } else {
      process.kill(-bootChild.pid, 'SIGTERM')
    }
  } catch {}
  bootChild = null
}

process.on('SIGINT', () => { teardownBoot(); process.exit(130) })
process.on('SIGTERM', () => { teardownBoot(); process.exit(143) })

;(async () => {
  console.log('\n=== 灵境发版前冒烟测试 ===')
  console.log(`  BOOT=${BOOT} SKIP_CHAT=${SKIP_CHAT}\n`)
  const t0 = Date.now()

  log('1/5', '环境检查 win-smoke.mjs')
  if (!runStep('env', 'node', ['scripts/win-smoke.mjs'])) fail(1, '环境检查未过, 看上面输出修好再来')

  log('2/5', '检查/启动 electron:dev')
  await bootIfNeeded()

  try {
    log('3/5', '端口活性 win-endpoints.mjs')
    if (!runStep('ports', 'node', ['scripts/win-endpoints.mjs'])) fail(3, '关键端口未通')

    log('4/5', '云端登录闭环')
    const r = await loginProbe()
    if (!r.ok) fail(4, r.detail)
    log('login', 'PASS  ' + r.detail)

    if (SKIP_CHAT) {
      log('5/5', 'SKIP (--skip-chat)')
    } else {
      log('5/5', 'Playwright chat-send.spec.ts (真发 1 条消息)')
      const ok = runStep('chat', 'node', [
        '--env-file-if-exists=.env.test',
        './node_modules/.bin/playwright',
        'test',
        'tests/chat-send.spec.ts',
        '--reporter=list',
      ])
      if (!ok) fail(5, '聊天 e2e 失败, 看上面 Playwright 输出')
    }

    const dt = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`\n\x1b[32m✓ 全部通过\x1b[0m  耗时 ${dt}s`)
  } finally {
    if (BOOT) teardownBoot()
  }
})().catch((e) => {
  console.error('UNCAUGHT:', e)
  teardownBoot()
  process.exit(99)
})
