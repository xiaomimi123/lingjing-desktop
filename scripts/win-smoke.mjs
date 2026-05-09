#!/usr/bin/env node
// 灵境 Win 启动前冒烟测试 —— 检查环境/CLI/网络是否齐备
// 用法: node scripts/win-smoke.mjs
// 退出码: 0 全过, 1 任意失败

import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'
import https from 'node:https'

const home = homedir()
const APPDATA = process.env.APPDATA || join(home, 'AppData', 'Roaming')
const LOCALAPPDATA = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')

const checks = []
const add = (name, fn) => checks.push({ name, fn })

add('Node 版本 ≥ 20', () => {
  const v = process.versions.node
  const major = Number(v.split('.')[0])
  return { ok: major >= 20, detail: `node ${v}` }
})

add('运行平台 = win32', () => ({
  ok: process.platform === 'win32',
  detail: process.platform,
}))

// 注: v1.5+ 改 embedded 架构, openclaw/hermes/python 全打包进 resources/, 不依赖全局安装.
// 只检查 "embedded 资源就位"; 用户机器上是否有全局 CLI 已无关紧要.
const RES_ROOT = process.cwd().endsWith('scripts') ? join(process.cwd(), '..', 'resources') : join(process.cwd(), 'resources')

add('embedded OpenClaw 就位 (resources/openclaw/openclaw.mjs)', () => {
  const entry = join(RES_ROOT, 'openclaw', 'openclaw.mjs')
  return existsSync(entry)
    ? { ok: true, detail: entry }
    : { ok: false, detail: `缺 ${entry}; v1.5+ 需 embedded 资源就位` }
})

add('embedded Python 就位 (resources/python/python.exe)', () => {
  const py = join(RES_ROOT, 'python', 'python.exe')
  return existsSync(py)
    ? { ok: true, detail: py }
    : { ok: false, detail: `缺 ${py}; portable Python 没解压` }
})

add('embedded Hermes 就位 (resources/hermes/venv/Scripts/hermes.exe)', () => {
  const bin = join(RES_ROOT, 'hermes', 'venv', 'Scripts', 'hermes.exe')
  return existsSync(bin)
    ? { ok: true, detail: bin }
    : { ok: false, detail: `缺 ${bin}` }
})

add('embedded Hermes --version 可执行 (15s 超时, 冷启可慢)', () => {
  const bin = join(RES_ROOT, 'hermes', 'venv', 'Scripts', 'hermes.exe')
  if (!existsSync(bin)) return { ok: false, detail: '二进制不存在, 跳过' }
  try {
    const out = execSync(`"${bin}" --version`, { encoding: 'utf8', timeout: 15000 }).trim()
    return {
      ok: out.toLowerCase().includes('hermes'),
      detail: out.split('\n')[0],
    }
  } catch (e) {
    return { ok: false, detail: e.message }
  }
})

add('灵境 API (api.aitoken.homes) 可达', () =>
  new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.aitoken.homes',
        path: '/api/status',
        method: 'GET',
        timeout: 15000,
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          const ok = res.statusCode === 200
          try {
            const j = JSON.parse(body)
            resolve({ ok, detail: `HTTP ${res.statusCode}, system=${j?.data?.system_name || '?'}` })
          } catch {
            resolve({ ok, detail: `HTTP ${res.statusCode}` })
          }
        })
      },
    )
    req.on('error', (e) => resolve({ ok: false, detail: e.message }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, detail: 'timeout 15s' })
    })
    req.end()
  }),
)

add('better-sqlite3 二进制就位', () => {
  const root = process.cwd().endsWith('scripts') ? join(process.cwd(), '..') : process.cwd()
  const bin = join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
  return existsSync(bin)
    ? { ok: true, detail: bin }
    : { ok: false, detail: '请运行 npm run rebuild:native' }
})

add('node-pty napi prebuilds 就位', () => {
  const root = process.cwd().endsWith('scripts') ? join(process.cwd(), '..') : process.cwd()
  const dir = join(root, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64')
  return existsSync(join(dir, 'pty.node'))
    ? { ok: true, detail: dir }
    : { ok: false, detail: 'pty.node 不存在' }
})

;(async () => {
  console.log('=== 灵境 Win 启动前冒烟测试 ===\n')
  let pass = 0
  let fail = 0
  for (const { name, fn } of checks) {
    let r
    try {
      r = await fn()
    } catch (e) {
      r = { ok: false, detail: 'EXCEPTION: ' + e.message }
    }
    const tag = r.ok ? '\x1b[32m OK \x1b[0m' : '\x1b[31mFAIL\x1b[0m'
    console.log(`[${tag}] ${name}`)
    console.log(`        ${r.detail}\n`)
    if (r.ok) pass++
    else fail++
  }
  console.log('========')
  console.log(`通过 ${pass} / ${pass + fail}`)
  process.exit(fail > 0 ? 1 : 0)
})()
