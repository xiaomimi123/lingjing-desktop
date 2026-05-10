import { app, BrowserWindow, Menu, ipcMain, net as electronNet, session, shell } from 'electron'
import electronUpdaterPkg from 'electron-updater'
const { autoUpdater } = electronUpdaterPkg
import path from 'node:path'
import net from 'node:net'
import os from 'node:os'
import { promises as fs, accessSync, readdirSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
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

// v1.4 诊断契约: 启动期每个关键步骤记一条结构化 assertion,
// 给 lingjing:diagnose-full IPC 暴露给前端诊断页 + 错误日志面板。
// 内存数组,生命周期 = 主进程,关 app 重启清空。
const startupAssertions = []
function recordAssertion(step, payload = {}) {
  const entry = { step, ts: new Date().toISOString(), ...payload }
  startupAssertions.push(entry)
  // 镜像写 main.log 一行,人眼也能看
  const flat = Object.entries(payload).map(([k, v]) =>
    `${k}=${typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '...' : JSON.stringify(v)}`
  ).join(' ')
  logMain(`[assertion] step=${step} ${flat}`)
}

// OpenClaw 端口探测:env 注入对 Win Scheduled Task 跑起来的 daemon 不生效
// (Task 不继承父进程 env),所以放弃 OPENCLAW_PROFILE/OPENCLAW_GATEWAY_PORT。
// 改为「端口探测」:OpenClaw 自己会从 18789 起依次找空端口,我们 spawn 后扫这个范围
// 找出实际监听端口,再注入给后端。
const OPENCLAW_PORT_SCAN_RANGE = [18789, 18790, 18791, 18792, 18793, 18794, 18795]
const OPENCLAW_DEFAULT_PORT = 18789
let detectedOpenClawPort = null

let welcomeWindow = null
let mainWindow = null
let backendProcess = null

// 启动日志:packaged 模式下 console.log 看不见,统一写到 userData/logs/。
// 任何启动问题都能让用户把这两个文件发我定位。
let mainLogStream = null
let backendLogStream = null
let openclawLogStream = null
function getLogPaths() {
  const dir = path.join(paths.userData, 'logs')
  return {
    dir,
    main: path.join(dir, 'main.log'),
    backend: path.join(dir, 'backend.log'),
    openclaw: path.join(dir, 'openclaw.log'),
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
function logOpenClaw(line) {
  const stamped = `[${new Date().toISOString()}] ${line}\n`
  try {
    openclawLogStream?.write(stamped)
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
    openclawLogStream = createWriteStream(lp.openclaw, { flags: 'w' })
    logMain(`==== Lingjing main 启动 ${app.getVersion?.() || '?'} pid=${process.pid} ====`)
    logMain(`paths: ${JSON.stringify(paths.debugDump(), null, 2)}`)
    logOpenClaw(`==== OpenClaw 子进程日志 ${new Date().toISOString()} ====`)
  } catch (e) {
    console.warn('[main] 初始化日志失败:', e?.message || e)
  }
}

/**
 * 扫端口 18789-18795 找在监听的那个,返回首个 LISTENING 的端口号或 null。
 * 用在 ensureOpenClawRunning 等待 OpenClaw daemon 起来时(daemon 自己挑端口)。
 */
async function detectOpenClawPort() {
  for (const port of OPENCLAW_PORT_SCAN_RANGE) {
    if (await pingTcpQuick('127.0.0.1', port)) return port
  }
  return null
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
    windowsHide: true,
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
      LINGJING_NODE_BIN: paths.embeddedNodeBin,
      LINGJING_NPM_CMD: paths.embeddedNpmCmd,
      // v1.2.3: 中文用户名路径下 Win cmd 默认 GBK 会让 Python/Node 子进程 stdio 乱码。
      // 强制 UTF-8 让 backend 派生的所有进程都用 UTF-8 编码。
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      LANG: 'zh_CN.UTF-8',
      LC_ALL: 'zh_CN.UTF-8',
      // OpenClaw 实际端口由 ensureOpenClawRunning 探测得出(Win 上 daemon 不读 env,
      // 自己挑 18789-18795 之间空端口)。process.env 优先,允许高级用户覆盖。
      OPENCLAW_WS_URL: process.env.OPENCLAW_WS_URL ||
        `ws://localhost:${detectedOpenClawPort || OPENCLAW_DEFAULT_PORT}`,
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
    // v1.5.x dev 模式: 优先查内嵌 resources/openclaw/openclaw.mjs(与 packaged 一致),
    // fallback 到全局 npm (v1.0-1.4 时代遗留, 兼容老开发机)。
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    return [
      paths.openclawEmbeddedJs,
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
    // v1.5.x dev 模式: 优先查内嵌 resources/hermes/venv/Scripts/hermes.exe,
    // fallback 到旧路径(LOCALAPPDATA hermes-agent / 全局 npm)。
    // 注: dev 模式直接用 resources 下的 venv 模板, packaged 才需要 userData copy。
    const localappdata = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    const embeddedDevHermes = path.join(paths.resourcesDir, 'hermes', 'venv', 'Scripts', 'hermes.exe')
    return [
      embeddedDevHermes,
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
 * 强制清理任何残留的 OpenClaw daemon(占 18789-18795 的进程 + 旧 task)。
 * 解决「用户机器上有 v1.0.x 留下的旧 daemon,协议错位导致 chat.send 超时」的根本问题。
 * 静默执行,失败不阻塞;每次启动都跑,确保 100% 干净。
 */
async function cleanupStaleOpenClawDaemons() {
  if (!isWin) return
  const ps = `
$ErrorActionPreference = 'SilentlyContinue';
$killed = @();
foreach ($p in 18789..18795) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue;
  if ($c) {
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue;
    $killed += "port=$p pid=$($c.OwningProcess)";
  }
};
foreach ($n in @('OpenClaw Gateway','OpenClaw Gateway (lingjing)','openclaw-gateway','openclaw-gateway-lingjing','OpenClaw_Gateway','openclaw')) {
  schtasks /End /TN $n 2>$null | Out-Null;
  schtasks /Delete /TN $n /F 2>$null | Out-Null;
};
if ($killed.Count -gt 0) { Write-Output ("killed: " + ($killed -join ',')) } else { Write-Output 'no stale daemon' };
`.trim()
  try {
    const proc = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-OutputFormat', 'Text', '-Command', ps,
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    proc.stdout?.on('data', (d) => { out += d.toString('utf8') })
    proc.stderr?.on('data', (d) => { out += '[stderr]' + d.toString('utf8') })
    await new Promise((resolve) => proc.on('close', resolve))
    logMain(`[main] OpenClaw 旧 daemon 清理: ${out.trim() || '(无输出)'}`)
    // 给系统几百毫秒释放端口/task,避免下一步 spawn 时 race
    await new Promise((r) => setTimeout(r, 500))
  } catch (e) {
    logMain(`[main] cleanupStaleOpenClawDaemons 失败(非致命): ${e?.message || e}`)
  }
}

/**
 * OpenClaw Gateway:启动时**强制清理旧 daemon → 重 spawn**(避免协议错位)。
 * 用「端口探测」找 OpenClaw 自己挑的实际端口,最长等 90s 推 splash 进度。
 */
async function ensureOpenClawRunning() {
  // v1.2.3:强制清理旧 daemon,绝不复用("已在跑"的可能是 v1.0.x 留下的协议不兼容版)。
  await cleanupStaleOpenClawDaemons()
  detectedOpenClawPort = null
  const bin = await findBin(openclawCandidates())
  if (!bin) {
    logMain('[main] OpenClaw CLI 未找到,跳过启动')
    return { status: 'skipped', message: 'openclaw CLI not installed' }
  }
  // 关键:`openclaw gateway start` 在 Win 上注册成 Scheduled Task,命令本身长期不退出,
  // 不能用 runCommand(它等子进程结束 → 永远等到 timeout 杀进程 → daemon 也死了)。
  // 改用 detached spawn + unref:让 daemon 独立活下去,父进程立刻继续轮询端口。
  const isJs = bin.endsWith('.mjs') || bin.endsWith('.js') || bin.endsWith('.cjs')
  const cmd = isJs ? process.execPath : bin
  const onboardArgs = isJs ? [bin, 'onboard', '--mode', 'local'] : ['onboard', '--mode', 'local']
  const installArgs = isJs ? [bin, 'gateway', 'install'] : ['gateway', 'install']
  const startArgs   = isJs ? [bin, 'gateway', 'start']   : ['gateway', 'start']
  const ocEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    CLAWHUB_URL: 'https://cn.clawhub-mirror.com',
    OPENCLAW_DISABLE_REMOTE_PRICING: '1',
    OPENCLAW_SKIP_PRICING_FETCH: '1',
    npm_config_registry: 'https://registry.npmmirror.com',
  }

  // v1.3.1: cleanupStaleOpenClawDaemons 删了 task,
  // 直接 `gateway start` 会因为 task 不存在报 "schtasks run failed:系统找不到指定文件"。
  // 必须先 `gateway install` 重新注册 task(idempotent,装过的会更新),再 detached start。
  logMain(`[main] OpenClaw step 1/3: gateway install (注册 Scheduled Task)`)
  try {
    await new Promise((resolve) => {
      const p = spawn(cmd, installArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: ocEnv,
      })
      p.stdout?.on('data', (d) => { try { openclawLogStream?.write(`[install] ${d}`) } catch {} })
      p.stderr?.on('data', (d) => { try { openclawLogStream?.write(`[install-stderr] ${d}`) } catch {} })
      const t = setTimeout(() => { try { p.kill() } catch {}; resolve(null) }, 15000)
      p.on('close', (code) => {
        clearTimeout(t)
        logMain(`[main] gateway install 退出 code=${code}`)
        resolve(null)
      })
      p.on('error', (err) => {
        clearTimeout(t)
        logOpenClaw(`install error: ${err?.message || err}`)
        resolve(null)
      })
    })
  } catch (e) {
    logMain(`[main] gateway install 异常(继续尝试 start): ${e?.message || e}`)
  }

  // v1.3.3 关键修复:OpenClaw install 写 openclaw.json 时不会写 `gateway.mode` 字段,
  // 而 daemon 启动时安全检查必须看到 `gateway.mode`,缺了就报
  // "Gateway start blocked: existing config is missing gateway.mode"。
  // onboard CLI 命令在 packaged 环境下是交互式的(等 stdin)会卡死,所以放弃 CLI,
  // 主进程直接读写 openclaw.json 兜底。
  logMain(`[main] OpenClaw step 2/3: 直接 patch openclaw.json 加 gateway.mode=local`)
  try {
    const ocConfigPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    if (existsSync(ocConfigPath)) {
      let raw = readFileSync(ocConfigPath, 'utf8')
      // v1.3.4: strip UTF-8 BOM(0xFEFF) — 用户用 PowerShell `Set-Content -Encoding UTF8`
      // 改 JSON 时默认带 BOM,Node JSON.parse 不容忍。Node writeFileSync 默认不写 BOM,
      // 所以读时 strip 完再写回 = 自动修复 BOM 污染。
      const hadBom = raw.charCodeAt(0) === 0xFEFF
      if (hadBom) raw = raw.slice(1)
      const cfg = JSON.parse(raw)
      if (!cfg.gateway || typeof cfg.gateway !== 'object') cfg.gateway = {}
      const needsModeWrite = cfg.gateway.mode !== 'local'
      if (needsModeWrite || hadBom) {
        if (needsModeWrite) cfg.gateway.mode = 'local'
        writeFileSync(ocConfigPath, JSON.stringify(cfg, null, 2), 'utf8')
        logMain(`[main] ✓ 已写入 openclaw.json (mode=${needsModeWrite ? '新写' : '已有'}, bomFix=${hadBom})`)
      } else {
        logMain('[main] gateway.mode=local 已存在 + 无 BOM,跳过')
      }
    } else {
      logMain(`[main] openclaw.json 不存在(${ocConfigPath}),跳过 patch`)
    }
  } catch (e) {
    logMain(`[main] patch openclaw.json 失败: ${e?.message || e}`)
  }

  // v1.3.5 关键修复:删掉多余的 `gateway start` spawn。
  // `gateway install` 已经在内部调用 schtasks /Run 启动了 daemon
  // (openclaw.log 显示 "Restarted Scheduled Task: OpenClaw Gateway"),
  // 我们再 spawn 一次会**启动第二个 daemon**,两个 daemon 同时跑会:
  //   1. 抢占 18789 端口,后启的那个被踢但异常状态影响第一个
  //   2. RPC 路由混乱(server 连上一个,请求被分到另一个挂掉的)
  //   3. 用户屏幕上能看到两个 PowerShell 黑窗口
  // install 已经 /Run, 不需要重复启动。

  // 轮询端口最多 90s,每秒一次,把进度推给 splash 让用户看到不会以为卡死。
  // 全新机器上 OpenClaw 首启要装内置 plugin、初始化 SQLite,实测 60-120s。
  logMain('[main] 等 OpenClaw 端口 (18789-18795 范围) 就绪,最多 90s...')
  const TOTAL_MS = 90000
  const INTERVAL_MS = 1000
  const started = Date.now()
  while (Date.now() - started < TOTAL_MS) {
    const port = await detectOpenClawPort()
    if (port) {
      detectedOpenClawPort = port
      logMain(`[main] OpenClaw Gateway 起来了 ✓ 端口=${port}`)
      sendLoadingStage(`OpenClaw 网关已就绪 (端口 ${port})`)
      setOpenClawTaskHidden()
      return { status: 'started', port }
    }
    const elapsed = Math.floor((Date.now() - started) / 1000)
    if (elapsed > 0 && elapsed % 5 === 0) {
      sendLoadingStage(`正在启动 OpenClaw 网关...已等候 ${elapsed}/90s,首次启动较慢`)
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
  }
  logMain('[main] OpenClaw 90s 还没在 18789-18795 监听,放用户进 app(后端会显示连接错误)')
  sendLoadingStage('OpenClaw 仍未就绪,可继续使用其他功能')
  return { status: 'timeout', port: null }
}

/**
 * 把 OpenClaw 注册的 Windows Scheduled Task 改成 Hidden=true。
 * 触发时仍然启动 daemon,但不再弹 console 窗口(下次启动开始生效)。
 * 静默执行,失败不阻塞。
 */
function setOpenClawTaskHidden() {
  if (!isWin) return
  const ps = `
    $names = @('OpenClaw Gateway (lingjing)','OpenClaw Gateway','openclaw-gateway-lingjing','openclaw-gateway','OpenClaw_Gateway','openclaw');
    foreach ($n in $names) {
      try {
        $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue;
        if ($t -and $t.Settings.Hidden -ne $true) {
          $t.Settings.Hidden = $true;
          Set-ScheduledTask -InputObject $t -ErrorAction SilentlyContinue | Out-Null;
        }
      } catch {}
    }
  `.trim()
  try {
    const proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    proc.unref()
    logMain('[main] 异步设置 OpenClaw Scheduled Task Hidden=true (下次启动生效)')
  } catch (e) {
    logMain('[main] setOpenClawTaskHidden 失败(非致命): ' + (e?.message || e))
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
    // sidebar 自然高度 ≈ 700px,锁死窗口高度避免拉到底部出现空白
    maxHeight: 700,
    maximizable: false,
    show: false,
    backgroundColor: '#FFFFFF',
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' }
      : {
          // Win:完全无 OS 标题栏(frame:false),前端自画 WindowControls 组件
          // 颜色跟随当前页面主题(浅色/深色/Login 米色/Dashboard 白色等)永不色差
          frame: false,
        }),
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
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: useShell,
      windowsHide: true,
      ...opts,
      env: childEnv,
    })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d) => (stdout += d.toString()))
    proc.stderr?.on('data', (d) => (stderr += d.toString()))
    proc.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr + err.message }))
    proc.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

async function configureOpenClaw(token, baseUrl, modelId, providerId = 'lingjing', compat = 'openai') {
  // v1.3.6: Win 上 `openclaw onboard` 在 packaged 环境会死锁(等 stdin),改为
  // 直接修改 ~/.openclaw/gateway.cmd 注入 OPENAI_API_KEY env + 重启 task。
  // daemon 启动时拿到 OPENAI_API_KEY,内部 embedded agent 不会卡 30 秒重试。
  // mac/Linux 仍用 onboard CLI(没复现 Win 死锁,且 launchd 启动机制不同)。
  if (isWin) {
    return await configureOpenClawWindows(token, baseUrl, modelId)
  }
  return await configureOpenClawUnix(token, baseUrl, modelId, providerId, compat)
}

/**
 * v1.4.1: Win 修法 — 直接写 OpenClaw 3 个 JSON 配置文件 + 修 gateway.cmd
 * 1. ~/.openclaw/agents/main/agent/auth-profiles.json: 写 openai:manual profile (含真 token)
 * 2. ~/.openclaw/openclaw.json: 加 auth.profiles 引用
 * 3. ~/.openclaw/agents/main/agent/models.json: 加 openai provider (baseUrl=灵境 aitoken.homes)
 * 4. ~/.openclaw/gateway.cmd: 删 4 行 watchdog env (修 daemon 自我重启) + 注入 OPENAI_API_KEY
 * 5. schtasks /End + /Run 重启 daemon
 *
 * schema 全部从客户机器实测验证(诊断 PS 输出反推),已开发机模拟测试 7/7 断言通过。
 */
async function configureOpenClawWindows(token, baseUrl, modelId) {
  const home = os.homedir()
  const ocDir = path.join(home, '.openclaw')
  const agentDir = path.join(ocDir, 'agents', 'main', 'agent')
  const cmdPath = path.join(ocDir, 'gateway.cmd')
  const openclawJsonPath = path.join(ocDir, 'openclaw.json')
  const modelsJsonPath = path.join(agentDir, 'models.json')
  const authProfilesPath = path.join(agentDir, 'auth-profiles.json')

  if (!existsSync(cmdPath)) {
    return { status: 'error', message: 'gateway.cmd 不存在,daemon 未 install。请重启灵境让 install 注册 task' }
  }
  if (!existsSync(agentDir)) {
    try { mkdirSync(agentDir, { recursive: true }) } catch {}
  }

  const stripBom = (s) => (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s)
  const readJson = (p, fallback) => {
    try {
      if (!existsSync(p)) return fallback
      return JSON.parse(stripBom(readFileSync(p, 'utf8')))
    } catch { return fallback }
  }

  // Step 1: auth-profiles.json - 写 openai:manual profile
  try {
    const auth = readJson(authProfilesPath, { version: 1, profiles: {} })
    auth.version = 1
    if (!auth.profiles) auth.profiles = {}
    auth.profiles['openai:manual'] = { type: 'token', provider: 'openai', token }
    writeFileSync(authProfilesPath, JSON.stringify(auth, null, 2), 'utf8')
    console.log(`[lingjing-cfg] ✓ auth-profiles.json 已注入 openai:manual (suffix: ...${token.slice(-6)})`)
  } catch (e) {
    return { status: 'error', message: 'patch auth-profiles.json 失败: ' + (e?.message || e) }
  }

  // Step 2: openclaw.json - 加 auth.profiles 引用 (保留原 gateway/meta)
  try {
    const cfg = readJson(openclawJsonPath, {})
    if (!cfg.auth) cfg.auth = {}
    if (!cfg.auth.profiles) cfg.auth.profiles = {}
    cfg.auth.profiles['openai:manual'] = { provider: 'openai', mode: 'token' }
    writeFileSync(openclawJsonPath, JSON.stringify(cfg, null, 2), 'utf8')
    console.log('[lingjing-cfg] ✓ openclaw.json 已加 auth.profiles 引用')
  } catch (e) {
    return { status: 'error', message: 'patch openclaw.json 失败: ' + (e?.message || e) }
  }

  // Step 3: models.json - 加 openai provider 指向灵境 aitoken.homes
  try {
    const m = readJson(modelsJsonPath, { providers: {} })
    if (!m.providers) m.providers = {}
    m.providers.openai = {
      baseUrl,
      apiKey: token,
      auth: 'token',
      api: 'openai-completions', // schema enum 验证合法值, 标准 OpenAI 兼容(灵境 aitoken.homes 适用)
      models: [
        { id: 'gpt-5.4', name: 'GPT-5.4', api: 'openai-completions',
          input: ['text', 'image'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 272000, maxTokens: 128000 },
        { id: 'gpt-5.4-mini', name: 'GPT-5.4-Mini', api: 'openai-completions',
          input: ['text', 'image'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 272000, maxTokens: 128000 },
        { id: 'gpt-5.2', name: 'GPT-5.2', api: 'openai-completions',
          input: ['text', 'image'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 272000, maxTokens: 128000 },
      ],
    }
    writeFileSync(modelsJsonPath, JSON.stringify(m, null, 2), 'utf8')
    console.log('[lingjing-cfg] ✓ models.json 已加 openai provider (baseUrl=' + baseUrl + ')')
  } catch (e) {
    return { status: 'error', message: 'patch models.json 失败: ' + (e?.message || e) }
  }

  // Step 4: gateway.cmd - 删 4 行 watchdog env (修 daemon 自我重启) + 注入 OPENAI_API_KEY
  try {
    let content = stripBom(readFileSync(cmdPath, 'utf8'))
    // v1.4.1: 删 4 行 task watchdog env(客户验证: daemon 看到这些 env 会每 2-3 分钟自我重启)
    content = content.replace(/^set "OPENCLAW_WINDOWS_TASK_NAME=[^"]*"\r?\n/gm, '')
    content = content.replace(/^set "OPENCLAW_SYSTEMD_UNIT=[^"]*"\r?\n/gm, '')
    content = content.replace(/^set "OPENCLAW_SERVICE_MARKER=[^"]*"\r?\n/gm, '')
    content = content.replace(/^set "OPENCLAW_SERVICE_KIND=[^"]*"\r?\n/gm, '')
    // 删旧的 OPENAI_API_KEY/OPENAI_BASE_URL(避免堆积)
    content = content.replace(/^set "OPENAI_API_KEY=[^"]*"\r?\n/gm, '')
    content = content.replace(/^set "OPENAI_BASE_URL=[^"]*"\r?\n/gm, '')
    const insertion = `set "OPENAI_API_KEY=${token}"\r\nset "OPENAI_BASE_URL=${baseUrl}"\r\n`
    if (/(set "OPENCLAW_GATEWAY_PORT=\d+"\r?\n)/.test(content)) {
      content = content.replace(/(set "OPENCLAW_GATEWAY_PORT=\d+"\r?\n)/, `$1${insertion}`)
    } else {
      content = content.replace(/^(".*?node\.exe".*)$/m, `${insertion}$1`)
    }
    writeFileSync(cmdPath, content, 'ascii')
    console.log('[lingjing-cfg] ✓ gateway.cmd 已删 watchdog env + 注入 OPENAI_API_KEY')
  } catch (e) {
    return { status: 'error', message: 'patch gateway.cmd 失败: ' + (e?.message || e) }
  }

  // Step 5: schtasks /End + /Run 重启 daemon
  console.log('[lingjing-cfg] 重启 OpenClaw daemon...')
  await new Promise((resolve) => {
    const ps = 'schtasks /End /TN "OpenClaw Gateway" 2>$null | Out-Null; Start-Sleep -Milliseconds 1500; schtasks /Run /TN "OpenClaw Gateway" 2>&1 | Out-String'
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    let out = ''
    p.stdout?.on('data', (d) => { out += d.toString('utf8') })
    p.stderr?.on('data', (d) => { out += d.toString('utf8') })
    const t = setTimeout(() => { try { p.kill() } catch {}; resolve() }, 10000)
    p.on('close', () => { clearTimeout(t); console.log('[lingjing-cfg] schtasks 输出:', out.trim().slice(0, 200)); resolve() })
    p.on('error', (err) => { clearTimeout(t); console.warn('[lingjing-cfg] schtasks 错误:', err?.message || err); resolve() })
  })

  // Step 6: 等 daemon 端口就绪(最多 30s)
  const started = Date.now()
  while (Date.now() - started < 30000) {
    if (await pingTcpQuick('127.0.0.1', 18789)) {
      console.log(`[lingjing-cfg] ✓ daemon 重启完成,端口 18789 就绪 (${Math.floor((Date.now() - started) / 1000)}s)`)
      return { status: 'ok', message: '已配置 openai provider + 重启 daemon' }
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return { status: 'error', message: 'daemon 重启 30s 后端口仍未就绪' }
}

/**
 * v1.3.6 之前的 onboard CLI 路径 — 保留给 mac/Linux 用。
 * Win 上请勿调用(会死锁)。
 */
async function configureOpenClawUnix(token, baseUrl, modelId, providerId = 'lingjing', compat = 'openai') {
  const bin = await findBin(openclawCandidates())
  if (!bin) {
    return { status: 'skipped', message: 'openclaw CLI not found in common paths' }
  }

  const args = [
    'onboard',
    '--non-interactive',
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
    '--no-install-daemon',
  ]

  const r = await runCommand(bin, args, { timeout: 90000 })
  if (r.code !== 0) {
    return {
      status: 'error',
      message: `onboard exit ${r.code}: ${(r.stderr || r.stdout || '<empty>').slice(0, 400)}`,
    }
  }

  if (isMac) {
    const uid = process.getuid?.() ?? 501
    await runCommand('launchctl', ['kickstart', '-k', `gui/${uid}/ai.openclaw.gateway`])
  } else {
    await runCommand(bin, ['gateway', 'restart'], { timeout: 20000 })
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

  // v1.5 路径 B: 优先把 token 注入灵境 server,启用 chat 直连 aitoken.homes(绕过 OpenClaw daemon)
  // 这是 v1.5 的核心可靠 chat 链路,不依赖 OpenClaw 内部 auth 机制。
  let bypassStatus = 'skipped'
  try {
    const r = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/internal/set-lingjing-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: fetched.token, baseUrl }),
    })
    if (r.ok) {
      bypassStatus = 'ok'
      console.log('[lingjing-cfg] ✓ v1.5 chat bypass enabled (server cached token)')
    } else {
      bypassStatus = 'error: HTTP ' + r.status
    }
  } catch (e) {
    bypassStatus = 'error: ' + (e?.message || e)
    console.warn('[lingjing-cfg] v1.5 bypass setup failed (non-fatal):', bypassStatus)
  }

  // fallback: 仍配 OpenClaw / Hermes,bypass 失效时走 daemon
  const oc = await configureOpenClaw(fetched.token, baseUrl, modelId).catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  const hm = await configureHermes(fetched.token, baseUrl, modelId).catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  return {
    tokenSource: fetched.source,
    tokenSuffix: fetched.token.slice(-6),
    bypass: bypassStatus,
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
  const ocPort = detectedOpenClawPort || OPENCLAW_DEFAULT_PORT
  const [server, openclaw, hermes] = await Promise.all([
    pingTcpQuick('127.0.0.1', BACKEND_PORT),
    pingTcpQuick('127.0.0.1', ocPort),
    pingTcpQuick('127.0.0.1', 8642),
  ])
  return {
    backend: { port: BACKEND_PORT, alive: server },
    openclaw: { port: ocPort, alive: openclaw },
    hermes: { port: 8642, alive: hermes },
  }
})

ipcMain.handle('lingjing:gateway-restart', async (_event, which) => {
  if (which === 'openclaw') return ensureOpenClawRunning()
  if (which === 'hermes') return ensureHermesRunning()
  return { status: 'error', message: `unknown gateway: ${which}` }
})

/**
 * v1.2.3: 模型切换 / 用户主动诊断时强制重启 OpenClaw daemon。
 * 流程: 杀旧 daemon + 删旧 task → 重 spawn → 端口探测 → 返回新端口。
 * 比 gateway-restart 更彻底(后者在已存在 daemon 时直接复用,本接口先 kill)。
 */
ipcMain.handle('lingjing:openclaw-restart', async () => {
  try {
    const r = await ensureOpenClawRunning()
    return { ok: r.status === 'started' || r.status === 'already-running', ...r }
  } catch (e) {
    return { ok: false, message: e?.message || String(e) }
  }
})

// ============================================================================
// v1.3.0 自检 (Preflight) — 登录后逐步验证 + 修复 + 测试链路
// 每步独立可调用、可重试。失败时前端显示错误 + 重试按钮。
// ============================================================================

ipcMain.handle('lingjing:preflight-backend-health', async () => {
  const t0 = Date.now()
  try {
    const alive = await pingTcpQuick('127.0.0.1', BACKEND_PORT, 1500)
    return { ok: alive, durationMs: Date.now() - t0, port: BACKEND_PORT }
  } catch (e) {
    return { ok: false, durationMs: Date.now() - t0, message: e?.message || String(e) }
  }
})

ipcMain.handle('lingjing:preflight-cleanup-stale', async () => {
  const t0 = Date.now()
  try {
    await cleanupStaleOpenClawDaemons()
    return { ok: true, durationMs: Date.now() - t0 }
  } catch (e) {
    // 清理失败不阻塞:返回 ok=true 但带 warning,前端可以选择继续
    return { ok: true, durationMs: Date.now() - t0, warning: e?.message || String(e) }
  }
})

ipcMain.handle('lingjing:preflight-start-openclaw', async () => {
  const t0 = Date.now()
  try {
    const r = await ensureOpenClawRunning()
    const ok = r.status === 'started' || r.status === 'already-running'
    return { ok, durationMs: Date.now() - t0, port: r.port, status: r.status, message: r.message }
  } catch (e) {
    return { ok: false, durationMs: Date.now() - t0, message: e?.message || String(e) }
  }
})

/**
 * 占位:configure-providers 实际由前端 bridge.autoConfigureViaMain 直接调用
 * (那个已经存在,复用即可),这里保留 IPC 给 PreflightPage 在 UI 上有"步骤"的概念。
 * 前端可以直接调 autoConfigureViaMain,然后告诉本 IPC "已完成,记一笔"。
 */
ipcMain.handle('lingjing:preflight-configure-providers', async (_event, params) => {
  const t0 = Date.now()
  // 前端会先调 autoConfigureViaMain,然后调本接口仅 mark 完成 + 计时统一
  return {
    ok: true,
    durationMs: Date.now() - t0,
    note: 'configure_providers should be called via autoConfigureViaMain bridge first',
    received: params || null,
  }
})

/**
 * 关键:发一条真实的轻量 chat 请求测试整条链路是否工作。
 * 调后端 :3000/api/lingjing/preflight-test-chat 发 "ping",30s 超时。
 * 这是之前所有版本的最大盲区——端口通了 ≠ chat.send 能 work。
 */
ipcMain.handle('lingjing:preflight-test-chat', async () => {
  const t0 = Date.now()
  try {
    const url = `http://127.0.0.1:${BACKEND_PORT}/api/lingjing/preflight-test-chat`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'ping' }),
        signal: ctrl.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timer)
      return { ok: false, durationMs: Date.now() - t0, message: fetchErr?.name === 'AbortError' ? '30s 内未收到响应' : (fetchErr?.message || String(fetchErr)) }
    }
    clearTimeout(timer)
    if (!res.ok) {
      return { ok: false, durationMs: Date.now() - t0, message: `HTTP ${res.status} ${res.statusText}` }
    }
    const data = await res.json().catch(() => null)
    return { ok: data?.ok === true, durationMs: Date.now() - t0, ...(data || {}) }
  } catch (e) {
    return { ok: false, durationMs: Date.now() - t0, message: e?.message || String(e) }
  }
})

ipcMain.handle('lingjing:preflight-start-hermes', async () => {
  const t0 = Date.now()
  try {
    const r = await ensureHermesRunning()
    const ok = r?.status === 'started' || r?.status === 'already-running'
    return { ok, durationMs: Date.now() - t0, ...(r || {}) }
  } catch (e) {
    return { ok: false, durationMs: Date.now() - t0, message: e?.message || String(e) }
  }
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

// ============================================================================
// 错误日志(用户在"系统设置 → 错误日志"复制后反馈给开发者)
// ============================================================================
ipcMain.handle('lingjing:get-error-logs', async () => {
  const lp = getLogPaths()
  const result = {
    version: app.getVersion?.() || '?',
    platform: process.platform,
    arch: process.arch,
    time: new Date().toISOString(),
    detectedOpenClawPort: detectedOpenClawPort || null,
    mainPath: lp.main,
    backendPath: lp.backend,
    openclawPath: lp.openclaw,
    main: '',
    backend: '',
    openclaw: '',
  }
  const tailLines = (filePath, n = 300) => {
    try {
      if (!existsSync(filePath)) return '(日志文件不存在,可能是当前进程刚启动还没写入)'
      const content = readFileSync(filePath, 'utf8')
      // 单文件超 1MB 时只取末尾 1MB,防止 IPC 拖累 UI
      const trimmed = content.length > 1024 * 1024 ? content.slice(-1024 * 1024) : content
      const lines = trimmed.split('\n')
      return lines.slice(-n).join('\n')
    } catch (e) {
      return `(读取失败: ${e?.message || e})`
    }
  }
  result.main = tailLines(lp.main)
  result.backend = tailLines(lp.backend)
  result.openclaw = tailLines(lp.openclaw)
  return result
})

ipcMain.handle('lingjing:open-logs-folder', async () => {
  try {
    const lp = getLogPaths()
    const err = await shell.openPath(lp.dir)
    if (err) return { ok: false, message: err }
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e?.message || String(e) }
  }
})

// ============================================================================
// v1.4 诊断契约 (Diagnostic Contract)
// 新页面 /diagnose 调本 IPC 拿到完整诊断 object,客户出问题时一键复制 markdown 反馈。
// 已开发机模拟测试 5 个 helper 返回结构正确(scanPorts / inspectConfig /
// inspectGatewayCmd / getDaemonProcessInfo / getScheduledTaskInfo)。
// ============================================================================

async function scanOpenClawPorts() {
  const result = []
  for (const port of OPENCLAW_PORT_SCAN_RANGE) {
    result.push({ port, listening: await pingTcpQuick('127.0.0.1', port, 500) })
  }
  return result
}

function inspectOpenClawConfig() {
  const cfgPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
  const out = { path: cfgPath, exists: existsSync(cfgPath), hasBom: false, parseable: false, fields: {} }
  if (!out.exists) return out
  try {
    let raw = readFileSync(cfgPath, 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) { out.hasBom = true; raw = raw.slice(1) }
    const cfg = JSON.parse(raw)
    out.parseable = true
    out.fields['gateway.mode'] = cfg?.gateway?.mode ?? null
    out.fields['gateway.auth.mode'] = cfg?.gateway?.auth?.mode ?? null
    const t = cfg?.gateway?.auth?.token
    out.fields['gateway.auth.token.suffix'] = typeof t === 'string' ? '...' + t.slice(-6) : null
    out.fields['gateway.remote.token.exists'] = cfg?.gateway?.remote?.token != null
    out.fields['meta.lastTouchedVersion'] = cfg?.meta?.lastTouchedVersion ?? null
  } catch (e) {
    out.parseError = String(e?.message || e)
  }
  return out
}

function inspectGatewayCmd() {
  const cmdPath = path.join(os.homedir(), '.openclaw', 'gateway.cmd')
  const out = { path: cmdPath, exists: existsSync(cmdPath) }
  if (!out.exists) return out
  try {
    const raw = readFileSync(cmdPath, 'utf8')
    out.hasOpenAIKey = /set "OPENAI_API_KEY=[^"]+"/.test(raw)
    out.hasOpenAIBaseUrl = /set "OPENAI_BASE_URL=[^"]+"/.test(raw)
    const portMatch = raw.match(/OPENCLAW_GATEWAY_PORT=(\d+)/)
    out.portFromCmd = portMatch ? Number(portMatch[1]) : null
    out.bytes = raw.length
  } catch (e) {
    out.readError = String(e?.message || e)
  }
  return out
}

async function getDaemonProcessInfo(port) {
  if (!isWin) return null
  const ps = `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p) { @{ pid = $p.Id; name = $p.ProcessName; cpuSec = [math]::Round($p.CPU, 1); memMB = [math]::Round($p.WorkingSet / 1MB, 1); startTime = $p.StartTime.ToString('o') } | ConvertTo-Json -Compress } }`
  return await new Promise((resolve) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    let out = ''
    p.stdout?.on('data', (d) => out += d.toString('utf8'))
    const t = setTimeout(() => { try { p.kill() } catch {}; resolve(null) }, 5000)
    p.on('close', () => {
      clearTimeout(t)
      try { resolve(out.trim() ? JSON.parse(out.trim()) : null) } catch { resolve(null) }
    })
    p.on('error', () => { clearTimeout(t); resolve(null) })
  })
}

async function getScheduledTaskInfo(name) {
  if (!isWin) return { name, exists: false, platform: 'non-win' }
  const ps = `$t = Get-ScheduledTask -TaskName "${name}" -ErrorAction SilentlyContinue; if ($t) { $info = Get-ScheduledTaskInfo -TaskName "${name}" -ErrorAction SilentlyContinue; @{ exists = $true; state = $t.State.ToString(); lastRunTime = if ($info.LastRunTime) { $info.LastRunTime.ToString('o') } else { $null }; lastTaskResult = $info.LastTaskResult; nextRunTime = if ($info.NextRunTime) { $info.NextRunTime.ToString('o') } else { $null } } | ConvertTo-Json -Compress } else { @{ exists = $false } | ConvertTo-Json -Compress }`
  return await new Promise((resolve) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    let out = ''
    p.stdout?.on('data', (d) => out += d.toString('utf8'))
    const t = setTimeout(() => { try { p.kill() } catch {}; resolve({ name, exists: false, timeout: true }) }, 5000)
    p.on('close', () => {
      clearTimeout(t)
      try { const parsed = JSON.parse(out.trim()); parsed.name = name; resolve(parsed) }
      catch { resolve({ name, exists: false, parseError: out.slice(0, 200) }) }
    })
    p.on('error', () => { clearTimeout(t); resolve({ name, exists: false, error: 'spawn failed' }) })
  })
}

function tailLog(filePath, lines = 200) {
  try {
    if (!existsSync(filePath)) return '(文件不存在)'
    const content = readFileSync(filePath, 'utf8')
    const trimmed = content.length > 1024 * 1024 ? content.slice(-1024 * 1024) : content
    return trimmed.split('\n').slice(-lines).join('\n')
  } catch (e) { return `(读失败: ${e?.message || e})` }
}

function findLatestOpenClawDaemonLog() {
  try {
    const dir = path.join(os.homedir(), '.openclaw', 'logs')
    if (!existsSync(dir)) return null
    const files = readdirSync(dir).map((n) => {
      const fp = path.join(dir, n)
      try { return { name: n, path: fp, mtime: statSync(fp).mtimeMs } } catch { return null }
    }).filter((x) => x && (x.name.endsWith('.log') || x.name.endsWith('.jsonl')))
    if (!files.length) return null
    files.sort((a, b) => b.mtime - a.mtime)
    return files[0]
  } catch { return null }
}

async function gatherDiagnostics() {
  const ports = await scanOpenClawPorts()
  const listeningPort = ports.find((p) => p.listening)?.port || 18789
  const [daemonProcess, taskMain, taskLingjing] = await Promise.all([
    getDaemonProcessInfo(listeningPort),
    getScheduledTaskInfo('OpenClaw Gateway'),
    getScheduledTaskInfo('OpenClaw Gateway (lingjing)'),
  ])
  const lp = getLogPaths()
  const ocDaemonLog = findLatestOpenClawDaemonLog()
  return {
    meta: {
      version: app.getVersion?.() || '?',
      platform: process.platform,
      arch: process.arch,
      ts: new Date().toISOString(),
      userDataPath: paths.userData,
      detectedOpenClawPort: detectedOpenClawPort,
    },
    startupAssertions: [...startupAssertions],
    openclawPorts: ports,
    scheduledTasks: [taskMain, taskLingjing],
    daemonProcess,
    openclawConfig: inspectOpenClawConfig(),
    gatewayCmd: inspectGatewayCmd(),
    logs: {
      mainTail: tailLog(lp.main, 200),
      backendTail: tailLog(lp.backend, 200),
      openclawTail: tailLog(lp.openclaw, 200),
      daemonLog: ocDaemonLog ? {
        path: ocDaemonLog.path,
        name: ocDaemonLog.name,
        tail: tailLog(ocDaemonLog.path, 100),
      } : null,
    },
  }
}

ipcMain.handle('lingjing:diagnose-full', async () => {
  try {
    return await gatherDiagnostics()
  } catch (e) {
    return { error: e?.message || String(e) }
  }
})

// ============================================================================
// 窗口控制(Win frame:false 自画按钮 / mac 走原生 traffic light)
// ============================================================================
ipcMain.handle('lingjing:window-minimize', () => {
  mainWindow?.minimize()
})
ipcMain.handle('lingjing:window-toggle-maximize', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
    return false
  } else {
    mainWindow.maximize()
    return true
  }
})
ipcMain.handle('lingjing:window-close', () => {
  mainWindow?.close()
})
ipcMain.handle('lingjing:window-is-maximized', () => mainWindow?.isMaximized() ?? false)

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

/**
 * 检测是否首次启动:
 * 首启 = userData/hermes-venv 不存在(说明 ensureHermesVenvCopy 还没跑过)。
 * 首启时 OpenClaw daemon 也没注册过 Scheduled Task,Hermes venv 没拷贝,
 * 所以会比正常启动慢 60-120 秒,需要更显眼的等待提示。
 */
function isFirstRun() {
  if (!app.isPackaged) return false
  return !existsSync(paths.hermesVenvUser)
}

async function bootstrap() {
  // Step -0: 初始化日志(packaged 模式下唯一能拿到 console 的方式)
  paths.ensureWritableDirs()
  initLogStreams()

  const firstRun = isFirstRun()
  logMain(`[main] firstRun=${firstRun}`)

  // Step 0: 立刻开加载动画窗口,后面所有耗时步骤都通过 sendLoadingStage 推阶段文案
  createWelcomeWindow()
  if (firstRun) {
    sendLoadingStage('首次启动需准备本地 AI 运行时,约需 1-2 分钟,请耐心等待...')
  } else {
    sendLoadingStage('正在准备运行环境...')
  }

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

  // Step 2: 先等 OpenClaw 端口探测就绪(最长 90s,内部会推 splash 进度)。
  // 必须 await 拿到 detectedOpenClawPort,后续 startBackend 才能用真实端口配 OPENCLAW_WS_URL。
  // Hermes 不阻塞,后台并行起。
  sendLoadingStage('正在启动 OpenClaw 网关...')
  ensureHermesRunning()
    .then((hm) => console.log('[main] Hermes Gateway:', JSON.stringify(hm)))
    .catch((e) => console.error('[main] Hermes Gateway 启动失败:', e?.message || e))
  const oc = await ensureOpenClawRunning().catch((e) => ({
    status: 'error', message: String(e?.message || e),
  }))
  console.log('[main] OpenClaw Gateway:', JSON.stringify(oc))

  // Step 3: 自起后端(此时 OPENCLAW_WS_URL 已经能用 detectedOpenClawPort)
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
