// One-off script: regenerate DTrek Navigator's Android launcher icons from DTrek's own icon
// asset (public/icon-512-maskable.png) instead of the old placeholder blue-X mark, so the native
// app icon actually reads as DTrek. Not part of the app runtime — run manually
// (`node scripts/gen-navigator-icons.mjs`) whenever the source icon changes.
//
// The source is full-bleed (boot print touches the canvas edges) — fine for a PWA maskable icon,
// where the OS applies its own safe-zone crop, but shown flat on Android (legacy icon, or an
// adaptive-icon mask shape that doesn't crop as tightly as expected) it read as awkwardly cut
// off. So this pads: the artwork is scaled down to CONTENT_SCALE of the canvas and centered on a
// solid canvas sampled from the source's own background color, leaving a visible margin on every
// side no matter what shape a launcher crops it to.
import sharp from 'sharp'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const RES = path.join(ROOT, 'android/app/src/main/res')
const SOURCE = path.join(ROOT, 'public/icon-512-maskable.png')

const CONTENT_SCALE = 0.72

const DENSITIES = [
  { dir: 'mipmap-mdpi',    legacy: 48,  foreground: 108 },
  { dir: 'mipmap-hdpi',    legacy: 72,  foreground: 162 },
  { dir: 'mipmap-xhdpi',   legacy: 96,  foreground: 216 },
  { dir: 'mipmap-xxhdpi',  legacy: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, foreground: 432 },
]

async function sampleBackground(source) {
  const { data } = await sharp(source).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  return { r: data[0], g: data[1], b: data[2] }
}

async function paddedIcon(source, size, background, dest) {
  const contentSize = Math.round(size * CONTENT_SCALE)
  const content = await sharp(source).resize(contentSize, contentSize).png().toBuffer()
  const offset = Math.round((size - contentSize) / 2)
  await sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: content, left: offset, top: offset }])
    .png()
    .toFile(dest)
}

const background = await sampleBackground(SOURCE)
console.log(`background sampled from source: rgb(${background.r}, ${background.g}, ${background.b})`)

for (const { dir, legacy, foreground } of DENSITIES) {
  const base = path.join(RES, dir)
  await paddedIcon(SOURCE, legacy, background, path.join(base, 'ic_launcher.png'))
  await paddedIcon(SOURCE, legacy, background, path.join(base, 'ic_launcher_round.png'))
  await paddedIcon(SOURCE, foreground, background, path.join(base, 'ic_launcher_foreground.png'))
  console.log(`✓ ${dir}`)
}
