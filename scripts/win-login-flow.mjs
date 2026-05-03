#!/usr/bin/env node
// 灵境 Win 登录闭环测试 —— 真实邮箱密码进登录,验证 cookie 续 session
// 用法: node scripts/win-login-flow.mjs <email> <password>
// 行为:
//   1. POST /api/user/login → 期望 success:true + 收到 set-cookie
//   2. 用拿到的 cookie GET /api/user/self → 期望 success:true + 用户名一致
// 安全: 邮箱/密码仅运行时内存使用,不写文件、不打印密码、不落盘 cookie
// 退出码: 0 闭环 PASS, 1 任意一步失败, 2 用法错

import https from 'node:https'

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('用法: node scripts/win-login-flow.mjs <email> <password>')
  console.error('注: 这只是登录闭环验证,不会持久化 cookie 或写任何文件')
  process.exit(2)
}

const HOST = 'api.aitoken.homes'

function call(path, method, body, cookies) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined
    const headers = {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3001',
    }
    if (data) headers['Content-Length'] = Buffer.byteLength(data)
    if (cookies) headers['Cookie'] = cookies
    const req = https.request(
      { hostname: HOST, path, method, headers, timeout: 30000 },
      (res) => {
        let buf = ''
        res.on('data', (c) => (buf += c))
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(buf)
          } catch {}
          resolve({
            status: res.statusCode,
            body: json || buf,
            setCookie: res.headers['set-cookie'] || [],
          })
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout 30s'))
    })
    if (data) req.write(data)
    req.end()
  })
}

;(async () => {
  console.log(`=== 灵境登录闭环测试 ===`)
  console.log(`邮箱: ${email}\n`)

  // Step 1: 登录
  console.log('[1/2] POST /api/user/login')
  let login
  try {
    login = await call('/api/user/login', 'POST', { username: email, password })
  } catch (e) {
    console.error(`\x1b[31m  网络错: ${e.message}\x1b[0m`)
    process.exit(1)
  }
  if (login.status !== 200 || login.body?.success !== true) {
    console.error(
      `\x1b[31m  登录失败 HTTP ${login.status}: ${login.body?.message || JSON.stringify(login.body)}\x1b[0m`,
    )
    process.exit(1)
  }
  const u = login.body.data
  console.log(
    `\x1b[32m  OK\x1b[0m → 用户: ${u.username} | role: ${u.role} | quota: ${u.quota ?? '?'} | used: ${u.used_quota ?? '?'}`,
  )
  const cookies = login.setCookie.map((c) => c.split(';')[0]).join('; ')
  if (!cookies) {
    console.error(`\x1b[31m  没收到 set-cookie!\x1b[0m`)
    process.exit(1)
  }
  const cookieNames = login.setCookie.map((c) => c.split('=')[0]).join(', ')
  console.log(`     收到 cookie: ${cookieNames}\n`)

  // Step 2: 用 cookie 续 session
  console.log('[2/2] GET /api/user/self (带 cookie)')
  let self
  try {
    self = await call('/api/user/self', 'GET', null, cookies)
  } catch (e) {
    console.error(`\x1b[31m  网络错: ${e.message}\x1b[0m`)
    process.exit(1)
  }
  if (self.status !== 200 || self.body?.success !== true) {
    console.error(
      `\x1b[31m  session 续接失败 HTTP ${self.status}: ${self.body?.message || JSON.stringify(self.body)}\x1b[0m`,
    )
    process.exit(1)
  }
  const u2 = self.body.data
  if (u2.username !== u.username) {
    console.error(`\x1b[31m  用户名不一致! login=${u.username}, self=${u2.username}\x1b[0m`)
    process.exit(1)
  }
  console.log(`\x1b[32m  OK\x1b[0m → session 续接成功,用户名一致 (${u2.username})\n`)

  console.log('========')
  console.log('\x1b[32m登录闭环 PASS\x1b[0m')
  process.exit(0)
})()
