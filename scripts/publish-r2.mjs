#!/usr/bin/env node
/**
 * 把 release/ 里的 Windows 安装包+元数据上传到 Cloudflare R2,
 * 给 electron-updater 做国内可用的更新源。
 *
 * 跑法:
 *   npm run publish:r2
 *
 * 上传文件:
 *   release/Lingjing-Setup-<ver>.exe
 *   release/Lingjing-Setup-<ver>.exe.blockmap
 *   release/latest.yml
 *
 * 凭据从 .env.r2 读(已 gitignore)。
 */
import { readFileSync, statSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { config as dotenvConfig } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const releaseDir = join(root, 'release')

dotenvConfig({ path: join(root, '.env.r2') })

const required = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET']
for (const k of required) {
  if (!process.env[k]) {
    console.error(`[publish-r2] 缺环境变量 ${k},请检查 .env.r2`)
    process.exit(1)
  }
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
})

const BUCKET = process.env.R2_BUCKET
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE || ''

function fmtMB(n) {
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

async function uploadOne(localPath, key, contentType) {
  if (!existsSync(localPath)) {
    console.warn(`[publish-r2] 跳过(不存在): ${localPath}`)
    return false
  }
  const body = readFileSync(localPath)
  const size = statSync(localPath).size
  console.log(`[publish-r2] ↑ ${key}  (${fmtMB(size)})`)
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: key.endsWith('latest.yml') ? 'no-cache, max-age=0' : 'public, max-age=86400',
  }))
  if (PUBLIC_BASE) {
    console.log(`         → ${PUBLIC_BASE}/${key}`)
  }
  return true
}

async function main() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }))
  } catch (e) {
    console.error(`[publish-r2] 连不上 bucket "${BUCKET}":`, e?.message || e)
    console.error('  常见原因: token 权限不含 Object Write / token 没勾这个 bucket / endpoint 写错')
    process.exit(2)
  }

  const yamlPath = join(releaseDir, 'latest.yml')
  if (!existsSync(yamlPath)) {
    console.error('[publish-r2] 找不到 release/latest.yml,请先跑 npm run dist:win')
    process.exit(3)
  }
  const yaml = readFileSync(yamlPath, 'utf8')
  const m = yaml.match(/^path:\s*(.+)$/m)
  if (!m) {
    console.error('[publish-r2] latest.yml 里没找到 path 字段,文件结构异常')
    process.exit(4)
  }
  const installerName = m[1].trim()
  const installerPath = join(releaseDir, installerName)
  const blockmapPath = installerPath + '.blockmap'

  console.log(`[publish-r2] 准备上传 (bucket=${BUCKET})`)
  console.log(`             installer = ${installerName}`)

  await uploadOne(installerPath, installerName, 'application/octet-stream')
  await uploadOne(blockmapPath, basename(blockmapPath), 'application/octet-stream')
  await uploadOne(yamlPath, 'latest.yml', 'text/yaml')

  console.log('\n✅ 完成。客户端 feedURL 应配为:')
  console.log(`   ${PUBLIC_BASE || process.env.R2_ENDPOINT + '/' + BUCKET}`)
  console.log('\n⚠ 验证: 浏览器打开下面两个链接应都能下载/查看:')
  if (PUBLIC_BASE) {
    console.log(`   ${PUBLIC_BASE}/latest.yml`)
    console.log(`   ${PUBLIC_BASE}/${installerName}`)
  }
}

main().catch((e) => {
  console.error('[publish-r2] 失败:', e?.message || e)
  process.exit(1)
})
