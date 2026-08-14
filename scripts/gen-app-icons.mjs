// Regenerates EVERY app icon asset — DTrek Navigator's Android launcher icons AND the main
// DTrek PWA's icon set (public/icon-*.png, apple-touch-icon.png, favicon.ico) — from a single
// source artwork (scripts/assets/navigator-icon-source.png), flattened onto the app's brand
// green (#277134, manifest.json's theme_color). Not part of the app runtime — run manually
// (`node scripts/gen-app-icons.mjs`) whenever the source icon changes.
//
// The source is a transparent PNG whose opaque content already fills ~87% of the canvas height
// (measured, not eyeballed — see the alpha-density scan this replaced). Three different content
// scales are used because each destination crops differently:
//   - ADAPTIVE (0.72): Android's adaptive icon only GUARANTEES the inner ~66% diameter survives
//     every launcher's mask shape (circle, squircle, teardrop...) — 0.72 leaves margin on top of
//     that guarantee. Used for both the adaptive foreground layer and the legacy/round PNGs,
//     which Android can also circle-crop on older devices.
//   - MASKABLE (0.80): the PWA "maskable" purpose icon follows the standard maskable-icon safe
//     zone (content within the inner ~80%) — same idea, less aggressive because purpose-built
//     maskable handling is more predictable than Android's launcher zoo.
//   - PLAIN (0.85): "any"-purpose square icons (icon-512, icon-192, apple-touch-icon, favicon) —
//     shown as a flat square or with mild OS-applied corner rounding, so they can sit closer to
//     full-bleed without risking a cropped look.
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'

const ROOT = path.resolve(import.meta.dirname, '..')
const SOURCE = path.join(ROOT, 'scripts/assets/navigator-icon-source.png')
const BACKGROUND = { r: 0x27, g: 0x71, b: 0x34 } // #277134 — manifest.json theme_color

async function paddedIcon(size, scale) {
  const contentSize = Math.round(size * scale)
  const content = await sharp(SOURCE).resize(contentSize, contentSize).png().toBuffer()
  const offset = Math.round((size - contentSize) / 2)
  return sharp({ create: { width: size, height: size, channels: 3, background: BACKGROUND } })
    .composite([{ input: content, left: offset, top: offset }])
    .png()
    .toBuffer()
}

async function writeIcon(size, scale, dest) {
  await writeFile(dest, await paddedIcon(size, scale))
  console.log(`✓ ${path.relative(ROOT, dest)}`)
}

// ── DTrek Navigator (Android) ───────────────────────────────────────────────
const RES = path.join(ROOT, 'android/app/src/main/res')
const ADAPTIVE_SCALE = 0.72
const DENSITIES = [
  { dir: 'mipmap-mdpi',    legacy: 48,  foreground: 108 },
  { dir: 'mipmap-hdpi',    legacy: 72,  foreground: 162 },
  { dir: 'mipmap-xhdpi',   legacy: 96,  foreground: 216 },
  { dir: 'mipmap-xxhdpi',  legacy: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, foreground: 432 },
]
for (const { dir, legacy, foreground } of DENSITIES) {
  const base = path.join(RES, dir)
  await writeIcon(legacy, ADAPTIVE_SCALE, path.join(base, 'ic_launcher.png'))
  await writeIcon(legacy, ADAPTIVE_SCALE, path.join(base, 'ic_launcher_round.png'))
  await writeIcon(foreground, ADAPTIVE_SCALE, path.join(base, 'ic_launcher_foreground.png'))
}

// ── Main DTrek PWA ───────────────────────────────────────────────────────────
const PUBLIC = path.join(ROOT, 'public')
await writeIcon(512, 0.80, path.join(PUBLIC, 'icon-512-maskable.png'))
await writeIcon(512, 0.85, path.join(PUBLIC, 'icon-512.png'))
await writeIcon(192, 0.85, path.join(PUBLIC, 'icon-192.png'))
await writeIcon(180, 0.85, path.join(PUBLIC, 'apple-touch-icon.png'))

const favicon32 = await paddedIcon(32, 0.85)
const favicon16 = await paddedIcon(16, 0.85)
const icoBuffer = await pngToIco([favicon32, favicon16])
await writeFile(path.join(PUBLIC, 'favicon.ico'), icoBuffer)
console.log('✓ public/favicon.ico')
