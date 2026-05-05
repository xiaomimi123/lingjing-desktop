import { app, BrowserWindow, Menu, ipcMain, net as electronNet, session, shell } from 'electron'
import electronUpdaterPkg from 'electron-updater'
const { autoUpdater } = electronUpdaterPkg
import path from 'node:path'
import net from 'node:net'
import os from 'node:os'
import { promises as fs, accessSync, readdirSync, createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as paths from './paths.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const VITE_DEV_HOST = '127.0.0.1'
const VITE_DEV_PORT = Number(process.env.DEV_PORT || 3001)
const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = Number(process.env.PORT || 3000)
const VITE_DEV_URL = `http://${VITE_DEV_HOST}:${VITE_DEV_PORT}`

let welcomeWindow = null
let mainWindow = null
let backendProcess = null

// 启动日志:packaged 模式下 console.log 看不见,统一写到 userData/logs/。
// 任何启动问题都能让用户把这两个文件发我定位。
let mainLogStream = null
let backendLogStream = null
function getLogPaths() {
  const dir = path.join(paths.userData, 'logs')
  return {
    dir,
    main: path.join(dir, 'main.log'),
    backend: path.join(dir, 'backend.log'),
  }
}
function logMain(line) {
  const stamped = `[${new Date().toISOString()}] ${line}\n`
  console.log(line)
  try {
    mainLogStream?.write(stamped)
  } catch {
    // ignore
  }
}
function initLogStreams() {
  try {
    const lp = getLogPaths()
    mkdirSync(lp.dir, { recursive: true })
    // 'a' append; 用截断 'w' 让每次启动一个干净 log,便于诊断
    mainLogStream = createWriteStream(lp.main, { flags: 'w' })
    backendLogStream = createWriteStream(lp.backend, { flags: 'w' })
    logMain(`==== Lingjing main 启动 ${app.getVersion?.() || '?'} pid=${process.pid} ====`)
    logMain(`paths: ${JSON.stringify(paths.debugDump(), null, 2)}`)
  } catch (e) {
    console.warn('[main] 初始化日志失败:', e?.message || e)
  }
}

/**
 * 找一个能跑 server/index.js 的 node 二进制。
 * 项目里 better-sqlite3 是按 Node 20 编译的(NODE_MODULE_VERSION 115),
 * 所以优先 nvm v20.x;次选 brew Node(用户已装 Node 25,起来后会 ABI 不匹配 → 报错可见)。
 */
function findNodeBin() {
  const candidates = []
  // nvm Node 20.x 全部子版本
  try {
    const nvmRoot = path.join(os.homedir(), '.nvm', 'versions', 'node')
    const dirs = readdirSync(nvmRoot).filter((n) => n.startsWith('v20.'))
    for (const d of dirs) candidates.push(path.join(nvmRoot, d, 'bin', 'node'))
  } catch {
    // 没装 nvm,继续
  }
  candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node')
  for (const c of candidates) {
    try {
      accessSync(c)
      return c
    } catch {
      // 跳到下一个
    }
  }
  return 'node' // 寄望 PATH 能解到
}

async function startBackend() {
  if (backendProcess) return
  // 先把所有可写目录建出来(packaged 时 resources 是只读,数据必须落 userData)
  paths.ensureWritableDirs()
  const projectRoot = paths.projectRoot
  const serverScript = paths.serverScript

  // Win 上直接用 Electron 自己的 Node 跑 server(避免 ABI 不匹配 + 不依赖系统 Node)。
  // mac 保留原行为(找 nvm v20.x),因为作者机器上有完整 brew/nvm 工具链。
  let nodeBin
  let extraEnv
  if (isWin) {
    nodeBin = process.execPath
    extraEnv = { ELECTRON_RUN_AS_NODE: '1' }
  } else {
    nodeBin = findNodeBin()
    extraEnv = {}
  }
  console.log('[main] 启动后端:', nodeBin, serverScript)
  console.log('[main] 路径配置:', paths.debugDump())

  backendProcess = spawn(nodeBin, [serverScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...extraEnv,
      PORT: String(BACKEND_PORT),
      NODE_ENV: isDev ? 'development' : 'production',
      // 把打包后的真实路径喂给 server,让它别再 __dirname/.. 拼到 asar 里
      LINGJING_DB_PATH: paths.dbPath,
      LINGJING_DATA_DIR: paths.dataDir,
      LINGJING_BACKUP_DIR: paths.backupDir,
      LINGJING_MEDIA_DIR: paths.mediaDir,
      LINGJING_RESOURCES_DIR: paths.resourcesDir,
      LINGJING_USER_DATA: paths.userData,
      LINGJING_HERMES_EXE: paths.hermesExe,
      LINGJING_HERMES_VENV: paths.hermesVenvUser,
      LINGJING_PYTHON_BASE: paths.pythonBaseDir,
      // packaged 时 server 在 app.asar.unpacked 下,看不到 asar 内的 package.json
      // (ELECTRON_RUN_AS_NODE 不认 asar);这里直接喂版本号
      LINGJING_APP_VERSION: app.getVersion(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  backendProcess.stdout?.on('data', (d) => {
    process.stdout.write(`[backend] ${d}`)
    try { backendLogStream?.write(d) } catch {}
  })
  backendProcess.stderr?.on('data', (d) => {
    process.stderr.write(`[backend!] ${d}`)
    try { backendLogStream?.write(`[STDERR] ${d}`) } catch {}
  })
  backendProcess.on('error', (err) => {
    logMain(`[main] 后端 spawn 错误: ${err?.message || err}`)
  })
  backendProcess.on('exit', (code, signal) => {
    logMain(`[main] 后端退出 code=${code} signal=${signal}`)
    backendProcess = null
  })
  logMain(`[main] backend pid=${backendProcess.pid}`)
}

/**
 * 快速 TCP 探活(无重试,几百毫秒返回)。
 */
function pingTcpQuick(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port })
    let done = false
    const finish = (val) => {
      if (done) return
      done = true
      sock.removeAllListeners()
      sock.destroy()
      resolve(val)
    }
    sock.once('connect', () => finish(true))
    sock.once('error', () => finish(false))
    sock.setTimeout(timeoutMs, () => finish(false))
  })
}

async function findBin(candidates) {
  for (const c of candidates) {
    try {
      await fs.access(c)
      return c
    } catch {
      // 跳过
    }
  }
  return null
}

/**
 * OpenClaw 二进制候选路径(按平台)。
 * 打包发行版优先用内嵌 resources/openclaw/ 下的副本(零配置体验);
 * dev / mac 走系统装的版本。
 */
function openclawCandidates() {
  const home = os.homedir()
  // 打包后:resources/openclaw/openclaw.mjs,用 Electron 自带 Node 跑
  // (ELECTRON_RUN_AS_NODE in spawn options)。注意是 .mjs 不是 dist/index.js!
  if (isWin && app.isPackaged) {
    return [paths.openclawEmbeddedJs]
  }
  if (isWin) {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    return [
      path.join(appdata, 'npm', 'openclaw.cmd'),
      path.join(appdata, 'npm', 'openclaw.exe'),
      'C:\\Program Files\\nodejs\\openclaw.cmd',
    ]
  }
  return [
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
    path.join(home, '.local', 'bin', 'openclaw'),
  ]
}

/**
 * Hermes 二进制候选路径。
 * 打包发行版优先用内嵌 resources/hermes/venv/Scripts/hermes.exe;
 * dev 走 NousResearch/hermes-agent 的 install.ps1 默认路径。
 */
function hermesCandidates() {
  const home = os.homedir()
  // 打包后:userData/hermes-venv/Scripts/hermes.exe(由 ensureHermesVenvCopy 首启拷贝)
  // 注:resources/hermes/venv 是只读模板,不能直接跑;运行时 venv 一定要在 userData 下
  if (isWin && app.isPackaged) {
    return [paths.hermesExe]
  }
  if (isWin) {
    const localappdata = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    return [
      path.join(localappdata, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
      path.join(appdata, 'npm', 'hermes.cmd'),
      path.join(appdata, 'npm', 'hermes.exe'),
      path.join(home, 'hermes-agent', '.venv', 'Scripts', 'hermes.exe'),
    ]
  }
  return [
    path.join(home, '.local', 'bin', 'hermes'),
    '/opt/homebrew/bin/hermes',
    '/usr/local/bin/hermes',
  ]
}

/**
 * OpenClaw Gateway:已起就跳过;没起调 `openclaw gateway start`(launchd 守护)。
 */
async function ensureOpenClawRunning() {
  if (await pingTcpQuick('127.0.0.1', 18789)) {
    logMain('[main] OpenClaw Gateway 已在跑(18789)')
    return { status: 'already-running', port: 18789 }
  }
  const bin = await findBin(openclawCandidates())
  if (!bin) {
    logMain('[main] OpenClaw CLI 未找到,跳过启动')
    return { status: 'skipped', message: 'openclaw CLI not installed' }
  }
  // 关键:`openclaw gateway start` 在 Win 上注册成 Scheduled Task,命令本身长期不退出,
  // 不能用 runCommand(它等子进程结束 → 永远等到 timeout 杀进程 → daemon 也死了)。
  // 改用 detached spawn + unref:让 daemon 独立活下去,父进程立刻继续轮询 18789。
  logMain(`[main] spawn OpenClaw Gateway (detached): ${bin} gateway start`)
  try {
    const args = bin.endsWith('.mjs') || bin.endsWith('.js') || bin.endsWith('.cjs')
      ? [bin, 'gateway', 'start']
      : ['gateway', 'start']
    const cmd = bin.endsWith('.mjs') || bin.endsWith('.js') || bin.endsWith('.cjs')
      ? process.execPath
      : bin
    const proc = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      shell: false,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        CLAWHUB_URL: 'https://cn.clawhub-mirror.com',
        // OpenRouter/LiteLLM pricing fetch 在国内会超时 15s × 2 = 30s 干等。关掉。
        OPENCLAW_DISABLE_REMOTE_PRICING: '1',
        OPENCLAW_SKIP_PRICING_FETCH: '1',
        // OpenClaw 部分加载流程会试图访问外网 npm registry 等,加镜像
        npm_config_registry: 'https://registry.npmmirror.com',
      },
    })
    proc.unref()
    logMain(`[main] spawn pid=${proc.pid}`)
  } catch (err) {
    logMain(`[main] spawn 失败: ${err?.message || err}`)
    return { status: 'error', message: String(err?.message || err) }
  }

  // 轮询 18789 最多 75s。OpenClaw 自己 startup-grace=60s,加上插件加载、
  // 国内网络可能慢,留 75s 余量,只在第一次启动等这么久,后续 daemon 已 LISTENING 立刻返回。
  logMain('[main] 等 18789 就绪 (最多 75s)...')
  try {
    await pingTcp('127.0.0.1', 18789, { timeoutMs: 75000, intervalMs: 500 })
    logMain('[main] OpenClaw Gateway 起来了 ✓')
    return { status: 'started', port: 18789 }
  } catch {
    logMain('[main] 18789 75s 还没就绪,前端可点重试或继续等')
    return { status: 'started-but-not-listening', message: '启动命令成功,但 18789 没就绪' }
  }
}

/**
 * Hermes Gateway:同 OpenClaw,优先 launchd 守护(`hermes gateway start`)。
 */
async function ensureHermesRunning() {
  if (await pingTcpQuick('127.0.0.1', 8642)) {
    return { status: 'already-running', port: 8642 }
  }
  // Win 上 `hermes gateway` 是 Messaging Gateway(Telegram/Discord),不是 8642 API。
  // server/hermes-proxy.js 会在收到首次请求时调 `hermes dashboard` 按需拉起,这里跳过。
  if (isWin) {
    return { status: 'lazy-start', message: 'Win 上 Hermes Dashboard 由 server 按需拉起,主进程跳过' }
  }
  const bin = await findBin(hermesCandidates())
  if (!bin) {
    return { status: 'skipped', message: 'hermes CLI not installed' }
  }
  console.log('[main] 启动 Hermes Gateway:', bin, 'gateway start')
  const r = await runCommand(bin, ['gateway', 'start'], { timeout: 20000 })
  if (r.code !== 0) {
    return {
      status: 'error',
      message: `hermes gateway start exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 300)}`,
    }
  }
  try {
    await pingTcp('127.0.0.1', 8642, { timeoutMs: 15000 })
    return { status: 'started', port: 8642 }
  } catch {
    return { status: 'started-but-not-listening', message: '启动命令成功,但 8642 没就绪' }
  }
}

function stopBackend() {
  if (!backendProcess) return
  console.log('[main] 杀后端 pid=', backendProcess.pid)
  try {
    backendProcess.kill('SIGTERM')
  } catch (e) {
    console.warn('[main] 后端 SIGTERM 失败:', e.message)
  }
  // 兜底:2s 后还活着就 SIGKILL
  const stale = backendProcess
  setTimeout(() => {
    if (stale && !stale.killed) {
      try {
        stale.kill('SIGKILL')
      } catch {
        // ignore
      }
    }
  }, 2000)
  backendProcess = null
}

function pingTcp(host, port, { timeoutMs = 30000, intervalMs = 250 } = {}) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect({ host, port })
      const cleanup = () => {
        sock.removeAllListeners()
        sock.destroy()
      }
      sock.once('connect', () => {
        cleanup()
        resolve()
      })
      sock.once('error', () => {
        cleanup()
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${host}:${port}`))
        } else {
          setTimeout(tryOnce, intervalMs)
        }
      })
      sock.setTimeout(2000, () => {
        cleanup()
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${host}:${port}`))
        } else {
          setTimeout(tryOnce, intervalMs)
        }
      })
    }
    tryOnce()
  })
}

function createWelcomeWindow() {
  welcomeWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#FFFFFF',
    ...(isMac ? { vibrancy: 'under-window' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  welcomeWindow.once('ready-to-show', () => welcomeWindow?.show())
  welcomeWindow.on('closed', () => {
    welcomeWindow = null
  })

  // 不依赖 vue:dev / packaged 都加载独立 loading.html(纯 inline css/js,秒开)
  welcomeWindow.loadFile(path.join(__dirname, 'loading.html'))
}

// 把启动阶段文案推给 welcomeWindow 的加载动画
function sendLoadingStage(text) {
  console.log('[main]', text)
  try {
    welcomeWindow?.webContents?.send('lingjing:loading-stage', text)
  } catch {
    // welcomeWindow 已关或没起来,忽略
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    // 默认 1280x700:height 刚好等于 sidebar 自然高度,首次开窗零留白。
    // 不再锁 maxHeight —— 否则会阻止"最大化"按钮、全屏模式、宽屏模式。
    // 用户主动拉大窗口接受底部留白即可,默认状态无问题。
    width: 1280,
    height: 700,
    minWidth: 1024,
    minHeight: 620,
    show: false,
    backgroundColor: '#FFFFFF',
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : { frame: true }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.close()
    }
    // rc3 临时:packaged 也开 DevTools,便于诊断白屏/资源 404 问题(下版稳定后用 LINGJING_DEVTOOLS env 控)
    if (isDev || process.env.LINGJING_DEVTOOLS !== '0') {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ============================================================================
// 自动配置本地 Gateway Provider —— 让 OpenClaw / Hermes 走 aitoken.homes
// ============================================================================

function runCommand(cmd, args, opts = {}) {
  // 给子进程一个干净的 PATH,优先 brew 的 Node(>= v22.12,满足 OpenClaw 4.21
  // 要求);Electron 自身跑在 nvm Node 20 上,直接继承会导致 openclaw 拒启动。
  const platformPaths = isWin
    ? [
        path.join(process.env.LOCALAPPDATA || '', 'openclaw', 'bin'),
        path.join(os.homedir(), '.local', 'bin'),
        'C:\\Program Files\\nodejs',
      ]
    : [
        '/opt/homebrew/bin',       // brew node、openclaw、hermes 都在这
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/opt/homebrew/sbin',
        `${os.homedir()}/.local/bin`, // hermes symlink
      ]
  const childEnv = {
    // 默认走 OpenClaw 官方中国镜像,加速 skills search/install。
    // user 可以在 OS 或 .env 里设 CLAWHUB_URL override(包括设空字符串回退到 clawhub.ai)。
    CLAWHUB_URL: 'https://cn.clawhub-mirror.com',
    ...process.env,
    ...(opts.env || {}),
    PATH: [...platformPaths, process.env.PATH || ''].filter(Boolean).join(path.delimiter),
  }
  // packaged 模式下 cmd 可能是 .js / .mjs(内嵌 OpenClaw 入口),OS 不知道怎么跑;
  // 改用 Electron 自带 Node + ELECTRON_RUN_AS_NODE 跑它。shell 模式也要关掉(.exe + .js arg cmd 解析不准)。
  const isJsEntry = cmd.endsWith('.js') || cmd.endsWith('.mjs') || cmd.endsWith('.cjs')
  let useShell = isWin && !isJsEntry
  if (isJsEntry) {
    args = [cmd, ...args]
    cmd = process.execPath
    childEnv.ELECTRON_RUN_AS_NODE = '1'
    useShell = false
  }
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: useShell, ...opts, env: childEnv })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d) => (stdout += d.toString()))
    proc.stderr?.on('data', (d) => (stderr += d.toString()))
    proc.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr + err.message }))
    proc.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

async function configureOpenClaw(token, baseUrl, modelId, providerId = 'lingjing', compat = 'openai') {
  const bin = await findBin(openclawCandidates())
  if (!bin) {
    return { status: 'skipped', message: 'openclaw CLI not found in common paths' }
  }

  const args = [
    'onboard',
    '--non-interactive',     // 关键!没这个 flag 会停在交互菜单
    '--flow', 'quickstart',
    '--mode', 'local',
    '--auth-choice', 'custom-api-key',
    '--custom-api-key', token,
    '--custom-base-url', baseUrl,
    '--custom-compatibility', compat,
    '--custom-provider-id', providerId,
    '--custom-model-id', modelId || 'gpt-5.4',
    '--accept-risk',
    '--gateway-bind', 'loopback',
    '--no-install-daemon',   // gateway 已经装好了,不重装
  ]

  console.log('[lingjing-cfg] running:', bin, args.map((a, i) => (args[i - 1] === '--custom-api-key' ? '<TOKEN>' : a)).join(' '))

  const r = await runCommand(bin, args, { timeout: 90000 })
  console.log('[lingjing-cfg] openclaw onboard exit code:', r.code)
  if (r.stdout) console.log('[lingjing-cfg] stdout:', r.stdout.slice(0, 800))
  if (r.stderr) console.log('[lingjing-cfg] stderr:', r.stderr.slice(0, 800))

  if (r.code !== 0) {
    return {
      status: 'error',
      message: `onboard exit ${r.code}: ${(r.stderr || r.stdout || '<empty>').slice(0, 400)}`,
    }
  }

  // 重启 Gateway 让新配置生效。launchctl 是 mac 专属;其他平台用 openclaw gateway restart 兜底。
  if (isMac) {
    const uid = process.getuid?.() ?? 501
    const restartResult = await runCommand('launchctl', ['kickstart', '-k', `gui/${uid}/ai.openclaw.gateway`])
    console.log('[lingjing-cfg] gateway restart exit:', restartResult.code, restartResult.stderr || '')
  } else {
    const restartResult = await runCommand(bin, ['gateway', 'restart'], { timeout: 20000 })
    console.log('[lingjing-cfg] gateway restart exit:', restartResult.code, restartResult.stderr || '')
  }

  return { status: 'ok', stdout: r.stdout?.slice(-200) }
}

async function configureHermes(token, baseUrl, modelId) {
  // 两个事必须同时做才能让 Hermes 真正用灵境:
  // 1. ~/.hermes/.env 写 OPENROUTER_API_KEY = 灵境 sk-token (Hermes 读这个 env)
  //    注:OPENROUTER_BASE_URL 这个 env Hermes 不读!hermes_constants.py 里
  //    OPENROUTER_BASE_URL 是硬编码常量 'https://openrouter.ai/api/v1'。
  // 2. ~/.hermes/config.yaml 改 model.base_url = 灵境 v1 + model.default = 灵境
  //    model id(走 Dashboard PUT /api/config 而不是直接改文件,Hermes 自己
  //    保证写入 + reload 一致性)。
  const envPath = path.join(os.homedir(), '.hermes', '.env')
  let content = ''
  try {
    content = await fs.readFile(envPath, 'utf-8')
  } catch {
    return { status: 'skipped', message: '~/.hermes/.env not found, skip Hermes config' }
  }

  const setLine = (text, key, value) => {
    const re = new RegExp(`^[#\\s]*${key}\\s*=.*$`, 'm')
    if (re.test(text)) return text.replace(re, `${key}=${value}`)
    return text + `\n${key}=${value}`
  }

  // .env:写 OPENROUTER_API_KEY(BASE_URL 留着但不起作用,无害)
  let updated = content
  updated = setLine(updated, 'OPENROUTER_API_KEY', token)
  updated = setLine(updated, 'OPENROUTER_BASE_URL', baseUrl)
  if (updated !== content) {
    await fs.writeFile(envPath, updated, 'utf-8')
  }

  // config.yaml:通过 Dashboard PUT API 改 model.base_url
  // 选 model id 时优先 caller 传入,否则用 gpt-5.4(灵境的 Anthropic 模型在
  // 订阅政策下会被 400 拒,GPT/Gemini/DeepSeek 没限制)。
  const safeModel = modelId || 'gpt-5.4'
  try {
    const dashConfig = {
      model: { default: safeModel, provider: 'auto', base_url: baseUrl },
    }
    // 通过 hermes 桌面后端的 /api/hermes/config 代理,带上 cookie
    const fetchFn = (await import('node:http')).request
    await new Promise((resolve, reject) => {
      const data = JSON.stringify({ config: dashConfig })
      const req = fetchFn(
        {
          host: '127.0.0.1',
          port: 3000,
          path: '/api/hermes/config',
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        },
        (resp) => {
          let buf = ''
          resp.on('data', (c) => (buf += c.toString()))
          resp.on('end', () => {
            if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) resolve(buf)
            else reject(new Error(`PUT /api/hermes/config -> ${resp.statusCode}: ${buf}`))
          })
        },
      )
      req.on('error', reject)
      req.write(data)
      req.end()
    })
    console.log('[lingjing-cfg] hermes config.yaml updated: model=', safeModel, 'base_url=', baseUrl)
  } catch (err) {
    console.warn('[lingjing-cfg] PUT hermes config failed (non-fatal):', err?.message || err)
  }

  // 重启 Hermes Gateway 让 config.yaml 生效
  const hermesBin = path.join(os.homedir(), '.local', 'bin', 'hermes')
  try {
    await fs.access(hermesBin)
  } catch {
    return { status: 'ok', message: 'env updated; hermes binary not found, manual restart needed' }
  }
  await runCommand(hermesBin, ['gateway', 'restart'], { timeout: 30000 })
  return { status: 'ok' }
}

/**
 * 用 Electron 主进程自身的 net.request 去拉 sk-xxx token,绕过浏览器 CORS 和
 * 跨域 cookie 限制(主进程不受 CORS 约束,可以直接用 Electron session 里的
 * cookie 调 aitoken.homes /api/token/)。
 */
async function fetchLingjingTokenViaMain() {
  const apiBase = 'https://api.aitoken.homes'
  const sess = session.defaultSession

  const cookies = await sess.cookies.get({ domain: '.aitoken.homes' })
  console.log('[lingjing-cfg] cookies on .aitoken.homes:', cookies.map((c) => c.name).join(','))
  const sessionCookie = cookies.find((c) => c.name === 'session_v2')
  if (!sessionCookie) {
    return { ok: false, message: 'session_v2 cookie not found, please re-login' }
  }
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  const requestJson = (path, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = electronNet.request({ method, url: `${apiBase}${path}`, redirect: 'follow' })
    req.setHeader('Cookie', cookieHeader)
    req.setHeader('Content-Type', 'application/json')
    req.setHeader('Accept', 'application/json')
    let buf = ''
    req.on('response', (resp) => {
      resp.on('data', (chunk) => (buf += chunk.toString()))
      resp.on('end', () => {
        try {
          const data = JSON.parse(buf || '{}')
          resolve({ status: resp.statusCode, data })
        } catch (e) {
          resolve({ status: resp.statusCode, data: { raw: buf } })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })

  // 1) 列已有 token,优先复用名为"灵境桌面"的;没有就创建
  const list = await requestJson('/api/token/?p=0&page_size=50&order=created_time')
  console.log('[lingjing-cfg] token list status:', list.status, 'count:', list.data?.data?.length ?? 0)
  if (list.status !== 200 || !list.data?.success) {
    return { ok: false, message: `token list failed: HTTP ${list.status} ${list.data?.message || ''}` }
  }
  const items = list.data.data || []
  const desktop = items.find((t) => t.name === '灵境桌面' && t.status === 1)
  if (desktop?.key) {
    return { ok: true, token: desktop.key, source: 'reused' }
  }
  const anyEnabled = items.find((t) => t.status === 1)
  if (anyEnabled?.key) {
    return { ok: true, token: anyEnabled.key, source: 'reused-other' }
  }

  // 2) 创建新 token
  const create = await requestJson('/api/token/', 'POST', {
    name: '灵境桌面',
    unlimited_quota: true,
    expired_time: -1,
    remain_quota: 500_000,
  })
  console.log('[lingjing-cfg] token create status:', create.status, JSON.stringify(create.data).slice(0, 200))
  if (create.status === 200 && create.data?.success && create.data?.data?.key) {
    return { ok: true, token: create.data.data.key, source: 'created' }
  }
  return { ok: false, message: `token create failed: ${create.data?.message || `HTTP ${create.status}`}` }
}

ipcMain.handle('lingjing:auto-configure-via-main', async (_event, params) => {
  console.log('[lingjing-cfg] auto-configure-via-main called, modelId:', params?.modelId)
  const fetched = await fetchLingjingTokenViaMain().catch((e) => ({ ok: false, message: String(e?.message || e) }))
  if (!fetched.ok) {
    return { token: null, openclaw: 'skipped', message: fetched.message }
  }
  console.log('[lingjing-cfg] got token (suffix):', fetched.token.slice(-8), 'source:', fetched.source)

  const baseUrl = 'https://api.aitoken.homes/v1'
  const modelId = params?.modelId || 'gpt-5.4'
  const oc = await configureOpenClaw(fetched.token, baseUrl, modelId).catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  const hm = await configureHermes(fetched.token, baseUrl, modelId).catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  return {
    tokenSource: fetched.source,
    tokenSuffix: fetched.token.slice(-6),
    openclaw: oc.status,
    openclawMessage: oc.message,
    hermes: hm.status,
    hermesMessage: hm.message,
  }
})

// ============================================================================
// ClawHub 技能商城 —— 用 openclaw skills CLI 查询 + 安装
// ============================================================================

async function findOpenClawBin() {
  return findBin(openclawCandidates())
}

ipcMain.handle('lingjing:skills-search', async (_event, params) => {
  const query = (params?.query && typeof params.query === 'string') ? params.query.trim() : ''
  const limit = Number(params?.limit) > 0 ? Math.min(50, Number(params.limit)) : 20
  const bin = await findOpenClawBin()
  if (!bin) return { ok: false, message: 'openclaw CLI 未找到' }
  const args = ['skills', 'search', '--json', '--limit', String(limit)]
  if (query) args.push(query)
  const r = await runCommand(bin, args, { timeout: 20000 })
  if (r.code !== 0) {
    return { ok: false, message: `openclaw skills search exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 300)}` }
  }
  try {
    const data = JSON.parse(r.stdout || '{}')
    return { ok: true, results: Array.isArray(data?.results) ? data.results : [] }
  } catch (e) {
    return { ok: false, message: `JSON 解析失败:${String(e?.message || e)}` }
  }
})

ipcMain.handle('lingjing:skills-install', async (_event, params) => {
  const slug = params?.slug
  if (!slug || typeof slug !== 'string') return { ok: false, message: 'slug 为空' }
  const force = !!params?.force
  const bin = await findOpenClawBin()
  if (!bin) return { ok: false, message: 'openclaw CLI 未找到' }
  const args = ['skills', 'install', slug]
  if (force) args.push('--force')
  const r = await runCommand(bin, args, { timeout: 120000 })
  if (r.code !== 0) {
    return { ok: false, message: `安装失败:${(r.stderr || r.stdout || `exit ${r.code}`).slice(0, 400)}` }
  }
  return { ok: true, stdout: r.stdout?.slice(-400) || '' }
})

ipcMain.handle('lingjing:skills-info', async (_event, params) => {
  const slug = params?.slug
  if (!slug || typeof slug !== 'string') return { ok: false, message: 'slug 为空' }
  const bin = await findOpenClawBin()
  if (!bin) return { ok: false, message: 'openclaw CLI 未找到' }
  const r = await runCommand(bin, ['skills', 'info', slug], { timeout: 20000 })
  return {
    ok: r.code === 0,
    text: r.stdout || r.stderr || '',
    code: r.code,
  }
})

ipcMain.handle('lingjing:open-external', async (_event, url) => {
  if (typeof url !== 'string') return { ok: false, message: 'invalid url' }
  // 只允许 http/https,防 file:// 攻击
  if (!/^https?:\/\//i.test(url)) return { ok: false, message: 'unsupported scheme' }
  await shell.openExternal(url)
  return { ok: true }
})

ipcMain.handle('lingjing:gateway-status', async () => {
  // UI 侧用来画"后端状态"卡片——三方端口探活
  const [server, openclaw, hermes] = await Promise.all([
    pingTcpQuick('127.0.0.1', BACKEND_PORT),
    pingTcpQuick('127.0.0.1', 18789),
    pingTcpQuick('127.0.0.1', 8642),
  ])
  return {
    backend: { port: BACKEND_PORT, alive: server },
    openclaw: { port: 18789, alive: openclaw },
    hermes: { port: 8642, alive: hermes },
  }
})

ipcMain.handle('lingjing:gateway-restart', async (_event, which) => {
  if (which === 'openclaw') return ensureOpenClawRunning()
  if (which === 'hermes') return ensureHermesRunning()
  return { status: 'error', message: `unknown gateway: ${which}` }
})

ipcMain.handle('lingjing:configure-local-providers', async (_event, params) => {
  const token = params?.token
  const baseUrl = params?.baseUrl || 'https://api.aitoken.homes/v1'
  const modelId = params?.modelId || 'gpt-5.4'
  const providerId = (params?.providerId && typeof params.providerId === 'string') ? params.providerId : 'lingjing'
  const compat = (params?.compat && typeof params.compat === 'string') ? params.compat : 'openai'
  // 用户接自己的 API 时不写 Hermes(避免覆盖灵镜云端,Hermes 仍然走 .env 默认配置)
  const skipHermes = !!params?.skipHermes
  if (!token || typeof token !== 'string') {
    return { openclaw: 'skipped', hermes: 'skipped', message: 'no token provided' }
  }
  const ocPromise = configureOpenClaw(token, baseUrl, modelId, providerId, compat)
    .catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  const hmPromise = skipHermes
    ? Promise.resolve({ status: 'skipped', message: 'skipHermes=true' })
    : configureHermes(token, baseUrl, modelId).catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  const [oc, hm] = await Promise.all([ocPromise, hmPromise])
  return {
    openclaw: oc.status,
    openclawMessage: oc.message,
    hermes: hm.status,
    hermesMessage: hm.message,
  }
})

// ============================================================================
// 自动更新 IPC(electron-updater + GitHub Releases)
// ============================================================================

let updaterEventBound = false

function bindUpdaterEvents() {
  if (updaterEventBound) return
  updaterEventBound = true
  // 不让 updater 自动下载,UI 控制节奏
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  const send = (event, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lingjing:update-event', { event, payload })
    }
  }

  autoUpdater.on('update-available', (info) => send('available', { version: info.version }))
  autoUpdater.on('update-not-available', (info) => send('not-available', { version: info.version }))
  autoUpdater.on('download-progress', (p) => send('progress', { percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond, transferred: p.transferred, total: p.total }))
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info.version }))
  autoUpdater.on('error', (err) => send('error', { message: err?.message || String(err) }))
}

ipcMain.handle('lingjing:check-for-update', async () => {
  if (!app.isPackaged) {
    return { hasUpdate: false, currentVersion: app.getVersion(), latestVersion: app.getVersion(), message: '开发模式不检查更新' }
  }
  bindUpdaterEvents()
  try {
    const r = await autoUpdater.checkForUpdates()
    const latest = r?.updateInfo?.version
    const current = app.getVersion()
    return { hasUpdate: !!latest && latest !== current, currentVersion: current, latestVersion: latest || current }
  } catch (err) {
    return { hasUpdate: false, currentVersion: app.getVersion(), latestVersion: app.getVersion(), error: err?.message || String(err) }
  }
})

ipcMain.handle('lingjing:download-update', async () => {
  if (!app.isPackaged) return { ok: false, message: '开发模式不支持下载' }
  bindUpdaterEvents()
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err?.message || String(err) }
  }
})

ipcMain.handle('lingjing:install-update', () => {
  if (!app.isPackaged) return { ok: false, message: '开发模式不支持安装' }
  // quitAndInstall 会先 quit 当前窗口再装新版,UI 端调完不要再做别的
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return { ok: true }
})

ipcMain.handle('lingjing:app-version', () => app.getVersion())

function buildAppMenu() {
  // Win 上隐藏顶部"编辑/视图/窗口/帮助"系统菜单条 —— 大部分用户用不到,
  // 反而占空间。mac 是全局菜单栏(顶部 apple bar),保留。
  if (isWin) {
    Menu.setApplicationMenu(null)
    return
  }
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac
      ? [
          {
            label: '灵境',
            submenu: [
              { role: 'about', label: '关于灵境' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏灵境' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '显示全部' },
              { type: 'separator' },
              { role: 'quit', label: '退出灵境' },
            ],
          },
        ]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front', label: '全部前置' }]
          : []),
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '访问灵境官网',
          click: () => shell.openExternal('https://aitoken.homes'),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * 打包后:resources/hermes/venv/pyvenv.cfg 的 home 字段是 build-time 的 base
 * Python 路径(我开发机的 uv 目录),用户机器没这个路径会让 venv 无法启动。
 * 首次启动时把 resources/hermes/venv 拷到 userData/hermes-venv,并改写 pyvenv.cfg 的 home
 * 字段指向内嵌 resources/python。
 *
 * 为什么不直接用 resources/hermes/venv:
 *   1) NSIS 安装目录通常只读(Program Files / 自定义路径用户可能也只给读权限),
 *      hermes 启动时它自己要写日志/缓存到 venv 内部,会失败
 *   2) pyvenv.cfg 的 home 字段是在打包机器上生成的(=作者的 Python 路径),
 *      用户机器上路径不同,必须改写,但只读位置改不了
 *
 * 幂等:已拷贝且 pyvenv.cfg home 正确则直接返回,不重复拷
 */
async function ensureHermesVenvCopy() {
  if (!app.isPackaged || !isWin) return
  const tpl = paths.hermesVenvTemplate
  const target = paths.hermesVenvUser
  const cfgPath = path.join(target, 'pyvenv.cfg')
  const desiredHome = paths.pythonBaseDir

  // 1) 已存在且 pyvenv.cfg home 字段正确 → 跳过(常态启动路径,< 50ms)
  try {
    const cfg = await fs.readFile(cfgPath, 'utf-8')
    if (cfg.includes(`home = ${desiredHome}`)) {
      console.log('[main] hermes venv 已就绪于 userData,跳过拷贝')
      return
    }
  } catch {
    // pyvenv.cfg 不存在(首启)或目标目录不存在 → 走拷贝逻辑
  }

  // 2) 模板存在性检查
  try {
    await fs.access(tpl)
  } catch {
    console.warn('[main] resources/hermes/venv 模板不存在,跳过 venv setup')
    return
  }

  // 3) 全量拷贝(首启耗时 5-15 秒,200MB+ 文件)
  console.log('[main] 首启 — 拷贝 hermes venv:', tpl, '→', target)
  const t0 = Date.now()
  try {
    try {
      await fs.rm(target, { recursive: true, force: true })
    } catch {
      // ignore
    }
    await fs.cp(tpl, target, { recursive: true })
    console.log(`[main] hermes venv 拷贝完成,耗时 ${Date.now() - t0}ms`)
  } catch (err) {
    console.error('[main] hermes venv 拷贝失败:', err?.message || err)
    return
  }

  // 4) 改写 pyvenv.cfg home 指向内嵌 base Python(= resources/python)
  try {
    const raw = await fs.readFile(cfgPath, 'utf-8')
    const lines = raw.split(/\r?\n/)
    const next = lines.map((line) => {
      if (line.startsWith('home =') || line.startsWith('home=')) {
        return `home = ${desiredHome}`
      }
      return line
    })
    await fs.writeFile(cfgPath, next.join('\r\n'), 'utf-8')
    console.log('[main] 已改写 pyvenv.cfg home →', desiredHome)
  } catch (err) {
    console.error('[main] 改写 pyvenv.cfg 失败:', err?.message || err)
  }
}

async function bootstrap() {
  // Step -0: 初始化日志(packaged 模式下唯一能拿到 console 的方式)
  paths.ensureWritableDirs()
  initLogStreams()

  // Step 0: 立刻开加载动画窗口,后面所有耗时步骤都通过 sendLoadingStage 推阶段文案
  createWelcomeWindow()
  sendLoadingStage('正在准备运行环境...')

  // Step 0.5: 文件完整性自检——任何缺失立刻在加载页给出明确错误。
  // 注意:asar=true 时是 app.asar 文件,asar=false 时是 app 目录,任一存在即可
  if (app.isPackaged) {
    const appAsar = path.join(process.resourcesPath, 'app.asar')
    const appDir = path.join(process.resourcesPath, 'app')
    const appBundleOk = existsSync(appAsar) || existsSync(appDir)
    const required = [
      ['Lingjing.exe', process.execPath, existsSync(process.execPath)],
      ['app 资源', `${appAsar} 或 ${appDir}`, appBundleOk],
      ['server/index.js', paths.serverScript, existsSync(paths.serverScript)],
      ['openclaw.mjs', paths.openclawEmbeddedJs, existsSync(paths.openclawEmbeddedJs)],
      ['hermes 模板 venv', path.join(paths.hermesVenvTemplate, 'Scripts', 'hermes.exe'),
        existsSync(path.join(paths.hermesVenvTemplate, 'Scripts', 'hermes.exe'))],
      ['python.exe', path.join(paths.pythonBaseDir, 'python.exe'),
        existsSync(path.join(paths.pythonBaseDir, 'python.exe'))],
    ]
    const missing = required.filter(([, , ok]) => !ok)
    if (missing.length > 0) {
      const msg = '安装文件不完整:\n' + missing.map(([n, p]) => `  - ${n}: ${p}`).join('\n')
      logMain(msg)
      sendLoadingStage('启动失败:' + missing.map(([n]) => n).join(', ') + ' 缺失,请重装')
      return
    }
    logMain('[main] 文件完整性自检通过')
  }

  // Step 1: 打包后把 hermes venv 拷到 userData(可写位置)+改写 pyvenv.cfg home
  // 首启 200MB+ 文件,5-15 秒,这是最长的一步
  if (app.isPackaged && isWin) {
    sendLoadingStage('正在解压本地 AI 运行时(首启需要 5-15 秒)...')
  }
  await ensureHermesVenvCopy()

  // Step 2: 并行 ensure OpenClaw / Hermes Gateway 都活着(已起就跳过)
  sendLoadingStage('正在启动 OpenClaw / Hermes 网关...')
  Promise.all([
    ensureOpenClawRunning().catch((e) => ({ status: 'error', message: String(e?.message || e) })),
    ensureHermesRunning().catch((e) => ({ status: 'error', message: String(e?.message || e) })),
  ]).then(([oc, hm]) => {
    console.log('[main] OpenClaw Gateway:', JSON.stringify(oc))
    console.log('[main] Hermes Gateway:', JSON.stringify(hm))
  })

  // Step 3: 自起后端
  sendLoadingStage('正在启动后端服务...')
  await startBackend().catch((e) => console.error('[main] 启动后端失败:', e?.message || e))

  // Step 4: 等 Vite 或本地后端端口就绪
  if (isDev) {
    sendLoadingStage('正在等待 Vite 开发服务器...')
    try {
      await pingTcp(VITE_DEV_HOST, VITE_DEV_PORT, { timeoutMs: 30000 })
    } catch (err) {
      console.error('[main] Vite dev server not reachable:', err.message)
      app.quit()
      return
    }
  }

  // Step 5: 等后端 :3000 起来,再开主窗(welcomeWindow 在 mainWindow ready-to-show 时关闭)
  sendLoadingStage('正在加载用户界面...')
  pingTcp(BACKEND_HOST, BACKEND_PORT, { timeoutMs: 30000 })
    .then(createMainWindow)
    .catch((err) => {
      logMain(`[main] 后端 :${BACKEND_PORT} 没起来: ${err.message}`)
      // 读 backend.log 尾部推给加载页,给用户/开发者看真实错误
      let tail = ''
      try {
        const lp = getLogPaths()
        if (existsSync(lp.backend)) {
          const raw = readFileSync(lp.backend, 'utf-8')
          tail = raw.split('\n').slice(-30).join('\n')
        }
      } catch {
        // ignore
      }
      sendLoadingDiagnostic({
        stage: '后端启动失败',
        message: `后端进程没有在 30 秒内监听 ${BACKEND_HOST}:${BACKEND_PORT}`,
        logTail: tail || '(无 backend.log 输出 — 子进程可能立即崩了)',
        logPath: getLogPaths().backend,
        paths: paths.debugDump(),
      })
      // 不再 fallback 开主窗(开了也是黑屏);loading 页会显示诊断,等用户决定
    })
}

function sendLoadingDiagnostic(payload) {
  logMain(`[diagnostic] ${payload.stage}: ${payload.message}`)
  try {
    welcomeWindow?.webContents?.send('lingjing:loading-diagnostic', payload)
  } catch {
    // ignore
  }
}

app.whenReady().then(() => {
  buildAppMenu()
  return bootstrap()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', stopBackend)
