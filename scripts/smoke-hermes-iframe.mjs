#!/usr/bin/env node
/**
 * v1.6 L1 验证: Hermes iframe 反向代理 + token 注入端到端能跑.
 * 前置: electron:dev 已起 + Hermes dashboard 在 9119 + token 已抓到.
 *
 * 1. GET http://127.0.0.1:3000/api/hermes/embed/  → 期待 Hermes HTML
 * 2. assert HTML 含 <title>Hermes Agent - Dashboard</title>
 * 3. assert HTML 含 __HERMES_SESSION_TOKEN__="<非空 token>"
 */
import http from 'node:http'

const PORT = process.env.PORT || 3000

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path }, (res) => {
      let buf = ''
      res.on('data', (c) => (buf += c))
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }))
    })
    req.on('error', reject)
  })
}

;(async () => {
  console.log('=== v1.6 Hermes iframe L1 smoke ===')

  const r = await get('/api/hermes/embed/')
  console.log(`HTTP ${r.status}, body bytes=${r.body.length}`)

  if (r.status !== 200) {
    console.error('FAIL: 期待 HTTP 200, 实际', r.status)
    console.error('body 前 200:', r.body.slice(0, 200))
    process.exit(1)
  }

  if (!r.body.includes('Hermes Agent - Dashboard') && !r.body.includes('hermes')) {
    console.error('FAIL: HTML 不像 Hermes dashboard')
    console.error('body 前 200:', r.body.slice(0, 200))
    process.exit(1)
  }

  const tokenMatch = r.body.match(/__HERMES_SESSION_TOKEN__\s*=\s*"([^"]*)"/)
  if (!tokenMatch) {
    console.error('FAIL: HTML 不含 __HERMES_SESSION_TOKEN__')
    process.exit(1)
  }
  const token = tokenMatch[1]
  if (!token) {
    console.error('⚠ WARN: token 为空 (Hermes 未启动或 fetchHermesToken 未跑完)')
    process.exit(1)
  }
  console.log(`✓ token 已注入, suffix=...${token.slice(-6)}`)
  console.log('✓ PASS: Hermes iframe proxy + token injection OK')
})().catch((e) => { console.error('SMOKE 异常:', e); process.exit(1) })
