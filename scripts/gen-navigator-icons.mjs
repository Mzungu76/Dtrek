// One-off script: regenerate DTrek Navigator's Android launcher icons from DTrek's own icon
// assets (public/icon-512.png, public/icon-512-maskable.png) instead of the old placeholder
// blue-X mark, so the native app icon actually reads as DTrek. Not part of the app runtime —
// run manually (`node scripts/gen-navigator-icons.mjs`) whenever the source icon changes.
import sharp from 'sharp'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const RES = path.join(ROOT, 'android/app/src/main/res')

const LEGACY_SOURCE = path.join(ROOT, 'public/icon-512.png')      // rounded-square treatment
const FOREGROUND_SOURCE = path.join(ROOT, 'public/icon-512-maskable.png') // full-bleed, safe-zone aware

const DENSITIES = [
  { dir: 'mipmap-mdpi',    legacy: 48,  foreground: 108 },
  { dir: 'mipmap-hdpi',    legacy: 72,  foreground: 162 },
  { dir: 'mipmap-xhdpi',   legacy: 96,  foreground: 216 },
  { dir: 'mipmap-xxhdpi',  legacy: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, foreground: 432 },
]

async function resizeTo(source, size, dest) {
  await sharp(source).resize(size, size).png().toFile(dest)
}

for (const { dir, legacy, foreground } of DENSITIES) {
  const base = path.join(RES, dir)
  await resizeTo(LEGACY_SOURCE, legacy, path.join(base, 'ic_launcher.png'))
  await resizeTo(LEGACY_SOURCE, legacy, path.join(base, 'ic_launcher_round.png'))
  await resizeTo(FOREGROUND_SOURCE, foreground, path.join(base, 'ic_launcher_foreground.png'))
  console.log(`✓ ${dir}`)
}
