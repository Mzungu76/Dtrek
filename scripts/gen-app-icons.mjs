// Regenerates EVERY app icon asset — DTrek Navigator's Android launcher icons AND the main
// DTrek PWA's icon set (public/icon-*.png, apple-touch-icon.png, favicon.ico) — from a single
// source artwork (scripts/assets/navigator-icon-source.png). Not part of the app runtime — run
// manually (`node scripts/gen-app-icons.mjs`) whenever the source icon changes.
//
// The source artwork is used full-bleed and unscaled — the footprint touches the canvas edge on
// every side, as if the art itself had been cropped to the icon. Only the negative space between
// tread blocks is transparent, so it's flattened onto a brand-green background. DTrek Navigator
// gets a darker green than the main DTrek PWA so the two apps read as distinct on a home screen
// while staying in the same brand family.
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'

const ROOT = path.resolve(import.meta.dirname, '..')
const SOURCE = path.join(ROOT, 'scripts/assets/navigator-icon-source.png')
const DTREK_GREEN = { r: 0x27, g: 0x71, b: 0x34 } // #277134 — public/manifest.json theme_color
const NAVIGATOR_GREEN = { r: 0x1e, g: 0x56, b: 0x31 } // #1e5631 — darker pine green, distinct from DTrek

async function paddedIcon(size, background) {
  const content = await sharp(SOURCE).resize(size, size).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: content, left: 0, top: 0 }])
    .png()
    .toBuffer()
}

async function writeIcon(size, background, dest) {
  await writeFile(dest, await paddedIcon(size, background))
  console.log(`✓ ${path.relative(ROOT, dest)}`)
}

// ── DTrek Navigator (Android) ───────────────────────────────────────────────
const RES = path.join(ROOT, 'android/app/src/main/res')
const DENSITIES = [
  { dir: 'mipmap-mdpi',    legacy: 48,  foreground: 108 },
  { dir: 'mipmap-hdpi',    legacy: 72,  foreground: 162 },
  { dir: 'mipmap-xhdpi',   legacy: 96,  foreground: 216 },
  { dir: 'mipmap-xxhdpi',  legacy: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, foreground: 432 },
]
for (const { dir, legacy, foreground } of DENSITIES) {
  const base = path.join(RES, dir)
  await writeIcon(legacy, NAVIGATOR_GREEN, path.join(base, 'ic_launcher.png'))
  await writeIcon(legacy, NAVIGATOR_GREEN, path.join(base, 'ic_launcher_round.png'))
  await writeIcon(foreground, NAVIGATOR_GREEN, path.join(base, 'ic_launcher_foreground.png'))
}

// ── Main DTrek PWA ───────────────────────────────────────────────────────────
const PUBLIC = path.join(ROOT, 'public')
await writeIcon(512, DTREK_GREEN, path.join(PUBLIC, 'icon-512-maskable.png'))
await writeIcon(512, DTREK_GREEN, path.join(PUBLIC, 'icon-512.png'))
await writeIcon(192, DTREK_GREEN, path.join(PUBLIC, 'icon-192.png'))
await writeIcon(180, DTREK_GREEN, path.join(PUBLIC, 'apple-touch-icon.png'))

const favicon32 = await paddedIcon(32, DTREK_GREEN)
const favicon16 = await paddedIcon(16, DTREK_GREEN)
const icoBuffer = await pngToIco([favicon32, favicon16])
await writeFile(path.join(PUBLIC, 'favicon.ico'), icoBuffer)
console.log('✓ public/favicon.ico')
