'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl, { Map as MLMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'
import { X, Play, Pause, RotateCcw, Mountain, Camera, Images, Film,
  Download, Share2, ChevronLeft, ChevronRight, ImagePlus, User,
  Loader2, GripVertical, Eye } from 'lucide-react'
import StreetViewPanel from '@/components/StreetViewPanel'
import { fetchDayHourly, wmoInfo } from '@/lib/openmeteo'
import { getProfile } from '@/lib/userProfile'

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''

// Preview playback speeds (10x/30x removed — too fast to be useful)
const SPEEDS = [
  { label: '½×',  v: 0.5 },
  { label: '1×',  v: 1   },
  { label: '3×',  v: 3   },
]

const STYLES = [
  { label: 'Outdoor',   url: () => `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${KEY}` },
  { label: 'Satellite', url: () => `https://api.maptiler.com/maps/hybrid/style.json?key=${KEY}` },
  { label: 'Winter',    url: () => `https://api.maptiler.com/maps/winter-v2/style.json?key=${KEY}` },
]

const VIDEO_DIMS: Record<string, [number, number]> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1':  [1080, 1080],
}

// ── Types ──────────────────────────────────────────────────────────────────────

type VideoState = 'idle' | 'config' | 'postprod' | 'rendering' | 'done'

type BearingMode = 'follow' | 'orbit-cw' | 'orbit-ccw' | 'side-left' | 'side-right' | 'overhead'

interface ShotSegment {
  id:          string
  label:       string
  startP:      number
  endP:        number
  pitch:       [number, number]   // [start, end]
  zoom:        [number, number]
  bearingMode: BearingMode
  orbitDeg?:   number             // total orbit degrees over shot duration
}

interface RoutePhoto {
  id:       string
  dataUrl:  string
  progress: number    // 0-1 on route timeline
  caption?: string
}

// ── Geo helpers ────────────────────────────────────────────────────────────────
function rad(d: number) { return d * Math.PI / 180 }

function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const a = Math.sin(rad((lat2 - lat1) / 2)) ** 2
          + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad((lon2 - lon1) / 2)) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = rad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(rad(lat2))
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function smoothArray(arr: number[], half = 4): number[] {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - half), Math.min(arr.length, i + half + 1))
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

// ── Cinematic shot planner ─────────────────────────────────────────────────────
function planShots(pts: TrackPoint[]): ShotSegment[] {
  const N = pts.length
  if (N < 2) return []

  // Compute per-point altitude for finding peaks
  const alts = pts.map(p => p.altitudeMeters ?? 0)
  const maxAlt = Math.max(...alts)
  const minAlt = Math.min(...alts)

  // Find peak region (highest sustained altitude)
  let peakCenterP = 0.5
  let bestSum = -Infinity
  const W = Math.round(N * 0.08)
  for (let i = W; i < N - W; i++) {
    const sum = alts.slice(i - W, i + W).reduce((a, b) => a + b, 0)
    if (sum > bestSum) { bestSum = sum; peakCenterP = i / (N - 1) }
  }
  const hasMeaningfulElevation = (maxAlt - minAlt) > 200

  const shots: ShotSegment[] = []

  // Opening aerial sweep (0–10%)
  shots.push({
    id: 'intro', label: 'Intro aereo',
    startP: 0, endP: 0.10,
    pitch: [45, 68], zoom: [11.5, 13.5],
    bearingMode: 'orbit-cw', orbitDeg: 60,
  })

  // First chase segment (10–30%)
  shots.push({
    id: 'chase1', label: 'Seguimento',
    startP: 0.10, endP: 0.30,
    pitch: [65, 62], zoom: [14.2, 14.5],
    bearingMode: 'follow',
  })

  if (hasMeaningfulElevation && peakCenterP > 0.25 && peakCenterP < 0.85) {
    const ps = Math.max(0.30, peakCenterP - 0.12)
    const pe = Math.min(0.90, peakCenterP + 0.12)

    // Approach: side view (shows the slope dramatically)
    shots.push({
      id: 'approach', label: 'Vista laterale',
      startP: 0.30, endP: ps,
      pitch: [55, 60], zoom: [13.8, 14.0],
      bearingMode: 'side-right',
    })

    // Peak orbit: dramatic bird's-eye spin
    shots.push({
      id: 'peak', label: 'Vetta — orbita',
      startP: ps, endP: pe,
      pitch: [72, 78], zoom: [13.0, 12.5],
      bearingMode: 'orbit-cw', orbitDeg: 120,
    })

    // Descent chase
    shots.push({
      id: 'descent', label: 'Discesa',
      startP: pe, endP: 0.90,
      pitch: [62, 58], zoom: [14.2, 14.0],
      bearingMode: 'follow',
    })
  } else {
    // Flat route: alternate follow / side views
    shots.push({
      id: 'mid1', label: 'Vista laterale',
      startP: 0.30, endP: 0.55,
      pitch: [52, 55], zoom: [13.8, 14.0],
      bearingMode: 'side-left',
    })
    shots.push({
      id: 'mid2', label: 'Seguimento',
      startP: 0.55, endP: 0.90,
      pitch: [64, 62], zoom: [14.3, 14.5],
      bearingMode: 'follow',
    })
  }

  // Outro pullback (90–100%)
  shots.push({
    id: 'outro', label: 'Finale — panoramica',
    startP: 0.90, endP: 1.0,
    pitch: [68, 48], zoom: [13.5, 11.0],
    bearingMode: 'orbit-ccw', orbitDeg: 80,
  })

  return shots
}

// Camera params interpolated across a shot + global progress
function shotCamera(
  shot: ShotSegment,
  routeBearing: number,
  p: number,                   // global progress 0-1
  orbitBaseRef: React.MutableRefObject<number>,
): { pitch: number; zoom: number; bearing: number } {
  const t  = (p - shot.startP) / (shot.endP - shot.startP)
  const tc = Math.max(0, Math.min(1, t))
  const pitch = lerp(shot.pitch[0], shot.pitch[1], tc)
  const zoom  = lerp(shot.zoom[0],  shot.zoom[1],  tc)

  let bearing = routeBearing
  switch (shot.bearingMode) {
    case 'orbit-cw':
      bearing = orbitBaseRef.current + tc * (shot.orbitDeg ?? 90)
      break
    case 'orbit-ccw':
      bearing = orbitBaseRef.current - tc * (shot.orbitDeg ?? 90)
      break
    case 'side-left':
      bearing = routeBearing - 90
      break
    case 'side-right':
      bearing = routeBearing + 90
      break
    case 'overhead':
      bearing = routeBearing
      break
  }
  return { pitch, zoom, bearing: (bearing + 360) % 360 }
}

// ── Canvas helpers ─────────────────────────────────────────────────────────────
function coverRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const srcAr = srcW / srcH, dstAr = dstW / dstH
  if (srcAr > dstAr) {
    const sw = Math.round(srcH * dstAr)
    return { sx: Math.round((srcW - sw) / 2), sy: 0, sw, sh: srcH }
  }
  const sh = Math.round(srcW / dstAr)
  return { sx: 0, sy: Math.round((srcH - sh) / 2), sw: srcW, sh }
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + cr, y); ctx.lineTo(x + w - cr, y); ctx.arcTo(x+w, y, x+w, y+cr, cr)
  ctx.lineTo(x+w, y+h-cr); ctx.arcTo(x+w, y+h, x+w-cr, y+h, cr)
  ctx.lineTo(x+cr, y+h); ctx.arcTo(x, y+h, x, y+h-cr, cr)
  ctx.lineTo(x, y+cr); ctx.arcTo(x, y, x+cr, y, cr)
  ctx.closePath()
}

// ── Hiker avatar drawing ───────────────────────────────────────────────────────
function drawHiker(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  bearing: number,
  walkPhase: number,           // increases monotonically with frames
  scale: number,               // 1 = 1080p base
  faceImg: HTMLImageElement | null,
) {
  const s = 26 * scale
  const cycle = (walkPhase * 0.18) % (Math.PI * 2)
  const legSwing  = Math.sin(cycle) * 0.42
  const armSwing  = -Math.sin(cycle) * 0.32
  const bodyBob   = Math.abs(Math.sin(cycle)) * 1.2 * scale   // vertical bounce

  ctx.save()
  ctx.translate(cx, cy - bodyBob)
  ctx.rotate((bearing - 90) * Math.PI / 180)

  // Shadow under feet
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(0, s * 2.1, s * 0.85, s * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()

  // ── Backpack ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#92400e'
  rrect(ctx, -s * 1.05, -s * 1.35, s * 0.52, s * 0.95, 4 * scale)
  ctx.fill()
  // small pocket
  ctx.fillStyle = '#78350f'
  rrect(ctx, -s * 0.92, -s * 0.85, s * 0.28, s * 0.32, 2 * scale)
  ctx.fill()

  // ── Legs ────────────────────────────────────────────────────────────────────
  const legW = s * 0.38
  ctx.lineCap  = 'round'
  ctx.lineJoin = 'round'

  ;[legSwing, -legSwing].forEach((angle, li) => {
    ctx.save()
    ctx.translate(li === 0 ? -s * 0.28 : s * 0.28, s * 0.55)
    ctx.rotate(angle)
    // Upper leg
    ctx.strokeStyle = '#1e3a5f'
    ctx.lineWidth = legW
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.85); ctx.stroke()
    // Lower leg
    ctx.save()
    ctx.translate(0, s * 0.85)
    ctx.rotate(-angle * 0.6)
    ctx.strokeStyle = '#1e40af'
    ctx.lineWidth = legW * 0.85
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.78); ctx.stroke()
    // Boot
    ctx.strokeStyle = '#1c1917'
    ctx.lineWidth = legW * 0.95
    ctx.beginPath(); ctx.moveTo(0, s*0.78); ctx.lineTo(s * 0.28, s * 0.78); ctx.stroke()
    ctx.restore()
    ctx.restore()
  })

  // ── Torso ────────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#1d4ed8'
  ctx.beginPath()
  ctx.moveTo(-s * 0.55, -s * 0.05)
  ctx.lineTo(-s * 0.52,  -s * 1.3)
  ctx.lineTo( s * 0.52,  -s * 1.3)
  ctx.lineTo( s * 0.55, -s * 0.05)
  ctx.closePath()
  ctx.fill()
  // Collar
  ctx.fillStyle = '#1e3a8a'
  ctx.fillRect(-s * 0.2, -s * 1.3, s * 0.4, s * 0.22)

  // ── Arms ─────────────────────────────────────────────────────────────────────
  ;[armSwing, -armSwing].forEach((angle, ai) => {
    ctx.save()
    ctx.translate(ai === 0 ? -s * 0.52 : s * 0.52, -s * 1.15)
    ctx.rotate(angle)
    ctx.strokeStyle = '#1d4ed8'
    ctx.lineWidth = s * 0.34
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ai === 0 ? -s*0.1 : s*0.1, s * 0.72); ctx.stroke()
    // Hand with hiking pole (lead arm)
    if (ai === 0) {
      ctx.save()
      ctx.translate(ai === 0 ? -s*0.1 : s*0.1, s * 0.72)
      ctx.strokeStyle = '#9ca3af'
      ctx.lineWidth = s * 0.1
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s * 0.15, s * 0.7); ctx.stroke()
      // pole tip disc
      ctx.fillStyle = '#6b7280'
      ctx.beginPath(); ctx.arc(-s * 0.15, s * 0.7, s * 0.14, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  })

  // ── Head ─────────────────────────────────────────────────────────────────────
  const headR = s * 0.72
  const headY = -s * 1.3 - headR

  ctx.save()
  ctx.beginPath()
  ctx.arc(0, headY, headR, 0, Math.PI * 2)
  ctx.clip()
  if (faceImg) {
    ctx.drawImage(faceImg, -headR, headY - headR, headR * 2, headR * 2)
  } else {
    // Default cartoon face
    ctx.fillStyle = '#fde68a'
    ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill()
    // Eyes
    ctx.fillStyle = '#1c1917'
    ctx.beginPath(); ctx.arc(-headR * 0.3, headY - headR * 0.1, headR * 0.13, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc( headR * 0.3, headY - headR * 0.1, headR * 0.13, 0, Math.PI * 2); ctx.fill()
    // Smile
    ctx.strokeStyle = '#92400e'
    ctx.lineWidth = scale * 2.5
    ctx.beginPath()
    ctx.arc(0, headY + headR * 0.1, headR * 0.38, 0.25, Math.PI - 0.25)
    ctx.stroke()
  }
  ctx.restore()

  // Head outline
  ctx.strokeStyle = '#1c1917'
  ctx.lineWidth = 2.5 * scale
  ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.stroke()

  // ── Hiking hat ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#d97706'
  // brim
  ctx.beginPath()
  ctx.ellipse(0, headY - headR * 0.7, headR * 1.1, headR * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  // crown
  rrect(ctx, -headR * 0.7, headY - headR * 1.55, headR * 1.4, headR * 0.9, headR * 0.4)
  ctx.fillStyle = '#b45309'
  ctx.fill()
  // hatband
  ctx.fillStyle = '#1c1917'
  ctx.fillRect(-headR * 0.7, headY - headR * 0.78, headR * 1.4, headR * 0.15)

  ctx.restore()
}

// ── Photo polaroid overlay ─────────────────────────────────────────────────────
interface ActiveOverlay {
  photo:     RoutePhoto
  img:       HTMLImageElement
  startFrame: number
  holdFrames: number
}

function drawPolaroid(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  overlay: ActiveOverlay,
  currentFrame: number,
) {
  const { startFrame, holdFrames, photo, img } = overlay
  const t = (currentFrame - startFrame) / holdFrames
  if (t < 0 || t > 1) return

  const SLIDE = 0.12
  let slideX = 0
  if (t < SLIDE)             slideX =  w * 0.38 * (1 - t / SLIDE)
  else if (t > 1 - SLIDE)   slideX =  w * 0.38 * ((t - (1 - SLIDE)) / SLIDE)

  const pW  = Math.round(w * 0.32)
  const pad = Math.round(pW * 0.05)
  const imgSz = pW - pad * 2
  const capH  = Math.round(pW * 0.16)
  const pH    = imgSz + pad * 3 + capH
  const pX    = w - pW - Math.round(w * 0.04) + Math.round(slideX)
  const pY    = Math.round(h * 0.18)

  ctx.save()
  ctx.translate(pX + pW / 2, pY + pH / 2)
  ctx.rotate(-0.04)
  ctx.translate(-pW / 2, -pH / 2)

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur  = 18
  ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 8
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, pW, pH)
  ctx.shadowColor = 'transparent'

  // Photo
  ctx.drawImage(img, pad, pad, imgSz, imgSz)

  // Caption
  const caption = photo.caption ?? ''
  if (caption) {
    ctx.fillStyle = '#1c1917'
    ctx.font      = `italic ${Math.round(pW * 0.075)}px Georgia,serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(caption.slice(0, 32), pW / 2, imgSz + pad * 2 + capH / 2)
  }

  ctx.restore()
}

// ── Graph helpers (unchanged) ──────────────────────────────────────────────────
interface GraphData {
  series: number[]; label: string; icon: string; strokeColor: string
  fillColor: string; minVal: number; maxVal: number; currentValue: number
}

function drawGraph(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, gw: number, gh: number,
  sc: number, progress: number, g: GraphData,
) {
  if (!g.series.length || g.maxVal <= g.minVal) return
  ctx.save()
  ctx.fillStyle = 'rgba(10,10,10,0.62)'
  rrect(ctx, x, y, gw, gh, 14 * sc); ctx.fill()
  const pad = Math.round(16 * sc), valW = Math.round(148 * sc)
  const lineX = x + valW, lineW = gw - valW - pad
  const lineY = y + Math.round(10 * sc), lineH = gh - Math.round(20 * sc)
  const range = g.maxVal - g.minVal
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = g.strokeColor
  ctx.font = `bold ${Math.round(19*sc)}px -apple-system,sans-serif`
  ctx.fillText(`${g.icon}  ${g.label}`, x + pad, y + Math.round(10*sc))
  ctx.fillStyle = 'white'; ctx.textBaseline = 'bottom'
  ctx.font = `bold ${Math.round(46*sc)}px -apple-system,sans-serif`
  ctx.fillText(`${Math.round(g.currentValue)}`, x + pad, y + gh - Math.round(10*sc))
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(lineX, y + Math.round(14*sc), 1, gh - Math.round(28*sc))
  const pts = g.series.map((v, i) => ({
    px: lineX + (i / (g.series.length - 1)) * lineW,
    py: lineY + lineH - Math.max(0, Math.min(1, (v - g.minVal) / range)) * lineH,
  }))
  const ag = ctx.createLinearGradient(0, lineY, 0, lineY + lineH)
  ag.addColorStop(0, g.fillColor); ag.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.beginPath()
  pts.forEach(({px,py},i) => i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py))
  ctx.lineTo(pts[pts.length-1].px, lineY+lineH); ctx.lineTo(pts[0].px, lineY+lineH)
  ctx.closePath(); ctx.fillStyle = ag; ctx.fill()
  ctx.strokeStyle = g.strokeColor; ctx.lineWidth = 2.5*sc; ctx.lineJoin='round'; ctx.lineCap='round'
  ctx.beginPath()
  pts.forEach(({px,py},i) => i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py))
  ctx.stroke()
  const cx2 = lineX + progress * lineW
  ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=1.5*sc
  ctx.setLineDash([4*sc,4*sc]); ctx.beginPath(); ctx.moveTo(cx2,lineY); ctx.lineTo(cx2,lineY+lineH); ctx.stroke(); ctx.restore()
  const ci = Math.min(Math.round(progress*(g.series.length-1)),g.series.length-1)
  const cdp = pts[ci]
  if (cdp) {
    ctx.fillStyle=g.strokeColor; ctx.strokeStyle='white'; ctx.lineWidth=2.5*sc
    ctx.beginPath(); ctx.arc(cdp.px,cdp.py,6*sc,0,Math.PI*2); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}

// ── HUD overlay ────────────────────────────────────────────────────────────────
interface HUDOpts {
  showTitle:boolean;title:string;showStats:boolean;coveredKm:number;totalKm:number
  alt:number;elevGain:number;showProgress:boolean;progress:number
  showBody:boolean;hrData?:GraphData;speedData?:GraphData
  shotLabel?: string
}

function drawHUD(ctx: CanvasRenderingContext2D, w: number, h: number, opts: HUDOpts) {
  const sc = Math.min(w, h) / 1080
  const pad=Math.round(40*sc), lineH=Math.round(52*sc), statSz=Math.round(32*sc)
  const labelSz=Math.round(22*sc), brandSz=Math.round(22*sc), graphH=Math.round(116*sc), graphGap=Math.round(16*sc)
  const hasBody = opts.showBody && (opts.hrData || opts.speedData)
  const gradTop = hasBody ? h*0.58 : h*0.72
  const grad = ctx.createLinearGradient(0, gradTop, 0, h)
  grad.addColorStop(0,'rgba(0,0,0,0)'); grad.addColorStop(0.5,'rgba(0,0,0,0.55)'); grad.addColorStop(1,'rgba(0,0,0,0.88)')
  ctx.fillStyle = grad; ctx.fillRect(0, gradTop, w, h - gradTop)
  ctx.textAlign = 'left'; let yBase = h - pad
  if (opts.showProgress) {
    const barH = Math.max(6, Math.round(8*sc)); yBase -= barH
    ctx.fillStyle='rgba(255,255,255,0.22)'; rrect(ctx,0,yBase,w,barH,barH/2); ctx.fill()
    if (opts.progress>0) { ctx.fillStyle='#3b82f6'; rrect(ctx,0,yBase,Math.max(barH,w*opts.progress),barH,barH/2); ctx.fill() }
    yBase -= Math.round(20*sc)
  }
  if (opts.showStats) {
    ctx.textBaseline='bottom'; ctx.font=`bold ${statSz}px -apple-system,sans-serif`; ctx.fillStyle='white'
    ctx.fillText(`${opts.coveredKm}/${opts.totalKm} km`, pad, yBase)
    const aT=`${opts.alt} m`; ctx.fillText(aT,(w-ctx.measureText(aT).width)/2,yBase)
    ctx.fillStyle='rgba(255,255,255,0.82)'; const gT=`+${opts.elevGain} m`
    ctx.fillText(gT, w-ctx.measureText(gT).width-pad, yBase); yBase -= lineH
  }
  if (opts.showTitle && opts.title) {
    ctx.textBaseline='bottom'; ctx.font=`600 ${labelSz}px -apple-system,sans-serif`; ctx.fillStyle='rgba(255,255,255,0.78)'
    let t=opts.title; while(ctx.measureText(t).width>w-pad*2&&t.length>4) t=t.slice(0,-4)+'…'
    ctx.fillText(t,pad,yBase); yBase -= lineH
  }
  if (opts.shotLabel) {
    // Top-left shot badge
    ctx.fillStyle='rgba(0,0,0,0.45)'
    rrect(ctx, Math.round(16*sc), Math.round(16*sc), ctx.measureText(opts.shotLabel).width + Math.round(24*sc), Math.round(32*sc), Math.round(8*sc))
    ctx.fill()
    ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.textBaseline='middle'; ctx.font=`${Math.round(14*sc)}px -apple-system,sans-serif`
    ctx.fillText(opts.shotLabel, Math.round(28*sc), Math.round(32*sc))
  }
  if (hasBody) {
    yBase -= Math.round(22*sc); const isPortrait=h>w
    if (isPortrait) {
      if (opts.speedData) { yBase-=graphH; drawGraph(ctx,pad,yBase,w-2*pad,graphH,sc,opts.progress,opts.speedData); yBase-=graphGap }
      if (opts.hrData)    { yBase-=graphH; drawGraph(ctx,pad,yBase,w-2*pad,graphH,sc,opts.progress,opts.hrData) }
    } else {
      const half=Math.floor((w-2*pad-graphGap)/2); yBase-=graphH
      if (opts.hrData&&opts.speedData) {
        drawGraph(ctx,pad,yBase,half,graphH,sc,opts.progress,opts.hrData)
        drawGraph(ctx,pad+half+graphGap,yBase,half,graphH,sc,opts.progress,opts.speedData)
      } else if (opts.hrData) drawGraph(ctx,pad,yBase,w-2*pad,graphH,sc,opts.progress,opts.hrData)
      else if (opts.speedData) drawGraph(ctx,pad,yBase,w-2*pad,graphH,sc,opts.progress,opts.speedData)
    }
  }
  ctx.textBaseline='bottom'; ctx.font=`bold ${brandSz}px -apple-system,sans-serif`; ctx.fillStyle='rgba(255,255,255,0.38)'
  const brand='DTrek'; ctx.fillText(brand,w-ctx.measureText(brand).width-pad,h-Math.round(10*sc))
}

// ── EXIF GPS reader ────────────────────────────────────────────────────────────
async function readExifGps(file: File): Promise<{ lat: number; lon: number } | null> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const buf = e.target?.result as ArrayBuffer
      if (!buf) { resolve(null); return }
      const view = new DataView(buf)
      // Minimal EXIF GPS parser
      try {
        if (view.getUint16(0) !== 0xFFD8) { resolve(null); return }
        let off = 2
        while (off < view.byteLength - 2) {
          const marker = view.getUint16(off); off += 2
          if (marker === 0xFFE1) {           // APP1
            const len = view.getUint16(off); off += 2
            const exifBytes = new Uint8Array(buf, off, 4)
            const exifHeader = Array.from(exifBytes).map(b => String.fromCharCode(b)).join('')
            if (exifHeader !== 'Exif') { resolve(null); return }
            const tiffStart = off + 6
            const tiffView = new DataView(buf, tiffStart)
            const littleEndian = tiffView.getUint16(0) === 0x4949
            const rd16 = (o: number) => tiffView.getUint16(o, littleEndian)
            const rd32 = (o: number) => tiffView.getUint32(o, littleEndian)
            const ifd0off = rd32(4)
            const nEntries = rd16(ifd0off)
            let gpsIfdOff = 0
            for (let i = 0; i < nEntries; i++) {
              const eOff = ifd0off + 2 + i * 12
              if (rd16(eOff) === 0x8825) { gpsIfdOff = rd32(eOff + 8); break }
            }
            if (!gpsIfdOff) { resolve(null); return }
            const gpsN = rd16(gpsIfdOff)
            const gpsData: Record<number, number[]> = {}
            for (let i = 0; i < gpsN; i++) {
              const eOff = gpsIfdOff + 2 + i * 12
              const tag = rd16(eOff), type = rd16(eOff+2), count = rd32(eOff+4)
              if (type === 5) {  // RATIONAL
                const valOff = rd32(eOff + 8)
                const vals: number[] = []
                for (let j = 0; j < count; j++) {
                  const num = rd32(valOff + j*8), den = rd32(valOff + j*8+4)
                  vals.push(den ? num / den : 0)
                }
                gpsData[tag] = vals
              }
            }
            const latArr = gpsData[2], lonArr = gpsData[4]
            if (!latArr || !lonArr) { resolve(null); return }
            const lat = latArr[0] + latArr[1]/60 + latArr[2]/3600
            const lon = lonArr[0] + lonArr[1]/60 + lonArr[2]/3600
            resolve({ lat, lon })
            return
          }
          off += view.getUint16(off) - 2 + 2
        }
      } catch {}
      resolve(null)
    }
    reader.readAsArrayBuffer(file.slice(0, 65536))
  })
}

// ── Main component ─────────────────────────────────────────────────────────────
interface Props {
  trackPoints: TrackPoint[]
  title?: string
  onClose: () => void
  plannedDate?: string
}

export default function RouteMap3D({ trackPoints, title, onClose, plannedDate }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<MLMap | null>(null)
  const markerRef     = useRef<Marker | null>(null)
  const animRef       = useRef<number>(0)
  const progressRef   = useRef(0)
  const lastTsRef     = useRef(0)
  const isPlayingRef  = useRef(false)
  const gpsRef        = useRef<TrackPoint[]>([])
  const totalDistRef  = useRef(0)
  const exaggRef      = useRef(1.5)
  const handleScrubRef= useRef<(p: number) => void>(() => {})
  const elevStatsRef  = useRef({ gain: 0, altMax: 0 })

  // Video refs
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null)
  const videoChunksRef     = useRef<Blob[]>([])
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoObjUrlRef     = useRef<string | null>(null)
  const orbitBaseRef       = useRef(0)    // bearing at start of current shot
  const walkPhaseRef       = useRef(0)    // monotonically increasing for walk animation
  const frameCountRef      = useRef(0)
  const renderAbortRef     = useRef(false)

  // Face image
  const faceImgRef    = useRef<HTMLImageElement | null>(null)
  const photoImgsRef  = useRef<Map<string, HTMLImageElement>>(new Map())

  const [mapReady,       setMapReady]      = useState(false)
  const [isPlaying,      setIsPlaying]     = useState(false)
  const [progress,       setProgress]      = useState(0)
  const [speedIdx,       setSpeedIdx]      = useState(1)
  const [styleIdx,       setStyleIdx]      = useState(0)
  const [exaggeration,   setExaggeration]  = useState(1.5)
  const [currentAlt,     setCurrentAlt]    = useState(0)
  const [coveredKm,      setCoveredKm]     = useState(0)
  const [shareToast,     setShareToast]    = useState('')
  const [showStreetView, setShowStreetView]= useState(false)
  const [streetViewPos,  setStreetViewPos] = useState<[number, number] | null>(null)

  // Video config
  const [videoState,        setVideoState]       = useState<VideoState>('idle')
  const [videoDuration,     setVideoDuration]    = useState(30)
  const [videoOrientation,  setVideoOrientation] = useState<'9:16'|'16:9'|'1:1'>('9:16')
  const [videoShowTitle,    setVideoShowTitle]   = useState(true)
  const [videoShowStats,    setVideoShowStats]   = useState(true)
  const [videoShowProgress, setVideoShowProgress]= useState(true)
  const [videoShowBody,     setVideoShowBody]    = useState(true)
  const [videoRecordedBlob, setVideoRecordedBlob]= useState<Blob | null>(null)
  const [renderProgress,    setRenderProgress]   = useState(0)
  const [renderFrame,       setRenderFrame]      = useState(0)
  const [renderTotal,       setRenderTotal]      = useState(0)

  // Post-production
  const [shotPlan,         setShotPlan]         = useState<ShotSegment[]>([])
  const [routePhotos,      setRoutePhotos]      = useState<RoutePhoto[]>([])
  const [previewShotId,    setPreviewShotId]    = useState<string | null>(null)
  const [photoBeingAdded,  setPhotoBeingAdded]  = useState(false)

  const gps = useRef(trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined))

  const hasBodyData = useMemo(() => {
    const pts = gps.current
    return pts.some(p => (p.heartRateBpm ?? 0) > 0) || (pts.length > 1 && pts.some(p => !!p.time))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const altitudeSeries = useMemo(() => {
    const pts = gps.current
    if (!pts.some(p => p.altitudeMeters !== undefined)) return []
    const N = pts.length, SAMPLES = Math.min(300, N)
    const step = (N - 1) / (SAMPLES - 1)
    return Array.from({ length: SAMPLES }, (_, i) => pts[Math.min(Math.round(i*step),N-1)].altitudeMeters ?? 0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [weatherBadge, setWeatherBadge] = useState<{ emoji:string; temp:number; label:string }|null>(null)

  // Load face from profile
  useEffect(() => {
    const face = getProfile().hikerFaceDataUrl
    if (!face) return
    const img = new Image()
    img.onload = () => { faceImgRef.current = img }
    img.src = face
  }, [])

  useEffect(() => {
    if (!plannedDate) return
    const pts = gps.current; if (!pts.length) return
    const cp = pts[Math.floor(pts.length/2)]
    if (!cp.lat || !cp.lon) return
    fetchDayHourly(cp.lat, cp.lon, plannedDate).then(hours => {
      const noon = hours.find(h => h.time.slice(11,13)==='12') ?? hours[Math.floor(hours.length/2)]
      if (noon) { const info=wmoInfo(noon.weathercode); setWeatherBadge({emoji:info.emoji,temp:Math.round(noon.temperature),label:info.label}) }
    }).catch(()=>{})
  }, [plannedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const setupLayers = useCallback(() => {
    const map=mapRef.current; if(!map) return
    const pts=gpsRef.current; const N=pts.length; if(N<2) return
    if (!map.getSource('terrain')) {
      map.addSource('terrain',{type:'raster-dem',url:`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${KEY}`,tileSize:512})
    }
    map.setTerrain({source:'terrain',exaggeration:exaggRef.current})
    if (!map.getLayer('sky')) {
      try { map.addLayer({id:'sky',type:'sky',paint:{'sky-type':'atmosphere','sky-atmosphere-sun':[0,90],'sky-atmosphere-sun-intensity':15}} as any) } catch {}
    }
    const coords=pts.map(p=>[p.lon!,p.lat!,p.altitudeMeters??0] as [number,number,number])
    if (map.getSource('route')) {
      (map.getSource('route') as any).setData({type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}})
    } else {
      map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}}})
    }
    if (!map.getLayer('route-casing')) map.addLayer({id:'route-casing',type:'line',source:'route',paint:{'line-color':'#ffffff','line-width':8,'line-opacity':0.55},layout:{'line-cap':'round','line-join':'round'}})
    if (!map.getLayer('route-line'))   map.addLayer({id:'route-line',type:'line',source:'route',paint:{'line-color':'#ff4444','line-width':4},layout:{'line-cap':'round','line-join':'round'}})
    const rawIdx=progressRef.current*(N-1), i0=Math.min(Math.floor(rawIdx),N-1)
    if (markerRef.current) markerRef.current.setLngLat([pts[i0].lon!,pts[i0].lat!])
  },[])

  useEffect(()=>{
    const pts=gps.current
    if(!containerRef.current||pts.length<2) return
    gpsRef.current=pts
    let cum=0,gain=0,altMax=pts[0].altitudeMeters??0
    for(let i=1;i<pts.length;i++){
      cum+=distM(pts[i-1].lat!,pts[i-1].lon!,pts[i].lat!,pts[i].lon!)
      const dAlt=(pts[i].altitudeMeters??0)-(pts[i-1].altitudeMeters??0)
      if(dAlt>0) gain+=dAlt
      if((pts[i].altitudeMeters??0)>altMax) altMax=pts[i].altitudeMeters??0
    }
    totalDistRef.current=cum; elevStatsRef.current={gain:Math.round(gain),altMax:Math.round(altMax)}
    setCurrentAlt(pts[0].altitudeMeters??0)
    let minLon=pts[0].lon!,maxLon=pts[0].lon!,minLat=pts[0].lat!,maxLat=pts[0].lat!
    for(const p of pts){
      if(p.lon!<minLon) minLon=p.lon!; if(p.lon!>maxLon) maxLon=p.lon!
      if(p.lat!<minLat) minLat=p.lat!; if(p.lat!>maxLat) maxLat=p.lat!
    }
    const map=new (maplibregl.Map as any)({container:containerRef.current!,style:STYLES[0].url(),
      center:[(minLon+maxLon)/2,(minLat+maxLat)/2],zoom:11,pitch:55,bearing:0,antialias:true,preserveDrawingBuffer:true}) as MLMap
    mapRef.current=map
    map.on('load',()=>{
      setupLayers()
      const mkEl=(c:string)=>{ const el=document.createElement('div'); el.style.cssText=`width:14px;height:14px;border-radius:50%;background:${c};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5)`; return el }
      new maplibregl.Marker({element:mkEl('#22c55e')}).setLngLat([pts[0].lon!,pts[0].lat!]).addTo(map)
      new maplibregl.Marker({element:mkEl('#ef4444')}).setLngLat([pts[pts.length-1].lon!,pts[pts.length-1].lat!]).addTo(map)
      const el=document.createElement('div')
      el.style.cssText='position:relative;width:24px;height:24px;'
      el.innerHTML=`<style>.pr{position:absolute;inset:-8px;border-radius:50%;background:rgba(59,130,246,.35);animation:p3d 1.6s ease-in-out infinite}@keyframes p3d{0%,100%{transform:scale(.7);opacity:.6}50%{transform:scale(1.3);opacity:.1}}</style><div class="pr"></div><div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.5)"></div>`
      const marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([pts[0].lon!,pts[0].lat!]).addTo(map)
      markerRef.current=marker
      map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:72,pitch:58,duration:2200})
      const onRouteClick=(e:any)=>{
        const g=gpsRef.current; if(g.length<2) return
        const {lat,lng}=e.lngLat; let minD=Infinity,bestIdx=0
        for(let i=0;i<g.length;i++){const d=distM(g[i].lat!,g[i].lon!,lat,lng);if(d<minD){minD=d;bestIdx=i}}
        handleScrubRef.current(bestIdx/(g.length-1))
      }
      map.on('click','route-casing',onRouteClick); map.on('click','route-line',onRouteClick)
      map.on('mouseenter','route-casing',()=>{map.getCanvas().style.cursor='pointer'})
      map.on('mouseleave','route-casing',()=>{map.getCanvas().style.cursor=''})
      setMapReady(true)
    })
    map.on('style.load',()=>{setupLayers();setMapReady(true)})
    return ()=>{
      cancelAnimationFrame(animRef.current)
      isPlayingRef.current=false
      if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){mediaRecorderRef.current.onstop=null;mediaRecorderRef.current.stop()}
      if(videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
      map.remove(); mapRef.current=null; markerRef.current=null
    }
  },[setupLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    exaggRef.current=exaggeration
    const map=mapRef.current; if(!map||!mapReady) return
    try{map.setTerrain({source:'terrain',exaggeration})}catch{}
  },[exaggeration,mapReady])

  const switchStyle=useCallback((idx:number)=>{setStyleIdx(idx);setMapReady(false);mapRef.current?.setStyle(STYLES[idx].url())},[])

  // Normal preview animation
  useEffect(()=>{
    isPlayingRef.current=isPlaying
    if(!isPlaying){cancelAnimationFrame(animRef.current);return}
    lastTsRef.current=0
    const pts=gpsRef.current,N=pts.length,totalKm=totalDistRef.current/1000
    const tick=(ts:number)=>{
      if(!isPlayingRef.current) return
      const dt=lastTsRef.current?ts-lastTsRef.current:16; lastTsRef.current=ts
      progressRef.current=Math.min(1,progressRef.current+(dt*SPEEDS[speedIdx].v)/90000)
      setProgress(progressRef.current)
      const rawIdx=progressRef.current*(N-1),i0=Math.floor(rawIdx),i1=Math.min(i0+1,N-1),frac=rawIdx-i0
      const p0=pts[i0],p1=pts[i1]
      const lon=p0.lon!+(p1.lon!-p0.lon!)*frac,lat=p0.lat!+(p1.lat!-p0.lat!)*frac
      const alt=(p0.altitudeMeters??0)+((p1.altitudeMeters??0)-(p0.altitudeMeters??0))*frac
      markerRef.current?.setLngLat([lon,lat])
      setCurrentAlt(Math.round(alt)); setCoveredKm(+(progressRef.current*totalKm).toFixed(1))
      const lookIdx=Math.min(i0+Math.max(3,Math.round(N*0.015)),N-1)
      const bear=bearingDeg(lat,lon,pts[lookIdx].lat!,pts[lookIdx].lon!)
      mapRef.current?.easeTo({center:[lon,lat],bearing:bear,pitch:68,zoom:14.5,duration:180})
      if(progressRef.current<1){animRef.current=requestAnimationFrame(tick)}else{setIsPlaying(false)}
    }
    animRef.current=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(animRef.current)
  },[isPlaying,speedIdx])

  const reset=useCallback(()=>{
    cancelAnimationFrame(animRef.current); isPlayingRef.current=false; progressRef.current=0
    setProgress(0);setIsPlaying(false)
    const pts=gpsRef.current; if(!pts.length) return
    markerRef.current?.setLngLat([pts[0].lon!,pts[0].lat!])
    setCurrentAlt(pts[0].altitudeMeters??0); setCoveredKm(0)
    let minLon=pts[0].lon!,maxLon=pts[0].lon!,minLat=pts[0].lat!,maxLat=pts[0].lat!
    for(const p of pts){if(p.lon!<minLon)minLon=p.lon!;if(p.lon!>maxLon)maxLon=p.lon!;if(p.lat!<minLat)minLat=p.lat!;if(p.lat!>maxLat)maxLat=p.lat!}
    mapRef.current?.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:72,pitch:58,duration:1200})
  },[])

  const handlePlay=()=>{if(progressRef.current>=1)reset();setIsPlaying(v=>!v)}

  const handleCapture=useCallback(async()=>{
    const map=mapRef.current; if(!map) return
    const dataUrl=map.getCanvas().toDataURL('image/png')
    const blob=await(await fetch(dataUrl)).blob()
    const file=new File([blob],`dtrek-3d-${Date.now()}.png`,{type:'image/png'})
    if(typeof navigator!=='undefined'&&(navigator as any).canShare?.({files:[file]})){
      try{await navigator.share({title:title??'Percorso 3D',text:'DTrek — Vista 3D del percorso',files:[file]});return}catch{}
    }
    const a=document.createElement('a');a.href=dataUrl;a.download=`dtrek-3d-${Date.now()}.png`;a.click()
    setShareToast('Screenshot salvato!');setTimeout(()=>setShareToast(''),2500)
  },[title])

  const handleStreetViewHere=useCallback(()=>{
    const pts=gpsRef.current; if(!pts.length) return
    const i0=Math.min(Math.floor(progressRef.current*(pts.length-1)),pts.length-1)
    setStreetViewPos([pts[i0].lat!,pts[i0].lon!]);setShowStreetView(true)
  },[])

  const handleScrub=useCallback((p:number)=>{
    const pts=gpsRef.current; if(!pts.length) return
    if(isPlayingRef.current){isPlayingRef.current=false;setIsPlaying(false);cancelAnimationFrame(animRef.current)}
    progressRef.current=p;setProgress(p)
    const rawIdx=p*(pts.length-1),i0=Math.min(Math.floor(rawIdx),pts.length-1),i1=Math.min(i0+1,pts.length-1),frac=rawIdx-i0
    const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac,lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
    const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac
    markerRef.current?.setLngLat([lon,lat]);setCurrentAlt(Math.round(alt));setCoveredKm(+(p*totalDistRef.current/1000).toFixed(1))
    const lookIdx=Math.min(i0+Math.max(3,Math.round(pts.length*0.015)),pts.length-1)
    const bear=bearingDeg(lat,lon,pts[lookIdx].lat!,pts[lookIdx].lon!)
    mapRef.current?.easeTo({center:[lon,lat],bearing:bear,pitch:68,zoom:14.5,duration:300})
  },[]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{handleScrubRef.current=handleScrub},[handleScrub])

  // ── Photo loading ────────────────────────────────────────────────────────────

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setPhotoBeingAdded(true)
    const pts = gpsRef.current

    for (const file of files) {
      const dataUrl = await new Promise<string>(res => {
        const r = new FileReader(); r.onload = ev => res(ev.target!.result as string); r.readAsDataURL(file)
      })

      // Load image element
      const img = new Image()
      await new Promise<void>(res => { img.onload = () => res(); img.src = dataUrl })

      // Square-crop to 800px
      const size = Math.min(img.width, img.height)
      const cropCanvas = document.createElement('canvas'); cropCanvas.width = cropCanvas.height = 800
      const cropCtx = cropCanvas.getContext('2d')!
      cropCtx.drawImage(img, (img.width-size)/2, (img.height-size)/2, size, size, 0, 0, 800, 800)
      const croppedUrl = cropCanvas.toDataURL('image/jpeg', 0.82)

      // Attempt EXIF GPS
      let progress = 0.5  // default to middle of route
      const gpsCoords = await readExifGps(file)
      if (gpsCoords && pts.length > 1) {
        let minD = Infinity, bestIdx = 0
        for (let i = 0; i < pts.length; i++) {
          const d = distM(pts[i].lat!, pts[i].lon!, gpsCoords.lat, gpsCoords.lon)
          if (d < minD) { minD = d; bestIdx = i }
        }
        progress = bestIdx / (pts.length - 1)
      }

      const id = `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const croppedImg = new Image(); croppedImg.src = croppedUrl
      await new Promise<void>(res => { croppedImg.onload = () => res() })
      photoImgsRef.current.set(id, croppedImg)

      setRoutePhotos(prev => [...prev, { id, dataUrl: croppedUrl, progress, caption: file.name.replace(/\.[^.]+$/, '').slice(0, 32) }])
    }
    setPhotoBeingAdded(false)
  }

  // ── Cinematic recording ──────────────────────────────────────────────────────

  // Called when user moves from config → postprod
  function goToPostProd() {
    const shots = planShots(gpsRef.current)
    setShotPlan(shots)
    setVideoState('postprod')
  }

  function moveShot(id: string, dir: -1 | 1) {
    setShotPlan(prev => {
      const idx = prev.findIndex(s => s.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swapIdx = idx + dir
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      // Re-distribute startP/endP proportionally
      let p = 0
      return next.map((s, i) => {
        const origDur = s.endP - s.startP
        const sP = p; const eP = Math.min(1, p + origDur); p = eP
        return { ...s, startP: sP, endP: i === next.length-1 ? 1 : eP }
      })
    })
  }

  const startRendering = useCallback(() => {
    const map = mapRef.current; if (!map) return
    if (typeof MediaRecorder === 'undefined') {
      setShareToast('Registrazione video non supportata su questo browser')
      setTimeout(() => setShareToast(''), 3000); setVideoState('idle'); return
    }

    cancelAnimationFrame(animRef.current); isPlayingRef.current=false; setIsPlaying(false)
    progressRef.current=0; setProgress(0)
    const pts=gpsRef.current; if(pts.length<2) return

    // Hide HTML marker during recording
    const markerEl = markerRef.current?.getElement()
    if (markerEl) markerEl.style.opacity = '0'

    const mapCanvas=map.getCanvas()
    const srcW=mapCanvas.width, srcH=mapCanvas.height
    const [outW,outH]=VIDEO_DIMS[videoOrientation]
    const composite=document.createElement('canvas'); composite.width=outW; composite.height=outH
    compositeCanvasRef.current=composite
    const ctx=composite.getContext('2d')!

    const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4']
      .find(t=>MediaRecorder.isTypeSupported(t))??''
    const stream=(composite as any).captureStream(30) as MediaStream
    const recorder=new MediaRecorder(stream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:10_000_000})
    videoChunksRef.current=[]
    recorder.ondataavailable=(e:BlobEvent)=>{if(e.data.size>0)videoChunksRef.current.push(e.data)}
    recorder.onstop=()=>{
      const blob=new Blob(videoChunksRef.current,{type:mimeType||'video/webm'})
      setVideoRecordedBlob(blob); setVideoState('done')
      if(markerEl) markerEl.style.opacity='1'
    }
    mediaRecorderRef.current=recorder; recorder.start(100)

    // Pre-compute body data
    const N=pts.length, SAMPLES=Math.min(300,N), step=(N-1)/(SAMPLES-1)
    const rawHr=Array.from({length:SAMPLES},(_,i)=>pts[Math.min(Math.round(i*step),N-1)].heartRateBpm??0)
    const rawSpeed=Array.from({length:SAMPLES},(_,i)=>{
      const idx=Math.min(Math.round(i*step),N-1); if(idx===0) return 0
      const prev=Math.max(0,idx-1),t0=pts[prev].time?new Date(pts[prev].time!).getTime():0,t1=pts[idx].time?new Date(pts[idx].time!).getTime():0
      if(!t0||!t1||t1<=t0) return 0
      return(distM(pts[prev].lat!,pts[prev].lon!,pts[idx].lat!,pts[idx].lon!)/((t1-t0)/1000))*3.6
    })
    const smoothSpeed=smoothArray(rawSpeed,4)
    const hrMax=Math.max(...rawHr),hrMin=Math.min(...rawHr.filter(v=>v>0),hrMax)
    const spMax=Math.max(...smoothSpeed)
    const hasHr=hrMax>0, hasSpeed=spMax>0

    const totalKm=totalDistRef.current/1000
    const {gain:elevGain}=elevStatsRef.current
    const dpr=window.devicePixelRatio||1
    const cr=coverRect(srcW,srcH,outW,outH)

    // Target FPS × duration = total frames
    const TARGET_FPS=30
    const TOTAL_FRAMES=Math.round(TARGET_FPS*videoDuration)
    setRenderTotal(TOTAL_FRAMES); setRenderFrame(0)
    frameCountRef.current=0; walkPhaseRef.current=0; renderAbortRef.current=false

    // Photo overlays: determine which frame each photo should appear on
    const sortedPhotos=[...routePhotos].sort((a,b)=>a.progress-b.progress)
    const photoSchedule=sortedPhotos.map(ph=>({
      photo:ph,
      img:photoImgsRef.current.get(ph.id),
      startFrame:Math.round(ph.progress*TOTAL_FRAMES),
      holdFrames:Math.round(TARGET_FPS*4),  // 4 seconds per photo
    })).filter(p=>!!p.img)

    const currentShots=shotPlan.length>0?shotPlan:planShots(pts)

    function renderNextFrame() {
      if(renderAbortRef.current) return
      const frameIdx=frameCountRef.current
      if(frameIdx>=TOTAL_FRAMES){recorder.stop();return}

      const p=frameIdx/TOTAL_FRAMES
      setRenderProgress(p); setRenderFrame(frameIdx)

      const rawIdx=p*(N-1),i0=Math.floor(rawIdx),i1=Math.min(i0+1,N-1),frac=rawIdx-i0
      const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac
      const lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
      const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac

      // Route bearing (look ahead)
      const lookIdx=Math.min(i0+Math.max(5,Math.round(N*0.03)),N-1)
      const routeBear=bearingDeg(lat,lon,pts[lookIdx].lat!,pts[lookIdx].lon!)

      // Find active shot
      const activShot=currentShots.find(s=>p>=s.startP&&p<=s.endP)??currentShots[currentShots.length-1]

      // On shot transition, store current bearing as orbit base
      const prevP=(frameIdx-1)/TOTAL_FRAMES
      const prevShot=currentShots.find(s=>prevP>=s.startP&&prevP<=s.endP)
      if(activShot&&prevShot&&activShot.id!==prevShot.id){
        orbitBaseRef.current=mapRef.current?.getBearing()??0
      }

      const cam=shotCamera(activShot,routeBear,p,orbitBaseRef)

      // ── Camera: jumpTo for instant repositioning (no lag) ─────────────────
      mapRef.current?.jumpTo({center:[lon,lat],bearing:cam.bearing,pitch:cam.pitch,zoom:cam.zoom})

      // Capture composite after map settles (1 rAF)
      requestAnimationFrame(()=>{
        if(!mapRef.current) return
        ctx.drawImage(mapCanvas,cr.sx,cr.sy,cr.sw,cr.sh,0,0,outW,outH)

        // Position: draw hiker avatar instead of plain dot
        const mp=mapRef.current!.project([lon,lat] as [number,number])
        const px=(mp.x*dpr-cr.sx)/cr.sw*outW
        const py=(mp.y*dpr-cr.sy)/cr.sh*outH
        if(px>=-60&&px<=outW+60&&py>=-60&&py<=outH+60){
          walkPhaseRef.current++
          drawHiker(ctx,px,py,cam.bearing,walkPhaseRef.current,outW/1080,faceImgRef.current)
        }

        // Photo overlays
        for(const sched of photoSchedule){
          if(frameIdx>=sched.startFrame&&frameIdx<sched.startFrame+sched.holdFrames){
            drawPolaroid(ctx,outW,outH,{photo:sched.photo,img:sched.img!,startFrame:sched.startFrame,holdFrames:sched.holdFrames},frameIdx)
          }
        }

        // HUD
        const si=Math.min(Math.round(p*(SAMPLES-1)),SAMPLES-1)
        const hrData:GraphData|undefined=(hasHr&&videoShowBody)?{
          series:rawHr,label:'BPM',icon:'♥',strokeColor:'#ef4444',fillColor:'rgba(239,68,68,0.28)',
          minVal:Math.max(0,hrMin-5),maxVal:hrMax+5,currentValue:rawHr[si],
        }:undefined
        const speedData:GraphData|undefined=(hasSpeed&&videoShowBody)?{
          series:smoothSpeed,label:'km/h',icon:'⚡',strokeColor:'#60a5fa',fillColor:'rgba(96,165,250,0.28)',
          minVal:0,maxVal:spMax+1,currentValue:smoothSpeed[si],
        }:undefined
        drawHUD(ctx,outW,outH,{
          showTitle:videoShowTitle,title:title??'',showStats:videoShowStats,
          coveredKm:+(p*totalKm).toFixed(1),totalKm:+totalKm.toFixed(1),alt:Math.round(alt),elevGain,
          showProgress:videoShowProgress,progress:p,showBody:videoShowBody,hrData,speedData,
          shotLabel:activShot?activShot.label:undefined,
        })

        frameCountRef.current++
        renderNextFrame()
      })
    }

    setVideoState('rendering')
    renderNextFrame()
  }, [videoDuration,videoOrientation,videoShowTitle,videoShowStats,videoShowProgress,videoShowBody,title,routePhotos,shotPlan])

  const cancelRendering=useCallback(()=>{
    renderAbortRef.current=true
    cancelAnimationFrame(animRef.current)
    if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){
      mediaRecorderRef.current.onstop=null; mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current=null; compositeCanvasRef.current=null
    const markerEl=markerRef.current?.getElement(); if(markerEl) markerEl.style.opacity='1'
    setVideoState('idle'); setRenderProgress(0); setVideoRecordedBlob(null)
  },[])

  const handleVideoDownload=useCallback(()=>{
    if(!videoRecordedBlob) return
    const ext=videoRecordedBlob.type.includes('mp4')?'mp4':'webm'
    const url=URL.createObjectURL(videoRecordedBlob)
    if(videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
    videoObjUrlRef.current=url
    const a=document.createElement('a');a.href=url;a.download=`dtrek-3d-${Date.now()}.${ext}`;a.click()
    setShareToast('Video salvato!');setTimeout(()=>setShareToast(''),2500)
  },[videoRecordedBlob])

  const handleVideoShare=useCallback(async()=>{
    if(!videoRecordedBlob) return
    const ext=videoRecordedBlob.type.includes('mp4')?'mp4':'webm'
    const file=new File([videoRecordedBlob],`dtrek-3d-${Date.now()}.${ext}`,{type:videoRecordedBlob.type})
    if(typeof navigator!=='undefined'&&(navigator as any).canShare?.({files:[file]})){
      try{await navigator.share({title:title??'Percorso DTrek',text:'DTrek — Video 3D del percorso',files:[file]});setVideoState('idle');setVideoRecordedBlob(null);return}catch{}
    }
    handleVideoDownload()
  },[videoRecordedBlob,title,handleVideoDownload])

  // ─────────────────────────────────────────────────────────────────────────────
  const totalKm=+(totalDistRef.current/1000).toFixed(1)

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{touchAction:'none'}}>
      <div ref={containerRef} className="flex-1 w-full h-full" />

      {/* ── Top bar ── */}
      <div className="absolute top-0 inset-x-0 pointer-events-none">
        <div className="flex items-start justify-between p-3 bg-gradient-to-b from-black/65 to-transparent">
          <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="flex gap-1 bg-black/45 backdrop-blur-md rounded-xl p-1 w-fit">
              {STYLES.map((s,i)=>(
                <button key={s.label} onClick={()=>switchStyle(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${styleIdx===i?'bg-white text-stone-900 shadow':'text-white/80 hover:bg-white/20'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {title&&<p className="text-white text-sm font-semibold drop-shadow-md ml-1 max-w-[280px] truncate">{title}</p>}
          </div>
          <div className="flex items-center gap-2 pointer-events-auto mt-0.5">
            <button onClick={handleStreetViewHere} title="Foto della zona"
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <Images style={{width:'1.1rem',height:'1.1rem'}}/>
            </button>
            <button onClick={()=>setVideoState('config')} title="Crea video"
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <Film style={{width:'1.1rem',height:'1.1rem'}}/>
            </button>
            <button onClick={handleCapture} title="Screenshot"
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <Camera style={{width:'1.1rem',height:'1.1rem'}}/>
            </button>
            <button onClick={onClose}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <X className="w-5 h-5"/>
            </button>
          </div>
        </div>
      </div>

      {/* Stats HUD */}
      <div className="absolute top-20 left-3 pointer-events-none">
        <div className="bg-black/50 backdrop-blur-md rounded-2xl px-4 py-3 text-white space-y-2 min-w-[148px] shadow-xl border border-white/10">
          <div className="flex items-center gap-2"><Mountain className="w-3.5 h-3.5 text-blue-300 shrink-0"/><span className="text-[11px] text-white/55 flex-1">Quota</span><span className="text-sm font-bold tabular-nums">{currentAlt} m</span></div>
          <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 shrink-0"/><span className="text-[11px] text-white/55 flex-1">Percorso</span><span className="text-sm font-bold tabular-nums">{coveredKm} km</span></div>
          <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 shrink-0"/><span className="text-[11px] text-white/55 flex-1">Totale</span><span className="text-sm font-bold tabular-nums text-white/70">{totalKm} km</span></div>
          {weatherBadge&&(
            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
              <span className="text-base leading-none shrink-0">{weatherBadge.emoji}</span>
              <span className="text-[11px] text-white/55 flex-1 truncate">{weatherBadge.label}</span>
              <span className="text-sm font-bold tabular-nums">{weatherBadge.temp}°</span>
            </div>
          )}
        </div>
      </div>

      {/* Elevation profile */}
      <div className="absolute left-3 right-3" style={{bottom:'92px'}}>
        <div className="relative">
          {altitudeSeries.length>1?(()=>{
            const minAlt=Math.min(...altitudeSeries),maxAlt=Math.max(...altitudeSeries),range=maxAlt-minAlt||1,H=56
            const polyPts=altitudeSeries.map((a,i)=>`${((i/(altitudeSeries.length-1))*1000).toFixed(0)},${(H-((a-minAlt)/range)*(H-6)).toFixed(1)}`).join(' ')
            const cursorX=(progress*1000).toFixed(1)
            return(
              <div className="w-full rounded-xl overflow-hidden backdrop-blur-sm bg-black/30 border border-white/10" style={{height:`${H}px`}}>
                <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="w-full h-full">
                  <defs><linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity="0.45"/><stop offset="100%" stopColor="#3b82f6" stopOpacity="0.08"/></linearGradient></defs>
                  <polygon points={`0,${H} ${polyPts} 1000,${H}`} fill="url(#elevGrad)"/>
                  <polyline points={polyPts} fill="none" stroke="#93c5fd" strokeWidth="2.5" strokeLinejoin="round"/>
                  <line x1={cursorX} y1="0" x2={cursorX} y2={H} stroke="white" strokeWidth="2" strokeDasharray="4,3" opacity="0.75"/>
                </svg>
              </div>
            )
          })():(
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div className="h-full rounded-full transition-none" style={{width:`${progress*100}%`,background:'linear-gradient(90deg,#3b82f6,#60a5fa)'}}/>
            </div>
          )}
          <input type="range" min={0} max={1} step={0.0005} value={progress}
            onChange={e=>handleScrub(+e.target.value)}
            className="absolute w-full opacity-0 cursor-pointer"
            style={{height:'64px',top:'50%',transform:'translateY(-50%)'}}/>
        </div>
        <div className="flex justify-between mt-1 text-[10px] font-medium px-0.5">
          <span className="text-white/50">0 km</span>
          {altitudeSeries.length>0&&<span className="text-blue-300">{currentAlt} m slm</span>}
          <span className="text-white/50">{totalKm} km</span>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-5 px-4">
        <div className="max-w-sm mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <button onClick={reset} className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-colors border border-white/10">
              <RotateCcw className="w-4 h-4"/>
            </button>
            <button onClick={handlePlay} disabled={!mapReady}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-stone-900 shadow-2xl hover:bg-stone-100 active:scale-95 transition-all disabled:opacity-35">
              {isPlaying?<Pause className="w-7 h-7"/>:<Play className="w-7 h-7 translate-x-0.5"/>}
            </button>
            <div className="flex gap-0.5 bg-white/15 rounded-xl p-1 border border-white/10">
              {SPEEDS.map((s,i)=>(
                <button key={s.label} onClick={()=>setSpeedIdx(i)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${speedIdx===i?'bg-white text-stone-900 shadow':'text-white/70 hover:bg-white/20'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-white/50 whitespace-nowrap font-medium">Rilievo</span>
            <input type="range" min={1} max={3} step={0.1} value={exaggeration} onChange={e=>setExaggeration(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-blue-400 cursor-pointer"/>
            <span className="text-[11px] text-white font-bold w-8 text-right">{exaggeration.toFixed(1)}×</span>
          </div>
        </div>
      </div>

      {/* Loading */}
      {!mapReady&&videoState==='idle'&&(
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 text-white">
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin"/>
          <p className="text-sm font-medium text-white/70">Caricamento mappa 3D…</p>
        </div>
      )}

      {shareToast&&(
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md text-stone-800 text-sm font-semibold px-4 py-2 rounded-full shadow-xl pointer-events-none">
          ✓ {shareToast}
        </div>
      )}

      {showStreetView&&streetViewPos&&(
        <StreetViewPanel lat={streetViewPos[0]} lon={streetViewPos[1]} title={title} onClose={()=>setShowStreetView(false)}/>
      )}

      {/* ══ CONFIG ══════════════════════════════════════════════════════════════ */}
      {videoState==='config'&&(
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm flex items-end z-20 pointer-events-auto">
          <div className="w-full bg-stone-900/97 rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">Impostazioni video</h2>
              <button onClick={()=>setVideoState('idle')} className="text-white/50 hover:text-white"><X className="w-5 h-5"/></button>
            </div>

            {/* Face preview */}
            <div className="flex items-center gap-4 bg-white/5 rounded-2xl p-4">
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-amber-400/60 bg-stone-700 flex items-center justify-center shrink-0">
                {faceImgRef.current
                  ? <img src={faceImgRef.current.src} alt="" className="w-full h-full object-cover"/>
                  : <User className="w-6 h-6 text-stone-400"/>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">Avatar escursionista</p>
                <p className="text-white/45 text-xs mt-0.5">
                  {faceImgRef.current
                    ? 'Volto caricato dal profilo ✓'
                    : 'Volto non impostato — vai su Profilo per caricarlo'}
                </p>
              </div>
            </div>

            {/* Style */}
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">STILE MAPPA</p>
              <div className="flex gap-2">
                {STYLES.map((s,i)=>(
                  <button key={s.label} onClick={()=>switchStyle(i)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${styleIdx===i?'bg-white text-stone-900':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">DURATA VIDEO</p>
              <div className="flex gap-2">
                {[15,30,60,90].map(d=>(
                  <button key={d} onClick={()=>setVideoDuration(d)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${videoDuration===d?'bg-blue-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {/* Orientation */}
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">FORMATO</p>
              <div className="flex gap-2">
                {(['9:16','16:9','1:1'] as const).map(o=>(
                  <button key={o} onClick={()=>setVideoOrientation(o)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${videoOrientation===o?'bg-blue-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {/* Elements */}
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">OVERLAY NEL VIDEO</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {label:'Titolo',val:videoShowTitle,set:setVideoShowTitle,ok:true},
                  {label:'Statistiche',val:videoShowStats,set:setVideoShowStats,ok:true},
                  {label:'Progresso',val:videoShowProgress,set:setVideoShowProgress,ok:true},
                  {label:'Dati corporei',val:videoShowBody,set:setVideoShowBody,ok:hasBodyData},
                ].map(item=>(
                  <button key={item.label} onClick={()=>item.ok&&item.set(v=>!v)} disabled={!item.ok}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${!item.ok?'opacity-30 cursor-not-allowed bg-white/5 text-white/40':item.val?'bg-white text-stone-900':'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                    {item.label}
                    {!item.ok&&<span className="block text-[10px] font-normal opacity-60">non disponibile</span>}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-white/35 text-[11px] text-center">
              Video 1080p · 10 Mbps · Rendering frame-by-frame per qualità massima
            </p>
            <div className="flex gap-3">
              <button onClick={()=>setVideoState('idle')} className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors">Annulla</button>
              <button onClick={goToPostProd} className="flex-[2] py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold flex items-center justify-center gap-2">
                Avanti → Montaggio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ POST-PRODUCTION ══════════════════════════════════════════════════════ */}
      {videoState==='postprod'&&(
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-end z-20 pointer-events-auto">
          <div className="w-full bg-stone-900/97 rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-bold text-lg">Montaggio</h2>
                <p className="text-white/45 text-xs mt-0.5">Riordina le inquadrature, aggiungi foto del percorso</p>
              </div>
              <button onClick={()=>setVideoState('config')} className="text-white/50 hover:text-white"><X className="w-5 h-5"/></button>
            </div>

            {/* Shot list */}
            <div className="mb-5">
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">PIANO DELLE INQUADRATURE</p>
              <div className="space-y-2">
                {shotPlan.map((shot,idx)=>(
                  <div key={shot.id} className="flex items-center gap-2 bg-white/7 rounded-xl px-3 py-2.5">
                    <GripVertical className="w-4 h-4 text-white/30 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{shot.label}</p>
                      <p className="text-white/40 text-[10px]">
                        {Math.round(shot.startP*100)}% → {Math.round(shot.endP*100)}% ·{' '}
                        {shot.bearingMode==='follow'?'Seguimento'
                          :shot.bearingMode==='orbit-cw'||shot.bearingMode==='orbit-ccw'?'Orbita'
                          :shot.bearingMode==='side-left'?'Lato sinistro':'Lato destro'}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button disabled={idx===0} onClick={()=>moveShot(shot.id,-1)}
                        className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 disabled:opacity-20 transition-colors">
                        <ChevronLeft className="w-3.5 h-3.5"/>
                      </button>
                      <button disabled={idx===shotPlan.length-1} onClick={()=>moveShot(shot.id,1)}
                        className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 disabled:opacity-20 transition-colors">
                        <ChevronRight className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Photos section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/45 text-[11px] font-semibold tracking-wider">
                  FOTO DEL PERCORSO {routePhotos.length>0&&<span className="text-blue-400">({routePhotos.length})</span>}
                </p>
                <label className={`flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer transition-colors ${photoBeingAdded?'opacity-50 pointer-events-none':''}`}>
                  {photoBeingAdded?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<ImagePlus className="w-3.5 h-3.5"/>}
                  Aggiungi foto
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload}/>
                </label>
              </div>

              {routePhotos.length===0?(
                <div className="border border-dashed border-white/20 rounded-xl p-5 text-center">
                  <p className="text-white/35 text-sm">Nessuna foto — le foto appaiono come polaroid nel video</p>
                  <p className="text-white/25 text-xs mt-1">GPS EXIF letto automaticamente, altrimenti posizionale manualmente</p>
                </div>
              ):(
                <div className="space-y-2">
                  {routePhotos.map(photo=>(
                    <div key={photo.id} className="flex items-center gap-3 bg-white/7 rounded-xl p-2">
                      <img src={photo.dataUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <input
                          value={photo.caption??''}
                          onChange={e=>setRoutePhotos(prev=>prev.map(p=>p.id===photo.id?{...p,caption:e.target.value}:p))}
                          placeholder="Didascalia…"
                          className="w-full bg-transparent text-white text-xs font-medium placeholder:text-white/30 focus:outline-none border-b border-white/10 focus:border-white/30 pb-0.5"
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-white/40 text-[10px] w-8 text-right">{Math.round(photo.progress*100)}%</span>
                          <input type="range" min={0} max={1} step={0.01} value={photo.progress}
                            onChange={e=>setRoutePhotos(prev=>prev.map(p=>p.id===photo.id?{...p,progress:+e.target.value}:p))}
                            className="flex-1 h-1 rounded-full accent-blue-400 cursor-pointer"/>
                        </div>
                      </div>
                      <button onClick={()=>{setRoutePhotos(prev=>prev.filter(p=>p.id!==photo.id));photoImgsRef.current.delete(photo.id)}}
                        className="text-white/30 hover:text-red-400 transition-colors shrink-0">
                        <X className="w-4 h-4"/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={()=>setVideoState('config')} className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors">← Config</button>
              <button onClick={startRendering} className="flex-[2] py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white animate-pulse"/>
                Avvia rendering
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RENDERING ═══════════════════════════════════════════════════════════ */}
      {videoState==='rendering'&&(
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" />
          <div className="absolute top-4 left-4 right-4 pointer-events-auto">
            <div className="bg-black/80 backdrop-blur-md rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"/>
                  <span className="text-white text-sm font-bold tracking-wide">RENDERING</span>
                </div>
                <button onClick={cancelRendering} className="text-white/60 hover:text-white text-xs font-semibold px-3 py-1 bg-white/10 rounded-full transition-colors">Annulla</button>
              </div>
              <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-blue-500 rounded-full transition-none" style={{width:`${renderProgress*100}%`}}/>
              </div>
              <p className="text-white/55 text-xs">Frame {renderFrame}/{renderTotal} · {Math.round(renderProgress*100)}%</p>
              <p className="text-white/35 text-[10px] mt-0.5">Frame-by-frame rendering — la qualità sarà perfetta</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ DONE ════════════════════════════════════════════════════════════════ */}
      {videoState==='done'&&(
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-20 pointer-events-auto">
          <div className="bg-stone-900/97 rounded-3xl px-6 py-7 mx-4 w-full max-w-sm shadow-2xl space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                <Film className="w-7 h-7 text-green-400"/>
              </div>
              <h2 className="text-white font-bold text-lg">Video pronto!</h2>
              <p className="text-white/50 text-sm mt-1">1080p · {videoDuration}s · {videoOrientation}</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <button onClick={handleVideoShare} className="w-full py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold flex items-center justify-center gap-2 transition-colors">
                <Share2 className="w-4 h-4"/>Condividi
              </button>
              <button onClick={handleVideoDownload} className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center justify-center gap-2 transition-colors">
                <Download className="w-4 h-4"/>Scarica
              </button>
            </div>
            <div className="flex gap-2.5">
              <button onClick={()=>{setVideoState('postprod');setVideoRecordedBlob(null);setRenderProgress(0)}}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors">
                ← Montaggio
              </button>
              <button onClick={()=>{setVideoState('idle');setVideoRecordedBlob(null);setRenderProgress(0)}}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors">
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
