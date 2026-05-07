#!/usr/bin/env node
/**
 * SVG → 多尺寸 PNG → 合成 .ico
 *
 * 跑法:
 *   npx -y -p sharp -p png-to-ico -- node scripts/build-icon.mjs
 *
 * 输入: docs/logo-candidates/option-b-ink.svg(用户选定的 B 方案)
 * 输出: build/icon.ico(含 16/24/32/48/64/128/256 七尺寸)
 *       build/icon.png(512×512,mac/linux 用)
 *
 * 用 npx 临时下载 sharp + png-to-ico,跑完不污染 package.json。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const SRC_SVG = join(root, 'docs', 'logo-candidates', 'option-b-ink.svg')
const OUT_DIR = join(root, 'build')
const OUT_ICO = join(OUT_DIR, 'icon.ico')
const OUT_PNG_512 = join(OUT_DIR, 'icon.png')

const SIZES = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  let sharp, pngToIco
  try {
    sharp = (await import('sharp')).default
    pngToIco = (await import('png-to-ico')).default
  } catch (e) {
    console.error('[build-icon] 缺依赖,请用 npx 跑:')
    console.error('  npx -y -p sharp -p png-to-ico -- node scripts/build-icon.mjs')
    process.exit(1)
  }

  if (!existsSync(SRC_SVG)) {
    console.error('[build-icon] 找不到 SVG:', SRC_SVG)
    process.exit(1)
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const svgBuf = readFileSync(SRC_SVG)
  console.log('[build-icon] 渲染 SVG → 7 个 PNG ...')
  const pngBufs = []
  for (const size of SIZES) {
    const png = await sharp(svgBuf, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    pngBufs.push(png)
    console.log(`  ✓ ${size}×${size}  ${png.length} bytes`)
  }

  console.log('[build-icon] 顺手生成 512×512 PNG ...')
  const png512 = await sharp(svgBuf, { density: 768 })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  writeFileSync(OUT_PNG_512, png512)
  console.log(`  ✓ ${OUT_PNG_512}  ${png512.length} bytes`)

  console.log('[build-icon] 合成 ICO ...')
  const icoBuf = await pngToIco(pngBufs)
  writeFileSync(OUT_ICO, icoBuf)
  console.log(`✅ ${OUT_ICO}  ${icoBuf.length} bytes`)
}

main().catch((e) => {
  console.error('[build-icon] 失败:', e?.message || e)
  process.exit(1)
})
