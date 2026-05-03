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

add('OpenClaw CLI 已安装', () => {
  const candidates = [
    join(APPDATA, 'npm', 'openclaw.cmd'),
    join(APPDATA, 'npm', 'openclaw.exe'),
  ]
  const found = candidates.find(existsSync)
  return found
    ? { ok: true, detail: found }
    : { ok: false, detail: `未找到; 请运行 npm i -g openclaw@latest` }
})

add('OpenClaw --version 可执行', () => {
  try {
    const out = execSync('openclaw --version', {
      encoding: 'utf8',
      timeout: 10000,
      shell: true,
    }).trim()
    return {
      ok: out.toLowerCase().includes('openclaw'),
      detail: out.split('\n').pop(),
    }
  } catch (e) {
    return { ok: false, detail: e.message }
  }
})

add('Hermes CLI 已安装', () => {
  const candidates = [
    join(LOCALAPPDATA, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
    join(home, 'hermes-agent', '.venv', 'Scripts', 'hermes.exe'),
  ]
  const found = candidates.find(existsSync)
  return found
    ? { ok: true, detail: found }
    : {
        ok: false,
        detail:
          '未找到; 请运行: irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex',
      }
})

add('Hermes --version 可执行', () => {
  const bin = join(LOCALAPPDATA, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe')
  if (!existsSync(bin)) return { ok: false, detail: '二进制不存在,跳过' }
  try {
    const out = execSync(`"${bin}" --version`, { encoding: 'utf8', timeout: 10000 }).trim()
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
