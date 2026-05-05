import { app } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, existsSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isPackaged = app.isPackaged

// 项目根: dev 是仓库根, packaged 是安装目录(D:\cesi\Lingjing\)
export const projectRoot = isPackaged
  ? path.dirname(process.execPath)
  : path.join(__dirname, '..')

// 资源目录: dev 是仓库根, packaged 是 安装目录\resources\
export const resourcesDir = isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..')

// 服务器代码所在目录:
//   asar=true  时,server 在 process.resourcesPath/app.asar.unpacked/
//   asar=false 时,所有文件直接在 process.resourcesPath/app/
//   两种 layout 都兼容(运行时探测哪个存在)
function detectAppDir() {
  if (!isPackaged) return path.join(__dirname, '..')
  const a = path.join(process.resourcesPath, 'app.asar.unpacked')
  const b = path.join(process.resourcesPath, 'app')
  if (existsSync(a)) return a
  if (existsSync(b)) return b
  // 两个都没有,默认 b(asar 关掉是更新的 layout)
  return b
}
export const asarUnpacked = detectAppDir()

// 用户数据目录: packaged = %APPDATA%\灵境\, dev = 仓库 .userdata/
export const userData = isPackaged
  ? app.getPath('userData')
  : path.join(__dirname, '..', '.userdata')

// 可写目录(dev/packaged 都用 userData 下,语义统一)
export const dataDir = path.join(userData, 'data')
export const backupDir = path.join(userData, 'backups')
export const mediaDir = path.join(userData, 'media')
export const dbPath = path.join(dataDir, 'wizard.db')

// server/index.js 真实磁盘路径(spawn 用)
export const serverScript = path.join(asarUnpacked, 'server', 'index.js')

// 内嵌 OpenClaw 包入口(.mjs 文件,得用 process.execPath + ELECTRON_RUN_AS_NODE 跑)
// 真正的 bin 入口在 package.json 的 bin.openclaw → openclaw.mjs(不是 dist/index.js)
export const openclawEmbeddedJs = path.join(resourcesDir, 'openclaw', 'openclaw.mjs')
export const openclawHome = path.join(userData, 'openclaw')

// 内嵌 Hermes venv: 模板在 resources/hermes/venv(只读),首启拷到 userData/hermes-venv 才能改写 pyvenv.cfg
export const hermesVenvTemplate = path.join(resourcesDir, 'hermes', 'venv')
export const hermesVenvUser = path.join(userData, 'hermes-venv')
export const hermesExe = path.join(hermesVenvUser, 'Scripts', 'hermes.exe')

// Portable Python(hermes venv 的 base)
export const pythonBaseDir = path.join(resourcesDir, 'python')

// 启动时把可写目录都建出来
export function ensureWritableDirs() {
  for (const d of [userData, dataDir, backupDir, mediaDir]) {
    try {
      mkdirSync(d, { recursive: true })
    } catch (e) {
      console.warn('[paths] mkdir 失败:', d, e.message)
    }
  }
}

export function debugDump() {
  return {
    isPackaged,
    projectRoot,
    resourcesDir,
    asarUnpacked,
    userData,
    dataDir,
    dbPath,
    serverScript,
    openclawEmbeddedJs,
    hermesVenvUser,
    hermesExe,
    pythonBaseDir,
  }
}
