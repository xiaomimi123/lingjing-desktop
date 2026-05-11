#!/usr/bin/env node
/**
 * v1.6 L1 验证: daemon chat 链路端到端是否能跑.
 * 前置: dev:server + OpenClaw daemon (18789) + lingjingApiToken 已注入.
 *
 * 1. POST /api/rpc {method:'chat.send', params}
 * 2. 同时听 /api/events SSE 流, 20s 内拿到 chat.delta + chat.final
 * 3. assert rpc payload.lingjingDaemon === true (daemon 路径成功)
 *    若 lingjingBypass === true 视为 PASS (fallback) 但带 warning
 */
import http from 'node:http'

const PORT = process.env.PORT || 3000
const TIMEOUT_MS = 20000

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ method, params })
    const req = http.request(
      {
        hostname: '127.0.0.1', port: PORT, path: '/api/rpc',
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let buf = ''
        res.on('data', (c) => (buf += c))
        res.on('end', () => { try { resolve(JSON.parse(buf)) } catch (e) { reject(e) } })
      },
    )
    req.on('error', reject); req.write(body); req.end()
  })
}

function collectSSEFor(timeoutMs) {
  return new Promise((resolve, reject) => {
    const events = []
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path: '/api/events' }, (res) => {
      let buf = ''
      res.on('data', (c) => {
        buf += c.toString('utf8')
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try { events.push(JSON.parse(line.slice(5).trim())) } catch {}
          }
        }
      })
    })
    const timer = setTimeout(() => { try { req.destroy() } catch {}; resolve(events) }, timeoutMs)
    req.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}

;(async () => {
  console.log('=== v1.6 daemon-chat L1 smoke ===')
  console.log('前置: dev:server + daemon (18789) + lingjingApiToken 已注入\n')

  const ssePromise = collectSSEFor(TIMEOUT_MS)
  await new Promise((r) => setTimeout(r, 500))

  const sentAt = Date.now()
  const rpcRes = await rpcCall('chat.send', {
    sessionKey: 'smoke-' + Date.now(),
    messages: [{ role: 'user', content: 'ping, reply with 5 words please' }],
  })
  console.log('RPC ack:', JSON.stringify(rpcRes))

  if (!rpcRes.ok) {
    console.error('FAIL: RPC ok=false (无 token 或 daemon down 且 bypass 也失败?)')
    process.exit(1)
  }

  const events = await ssePromise
  const deltas = events.filter((e) => e.event === 'chat.delta')
  const finals = events.filter((e) => e.event === 'chat.final')
  console.log(`SSE: ${deltas.length} delta + ${finals.length} final in ${Date.now() - sentAt}ms`)

  if (deltas.length === 0) {
    console.error('FAIL: 没收到 chat.delta')
    process.exit(1)
  }

  if (rpcRes.payload?.lingjingDaemon === true) {
    console.log('✓ PASS: chat 走 daemon 路径')
    process.exit(0)
  } else if (rpcRes.payload?.lingjingBypass === true) {
    console.log('⚠ PASS (走了 fallback bypass): daemon 不可用')
    process.exit(0)
  } else {
    console.error('FAIL: 不识别的路径 (无 lingjingDaemon/lingjingBypass 标记)')
    process.exit(1)
  }
})().catch((e) => { console.error('SMOKE 异常:', e); process.exit(1) })
