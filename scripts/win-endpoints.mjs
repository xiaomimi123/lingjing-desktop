#!/usr/bin/env node
// 灵境 Win 端点活性测试 —— 启动 npm run electron:dev 后跑
// 用法: node scripts/win-endpoints.mjs
// 退出码: 0 关键端点全活, 1 任意必需端点不通

import http from 'node:http'
import net from 'node:net'

// required: true 时不通就 fail; false 是软失败(只警告)
const targets = [
  { name: 'Vite dev (前端 HMR)', port: 3001, required: true },
  { name: 'Express server (灵境后端)', port: 3000, required: true },
  { name: 'OpenClaw Gateway (WS)', port: 18789, required: true },
  { name: 'Hermes API (OpenAI 兼容)', port: 8642, required: false },
  { name: 'Hermes Web Dashboard', port: 9119, required: false },
]

function pingTcp(port, timeout = 2000) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: '127.0.0.1', port })
    const done = (val) => {
      sock.removeAllListeners()
      sock.destroy()
      resolve(val)
    }
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.setTimeout(timeout, () => done(false))
  })
}

function httpGet(port, path = '/', timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', timeout },
      (res) => {
        res.resume()
        resolve({ status: res.statusCode })
      },
    )
    req.on('error', (e) => resolve({ error: e.message }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ error: 'timeout' })
    })
    req.end()
  })
}

;(async () => {
  console.log('=== 灵境 Win 端点活性测试 ===')
  console.log('(请确保已经 `npm run electron:dev` 跑起来再执行此脚本)\n')

  let pass = 0
  let failHard = 0
  let failSoft = 0

  for (const t of targets) {
    const tcp = await pingTcp(t.port)
    if (!tcp) {
      const tag = t.required ? '\x1b[31mFAIL\x1b[0m' : '\x1b[33mWARN\x1b[0m'
      console.log(`[${tag}] ${t.name} :${t.port}`)
      console.log(`        TCP 不通 (服务没起?)\n`)
      if (t.required) failHard++
      else failSoft++
      continue
    }
    const r = await httpGet(t.port)
    if (r.error) {
      const tag = t.required ? '\x1b[31mFAIL\x1b[0m' : '\x1b[33mWARN\x1b[0m'
      console.log(`[${tag}] ${t.name} :${t.port}`)
      console.log(`        TCP 通,但 HTTP ${r.error}\n`)
      if (t.required) failHard++
      else failSoft++
      continue
    }
    console.log(`[\x1b[32m OK \x1b[0m] ${t.name} :${t.port}`)
    console.log(`        HTTP ${r.status}\n`)
    pass++
  }

  console.log('========')
  console.log(
    `通过 ${pass} / ${pass + failHard + failSoft}` +
      (failSoft > 0 ? ` (${failSoft} 个非必需软失败,可忽略)` : ''),
  )
  process.exit(failHard > 0 ? 1 : 0)
})()
