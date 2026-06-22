'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl, { Map as MLMap, Marker, Popup } from 'maplibre-gl'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'
import {
  X, Play, Pause, RotateCcw, Mountain, Camera, Images, Film,
  Download, Share2, ChevronLeft, ChevronRight, ImagePlus,
  Loader2, GripVertical, Check, Navigation, Layers, Sparkles, Copy, MapPin,
} from 'lucide-react'
import StreetViewPanel from '@/components/StreetViewPanel'
import { fetchDayHourly, wmoInfo } from '@/lib/openmeteo'
import { getProfile } from '@/lib/userProfile'
import { type PoiItem, type PoiType, POI_META, buildPoiPopupHtml } from '@/lib/overpass'
import { fetchActivityPhotos, addActivityPhoto, updateActivityPhoto, removeActivityPhoto, type RoutePhoto } from '@/lib/activityPhotos'

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''

const SPEEDS = [
  { label: '½×', v: 0.5 },
  { label: '1×', v: 1   },
  { label: '3×', v: 3   },
]

const VIDEO_PRESETS = {
  reels:  { duration: 30, styleIdx: 1, orientation: '9:16'   as const, label: 'Reels',    desc: '9:16 · 1080×1920',   grading: 'contrast(1.08) saturate(1.25) brightness(1.03)' },
  feed45: { duration: 30, styleIdx: 1, orientation: '4:5'    as const, label: 'Feed 4:5', desc: '4:5 · 1080×1350',    grading: 'contrast(1.08) saturate(1.25) brightness(1.03)' },
  feed11: { duration: 30, styleIdx: 1, orientation: '1:1'    as const, label: 'Feed 1:1', desc: '1:1 · 1080×1080',    grading: 'contrast(1.08) saturate(1.25) brightness(1.03)' },
  epico:  { duration: 30, styleIdx: 0, orientation: '9:16'   as const, label: 'Epico',    desc: '9:16 · cinematico',   grading: 'contrast(1.05) saturate(1.18) brightness(1.02)' },
  snappy: { duration: 15, styleIdx: 1, orientation: '9:16'   as const, label: 'Snappy',   desc: '9:16 · social-ready', grading: 'contrast(1.12) saturate(1.38) brightness(1.04)' },
} as const

const STYLES = [
  { label: 'Outdoor',   url: () => `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${KEY}` },
  { label: 'Satellite', url: () => `https://api.maptiler.com/maps/hybrid/style.json?key=${KEY}` },
  { label: 'Winter',    url: () => `https://api.maptiler.com/maps/winter-v2/style.json?key=${KEY}` },
]

const VIDEO_DIMS: Record<string, [number, number]> = {
  '9:16':   [1080, 1920],
  '4:5':    [1080, 1350],
  '1:1':    [1080, 1080],
  '1.91:1': [1080,  566],
  '16:9':   [1920, 1080],
}

// Overpass returns POIs with no cap (a route near villages/refuges can return 50-100+), and
// baking one GPU texture per POI in the video stalled rendering — cap to the most notable ones.
const MAX_VIDEO_POIS = 15
const POI_NOTABILITY_TIER: Record<PoiType, 0|1|2> = {
  peak: 0, hut: 0, bivouac: 0, pass: 0, viewpoint: 0,
  waterfall: 1, cave: 1, shelter: 1, ruins: 1, castle: 1, archaeological: 1, cross: 1, monument: 1, chapel: 1, tower: 1, bridge: 1,
  spring: 2, fountain: 2, picnic: 2, bench: 2,
}

// ── Types ──────────────────────────────────────────────────────────────────────

type VideoState = 'idle' | 'config' | 'postprod' | 'rendering' | 'finalizing' | 'done'
type VideoPreset = 'reels' | 'feed45' | 'feed11' | 'epico' | 'snappy' | 'custom'
type BearingMode = 'follow' | 'orbit-cw' | 'orbit-ccw' | 'side-left' | 'side-right' | 'overhead'
type PlacingStep = 'pos'

interface ShotSegment {
  id: string; label: string; startP: number; endP: number
  pitch: [number, number]; zoom: [number, number]
  bearingMode: BearingMode; orbitDeg?: number
}

// ── Geo helpers ────────────────────────────────────────────────────────────────

function rad(d: number) { return d * Math.PI / 180 }

function distM(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000, a = Math.sin(rad((la2-la1)/2))**2 + Math.cos(rad(la1))*Math.cos(rad(la2))*Math.sin(rad((lo2-lo1)/2))**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function bearingDeg(la1: number, lo1: number, la2: number, lo2: number): number {
  const dl = rad(lo2-lo1), y = Math.sin(dl)*Math.cos(rad(la2))
  const x = Math.cos(rad(la1))*Math.sin(rad(la2)) - Math.sin(rad(la1))*Math.cos(rad(la2))*Math.cos(dl)
  return (Math.atan2(y,x)*180/Math.PI+360)%360
}

function smoothArray(arr: number[], half = 4): number[] {
  return arr.map((_,i) => { const s=arr.slice(Math.max(0,i-half),Math.min(arr.length,i+half+1)); return s.reduce((a,b)=>a+b,0)/s.length })
}

// Circular mean for bearings — avoids the 350°/10° → 180° bug at north crossings
function circularMeanBearings(bearings: number[], half: number): number[] {
  return bearings.map((_,i)=>{
    const s=bearings.slice(Math.max(0,i-half),Math.min(bearings.length,i+half+1))
    const x=s.reduce((sum,b)=>sum+Math.cos(b*Math.PI/180),0)/s.length
    const y=s.reduce((sum,b)=>sum+Math.sin(b*Math.PI/180),0)/s.length
    return (Math.atan2(y,x)*180/Math.PI+360)%360
  })
}

function lerp(a: number, b: number, t: number) { return a + (b-a)*t }

function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a) % 360 + 540) % 360 - 180
  return (a + d * t + 360) % 360
}


// ── Canvas helpers ─────────────────────────────────────────────────────────────

function coverRect(sW: number, sH: number, dW: number, dH: number) {
  const sA=sW/sH, dA=dW/dH
  if (sA>dA) { const sw=Math.round(sH*dA); return {sx:Math.round((sW-sw)/2),sy:0,sw,sh:sH} }
  const sh=Math.round(sW/dA); return {sx:0,sy:Math.round((sH-sh)/2),sw:sW,sh}
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const c=Math.min(r,w/2,h/2)
  ctx.beginPath()
  ctx.moveTo(x+c,y); ctx.lineTo(x+w-c,y); ctx.arcTo(x+w,y,x+w,y+c,c)
  ctx.lineTo(x+w,y+h-c); ctx.arcTo(x+w,y+h,x+w-c,y+h,c)
  ctx.lineTo(x+c,y+h); ctx.arcTo(x,y+h,x,y+h-c,c)
  ctx.lineTo(x,y+c); ctx.arcTo(x,y,x+c,y,c)
  ctx.closePath()
}

// ── Map pin (replaces hiker avatar) ───────────────────────────────────────────

function drawMapPin(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,    // tip of pin = GPS position
  sc: number,                // scale (outW/1080)
  faceImg: HTMLImageElement | null,
) {
  const R    = 32 * sc
  const tipH = 16 * sc
  const ccY  = cy - R - tipH   // circle center (pin tip is at cy)

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12*sc; ctx.shadowOffsetY = 4*sc

  // Teardrop tip
  ctx.beginPath()
  ctx.moveTo(cx - R*0.42, ccY + R*0.68)
  ctx.lineTo(cx + R*0.42, ccY + R*0.68)
  ctx.lineTo(cx, cy)
  ctx.closePath()
  ctx.fillStyle = '#1e40af'; ctx.fill()

  ctx.shadowColor = 'transparent'

  // Circle body
  const g = ctx.createRadialGradient(cx-R*0.28, ccY-R*0.28, R*0.05, cx, ccY, R*1.45)
  g.addColorStop(0, '#93c5fd'); g.addColorStop(1, '#1d4ed8')
  ctx.beginPath(); ctx.arc(cx, ccY, R, 0, Math.PI*2)
  ctx.fillStyle = g; ctx.fill()

  // White border
  ctx.strokeStyle = 'white'; ctx.lineWidth = 3*sc
  ctx.beginPath(); ctx.arc(cx, ccY, R, 0, Math.PI*2); ctx.stroke()

  // Photo or person silhouette clipped to inner circle
  ctx.save()
  const ir = R - 2*sc
  ctx.beginPath(); ctx.arc(cx, ccY, ir, 0, Math.PI*2); ctx.clip()
  if (faceImg) {
    ctx.drawImage(faceImg, cx-ir, ccY-ir, ir*2, ir*2)
  } else {
    ctx.fillStyle = '#3b82f6'
    ctx.fillRect(cx-ir, ccY-ir, ir*2, ir*2)
    // Person silhouette
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.beginPath(); ctx.arc(cx, ccY-ir*0.2, ir*0.32, 0, Math.PI*2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(cx, ccY+ir*0.32, ir*0.44, ir*0.26, 0, Math.PI, 0); ctx.fill()
  }
  ctx.restore()
  ctx.restore()
}

// ── Photo pin ─────────────────────────────────────────────────────────────────

function drawPhotoPin(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  sc: number,
  img: HTMLImageElement,
) {
  const W = 45*sc, H = 45*sc, R = 7*sc, tipH = 9*sc
  const bx = cx - W/2, by = cy - H - tipH
  ctx.save()
  ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=8*sc; ctx.shadowOffsetY=3*sc
  ctx.fillStyle='white'
  rrect(ctx,bx,by,W,H,R); ctx.fill()
  ctx.beginPath(); ctx.moveTo(cx-5*sc,by+H); ctx.lineTo(cx+5*sc,by+H); ctx.lineTo(cx,cy); ctx.closePath(); ctx.fill()
  ctx.shadowColor='transparent'
  ctx.save()
  rrect(ctx,bx+2*sc,by+2*sc,W-4*sc,H-4*sc,R-1*sc); ctx.clip()
  ctx.drawImage(img,bx+2*sc,by+2*sc,W-4*sc,H-4*sc)
  ctx.restore()
  ctx.restore()
}

function drawPoiPin(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  sc: number,
  emoji: string,
) {
  const R = 16 * sc
  ctx.save()
  ctx.shadowColor='rgba(0,0,0,0.45)'; ctx.shadowBlur=6*sc; ctx.shadowOffsetY=2*sc
  ctx.fillStyle='white'
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill()
  ctx.shadowColor='transparent'
  ctx.lineWidth=2*sc; ctx.strokeStyle='rgba(0,0,0,0.12)'
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.stroke()
  ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.font=`${Math.round(18*sc)}px -apple-system,sans-serif`
  ctx.fillText(emoji, cx, cy+1*sc)
  ctx.restore()
}

// ── Polaroid overlay ───────────────────────────────────────────────────────────

interface ActiveOverlay {
  photo:       RoutePhoto
  img:         HTMLImageElement
  startFrame:  number
  holdFrames:  number
}

function drawPolaroid(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  ov: ActiveOverlay,
  currentFrame: number,
) {
  const { startFrame, holdFrames, photo, img } = ov
  const t = (currentFrame - startFrame) / holdFrames
  if (t < 0 || t > 1) return

  const SLIDE = 0.13
  let slideX = 0
  if (t < SLIDE)            slideX = w * 0.36 * (1 - t / SLIDE)
  else if (t > 1 - SLIDE)   slideX = w * 0.36 * ((t - (1-SLIDE)) / SLIDE)

  const pW  = Math.round(w * 0.30)
  const pad = Math.round(pW * 0.055)
  const imgSz = pW - pad * 2
  const capH  = Math.round(pW * 0.26)
  const pH    = imgSz + pad * 2 + capH
  const pX    = w - pW - Math.round(w * 0.035) + Math.round(slideX)
  const pY    = Math.round(h * 0.14)

  ctx.save()
  ctx.translate(pX + pW*0.5, pY + pH*0.5)
  ctx.rotate(-0.038)
  ctx.translate(-pW*0.5, -pH*0.5)

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 22; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 12
  ctx.fillStyle = '#fffdf4'; ctx.fillRect(0, 0, pW, pH)
  ctx.shadowColor = 'transparent'

  // Photo image
  ctx.drawImage(img, pad, pad, imgSz, imgSz)

  // Subtle vignette on photo
  const vig = ctx.createLinearGradient(pad, pad, pad, pad+imgSz)
  vig.addColorStop(0, 'rgba(0,0,0,0.07)'); vig.addColorStop(0.4, 'transparent')
  vig.addColorStop(0.7, 'transparent'); vig.addColorStop(1, 'rgba(0,0,0,0.05)')
  ctx.fillStyle = vig; ctx.fillRect(pad, pad, imgSz, imgSz)

  // Thin separator
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.7
  ctx.beginPath(); ctx.moveTo(pad*2.2, imgSz+pad*1.7); ctx.lineTo(pW-pad*2.2, imgSz+pad*1.7); ctx.stroke()

  // Caption (elegant multi-line italic)
  const caption = photo.caption.trim()
  const fontSz = Math.max(8, Math.round(pW * 0.072))
  ctx.fillStyle = '#2c1a0e'
  ctx.textAlign = 'center'
  ctx.font = `italic ${fontSz}px Georgia,serif`

  const maxTW = pW - pad * 3.5
  const words = caption.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd
    if (ctx.measureText(test).width > maxTW && cur) { lines.push(cur); cur = wd } else { cur = test }
  }
  if (cur) lines.push(cur)
  const visLines = lines.slice(0, 2)
  const lineH = fontSz * 1.35
  const textBlockH = visLines.length * lineH
  const textY = imgSz + pad * 2.2 + (capH - pad - textBlockH) / 2

  ctx.textBaseline = 'top'
  visLines.forEach((l, i) => ctx.fillText(l, pW*0.5, textY + i*lineH))

  // Small decorative dash below text
  if (visLines.length > 0) {
    ctx.strokeStyle = 'rgba(44,26,14,0.2)'; ctx.lineWidth = 0.6
    const dashY = textY + textBlockH + fontSz*0.45
    ctx.beginPath(); ctx.moveTo(pW*0.38, dashY); ctx.lineTo(pW*0.62, dashY); ctx.stroke()
  }

  ctx.restore()
}

// ── Graph (unchanged) ──────────────────────────────────────────────────────────

interface GraphData {
  series:number[]; label:string; icon:string; strokeColor:string
  fillColor:string; minVal:number; maxVal:number; currentValue:number
}

function drawGraph(ctx: CanvasRenderingContext2D, x:number, y:number, gw:number, gh:number, sc:number, progress:number, g:GraphData) {
  if(!g.series.length||g.maxVal<=g.minVal) return
  ctx.save()
  ctx.fillStyle='rgba(10,10,10,0.62)'; rrect(ctx,x,y,gw,gh,14*sc); ctx.fill()
  const pad=Math.round(16*sc),valW=Math.round(148*sc),lineX=x+valW,lineW=gw-valW-pad
  const lineY=y+Math.round(10*sc),lineH=gh-Math.round(20*sc),range=g.maxVal-g.minVal
  ctx.textBaseline='top'; ctx.textAlign='left'; ctx.fillStyle=g.strokeColor
  ctx.font=`bold ${Math.round(19*sc)}px -apple-system,sans-serif`
  ctx.fillText(`${g.icon}  ${g.label}`,x+pad,y+Math.round(10*sc))
  ctx.fillStyle='white'; ctx.textBaseline='bottom'
  ctx.font=`bold ${Math.round(46*sc)}px -apple-system,sans-serif`
  ctx.fillText(`${Math.round(g.currentValue)}`,x+pad,y+gh-Math.round(10*sc))
  ctx.fillStyle='rgba(255,255,255,0.1)'; ctx.fillRect(lineX,y+Math.round(14*sc),1,gh-Math.round(28*sc))
  const pts=g.series.map((v,i)=>({px:lineX+(i/(g.series.length-1))*lineW,py:lineY+lineH-Math.max(0,Math.min(1,(v-g.minVal)/range))*lineH}))
  const ag=ctx.createLinearGradient(0,lineY,0,lineY+lineH)
  ag.addColorStop(0,g.fillColor); ag.addColorStop(1,'rgba(0,0,0,0)')
  ctx.beginPath(); pts.forEach(({px,py},i)=>i===0?ctx.moveTo(px,py):ctx.lineTo(px,py))
  ctx.lineTo(pts[pts.length-1].px,lineY+lineH); ctx.lineTo(pts[0].px,lineY+lineH); ctx.closePath()
  ctx.fillStyle=ag; ctx.fill()
  ctx.strokeStyle=g.strokeColor; ctx.lineWidth=2.5*sc; ctx.lineJoin='round'; ctx.lineCap='round'
  ctx.beginPath(); pts.forEach(({px,py},i)=>i===0?ctx.moveTo(px,py):ctx.lineTo(px,py)); ctx.stroke()
  const cx2=lineX+progress*lineW
  ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=1.5*sc; ctx.setLineDash([4*sc,4*sc])
  ctx.beginPath(); ctx.moveTo(cx2,lineY); ctx.lineTo(cx2,lineY+lineH); ctx.stroke(); ctx.restore()
  const ci=Math.min(Math.round(progress*(g.series.length-1)),g.series.length-1), cdp=pts[ci]
  if(cdp){ctx.fillStyle=g.strokeColor;ctx.strokeStyle='white';ctx.lineWidth=2.5*sc;ctx.beginPath();ctx.arc(cdp.px,cdp.py,6*sc,0,Math.PI*2);ctx.fill();ctx.stroke()}
  ctx.restore()
}

// ── HUD overlay ────────────────────────────────────────────────────────────────

interface HUDOpts {
  showTitle:boolean; title:string; showStats:boolean; coveredKm:number; totalKm:number
  alt:number; elevGain:number; showProgress:boolean; progress:number
  showBody:boolean; hrData?:GraphData; speedData?:GraphData; shotLabel?:string
}

function drawHUD(ctx: CanvasRenderingContext2D, w: number, h: number, opts: HUDOpts) {
  const sc=Math.min(w,h)/1080, pad=Math.round(40*sc), lineH=Math.round(52*sc)
  const statSz=Math.round(32*sc), labelSz=Math.round(22*sc), brandSz=Math.round(22*sc)
  const graphH=Math.round(116*sc), graphGap=Math.round(16*sc)
  const hasBody=opts.showBody&&(opts.hrData||opts.speedData)
  const gradTop=hasBody?h*0.44:h*0.62
  const grad=ctx.createLinearGradient(0,gradTop,0,h)
  grad.addColorStop(0,'rgba(0,0,0,0)'); grad.addColorStop(0.28,'rgba(0,0,0,0.45)'); grad.addColorStop(0.60,'rgba(0,0,0,0.80)'); grad.addColorStop(1,'rgba(0,0,0,0.93)')
  ctx.fillStyle=grad; ctx.fillRect(0,gradTop,w,h-gradTop)
  ctx.textAlign='left'; let yBase=h-pad
  if(opts.showProgress){
    const barH=Math.max(6,Math.round(8*sc)); yBase-=barH
    ctx.fillStyle='rgba(255,255,255,0.22)'; rrect(ctx,0,yBase,w,barH,barH/2); ctx.fill()
    if(opts.progress>0){ctx.fillStyle='#3b82f6';rrect(ctx,0,yBase,Math.max(barH,w*opts.progress),barH,barH/2);ctx.fill()}
    yBase-=Math.round(20*sc)
  }
  if(opts.showStats){
    ctx.textBaseline='bottom'; ctx.font=`bold ${statSz}px -apple-system,sans-serif`; ctx.fillStyle='white'
    ctx.fillText(`${opts.coveredKm}/${opts.totalKm} km`,pad,yBase)
    const aT=`${opts.alt} m`; ctx.fillText(aT,(w-ctx.measureText(aT).width)/2,yBase)
    ctx.fillStyle='rgba(255,255,255,0.82)'; const gT=`+${opts.elevGain} m`
    ctx.fillText(gT,w-ctx.measureText(gT).width-pad,yBase); yBase-=lineH
  }
  if(opts.showTitle&&opts.title){
    ctx.textBaseline='bottom'; ctx.font=`600 ${labelSz}px -apple-system,sans-serif`; ctx.fillStyle='rgba(255,255,255,0.78)'
    let t=opts.title; while(ctx.measureText(t).width>w-pad*2&&t.length>4) t=t.slice(0,-4)+'…'
    ctx.fillText(t,pad,yBase); yBase-=lineH
  }
  if(opts.shotLabel){
    const sw=ctx.measureText(opts.shotLabel).width+Math.round(24*sc)
    ctx.fillStyle='rgba(0,0,0,0.45)'; rrect(ctx,Math.round(16*sc),Math.round(16*sc),sw,Math.round(32*sc),Math.round(8*sc)); ctx.fill()
    ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.textBaseline='middle'; ctx.font=`${Math.round(14*sc)}px -apple-system,sans-serif`
    ctx.fillText(opts.shotLabel,Math.round(28*sc),Math.round(32*sc))
  }
  if(hasBody){
    yBase-=Math.round(22*sc); const isP=h>w
    if(isP){
      if(opts.speedData){yBase-=graphH;drawGraph(ctx,pad,yBase,w-2*pad,graphH,sc,opts.progress,opts.speedData);yBase-=graphGap}
      if(opts.hrData){yBase-=graphH;drawGraph(ctx,pad,yBase,w-2*pad,graphH,sc,opts.progress,opts.hrData)}
    } else {
      const half=Math.floor((w-2*pad-graphGap)/2); yBase-=graphH
      if(opts.hrData&&opts.speedData){drawGraph(ctx,pad,yBase,half,graphH,sc,opts.progress,opts.hrData);drawGraph(ctx,pad+half+graphGap,yBase,half,graphH,sc,opts.progress,opts.speedData)}
      else if(opts.hrData) drawGraph(ctx,pad,yBase,w-2*pad,graphH,sc,opts.progress,opts.hrData)
      else if(opts.speedData) drawGraph(ctx,pad,yBase,w-2*pad,graphH,sc,opts.progress,opts.speedData)
    }
  }
  ctx.textBaseline='bottom'; ctx.font=`bold ${brandSz}px -apple-system,sans-serif`; ctx.fillStyle='rgba(255,255,255,0.38)'
  const brand='DTrek'; ctx.fillText(brand,w-ctx.measureText(brand).width-pad,h-Math.round(10*sc))
}

// ── Cinematic shot planner ─────────────────────────────────────────────────────

function planShots(pts: TrackPoint[], zIn = 10.5, zFoll = 13.8): ShotSegment[] {
  const N=pts.length; if(N<2) return []
  const shots:ShotSegment[]=[]
  shots.push({id:'intro',label:'Intro aereo',startP:0,endP:0.08,pitch:[20,48],zoom:[zIn,zFoll],bearingMode:'follow'})
  shots.push({id:'follow',label:'Seguimento',startP:0.08,endP:1.0,pitch:[48,48],zoom:[zFoll,zFoll],bearingMode:'follow'})
  return shots
}

function shotCamera(shot: ShotSegment, routeBearing: number, p: number, orbitBaseRef: React.MutableRefObject<number>): {pitch:number;zoom:number;bearing:number} {
  const tc=Math.max(0,Math.min(1,(p-shot.startP)/(shot.endP-shot.startP)))
  const pitch=lerp(shot.pitch[0],shot.pitch[1],tc), zoom=lerp(shot.zoom[0],shot.zoom[1],tc)
  let bearing=routeBearing
  switch(shot.bearingMode){
    case 'orbit-cw':  bearing=orbitBaseRef.current+tc*(shot.orbitDeg??90); break
    case 'orbit-ccw': bearing=orbitBaseRef.current-tc*(shot.orbitDeg??90); break
    case 'side-left': bearing=routeBearing-90; break
    case 'side-right':bearing=routeBearing+90; break
  }
  return {pitch,zoom,bearing:(bearing+360)%360}
}

// ── EXIF GPS parser ────────────────────────────────────────────────────────────

async function readExifGps(file: File): Promise<{lat:number;lon:number}|null> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const buf=e.target?.result as ArrayBuffer; if(!buf){resolve(null);return}
      const view=new DataView(buf)
      try {
        if(view.getUint16(0)!==0xFFD8){resolve(null);return}
        let off=2
        while(off<view.byteLength-2){
          const marker=view.getUint16(off); off+=2
          if(marker===0xFFE1){
            const len=view.getUint16(off); off+=2
            const hb=new Uint8Array(buf,off,4)
            if(Array.from(hb).map(b=>String.fromCharCode(b)).join('')!=='Exif'){resolve(null);return}
            const ts=off+6, tv=new DataView(buf,ts), le=tv.getUint16(0)===0x4949
            const rd16=(o:number)=>tv.getUint16(o,le), rd32=(o:number)=>tv.getUint32(o,le)
            const ifd0=rd32(4), n0=rd16(ifd0); let gOff=0
            for(let i=0;i<n0;i++){const eo=ifd0+2+i*12;if(rd16(eo)===0x8825){gOff=rd32(eo+8);break}}
            if(!gOff){resolve(null);return}
            const gN=rd16(gOff), gd:Record<number,number[]>={}
            for(let i=0;i<gN;i++){
              const eo=gOff+2+i*12, tag=rd16(eo), type=rd16(eo+2), count=rd32(eo+4)
              if(type===5){const vOff=rd32(eo+8), vals:number[]=[];for(let j=0;j<count;j++){const n=rd32(vOff+j*8),d=rd32(vOff+j*8+4);vals.push(d?n/d:0)};gd[tag]=vals}
            }
            const la=gd[2],lo=gd[4]; if(!la||!lo){resolve(null);return}
            resolve({lat:la[0]+la[1]/60+la[2]/3600,lon:lo[0]+lo[1]/60+lo[2]/3600}); return
          }
          off+=view.getUint16(off)-2+2
        }
      } catch {}
      resolve(null)
    }
    reader.readAsArrayBuffer(file.slice(0,65536))
  })
}

// ── Progressive route reveal helpers ──────────────────────────────────────────

function setupRouteReveal(map: MLMap, pts: TrackPoint[]) {
  if(map.getSource('route-traveled')) return
  map.addSource('route-traveled',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[[pts[0].lon!,pts[0].lat!]]},properties:{}}})
  map.addLayer({id:'route-traveled',type:'line',source:'route-traveled',paint:{'line-color':'#f97316','line-width':5,'line-opacity':0.9},layout:{'line-cap':'round','line-join':'round'}})
  try{map.setPaintProperty('route-line','line-opacity',0.22)}catch{}
  try{map.setPaintProperty('route-casing','line-opacity',0.18)}catch{}
}

function cleanupRouteReveal(map: MLMap) {
  try{if(map.getLayer('route-traveled'))map.removeLayer('route-traveled')}catch{}
  try{if(map.getSource('route-traveled'))map.removeSource('route-traveled')}catch{}
  try{map.setPaintProperty('route-line','line-opacity',1)}catch{}
  try{map.setPaintProperty('route-casing','line-opacity',0.55)}catch{}
}

// ── Ambient audio generator ────────────────────────────────────────────────────

function createAmbientAudio(
  audioCtx: AudioContext,
  dest: MediaStreamAudioDestinationNode,
  style: 'epico' | 'snappy',
): { start: () => void; stop: () => void } {
  const master = audioCtx.createGain()
  master.gain.setValueAtTime(0, audioCtx.currentTime)
  master.connect(dest)

  const freqs = style === 'epico'
    ? [55, 82.4, 110, 164.8]
    : [65.4, 98, 130.8, 196]

  const allNodes: (OscillatorNode | AudioBufferSourceNode)[] = []
  freqs.forEach((f, i) => {
    const osc = audioCtx.createOscillator()
    osc.type = 'sine'; osc.frequency.value = f
    const lfo = audioCtx.createOscillator()
    lfo.type = 'sine'; lfo.frequency.value = 0.04 + i * 0.015
    const lfoG = audioCtx.createGain(); lfoG.gain.value = f * 0.007
    lfo.connect(lfoG); lfoG.connect(osc.frequency)
    const g = audioCtx.createGain(); g.gain.value = 0.22 / freqs.length
    osc.connect(g); g.connect(master)
    allNodes.push(osc, lfo)
  })

  const SR = audioCtx.sampleRate
  const buf = audioCtx.createBuffer(1, SR * 4, SR)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6
  const noise = audioCtx.createBufferSource()
  noise.buffer = buf; noise.loop = true
  const lp = audioCtx.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = style === 'epico' ? 350 : 550; lp.Q.value = 1
  const ng = audioCtx.createGain(); ng.gain.value = 0.05
  noise.connect(lp); lp.connect(ng); ng.connect(master)
  allNodes.push(noise)

  return {
    start() {
      allNodes.forEach(n => { try { n.start() } catch {} })
      master.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 2.5)
    },
    // Oscillators/noise loop forever once started — must be stopped explicitly,
    // otherwise they keep feeding the AudioEncoder during finalize and the
    // encoder queue never drains (flush() stalls indefinitely).
    stop() {
      allNodes.forEach(n => { try { n.stop() } catch {} })
      try { master.disconnect() } catch {}
    },
  }
}

// ── Elevation profile in video HUD ────────────────────────────────────────────

function drawVideoElevProfile(
  ctx: CanvasRenderingContext2D,
  series: number[], progress: number,
  x: number, y: number, w: number, h: number, sc: number,
) {
  if (series.length < 2) return
  const minA = Math.min(...series), maxA = Math.max(...series), range = maxA - minA || 1
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  rrect(ctx, x, y, w, h, 10*sc); ctx.fill()
  const pad = 6*sc
  const pts2 = series.map((a, i) => ({
    px: x + pad + (i / (series.length - 1)) * (w - 2*pad),
    py: y + h - pad - ((a - minA) / range) * (h - 2*pad) * 0.88,
  }))
  const grad = ctx.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, 'rgba(96,165,250,0.5)'); grad.addColorStop(1, 'rgba(59,130,246,0.04)')
  ctx.beginPath()
  pts2.forEach(({px,py}, i) => i === 0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py))
  ctx.lineTo(pts2[pts2.length-1].px, y+h-pad); ctx.lineTo(pts2[0].px, y+h-pad); ctx.closePath()
  ctx.fillStyle = grad; ctx.fill()
  ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 1.5*sc; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.beginPath()
  pts2.forEach(({px,py}, i) => i === 0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py)); ctx.stroke()
  const curX = x + pad + progress * (w - 2*pad)
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2*sc; ctx.setLineDash([3*sc,2*sc])
  ctx.beginPath(); ctx.moveTo(curX, y+pad); ctx.lineTo(curX, y+h-pad); ctx.stroke(); ctx.setLineDash([])
  const ci = Math.min(Math.round(progress*(series.length-1)), series.length-1)
  const cp = pts2[ci]
  if (cp) {
    ctx.fillStyle = '#60a5fa'; ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5*sc
    ctx.beginPath(); ctx.arc(cp.px, cp.py, 3.5*sc, 0, Math.PI*2); ctx.fill(); ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.font = `${Math.round(9*sc)}px -apple-system,sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.round(minA)}m`, x+pad, y+h-1*sc)
  ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(`${Math.round(maxA)}m`, x+w-pad, y+pad)
  ctx.restore()
}

// BearingPicker removed — orientation is now set directly on the map

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  trackPoints: TrackPoint[]
  title?: string
  onClose: () => void
  plannedDate?: string
  plannedTrackPoints?: TrackPoint[]
  activityId?: string
  distanceMeters?: number
  elevationGain?: number
  pois?: PoiItem[]
  initialVideoState?: 'idle' | 'config'
}

export default function RouteMap3D({ trackPoints, title, onClose, plannedDate, plannedTrackPoints, activityId, distanceMeters: distanceProp, elevationGain: elevGainProp, pois, initialVideoState }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<MLMap | null>(null)
  const markerRef      = useRef<Marker | null>(null)
  const animRef        = useRef<number>(0)
  const progressRef    = useRef(0)
  const lastTsRef      = useRef(0)
  const isPlayingRef   = useRef(false)
  const gpsRef         = useRef<TrackPoint[]>([])
  const totalDistRef   = useRef(0)
  const exaggRef       = useRef(1.5)
  const handleScrubRef = useRef<(p: number) => void>(() => {})
  const elevStatsRef   = useRef({ gain: 0, altMax: 0 })

  // Video refs
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null)
  const videoChunksRef     = useRef<Blob[]>([])
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoObjUrlRef     = useRef<string | null>(null)
  const orbitBaseRef       = useRef(0)
  const frameCountRef      = useRef(0)
  const renderAbortRef     = useRef(false)
  const renderedFramesRef  = useRef(0)
  const encodedFramesRef   = useRef(0)
  // Avoids calling setPaintProperty every single frame when the opacity value hasn't
  // actually changed since the last frame — redundant calls force unnecessary style
  // recalc/repaint work on every tick, adding to GPU pressure during export.
  const lastIconOpacityRef = useRef<Map<string, number>>(new Map())
  // WebCodecs path refs
  const videoEncoderRef  = useRef<any>(null)
  const audioEncoderRef  = useRef<any>(null)
  const muxerRef         = useRef<any>(null)
  const muxerTargetRef   = useRef<any>(null)
  const photoPinCleanupRef = useRef<(() => void) | null>(null)
  const poiPinCleanupRef   = useRef<(() => void) | null>(null)
  const stopAmbientAudioRef = useRef<(() => void) | null>(null)
  const finalizeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const webglLostCleanupRef = useRef<(() => void) | null>(null)

  // Smooth camera refs (exponential interpolation)
  const smoothBearRef  = useRef(0)
  const smoothPitchRef = useRef(65)
  const smoothZoomRef  = useRef(14)

  // Face image
  const faceImgRef   = useRef<HTMLImageElement | null>(null)
  const photoImgsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const photoMarkersRef = useRef<Map<string, import('maplibre-gl').Marker>>(new Map())

  // POI markers/popups (interactive view) + proximity auto-popup bookkeeping
  const poiMarkersRef     = useRef<Map<number, Marker>>(new Map())
  const poiPopupsRef      = useRef<Map<number, Popup>>(new Map())
  const poiTriggeredRef   = useRef<Set<number>>(new Set())
  const poiOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const poiOpenIdRef      = useRef<number | null>(null)

  const [mapReady,       setMapReady]      = useState(false)
  const [isPlaying,      setIsPlaying]     = useState(false)
  const [progress,       setProgress]      = useState(0)
  const [speedIdx,       setSpeedIdx]      = useState(1)
  const [styleIdx,       setStyleIdx]      = useState(0)
  const [exaggeration,   setExaggeration]  = useState(1.5)
  const [currentAlt,     setCurrentAlt]    = useState(0)
  const [coveredKm,      setCoveredKm]     = useState(0)
  const [shareToast,     setShareToast]    = useState('')
  const [showStreetView,     setShowStreetView]    = useState(false)
  const [showPlannedRoute,   setShowPlannedRoute]  = useState(false)
  const [showPois,           setShowPois]          = useState(true)
  const [streetViewPos,  setStreetViewPos] = useState<[number,number]|null>(null)

  // Video config
  const [videoState,        setVideoState]       = useState<VideoState>(initialVideoState ?? 'idle')
  const [videoDuration,     setVideoDuration]    = useState(30)
  const [videoOrientation,  setVideoOrientation] = useState<'9:16'|'4:5'|'1:1'|'1.91:1'|'16:9'>('9:16')
  const [videoFps,          setVideoFps]         = useState<30|60>(30)
  const [coverPhotoId,      setCoverPhotoId]      = useState<string|null>(null)
  const [videoShowTitle,    setVideoShowTitle]   = useState(true)
  const [videoShowStats,    setVideoShowStats]   = useState(true)
  const [videoShowProgress, setVideoShowProgress]= useState(true)
  const [videoShowBody,     setVideoShowBody]    = useState(true)
  const [videoShowPois,     setVideoShowPois]    = useState(false)
  const [videoRecordedBlob, setVideoRecordedBlob]= useState<Blob | null>(null)
  const [renderProgress,    setRenderProgress]   = useState(0)
  const [renderFrame,       setRenderFrame]      = useState(0)
  const [renderTotal,       setRenderTotal]      = useState(0)
  const [finalizeElapsedSec,setFinalizeElapsedSec]= useState(0)
  const [videoPreset,       setVideoPreset]      = useState<VideoPreset>('custom')
  const [videoEnableAudio,  setVideoEnableAudio] = useState(false)
  const [photoDurationSec,  setPhotoDurationSec] = useState(3.0)
  const [zoomIntro,         setZoomIntro]        = useState(10.5)
  const [zoomFollow,        setZoomFollow]        = useState(13.8)
  const [zoomOutro,         setZoomOutro]         = useState(7.5)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [captionData,    setCaptionData]    = useState<{caption:string;hashtags:string}|null>(null)
  const [captionLoading, setCaptionLoading] = useState(false)
  const [captionCopied,  setCaptionCopied]  = useState(false)

  // Post-production
  const [shotPlan,        setShotPlan]       = useState<ShotSegment[]>([])
  const [routePhotos,     setRoutePhotos]    = useState<RoutePhoto[]>([])
  const [placingPhoto,    setPlacingPhoto]   = useState<{id:string;step:PlacingStep}|null>(null)
  const placingPhotoRef = useRef<{id:string;step:PlacingStep}|null>(null)
  useEffect(()=>{ placingPhotoRef.current=placingPhoto },[placingPhoto])
  const [photoBeingAdded, setPhotoBeingAdded]= useState(false)

  // Load persisted photos from the server on mount (migra automaticamente da localStorage se serve)
  useEffect(() => {
    if (!activityId) return
    fetchActivityPhotos(activityId).then(photos => {
      photos.forEach(photo => {
        const img = new Image()
        img.crossOrigin = 'anonymous' // required so canvas drawImage/toBlob don't taint on the remote Storage URL
        img.onload = () => { photoImgsRef.current.set(photo.id, img) }
        img.src = photo.url
      })
      setRoutePhotos(photos)
    }).catch(() => {
      setShareToast('Errore: impossibile caricare le foto del percorso')
      setTimeout(() => setShareToast(''), 3000)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const gps = useRef(trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined))

  const hasBodyData = useMemo(() => {
    const pts=gps.current
    return pts.some(p=>(p.heartRateBpm??0)>0)||(pts.length>1&&pts.some(p=>!!p.time))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const altitudeSeries = useMemo(() => {
    const pts=gps.current; if(!pts.some(p=>p.altitudeMeters!==undefined)) return []
    const N=pts.length, S=Math.min(300,N), step=(N-1)/(S-1)
    return Array.from({length:S},(_,i)=>pts[Math.min(Math.round(i*step),N-1)].altitudeMeters??0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [weatherBadge, setWeatherBadge] = useState<{emoji:string;temp:number;label:string}|null>(null)

  // Load face photo from profile
  useEffect(() => {
    const face=getProfile().hikerFaceDataUrl; if(!face) return
    const img=new Image(); img.onload=()=>{faceImgRef.current=img}; img.src=face
  }, [])

  useEffect(() => {
    if(!plannedDate) return
    const pts=gps.current; if(!pts.length) return
    const cp=pts[Math.floor(pts.length/2)]; if(!cp.lat||!cp.lon) return
    fetchDayHourly(cp.lat,cp.lon,plannedDate).then(hours=>{
      const noon=hours.find(h=>h.time.slice(11,13)==='12')??hours[Math.floor(hours.length/2)]
      if(noon){const info=wmoInfo(noon.weathercode);setWeatherBadge({emoji:info.emoji,temp:Math.round(noon.temperature),label:info.label})}
    }).catch(()=>{})
  },[plannedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map click listener for photo placement ───────────────────────────────────

  useEffect(() => {
    const map=mapRef.current
    if(!map||!placingPhoto||placingPhoto.step!=='pos') return

    const handler=(e:any)=>{
      const pts=gpsRef.current; if(!pts.length) return
      const {lat,lng}=e.lngLat
      let minD=Infinity, bestIdx=0
      for(let i=0;i<pts.length;i++){const d=distM(pts[i].lat!,pts[i].lon!,lat,lng);if(d<minD){minD=d;bestIdx=i}}
      const prog=bestIdx/(pts.length-1)
      const photoId=placingPhoto.id, nearLat=pts[bestIdx].lat!, nearLon=pts[bestIdx].lon!
      setRoutePhotos(prev=>prev.map(p=>p.id===photoId
        ?{...p,progress:prog,lat:nearLat,lon:nearLon}:p))
      setPlacingPhoto(null)
      updateActivityPhoto(photoId,{progress:prog,lat:nearLat,lon:nearLon}).catch(()=>{
        setShareToast('Errore: posizionamento foto non salvato'); setTimeout(()=>setShareToast(''),3000)
      })
    }
    map.on('click',handler)
    return ()=>{map.off('click',handler)}
  },[placingPhoto])

  // ── Photo markers on map ──────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const pts = gpsRef.current
    // Remove old photo markers
    photoMarkersRef.current.forEach(m => m.remove())
    photoMarkersRef.current.clear()
    // Add new photo markers
    routePhotos.forEach(photo => {
      const idx = Math.min(Math.round(photo.progress*(pts.length-1)), pts.length-1)
      const lon = pts[idx].lon!, lat = pts[idx].lat!
      const el = document.createElement('div')
      el.style.cssText = 'cursor:pointer'
      el.innerHTML = `<div style="position:relative;display:inline-block">
        <div style="width:36px;height:36px;background:white;border-radius:6px;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.45);overflow:hidden">
          <img src="${photo.url}" style="width:100%;height:100%;object-fit:cover;display:block"/>
        </div>
        <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid white;margin:0 auto;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35))"></div>
      </div>`
      const marker = new maplibregl.Marker({element:el, anchor:'bottom'}).setLngLat([lon,lat]).addTo(map)
      photoMarkersRef.current.set(photo.id, marker)
    })
    return () => {
      photoMarkersRef.current.forEach(m => m.remove())
      photoMarkersRef.current.clear()
    }
  }, [routePhotos, mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── POI markers + popups on map ────────────────────────────────────────────────
  // DOM markers are independent of MapLibre's style/layer tree, so they survive
  // setStyle() / setupLayers() calls (style switcher) without extra handling.

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    poiMarkersRef.current.forEach(m => m.remove())
    poiMarkersRef.current.clear()
    poiPopupsRef.current.clear()
    ;(pois ?? []).forEach(poi => {
      const meta = POI_META[poi.type]
      const el = document.createElement('div')
      el.style.cssText = 'font-size:22px;line-height:1;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))'
      el.textContent = meta.emoji
      el.style.display = showPois ? '' : 'none'
      const popup = new maplibregl.Popup({ maxWidth: '250px', offset: 14 }).setHTML(buildPoiPopupHtml(poi))
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([poi.lon, poi.lat]).setPopup(popup).addTo(map)
      poiMarkersRef.current.set(poi.id, marker)
      poiPopupsRef.current.set(poi.id, popup)
    })
    return () => {
      poiMarkersRef.current.forEach(m => m.remove())
      poiMarkersRef.current.clear()
      poiPopupsRef.current.clear()
    }
  }, [pois, mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── POI layer visibility toggle ────────────────────────────────────────────────

  useEffect(() => {
    poiMarkersRef.current.forEach(m => { m.getElement().style.display = showPois ? '' : 'none' })
  }, [showPois])

  // ── Layer setup ───────────────────────────────────────────────────────────────

  const setupLayers=useCallback(()=>{
    const map=mapRef.current; if(!map) return
    const pts=gpsRef.current, N=pts.length; if(N<2) return
    if(!map.getSource('terrain'))
      map.addSource('terrain',{type:'raster-dem',url:`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${KEY}`,tileSize:512})
    map.setTerrain({source:'terrain',exaggeration:exaggRef.current})
    if(!map.getLayer('sky')) try{map.addLayer({id:'sky',type:'sky',paint:{'sky-type':'atmosphere','sky-atmosphere-sun':[0,90],'sky-atmosphere-sun-intensity':15}} as any)}catch{}
    const coords=pts.map(p=>[p.lon!,p.lat!,p.altitudeMeters??0] as [number,number,number])
    if(map.getSource('route')){(map.getSource('route') as any).setData({type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}})}
    else{map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}}})}
    if(!map.getLayer('route-casing')) map.addLayer({id:'route-casing',type:'line',source:'route',paint:{'line-color':'#ffffff','line-width':8,'line-opacity':0.55},layout:{'line-cap':'round','line-join':'round'}})
    if(!map.getLayer('route-line'))   map.addLayer({id:'route-line',type:'line',source:'route',paint:{'line-color':'#ff4444','line-width':4},layout:{'line-cap':'round','line-join':'round'}})
    const i0=Math.min(Math.floor(progressRef.current*(N-1)),N-1)
    markerRef.current?.setLngLat([pts[i0].lon!,pts[i0].lat!])
  },[])

  // ── Map initialization ────────────────────────────────────────────────────────

  useEffect(()=>{
    const pts=gps.current; if(!containerRef.current||pts.length<2) return
    gpsRef.current=pts
    let cum=0,gain=0,altMax=pts[0].altitudeMeters??0
    for(let i=1;i<pts.length;i++){
      cum+=distM(pts[i-1].lat!,pts[i-1].lon!,pts[i].lat!,pts[i].lon!)
      const d=(pts[i].altitudeMeters??0)-(pts[i-1].altitudeMeters??0)
      if(d>0) gain+=d; if((pts[i].altitudeMeters??0)>altMax) altMax=pts[i].altitudeMeters??0
    }
    totalDistRef.current=cum; elevStatsRef.current={gain:Math.round(gain),altMax:Math.round(altMax)}
    setCurrentAlt(pts[0].altitudeMeters??0)
    let minLon=pts[0].lon!,maxLon=pts[0].lon!,minLat=pts[0].lat!,maxLat=pts[0].lat!
    for(const p of pts){if(p.lon!<minLon)minLon=p.lon!;if(p.lon!>maxLon)maxLon=p.lon!;if(p.lat!<minLat)minLat=p.lat!;if(p.lat!>maxLat)maxLat=p.lat!}
    const map=new (maplibregl.Map as any)({container:containerRef.current!,style:STYLES[0].url(),
      center:[(minLon+maxLon)/2,(minLat+maxLat)/2],zoom:11,pitch:55,bearing:0,antialias:true,preserveDrawingBuffer:true}) as MLMap
    mapRef.current=map

    map.on('load',()=>{
      setupLayers()
      const mkEl=(c:string)=>{const el=document.createElement('div');el.style.cssText=`width:14px;height:14px;border-radius:50%;background:${c};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5)`;return el}
      new maplibregl.Marker({element:mkEl('#22c55e')}).setLngLat([pts[0].lon!,pts[0].lat!]).addTo(map)
      new maplibregl.Marker({element:mkEl('#ef4444')}).setLngLat([pts[pts.length-1].lon!,pts[pts.length-1].lat!]).addTo(map)

      // Map pin marker (with face photo if available in profile)
      const { hikerFaceDataUrl } = getProfile()
      const el=document.createElement('div')
      el.style.cssText='width:32px;height:44px;cursor:default'
      const ts=Date.now()
      el.innerHTML=`<svg viewBox="0 0 32 44" width="32" height="44" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="pg${ts}" cx="38%" cy="28%">
            <stop offset="0%" stop-color="#93c5fd"/>
            <stop offset="100%" stop-color="#1d4ed8"/>
          </radialGradient>
          <clipPath id="fc${ts}"><circle cx="16" cy="13.5" r="12"/></clipPath>
        </defs>
        <filter id="ds"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.45"/></filter>
        <path d="M16 0C7.2 0 0 7.2 0 16c0 11 13.5 26.5 16 28 2.5-1.5 16-17 16-28C32 7.2 24.8 0 16 0z" fill="url(#pg${ts})" filter="url(#ds)"/>
        <circle cx="16" cy="13.5" r="13.5" fill="none" stroke="white" stroke-width="2.5"/>
        ${hikerFaceDataUrl
          ? `<image href="${hikerFaceDataUrl}" x="4" y="1" width="24" height="24" clip-path="url(#fc${ts})"/>`
          : `<circle cx="16" cy="11.5" r="3.8" fill="rgba(255,255,255,0.88)"/>
             <path d="M9.5 21.5 Q16 17 22.5 21.5" fill="none" stroke="rgba(255,255,255,0.88)" stroke-width="1.8" stroke-linecap="round"/>`
        }
      </svg>`
      const marker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([pts[0].lon!,pts[0].lat!]).addTo(map)
      markerRef.current=marker

      map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:72,pitch:58,duration:2200})

      const onRouteClick=(e:any)=>{
        // use ref — closure captures stale state
        if(placingPhotoRef.current) return
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
      renderAbortRef.current=true
      cancelAnimationFrame(animRef.current)
      isPlayingRef.current=false
      if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){mediaRecorderRef.current.onstop=null;mediaRecorderRef.current.stop()}
      try { videoEncoderRef.current?.close(); videoEncoderRef.current=null } catch {}
      try { audioEncoderRef.current?.close(); audioEncoderRef.current=null } catch {}
      try { stopAmbientAudioRef.current?.(); stopAmbientAudioRef.current=null } catch {}
      try { audioCtxRef.current?.close(); audioCtxRef.current=null } catch {}
      if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current=null }
      try { webglLostCleanupRef.current?.() } catch {}
      muxerRef.current=null; muxerTargetRef.current=null
      if(videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
      map.remove(); mapRef.current=null; markerRef.current=null
    }
  },[setupLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{exaggRef.current=exaggeration;const map=mapRef.current;if(!map||!mapReady) return;try{map.setTerrain({source:'terrain',exaggeration})}catch{}},[exaggeration,mapReady])

  // ── Planned route overlay layer ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !plannedTrackPoints?.length) return
    const coords = plannedTrackPoints
      .filter(p => p.lat && p.lon)
      .map(p => [p.lon!, p.lat!] as [number, number])
    if (coords.length < 2) return
    if (!map.getSource('planned-route')) {
      map.addSource('planned-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
      })
      map.addLayer({
        id: 'planned-route-line',
        type: 'line',
        source: 'planned-route',
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: { 'line-color': '#a855f7', 'line-width': 3, 'line-dasharray': [2, 3], 'line-opacity': 0.9 },
      }, 'route-casing')
    }
  }, [mapReady, plannedTrackPoints])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    try { map.setLayoutProperty('planned-route-line', 'visibility', showPlannedRoute ? 'visible' : 'none') } catch {}
  }, [showPlannedRoute, mapReady])

  const switchStyle=useCallback((i:number)=>{setStyleIdx(i);setMapReady(false);mapRef.current?.setStyle(STYLES[i].url())},[])

  // ── Normal preview animation ──────────────────────────────────────────────────

  useEffect(()=>{
    isPlayingRef.current=isPlaying
    if(!isPlaying){cancelAnimationFrame(animRef.current);return}
    lastTsRef.current=0
    const pts=gpsRef.current, N=pts.length, totalKm=totalDistRef.current/1000
    const tick=(ts:number)=>{
      if(!isPlayingRef.current) return
      const dt=lastTsRef.current?ts-lastTsRef.current:16; lastTsRef.current=ts
      progressRef.current=Math.min(1,progressRef.current+(dt*SPEEDS[speedIdx].v)/90000)
      setProgress(progressRef.current)
      const rawIdx=progressRef.current*(N-1),i0=Math.floor(rawIdx),i1=Math.min(i0+1,N-1),frac=rawIdx-i0
      const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac, lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
      const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac
      markerRef.current?.setLngLat([lon,lat])
      setCurrentAlt(Math.round(alt)); setCoveredKm(+(progressRef.current*totalKm).toFixed(1))
      const li=Math.min(i0+Math.max(3,Math.round(N*0.015)),N-1)
      const bear=bearingDeg(lat,lon,pts[li].lat!,pts[li].lon!)
      mapRef.current?.easeTo({center:[lon,lat],bearing:bear,pitch:68,zoom:14.5,duration:180})
      // Proximity auto-popup: open the popup of a nearby POI for ~1.5s, only one at a time
      if(showPois&&pois?.length){
        const PROXIMITY_M=40
        for(const poi of pois){
          const d=distM(lat,lon,poi.lat,poi.lon)
          if(d<=PROXIMITY_M){
            if(!poiTriggeredRef.current.has(poi.id)){
              poiTriggeredRef.current.add(poi.id)
              if(poiOpenIdRef.current!==null&&poiOpenIdRef.current!==poi.id){
                poiPopupsRef.current.get(poiOpenIdRef.current)?.remove()
              }
              if(poiOpenTimeoutRef.current){clearTimeout(poiOpenTimeoutRef.current)}
              const popup=poiPopupsRef.current.get(poi.id), marker=poiMarkersRef.current.get(poi.id)
              if(popup&&marker&&mapRef.current){
                popup.setLngLat(marker.getLngLat()).addTo(mapRef.current)
                poiOpenIdRef.current=poi.id
                poiOpenTimeoutRef.current=setTimeout(()=>{
                  popup.remove(); poiOpenIdRef.current=null; poiOpenTimeoutRef.current=null
                },1500)
              }
            }
          } else {
            poiTriggeredRef.current.delete(poi.id)
          }
        }
      }
      if(progressRef.current<1){animRef.current=requestAnimationFrame(tick)}else{setIsPlaying(false)}
    }
    animRef.current=requestAnimationFrame(tick)
    return()=>{
      cancelAnimationFrame(animRef.current)
      if(poiOpenTimeoutRef.current){clearTimeout(poiOpenTimeoutRef.current);poiOpenTimeoutRef.current=null}
    }
  },[isPlaying,speedIdx,showPois,pois])

  const reset=useCallback(()=>{
    cancelAnimationFrame(animRef.current); isPlayingRef.current=false; progressRef.current=0
    poiTriggeredRef.current.clear()
    if(poiOpenTimeoutRef.current){clearTimeout(poiOpenTimeoutRef.current);poiOpenTimeoutRef.current=null}
    if(poiOpenIdRef.current!==null){poiPopupsRef.current.get(poiOpenIdRef.current)?.remove();poiOpenIdRef.current=null}
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
    const dU=map.getCanvas().toDataURL('image/png'), blob=await(await fetch(dU)).blob()
    const file=new File([blob],`dtrek-3d-${Date.now()}.png`,{type:'image/png'})
    if(typeof navigator!=='undefined'&&(navigator as any).canShare?.({files:[file]})){
      try{await navigator.share({title:title??'Percorso 3D',text:'DTrek — Vista 3D',files:[file]});return}catch{}
    }
    const a=document.createElement('a');a.href=dU;a.download=`dtrek-3d-${Date.now()}.png`;a.click()
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
    const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac, lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
    const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac
    markerRef.current?.setLngLat([lon,lat]);setCurrentAlt(Math.round(alt));setCoveredKm(+(p*totalDistRef.current/1000).toFixed(1))
    const li=Math.min(i0+Math.max(3,Math.round(pts.length*0.015)),pts.length-1)
    const bear=bearingDeg(lat,lon,pts[li].lat!,pts[li].lon!)
    mapRef.current?.easeTo({center:[lon,lat],bearing:bear,pitch:68,zoom:14.5,duration:300})
  },[]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{handleScrubRef.current=handleScrub},[handleScrub])

  // ── Photo upload ──────────────────────────────────────────────────────────────

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files=Array.from(e.target.files??[]); e.target.value=''; if(!files.length||!activityId) return
    setPhotoBeingAdded(true)
    const pts=gpsRef.current

    for(const file of files){
      const dataUrl=await new Promise<string>(res=>{const r=new FileReader();r.onload=ev=>res(ev.target!.result as string);r.readAsDataURL(file)})
      const img=new Image(); await new Promise<void>(res=>{img.onload=()=>res();img.src=dataUrl})
      // Square-crop to 800px
      const size=Math.min(img.width,img.height), cv=document.createElement('canvas'); cv.width=cv.height=800
      const cc=cv.getContext('2d')!; cc.drawImage(img,(img.width-size)/2,(img.height-size)/2,size,size,0,0,800,800)
      const cropped=cv.toDataURL('image/jpeg',0.82)
      const ci=new Image(); await new Promise<void>(res=>{ci.onload=()=>res();ci.src=cropped})

      // EXIF GPS
      const gpsCoords=await readExifGps(file)
      let progress=0.5, hasExifGps=false, exifLat: number|undefined, exifLon: number|undefined
      if(gpsCoords&&pts.length>1){
        hasExifGps=true
        exifLat=gpsCoords.lat; exifLon=gpsCoords.lon
        let minD=Infinity, bestIdx=0
        for(let i=0;i<pts.length;i++){const d=distM(pts[i].lat!,pts[i].lon!,gpsCoords.lat,gpsCoords.lon);if(d<minD){minD=d;bestIdx=i}}
        progress=bestIdx/(pts.length-1)
      }

      const id=`photo-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const caption=file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ').slice(0,40)
      photoImgsRef.current.set(id,ci)

      try {
        const saved=await addActivityPhoto(activityId,{
          id, dataUrl:cropped, progress, caption, hasExifGps,
          ...(exifLat !== undefined && exifLon !== undefined ? {lat:exifLat,lon:exifLon} : {}),
        })
        setRoutePhotos(prev=>[...prev,saved])
      } catch {
        photoImgsRef.current.delete(id)
        setShareToast('Errore: caricamento foto non riuscito'); setTimeout(()=>setShareToast(''),3000)
      }
    }
    setPhotoBeingAdded(false)
  }

  // ── Post-production helpers ───────────────────────────────────────────────────

  function goToPostProd() { setShotPlan(planShots(gpsRef.current, zoomIntro, zoomFollow)); setVideoState('postprod') }

  function moveShot(id: string, dir: -1|1) {
    setShotPlan(prev=>{
      const idx=prev.findIndex(s=>s.id===id); if(idx<0) return prev
      const next=[...prev], si=idx+dir; if(si<0||si>=next.length) return prev
      ;[next[idx],next[si]]=[next[si],next[idx]]
      let p=0; return next.map((s,i)=>{const dur=s.endP-s.startP,sP=p,eP=Math.min(1,p+dur);p=eP;return{...s,startP:sP,endP:i===next.length-1?1:eP}})
    })
  }

  // ── Cinematic rendering ───────────────────────────────────────────────────────

  const startRendering=useCallback(async ()=>{
    const map=mapRef.current; if(!map) return
    if(typeof MediaRecorder==='undefined'){
      setShareToast('Registrazione video non supportata su questo browser')
      setTimeout(()=>setShareToast(''),3000); setVideoState('idle'); return
    }

    // Guards every map.once('idle') wait against a context that never settles (e.g. GPU
    // pressure from many POI/photo textures) — without this the whole render hangs forever.
    const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ])

    // encode() is non-blocking — without backpressure a fast render loop can flood the
    // encoder's internal queue faster than it can drain it. Weaker mobile hardware
    // encoders react to a flooded queue by dropping/corrupting frames (visible as
    // flicker), so stall briefly until the queue has room before enqueuing more.
    const waitForEncoderQueue = async (enc: InstanceType<typeof VideoEncoder>) => {
      while (enc.encodeQueueSize > 2) await new Promise(r => setTimeout(r, 10))
    }

    // Shared failure path: an unhandled exception during setup, or a lost WebGL context
    // mid-render, otherwise leaves the UI stuck on "rendering"/"finalizing" with no feedback.
    let renderFailed = false
    const failRendering = (message: string) => {
      if (renderFailed) return
      renderFailed = true
      renderAbortRef.current = true
      cancelAnimationFrame(animRef.current)
      console.error('[dtrek] video rendering failed:', message)
      try { videoEncoderRef.current?.close(); videoEncoderRef.current=null } catch {}
      try { audioEncoderRef.current?.close(); audioEncoderRef.current=null } catch {}
      muxerRef.current=null; muxerTargetRef.current=null
      try { stopAmbientAudioRef.current?.(); stopAmbientAudioRef.current=null } catch {}
      try { audioCtxRef.current?.close(); audioCtxRef.current=null } catch {}
      if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current=null }
      try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current=null } catch {}
      try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current=null } catch {}
      try { cleanupRouteReveal(map) } catch {}
      const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='1'
      const cont=containerRef.current; if(cont){cont.style.width='';cont.style.height=''}
      try { map.resize() } catch {}
      if (typeof (map as any).setPixelRatio === 'function') { try{(map as any).setPixelRatio(window.devicePixelRatio||1)}catch{} }
      webglLostCleanupRef.current?.()
      setVideoState('idle')
      setShareToast(message)
      setTimeout(()=>setShareToast(''),4500)
    }
    const onWebglContextLost = (e: Event) => {
      e.preventDefault?.()
      failRendering('Il contesto grafico (GPU) si è interrotto durante la generazione del video. Riprova con meno foto/POI o un video più breve.')
    }
    const renderCanvas = map.getCanvas()
    renderCanvas.addEventListener('webglcontextlost', onWebglContextLost)
    webglLostCleanupRef.current = () => { try { renderCanvas.removeEventListener('webglcontextlost', onWebglContextLost) } catch {}; webglLostCleanupRef.current = null }

    try {

    cancelAnimationFrame(animRef.current); isPlayingRef.current=false; setIsPlaying(false)
    progressRef.current=0; setProgress(0)
    const pts=gpsRef.current; if(pts.length<2) { webglLostCleanupRef.current?.(); return }

    const [outW,outH]=VIDEO_DIMS[videoOrientation]

    // Resize map container to output resolution so tiles load at correct density
    const cont=containerRef.current!
    const dpr=window.devicePixelRatio||1
    cont.style.width=`${outW/dpr}px`
    cont.style.height=`${outH/dpr}px`
    map.resize()
    await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})

    // 2× supersampling: map renders at 2× pixel density, drawImage downscales for sharper tiles
    if (typeof (map as any).setPixelRatio === 'function') {
      ;(map as any).setPixelRatio(dpr * 2)
      map.resize()
      await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    }

    // Pre-compute smooth route bearings here so introBearing uses the same value
    // as the follow phase (which looks 12% ahead), eliminating the bearing jerk at intro→follow
    const N=pts.length
    const rawRouteBears=Array.from({length:Math.max(1,N-1)},(_,i)=>bearingDeg(pts[i].lat!,pts[i].lon!,pts[Math.min(i+1,N-1)].lat!,pts[Math.min(i+1,N-1)].lon!))
    const smoothRouteBears=circularMeanBearings(rawRouteBears,35)
    // Intro bearing must match what follow uses at p=0 (look 12% ahead) to avoid bearing jerk
    const introLookIdx=Math.min(Math.round(0.12*(N-1)),smoothRouteBears.length-1)
    const introBearing=smoothRouteBears[introLookIdx]
    // 20-position pre-warm at actual recording conditions (follow phase: zoomFollow + pitch 48°
    // with real route bearings) — eliminates tile pop-in from oblique view at non-north bearings
    const PREWARM_STEPS = 20
    const prewarmIdxs = Array.from({length:PREWARM_STEPS},(_,i)=>
      Math.min(Math.round(i/(PREWARM_STEPS-1)*(pts.length-1)),pts.length-1))
    for (const ki of prewarmIdxs) {
      const bearing = smoothRouteBears[Math.min(ki,smoothRouteBears.length-1)]??introBearing
      map.jumpTo({center:[pts[ki].lon!,pts[ki].lat!],zoom:zoomFollow,pitch:48,bearing})
      await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    }
    // Outro position (zoomed out) and intro zoom/pitch
    map.jumpTo({center:[pts[N-1].lon!,pts[N-1].lat!],zoom:zoomOutro,pitch:8,bearing:introBearing})
    await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    for (const ki of prewarmIdxs.slice(0,5)) {
      map.jumpTo({center:[pts[ki].lon!,pts[ki].lat!],zoom:zoomIntro,pitch:20,bearing:introBearing})
      await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    }
    // Position at intro start
    map.jumpTo({center:[pts[0].lon!,pts[0].lat!],zoom:zoomIntro,pitch:20,bearing:introBearing})
    await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})

    // Hide HTML marker during rendering
    const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='0'

    // Initialize smooth camera from intro starting pose
    smoothBearRef.current=introBearing
    smoothPitchRef.current=20
    smoothZoomRef.current=zoomIntro
    orbitBaseRef.current=introBearing

    // Setup progressive route reveal
    try { setupRouteReveal(map, pts) } catch {}

    const mapCanvas=map.getCanvas()
    const composite=document.createElement('canvas'); composite.width=outW; composite.height=outH
    compositeCanvasRef.current=composite
    const ctx=composite.getContext('2d')!
    ctx.imageSmoothingEnabled=true
    ctx.imageSmoothingQuality='high'

    // Codec: H.264 dove supportato nativamente (Safari/iOS), VP9 su Chrome/Firefox.
    // NON specificare profili H.264 (avc1.640028 ecc.) — alcuni browser li dichiarano
    // supportati ma producono output scadente con l'encoder software di fallback.
    const mimeType=[
      'video/mp4;codecs=avc1',   // H.264 — Safari, Chrome/Android, Chrome/Windows
      'video/mp4',               // H.264 generico (fallback)
      'video/webm;codecs=vp9',   // VP9 — Chrome/Firefox desktop (buona qualità)
      'video/webm;codecs=vp8',   // VP8 — browser più vecchi
      'video/webm',
    ].find(t=>MediaRecorder.isTypeSupported(t))??''
    // ── Recording setup: WebCodecs (preferred) or MediaRecorder fallback ────────
    const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
    // Shared with VideoEncoder output callback and finishRecording (same closure)
    const videoChunkBuffer: Array<{chunk: any, meta: any}> = []

    const finishRecording = async () => {
      const ve = videoEncoderRef.current
      const ae = audioEncoderRef.current
      const mx = muxerRef.current
      const tgt = muxerTargetRef.current
      if (!ve) return
      setVideoState('finalizing')
      // Tick a visible elapsed-seconds counter — without this the UI shows a bar pinned at
      // 100% with static text for the whole flush/mux duration, looking frozen even when
      // it's legitimately still working (compression can take 20-30s for long/photo-heavy videos).
      setFinalizeElapsedSec(0)
      finalizeIntervalRef.current = setInterval(() => setFinalizeElapsedSec(s => s + 1), 1000)
      try {
      // Stop ambient audio FIRST: oscillators/noise loop forever once started, so if they
      // keep feeding the AudioEncoder while we await flush(), the queue never drains and
      // finalize stalls indefinitely (the original cause of "stuck during compression").
      try { stopAmbientAudioRef.current?.(); stopAmbientAudioRef.current = null } catch {}
      // Flush encoders BEFORE nulling muxer: output callbacks use muxerRef.current.
      // Guard with a timeout so a stuck encoder (e.g. lost GPU context) surfaces as a
      // recoverable error instead of leaving the UI frozen on "finalizing" forever.
      try { await withTimeout(ve.flush(), 20000) } catch (err) {
        console.error('video flush:', err)
        try { ve.close() } catch {} // force-release a wedged encoder (e.g. lost GPU context)
      }
      try { if (ae && ae.state !== 'closed') await withTimeout(ae.flush(), 10000) } catch { try { ae?.close() } catch {} }
      // Sort buffered video chunks by PTS (timestamp) so the muxer receives them in display order,
      // correcting any decode-order reordering from the hardware H.264 encoder.
      videoChunkBuffer.sort((a, b) => a.chunk.timestamp - b.chunk.timestamp)
      for (const { chunk, meta } of videoChunkBuffer) {
        try { mx?.addVideoChunk(chunk, meta) } catch {}
      }
      // Finalize container, then null all refs
      try { mx?.finalize() } catch (err) { console.error('mux finalize:', err) }
      muxerRef.current=null; muxerTargetRef.current=null
      videoEncoderRef.current=null; audioEncoderRef.current=null
      const buf = tgt?.buffer
      if (buf instanceof ArrayBuffer && buf.byteLength > 0) {
        setVideoRecordedBlob(new Blob([buf], { type: 'video/mp4' }))
        setVideoState('done')
      } else {
        console.error('mp4-muxer produced empty buffer — encoding failed')
        setShareToast('Errore: il video non è stato generato correttamente')
        setTimeout(() => setShareToast(''), 4000)
        setVideoState('idle')
      }
      if(mEl) mEl.style.opacity='1'
      try { cleanupRouteReveal(map) } catch {}
      try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current = null } catch {}
      try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current = null } catch {}
      try { audioCtxRef.current?.close(); audioCtxRef.current=null } catch {}
      if (typeof (map as any).setPixelRatio === 'function') { ;(map as any).setPixelRatio(dpr) }
      cont.style.width=''; cont.style.height=''; map.resize()
      } finally {
        if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current = null }
        webglLostCleanupRef.current?.()
      }
    }

    if (hasWebCodecs) {
      // Each frame gets an explicit timestamp → correct duration regardless of render speed
      if (videoEnableAudio) {
        try {
          const audioCtx = new AudioContext({ sampleRate: 44100 })
          const audioDest = audioCtx.createMediaStreamDestination()
          audioCtxRef.current = audioCtx
          const ambientAudio = createAmbientAudio(audioCtx, audioDest, (['reels','feed45','feed11','snappy'] as const).includes(videoPreset as any) ? 'snappy' : 'epico')
          ambientAudio.start()
          stopAmbientAudioRef.current = ambientAudio.stop
          if (typeof AudioEncoder !== 'undefined') {
            const aeCheck = await (AudioEncoder as any).isConfigSupported?.({ codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: 44100 }).catch(() => null)
            if (aeCheck?.supported !== false) {
              const ae = new (AudioEncoder as any)({
                output: (chunk: any, meta: any) => { try { muxerRef.current?.addAudioChunk(chunk, meta) } catch {} },
                error: () => {}
              })
              ae.configure({ codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: 44100, bitrate: 192_000 })
              audioEncoderRef.current = ae
              let audioTimestampUs = 0
              const proc = audioCtx.createScriptProcessor(4096, 2, 2)
              proc.onaudioprocess = (e: AudioProcessingEvent) => {
                if (renderAbortRef.current || ae.state === 'closed') return
                const l = e.inputBuffer.getChannelData(0), r = e.inputBuffer.getChannelData(1)
                const buf = new Float32Array(l.length * 2); buf.set(l, 0); buf.set(r, l.length)
                try {
                  const ad = new (AudioData as any)({ format: 'f32-planar', sampleRate: 44100, numberOfFrames: l.length, numberOfChannels: 2, timestamp: audioTimestampUs, data: buf })
                  ae.encode(ad); ad.close()
                } catch {}
                audioTimestampUs += l.length / 44100 * 1_000_000
              }
              audioCtx.createMediaStreamSource(audioDest.stream).connect(proc)
              proc.connect(audioCtx.destination)
              // onaudioprocess keeps firing for as long as proc stays connected, regardless
              // of whether the oscillators are still producing sound — disconnect it too.
              stopAmbientAudioRef.current = () => { ambientAudio.stop(); proc.disconnect() }
            }
          }
        } catch {}
      }
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
      const muxTarget = new ArrayBufferTarget()
      muxerTargetRef.current = muxTarget
      const muxOpts: any = {
        target: muxTarget,
        video: { codec: 'avc', width: outW, height: outH, frameRate: videoFps },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      }
      if (videoEnableAudio && audioEncoderRef.current) {
        muxOpts.audio = { codec: 'aac', numberOfChannels: 2, sampleRate: 44100 }
      }
      muxerRef.current = new Muxer(muxOpts)
      const ve = new VideoEncoder({
        output: (chunk: any, meta: any) => { videoChunkBuffer.push({ chunk, meta }) },
        error: (e: any) => console.error('VideoEncoder error:', e)
      })
      // Pick highest-quality AVC profile the browser supports
      const avcCandidates = ['avc1.640034','avc1.640028','avc1.4d4028','avc1.42003d','avc1.420028']
      let chosenCodec = 'avc1.420028'
      for (const c of avcCandidates) {
        try {
          const sup = await VideoEncoder.isConfigSupported({ codec: c, width: outW, height: outH, bitrate: videoFps===60?25_000_000:20_000_000, framerate: videoFps, latencyMode: 'quality' })
          if (sup.supported) { chosenCodec = c; break }
        } catch {}
      }
      // 'quality' (not 'realtime'): this is a file export, not a live stream — the spec
      // explicitly allows 'realtime' encoders to drop/degrade frames under load to
      // minimize latency, which is the wrong tradeoff here and was producing flicker.
      ve.configure({ codec: chosenCodec, width: outW, height: outH, bitrate: videoFps===60?25_000_000:20_000_000, framerate: videoFps, latencyMode: 'quality' })
      videoEncoderRef.current = ve

    } else {
      // MediaRecorder fallback (browsers without WebCodecs)
      let audioStream: MediaStream | undefined
      if (videoEnableAudio) {
        try {
          const audioCtx = new AudioContext({ sampleRate: 44100 })
          const audioDest = audioCtx.createMediaStreamDestination()
          audioCtxRef.current = audioCtx
          const ambientAudio = createAmbientAudio(audioCtx, audioDest, (['reels','feed45','feed11','snappy'] as const).includes(videoPreset as any) ? 'snappy' : 'epico')
          ambientAudio.start()
          stopAmbientAudioRef.current = ambientAudio.stop
          audioStream = audioDest.stream
        } catch {}
      }
      const videoStream=(composite as any).captureStream(videoFps) as MediaStream
      const stream = audioStream
        ? new MediaStream([...videoStream.getVideoTracks(), ...audioStream.getAudioTracks()])
        : videoStream
      const recorder=new MediaRecorder(stream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:videoFps===60?25_000_000:20_000_000,audioBitsPerSecond:192_000})
      videoChunksRef.current=[]
      recorder.ondataavailable=(e:BlobEvent)=>{if(e.data.size>0)videoChunksRef.current.push(e.data)}
      recorder.onstop=()=>{
        const blob=new Blob(videoChunksRef.current,{type:mimeType||'video/webm'})
        setVideoRecordedBlob(blob); setVideoState('done')
        if(mEl) mEl.style.opacity='1'
        try { cleanupRouteReveal(map) } catch {}
        try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current = null } catch {}
        try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current = null } catch {}
        try { audioCtxRef.current?.close(); audioCtxRef.current=null } catch {}
        if (typeof (map as any).setPixelRatio === 'function') { ;(map as any).setPixelRatio(dpr) }
        cont.style.width=''; cont.style.height=''; map.resize()
        webglLostCleanupRef.current?.()
      }
      mediaRecorderRef.current=recorder; recorder.start(100)
    }


    // N, rawRouteBears, smoothRouteBears computed above (before introBearing)

    // Body data pre-computation
    const SAMPLES=Math.min(300,N), step=(N-1)/(SAMPLES-1)
    const rawHr=Array.from({length:SAMPLES},(_,i)=>pts[Math.min(Math.round(i*step),N-1)].heartRateBpm??0)
    const rawSpeed=Array.from({length:SAMPLES},(_,i)=>{
      const idx=Math.min(Math.round(i*step),N-1); if(idx===0) return 0
      const prev=Math.max(0,idx-1)
      const t0=pts[prev].time?new Date(pts[prev].time!).getTime():0, t1=pts[idx].time?new Date(pts[idx].time!).getTime():0
      if(!t0||!t1||t1<=t0) return 0
      return(distM(pts[prev].lat!,pts[prev].lon!,pts[idx].lat!,pts[idx].lon!)/((t1-t0)/1000))*3.6
    })
    const smoothSpeed=smoothArray(rawSpeed,4)
    const smoothHr=smoothArray(rawHr,4)
    const hrMax=Math.max(...smoothHr), hrMin=Math.min(...smoothHr.filter(v=>v>0),hrMax)
    const spMax=Math.max(...smoothSpeed), hasHr=hrMax>0, hasSpeed=spMax>0
    // Prefer authoritative stored values over recomputed-from-GPS (which can differ due to downsampling)
    const totalKm=(distanceProp ?? totalDistRef.current) / 1000
    const elevGain = elevGainProp ?? elevStatsRef.current.gain

    const TARGET_FPS=videoFps
    const PHOTO_REVEAL_FRAMES = Math.round(TARGET_FPS * photoDurationSec)
    const sortedPhotos = [...routePhotos]
      .sort((a,b)=>a.progress-b.progress)
      .filter(ph => photoImgsRef.current.has(ph.id))
      .map(ph => ({photo:ph, img:photoImgsRef.current.get(ph.id)!}))

    // Bake photo pins into MapLibre's WebGL render as a symbol layer.
    // This ensures pins are geo-anchored and never wander relative to the map —
    // they move exactly with map tiles, unlike a canvas overlay that composites
    // after the render pass and drifts under pitched-camera perspective.
    const photoPinLayerId  = 'dtrek-photo-pins-layer'
    const photoPinSourceId = 'dtrek-photo-pins'
    if (sortedPhotos.length > 0) {
      const iconSc = 2  // render 2× for crispness; pixelRatio:2 → 45×54 CSS px
      const photoPinImageIds: string[] = []
      for (const s of sortedPhotos) {
        const W = 45 * iconSc, H = 45 * iconSc, tipH = 9 * iconSc
        const offC = document.createElement('canvas')
        offC.width = W; offC.height = H + tipH
        const offCtx = offC.getContext('2d')!
        offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high'
        drawPhotoPin(offCtx, W / 2, H + tipH, iconSc, s.img)
        const imgId = `dtrek-photo-pin-${s.photo.id}`
        const imageData = offCtx.getImageData(0, 0, offC.width, offC.height)
        try { if (map.hasImage(imgId)) map.removeImage(imgId); map.addImage(imgId, imageData, { pixelRatio: iconSc }) } catch {}
        photoPinImageIds.push(imgId)
      }
      const pinFeatures = sortedPhotos.map(s => {
        const pi = Math.min(Math.round(s.photo.progress * (N - 1)), N - 1)
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [s.photo.lon ?? pts[pi].lon!, s.photo.lat ?? pts[pi].lat!] },
          properties: { pinId: `dtrek-photo-pin-${s.photo.id}` },
        }
      })
      try {
        map.addSource(photoPinSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: pinFeatures } })
        map.addLayer({
          id: photoPinLayerId, type: 'symbol', source: photoPinSourceId,
          layout: {
            'icon-image': ['get', 'pinId'],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-size': (outW / 1080) / dpr,
          },
          paint: { 'icon-opacity': 0 },
        } as any)
        await withTimeout(new Promise<void>(r => map.once('idle', r as any)), 8000).catch(()=>{})
      } catch {}
      photoPinCleanupRef.current = () => {
        const m = mapRef.current; if (!m) return
        try { m.removeLayer(photoPinLayerId) } catch {}
        try { m.removeSource(photoPinSourceId) } catch {}
        for (const id of photoPinImageIds) { try { m.removeImage(id) } catch {} }
      }
    }

    // Bake POI badges into MapLibre's WebGL render as a symbol layer (same rationale as photo pins).
    // Overpass returns POIs with no cap (a route near villages/refuges can return 50-100+),
    // and baking one texture per POI overwhelmed the GPU and stalled the 'idle' wait below —
    // cap the count, prioritize the most notable types, and share one image per distinct type.
    const poiPinLayerId  = 'dtrek-poi-pins-layer'
    const poiPinSourceId = 'dtrek-poi-pins'
    const videoPois = (pois ?? []).slice()
      .sort((a, b) => (POI_NOTABILITY_TIER[a.type] - POI_NOTABILITY_TIER[b.type]) || (a.distFromTrack - b.distFromTrack))
      .slice(0, MAX_VIDEO_POIS)
    if (videoShowPois && videoPois.length > 0) {
      const iconSc = 2
      const poiPinImageIds: string[] = []
      const poiTypesUsed = Array.from(new Set(videoPois.map(p => p.type)))
      for (const type of poiTypesUsed) {
        const D = 32 * iconSc
        const offC = document.createElement('canvas')
        offC.width = D; offC.height = D
        const offCtx = offC.getContext('2d')!
        offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high'
        drawPoiPin(offCtx, D / 2, D / 2, iconSc, POI_META[type].emoji)
        const imgId = `dtrek-poi-pin-type-${type}`
        const imageData = offCtx.getImageData(0, 0, D, D)
        try { if (map.hasImage(imgId)) map.removeImage(imgId); map.addImage(imgId, imageData, { pixelRatio: iconSc }) } catch {}
        poiPinImageIds.push(imgId)
      }
      const poiPinFeatures = videoPois.map(poi => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [poi.lon, poi.lat] },
        properties: { pinId: `dtrek-poi-pin-type-${poi.type}` },
      }))
      try {
        map.addSource(poiPinSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: poiPinFeatures } })
        map.addLayer({
          id: poiPinLayerId, type: 'symbol', source: poiPinSourceId,
          layout: {
            'icon-image': ['get', 'pinId'],
            'icon-anchor': 'center',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-size': (outW / 1080) / dpr,
          },
          paint: { 'icon-opacity': 0 },
        } as any)
        await withTimeout(new Promise<void>(r => map.once('idle', r as any)), 8000).catch(()=>{})
      } catch {}
      poiPinCleanupRef.current = () => {
        const m = mapRef.current; if (!m) return
        try { m.removeLayer(poiPinLayerId) } catch {}
        try { m.removeSource(poiPinSourceId) } catch {}
        for (const id of poiPinImageIds) { try { m.removeImage(id) } catch {} }
      }
    }

    // Intro: fixed duration where p=0 (route frozen, camera swoops in)
    const INTRO_FRAMES = Math.round(TARGET_FPS * Math.max(2, videoDuration * 0.08))
    // Route frames: full traversal 0→1 starts AFTER intro
    const ROUTE_FRAMES = Math.round(TARGET_FPS * videoDuration)
    // Each photo inserts PHOTO_REVEAL_FRAMES of pause after reaching its position (after intro)
    const photoTriggerRouteFrames = sortedPhotos.map(s => Math.round(s.photo.progress * ROUTE_FRAMES))
    // Outro: separate phase after route completes (~17% of route duration, min 3s)
    const OUTRO_FRAMES = Math.round(TARGET_FPS * Math.max(3, videoDuration * 0.17))
    const TOTAL_FRAMES = INTRO_FRAMES + ROUTE_FRAMES + sortedPhotos.length * PHOTO_REVEAL_FRAMES + OUTRO_FRAMES
    renderedFramesRef.current = 0
    encodedFramesRef.current  = 0
    const outroStartBearRef = { current: -1 as number }

    // Pre-compute peak position on route (for peak callout)
    const peakRouteP = (() => {
      let maxA = -Infinity, peakIdx = 0
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i].altitudeMeters ?? 0
        if (a > maxA) { maxA = a; peakIdx = i }
      }
      return peakIdx / Math.max(1, pts.length - 1)
    })()

    const frameToState = (frameIdx: number): {p:number; introP?:number; reveal?:{photo:RoutePhoto;img:HTMLImageElement;revealFrame:number}; outroP?:number; followFrame?:number} => {
      // Intro phase: route frozen at p=0, camera interpolates via introP 0→1
      if (frameIdx < INTRO_FRAMES) {
        return {p: 0, introP: frameIdx / Math.max(1, INTRO_FRAMES - 1)}
      }
      const afterIntro = frameIdx - INTRO_FRAMES
      let pauseOffset = 0
      for (let i = 0; i < sortedPhotos.length; i++) {
        const triggerF = photoTriggerRouteFrames[i] + pauseOffset
        if (afterIntro < triggerF) break
        if (afterIntro < triggerF + PHOTO_REVEAL_FRAMES) {
          return {p: sortedPhotos[i].photo.progress, reveal: {...sortedPhotos[i], revealFrame: afterIntro - triggerF}}
        }
        pauseOffset += PHOTO_REVEAL_FRAMES
      }
      const routeFrame = afterIntro - pauseOffset
      if (routeFrame >= ROUTE_FRAMES) {
        const outroFrame = routeFrame - ROUTE_FRAMES
        return {p: 1.0, outroP: Math.min(1, outroFrame / Math.max(1, OUTRO_FRAMES - 1))}
      }
      // Divide by ROUTE_FRAMES-1 so the last follow frame reaches p=1.0 (exactly pts[N-1]),
      // preventing a small center jump at the follow→outro transition
      return {p: Math.min(1, routeFrame / Math.max(1, ROUTE_FRAMES - 1)), followFrame: routeFrame}
    }

    setRenderTotal(TOTAL_FRAMES); setRenderFrame(0); frameCountRef.current=0; renderAbortRef.current=false
    lastIconOpacityRef.current.clear()

    // Always recompute shots with current slider values so intro/follow/outro
    // all use the same zoomFollow, even if sliders were changed after goToPostProd
    const currentShots=planShots(pts, zoomIntro, zoomFollow)

    const TITLE_DUR = Math.round(TARGET_FPS * 2.2)  // 2.2s title card
    // Strip database code prefix (e.g. "dtrek1234567890" or "dtrek1234567890 - Titolo")
    const displayTitle=(title??'').replace(/^dtrek[a-z0-9]+\s*[-–:·\s]*/i,'').trim()||(title??'')

    // Fires callback after MapLibre renders the current frame, with a 600ms fallback.
    // Prevents the render loop from stalling if MapLibre skips a render cycle
    // (e.g. when the camera has fully converged and the map considers the scene unchanged).
    // Callback is allowed to be async (capture callbacks await encoder backpressure).
    const onNextRender = (cb: () => void | Promise<void>) => {
      let fired = false
      const fire = () => { if (!fired) { fired = true; cb() } }
      try { map!.once('render' as any, fire) } catch {}
      setTimeout(fire, 600)
    }

    const renderNextFrame = () => {
      if(renderAbortRef.current) return
      const frameIdx=frameCountRef.current
      if(frameIdx>=TOTAL_FRAMES){
        if(videoEncoderRef.current){ finishRecording().catch(err=>{ console.error(err); failRendering('Errore durante la finalizzazione del video. Riprova.') }) }
        else { mediaRecorderRef.current?.stop() }
        return
      }

      const {p, introP, reveal, outroP, followFrame} = frameToState(frameIdx)
      setRenderProgress(frameIdx/TOTAL_FRAMES); setRenderFrame(frameIdx)

      // During photo reveal: hold camera, show photo fullscreen with Ken Burns effect
      if (reveal) {
        requestAnimationFrame(async ()=>{
          if (renderAbortRef.current) return
          try {
          const t = reveal.revealFrame / PHOTO_REVEAL_FRAMES
          const alpha = t<0.08 ? t/0.08 : t>0.92 ? (1-t)/0.08 : 1
          const img = reveal.img
          // Defensive guard against the same black-frame class of bug as the map canvas:
          // skip drawing/encoding entirely (instead of compositing a blank/partial image)
          // if this photo somehow isn't fully decoded yet.
          const imgReady = img.complete && img.naturalWidth > 0
          ctx.clearRect(0, 0, outW, outH)
          if (imgReady) {
          // Ken Burns: slow zoom + gentle drift per photo
          const photoIdx = sortedPhotos.findIndex(s => s.photo.id === reveal.photo.id)
          const kbScale = 1 + 0.07 * t
          const driftDir = (photoIdx % 2 === 0) ? 1 : -1
          const kbDX = driftDir * outW * 0.03 * t
          const kbDY = outH * 0.02 * t
          const srcA = img.width / img.height
          const dstA = outW / outH
          let sx=0,sy=0,sw=img.width,sh=img.height
          if(srcA>dstA){sw=Math.round(sh*dstA);sx=(img.width-sw)/2}
          else{sh=Math.round(sw/dstA);sy=(img.height-sh)/2}
          ctx.save()
          ctx.translate(outW/2 + kbDX, outH/2 + kbDY)
          ctx.scale(kbScale, kbScale)
          ctx.drawImage(img, sx, sy, sw, sh, -outW/2, -outH/2, outW, outH)
          ctx.restore()
          // Vignette
          const vig=ctx.createRadialGradient(outW/2,outH/2,outW*0.3,outW/2,outH/2,outW*0.75)
          vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.35)')
          ctx.fillStyle=vig; ctx.fillRect(0,0,outW,outH)
          // Caption
          if(reveal.photo.caption){
            const sc2=Math.min(outW,outH)/1080
            ctx.globalAlpha=alpha
            ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,outH-Math.round(100*sc2),outW,Math.round(100*sc2))
            ctx.fillStyle='white'; ctx.textAlign='center'; ctx.textBaseline='middle'
            ctx.font=`italic ${Math.round(38*sc2)}px Georgia,serif`
            ctx.fillText(reveal.photo.caption,outW/2,outH-Math.round(50*sc2))
            ctx.globalAlpha=1
          }
          // Fade overlay
          ctx.globalAlpha=1-alpha; ctx.fillStyle='black'; ctx.fillRect(0,0,outW,outH); ctx.globalAlpha=1
          if (videoEncoderRef.current) {
            await waitForEncoderQueue(videoEncoderRef.current)
            let _vf: InstanceType<typeof VideoFrame> | null = null
            try { _vf = new VideoFrame(composite, { timestamp: Math.round(frameCountRef.current * 1_000_000 / TARGET_FPS), duration: Math.round(1_000_000 / TARGET_FPS) }); videoEncoderRef.current.encode(_vf, { keyFrame: frameCountRef.current % (TARGET_FPS * 2) === 0 }); encodedFramesRef.current++ } catch {}
            finally { _vf?.close() }
          }
          }
          } catch (err) { console.error('[dtrek] reveal frame error:', err) }
          frameCountRef.current++; renderedFramesRef.current++
          renderNextFrame()
        })
        return
      }

      // Outro phase: camera orbits and pulls back from route end after traversal completes
      if (outroP !== undefined) {
        if (outroStartBearRef.current < 0) outroStartBearRef.current = smoothBearRef.current
        // Ease-in² on orbit so it starts at near-zero angular velocity, eliminating the
        // bearing velocity discontinuity at the follow→outro transition
        const easedOutroP = outroP * outroP
        const outroBearing = (outroStartBearRef.current - easedOutroP * 100 + 360) % 360
        const outroPitch = lerp(48, 8, outroP)
        const outroZoom_val = lerp(zoomFollow, zoomOutro, outroP)
        smoothBearRef.current = lerpAngle(smoothBearRef.current, outroBearing, 0.04)
        smoothPitchRef.current = lerp(smoothPitchRef.current, outroPitch, 0.06)
        smoothZoomRef.current = lerp(smoothZoomRef.current, outroZoom_val, 0.06)
        mapRef.current?.jumpTo({
          center: [pts[N-1].lon!, pts[N-1].lat!],
          bearing: smoothBearRef.current, pitch: smoothPitchRef.current, zoom: smoothZoomRef.current,
        })
        // Photo/POI pins: fade out over first 30% of outro via symbol layer opacity.
        // setPaintProperty forces a style recalc even when the value is unchanged —
        // skip the call when the cached value already matches.
        const outroIconOpacity = outroP < 0.3 ? (1 - outroP / 0.3) : 0
        if (lastIconOpacityRef.current.get(photoPinLayerId) !== outroIconOpacity) {
          try { map!.setPaintProperty(photoPinLayerId, 'icon-opacity', outroIconOpacity); lastIconOpacityRef.current.set(photoPinLayerId, outroIconOpacity) } catch {}
        }
        if (lastIconOpacityRef.current.get(poiPinLayerId) !== outroIconOpacity) {
          try { map!.setPaintProperty(poiPinLayerId, 'icon-opacity', outroIconOpacity); lastIconOpacityRef.current.set(poiPinLayerId, outroIconOpacity) } catch {}
        }
        try { map!.triggerRepaint() } catch {}
        onNextRender(async () => {
          if (!mapRef.current) { frameCountRef.current++; renderedFramesRef.current++; renderNextFrame(); return }
          try {
          // Skip the entire tick (draw + encode) if the map canvas is momentarily
          // unavailable (mid-resize/context hiccup) instead of compositing a blank
          // frame — the composite canvas simply holds its last good content, and no
          // VideoFrame is sent for this tick, so no black frame reaches the output file.
          const mapAvailableO = mapCanvas.width > 0 && mapCanvas.height > 0
          if (mapAvailableO) {
          ctx.clearRect(0, 0, outW, outH)
          const grading = (VIDEO_PRESETS as Record<string,{grading:string}>)[videoPreset]?.grading ?? VIDEO_PRESETS.epico.grading
          try { ctx.filter=grading } catch {}
          const crO = coverRect(mapCanvas.width, mapCanvas.height, outW, outH)
          ctx.drawImage(mapCanvas, crO.sx, crO.sy, crO.sw, crO.sh, 0, 0, outW, outH)
          try { ctx.filter='none' } catch {}
          const sc2 = Math.min(outW, outH) / 1080
          // User pin visible at start of outro, fades out over first 20%
          if (outroP < 0.2) {
            ctx.globalAlpha = 1 - outroP / 0.2
            drawMapPin(ctx, outW/2, outH/2, outW/1080, faceImgRef.current)
            ctx.globalAlpha = 1
          }
          // End card fades in during outro
          const FADE_START = 0.35
          if (outroP > FADE_START) {
            const fa = Math.pow((outroP - FADE_START) / (1 - FADE_START), 1.2)
            if (fa < 0.82) {
              ctx.globalAlpha = fa * 0.95; ctx.fillStyle = 'black'; ctx.fillRect(0, 0, outW, outH); ctx.globalAlpha = 1
            } else {
              ctx.globalAlpha = fa; ctx.fillStyle = 'black'; ctx.fillRect(0, 0, outW, outH); ctx.globalAlpha = 1
              const cardAlpha = Math.min(1, (fa - 0.82) / 0.18)
              ctx.globalAlpha = cardAlpha
              ctx.fillStyle = '#22d3ee'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
              ctx.font = `800 ${Math.round(26*sc2)}px -apple-system,sans-serif`
              ctx.fillText('DTrek', outW/2, outH/2 - Math.round(92*sc2))
              ctx.fillStyle = 'white'; ctx.font = `700 ${Math.round(44*sc2)}px -apple-system,sans-serif`
              let et = displayTitle; while(ctx.measureText(et).width > outW - Math.round(80*sc2) && et.length > 4) et = et.slice(0,-4)+'…'
              ctx.fillText(et, outW/2, outH/2 - Math.round(30*sc2))
              const statItems:{v:string;l:string;col:string}[] = [
                {v:`${+totalKm.toFixed(1)} km`, l:'distanza', col:'white'},
                {v:`${elevGain} m`, l:'D+', col:'white'},
              ]
              const sw2 = Math.round(150*sc2), sgap = Math.round(20*sc2)
              const tw2 = statItems.length*sw2+(statItems.length-1)*sgap
              const sx0 = outW/2-tw2/2+sw2/2, sy2 = outH/2+Math.round(52*sc2)
              statItems.forEach((s,i)=>{
                const sx3 = sx0+i*(sw2+sgap)
                ctx.fillStyle = s.col; ctx.font = `800 ${Math.round(40*sc2)}px -apple-system,sans-serif`
                ctx.fillText(s.v, sx3, sy2)
                ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.font = `500 ${Math.round(14*sc2)}px -apple-system,sans-serif`
                ctx.fillText(s.l, sx3, sy2+Math.round(30*sc2))
              })
              ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.font = `400 ${Math.round(12*sc2)}px -apple-system,sans-serif`
              ctx.fillText('Tracciato con DTrek', outW/2, outH/2+Math.round(130*sc2))
              ctx.globalAlpha = 1
            }
          }
          if (videoEncoderRef.current) {
            await waitForEncoderQueue(videoEncoderRef.current)
            let _vf: InstanceType<typeof VideoFrame> | null = null
            try { _vf = new VideoFrame(composite, { timestamp: Math.round(frameCountRef.current * 1_000_000 / TARGET_FPS), duration: Math.round(1_000_000 / TARGET_FPS) }); videoEncoderRef.current.encode(_vf, { keyFrame: frameCountRef.current % (TARGET_FPS * 2) === 0 }); encodedFramesRef.current++ } catch {}
            finally { _vf?.close() }
          }
          }
          } catch (err) { console.error('[dtrek] outro frame error:', err) }
          frameCountRef.current++; renderedFramesRef.current++
          renderNextFrame()
        })
        return
      }

      const rawIdx=p*(N-1), i0=Math.floor(rawIdx), i1=Math.min(i0+1,N-1), frac=rawIdx-i0
      // During intro p=0 → lon/lat = pts[0]; follow/outro → actual position
      const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac
      const lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
      const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac

      if (introP !== undefined) {
        // ── Intro: camera swoops in, route stays at p=0, pin hidden ──────────
        const introShot = currentShots.find(s => s.id === 'intro') ?? currentShots[0]
        // Ease-out on introP: target reaches follow values by ~80% of intro, giving
        // the IIR filter time to converge before the follow phase starts.
        const easedIntroP = 1 - Math.pow(1 - introP, 2)
        const targetPitch = lerp(introShot.pitch[0], introShot.pitch[1], easedIntroP)
        const targetZoom  = lerp(introShot.zoom[0],  introShot.zoom[1],  easedIntroP)
        // Faster lerp in the last 30% of intro to ensure full convergence
        const lerpF = introP > 0.7 ? lerp(0.07, 0.14, (introP - 0.7) / 0.3) : 0.07
        smoothBearRef.current  = lerpAngle(smoothBearRef.current, introBearing, 0.022)
        smoothPitchRef.current = lerp(smoothPitchRef.current, targetPitch, lerpF)
        smoothZoomRef.current  = lerp(smoothZoomRef.current, targetZoom, lerpF)
        mapRef.current?.jumpTo({
          center: [pts[0].lon!, pts[0].lat!], bearing: smoothBearRef.current,
          pitch: smoothPitchRef.current, zoom: smoothZoomRef.current,
        })
      } else {
        // ── Follow: camera tracks GPS, pin moves ──────────────────────────────
        // Route bearing: look 12% ahead so camera anticipates direction
        const lookIdx=Math.min(Math.round((p+0.12)*(N-1)),smoothRouteBears.length-1)
        const routeBear=smoothRouteBears[lookIdx]
        const followShot = currentShots.find(s => s.id === 'follow') ?? currentShots[currentShots.length-1]
        const cam = shotCamera(followShot, routeBear, p, orbitBaseRef)
        smoothBearRef.current  = lerpAngle(smoothBearRef.current, cam.bearing, 0.022)
        smoothPitchRef.current = lerp(smoothPitchRef.current, cam.pitch, 0.06)
        smoothZoomRef.current  = lerp(smoothZoomRef.current, cam.zoom, 0.06)
        mapRef.current?.jumpTo({
          center:[lon,lat], bearing:smoothBearRef.current,
          pitch:smoothPitchRef.current, zoom:smoothZoomRef.current,
        })
        // Progressive route reveal (every 20 frames)
        if(frameIdx%20===0&&mapRef.current){
          const cov=pts.slice(0,Math.min(i0+2,N)).map(pp=>[pp.lon!,pp.lat!])
          try{(mapRef.current.getSource('route-traveled') as any)?.setData({type:'Feature',geometry:{type:'LineString',coordinates:cov},properties:{}})}catch{}
        }
      }

      // Photo/POI pins: hidden in intro, visible in follow (symbol layer driven by opacity).
      // Skip the call when the cached value already matches — avoids a style recalc
      // every single frame for a value that's constant for the whole intro or follow phase.
      const followIconOpacity = introP !== undefined ? 0 : 1
      if (lastIconOpacityRef.current.get(photoPinLayerId) !== followIconOpacity) {
        try { map!.setPaintProperty(photoPinLayerId, 'icon-opacity', followIconOpacity); lastIconOpacityRef.current.set(photoPinLayerId, followIconOpacity) } catch {}
      }
      if (lastIconOpacityRef.current.get(poiPinLayerId) !== followIconOpacity) {
        try { map!.setPaintProperty(poiPinLayerId, 'icon-opacity', followIconOpacity); lastIconOpacityRef.current.set(poiPinLayerId, followIconOpacity) } catch {}
      }
      // Capture frame after MapLibre's own render pass completes (guarantees frame reflects jumpTo)
      try { map!.triggerRepaint() } catch {}
      onNextRender(async ()=>{
        if(!mapRef.current) { frameCountRef.current++; renderedFramesRef.current++; renderNextFrame(); return }
        try {

        // Skip the entire tick (draw + encode) if the map canvas is momentarily
        // unavailable — see the matching comment in the outro block above.
        const mapAvailableF = mapCanvas.width > 0 && mapCanvas.height > 0
        if (mapAvailableF) {
        ctx.clearRect(0, 0, outW, outH)
        // Color grading: applica il grading del preset corrente
        const grading = (VIDEO_PRESETS as Record<string,{grading:string}>)[videoPreset]?.grading ?? VIDEO_PRESETS.epico.grading
        try { ctx.filter=grading } catch {}
        const crF = coverRect(mapCanvas.width, mapCanvas.height, outW, outH)
        ctx.drawImage(mapCanvas,crF.sx,crF.sy,crF.sw,crF.sh,0,0,outW,outH)
        try { ctx.filter='none' } catch {}

        // User pin: canvas center = GPS position; always visible in follow, fades in over last 30% of intro
        if (introP === undefined) {
          drawMapPin(ctx, outW/2, outH/2, outW/1080, faceImgRef.current)
        } else if (introP > 0.7) {
          ctx.globalAlpha = (introP - 0.7) / 0.3
          drawMapPin(ctx, outW/2, outH/2, outW/1080, faceImgRef.current)
          ctx.globalAlpha = 1
        }

        const sc2=Math.min(outW,outH)/1080

        // Animated elevation profile (upper center, hidden during title card)
        if(altitudeSeries.length>1&&!(videoShowTitle&&displayTitle&&frameIdx<Math.round(TARGET_FPS*1.8))){
          const elW=Math.round(outW*0.36), elH=Math.round(34*sc2)
          const elX=Math.round((outW-elW)/2), elY=Math.round(18*sc2)
          drawVideoElevProfile(ctx,altitudeSeries,p,elX,elY,elW,elH,sc2)
        }

        // Peak callout: appears when camera is near the route's highest point (follow phase only)
        const peakDist=Math.abs(p-peakRouteP)
        if(peakDist<0.042&&altitudeSeries.length>0&&introP===undefined&&frameIdx>TITLE_DUR){
          const peakAlpha=Math.pow(Math.max(0,1-peakDist/0.042),0.5)*0.9
          const maxAlt=Math.round(Math.max(...altitudeSeries))
          const label=`▲ ${maxAlt} m`
          ctx.save()
          ctx.font=`700 ${Math.round(20*sc2)}px -apple-system,sans-serif`
          const lw=ctx.measureText(label).width+Math.round(28*sc2), lh=Math.round(38*sc2)
          const lx=Math.round((outW-lw)/2), ly=Math.round(outH*0.115)
          ctx.globalAlpha=peakAlpha
          ctx.fillStyle='rgba(0,0,0,0.6)'; rrect(ctx,lx,ly,lw,lh,lh/2); ctx.fill()
          ctx.fillStyle='#60a5fa'; ctx.textAlign='center'; ctx.textBaseline='middle'
          ctx.fillText(label,outW/2,ly+lh/2)
          ctx.globalAlpha=1; ctx.restore()
        }

        // Title card (first 2.2s)
        if(videoShowTitle&&displayTitle&&frameIdx<TITLE_DUR){
          const fi=frameIdx/(TARGET_FPS*0.55), fo=frameIdx>(TITLE_DUR-TARGET_FPS*0.55)?(TITLE_DUR-frameIdx)/(TARGET_FPS*0.55):1
          const alpha=Math.min(1,Math.min(fi,fo))
          ctx.fillStyle=`rgba(0,0,0,${alpha*0.58})`; ctx.fillRect(0,0,outW,outH)
          ctx.globalAlpha=alpha
          ctx.fillStyle='rgba(255,255,255,0.52)'; ctx.font=`700 ${Math.round(20*sc2)}px -apple-system,sans-serif`
          ctx.textAlign='center'; ctx.textBaseline='bottom'
          ctx.fillText('DTrek',outW/2,outH/2-Math.round(36*sc2))
          ctx.fillStyle='white'; ctx.font=`700 ${Math.round(62*sc2)}px -apple-system,sans-serif`; ctx.textBaseline='middle'
          let tt=displayTitle; while(ctx.measureText(tt).width>outW-Math.round(120*sc2)&&tt.length>4) tt=tt.slice(0,-4)+'…'
          ctx.fillText(tt,outW/2,outH/2)
          ctx.globalAlpha=1
        }

        // HUD (skip if title card is prominent)
        const showHUD = !(videoShowTitle&&displayTitle&&frameIdx<TITLE_DUR&&frameIdx<Math.round(TARGET_FPS*1.5))
        if(showHUD){
          const si=Math.min(Math.round(p*(SAMPLES-1)),SAMPLES-1)
          const hrData:GraphData|undefined=(hasHr&&videoShowBody)?{series:smoothHr,label:'BPM',icon:'♥',strokeColor:'#ef4444',fillColor:'rgba(239,68,68,0.28)',minVal:Math.max(0,hrMin-5),maxVal:hrMax+5,currentValue:smoothHr[si]}:undefined
          const speedData:GraphData|undefined=(hasSpeed&&videoShowBody)?{series:smoothSpeed,label:'km/h',icon:'⚡',strokeColor:'#60a5fa',fillColor:'rgba(96,165,250,0.28)',minVal:0,maxVal:spMax+1,currentValue:smoothSpeed[si]}:undefined
          drawHUD(ctx,outW,outH,{showTitle:videoShowTitle,title:displayTitle,showStats:videoShowStats,coveredKm:+(p*totalKm).toFixed(1),totalKm:+totalKm.toFixed(1),alt:Math.round(alt),elevGain,showProgress:videoShowProgress,progress:p,showBody:videoShowBody,hrData,speedData,shotLabel:introP!==undefined?'Intro aereo':'Seguimento'})
        }

        if (videoEncoderRef.current) {
          await waitForEncoderQueue(videoEncoderRef.current)
          let _vf: InstanceType<typeof VideoFrame> | null = null
          try { _vf = new VideoFrame(composite, { timestamp: Math.round(frameCountRef.current * 1_000_000 / TARGET_FPS), duration: Math.round(1_000_000 / TARGET_FPS) }); videoEncoderRef.current.encode(_vf, { keyFrame: frameCountRef.current % (TARGET_FPS * 2) === 0 }); encodedFramesRef.current++ } catch {}
          finally { _vf?.close() }
        }
        }
        } catch (err) { console.error('[dtrek] frame error:', err) }
        frameCountRef.current++; renderedFramesRef.current++
        renderNextFrame()
      })
    }

    setVideoState('rendering')
    renderNextFrame()

    } catch (err) {
      failRendering('Errore durante la preparazione del video. Riprova con meno foto/POI o riduci la durata.')
    }
  },[videoDuration,videoFps,videoOrientation,videoShowTitle,videoShowStats,videoShowProgress,videoShowBody,title,routePhotos,videoPreset,videoEnableAudio,altitudeSeries,photoDurationSec,zoomIntro,zoomFollow,zoomOutro,pois,videoShowPois])

  const cancelRendering=useCallback(()=>{
    renderAbortRef.current=true; cancelAnimationFrame(animRef.current)
    frameCountRef.current=0
    if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){mediaRecorderRef.current.onstop=null;mediaRecorderRef.current.stop()}
    mediaRecorderRef.current=null; compositeCanvasRef.current=null
    try { videoEncoderRef.current?.close(); videoEncoderRef.current=null } catch {}
    try { audioEncoderRef.current?.close(); audioEncoderRef.current=null } catch {}
    muxerRef.current=null; muxerTargetRef.current=null
    try { stopAmbientAudioRef.current?.(); stopAmbientAudioRef.current=null } catch {}
    try { audioCtxRef.current?.close(); audioCtxRef.current=null } catch {}
    if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current=null }
    try { webglLostCleanupRef.current?.() } catch {}
    const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='1'
    if(mapRef.current) try{cleanupRouteReveal(mapRef.current)}catch{}
    try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current = null } catch {}
    try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current = null } catch {}
    // Restore container size and map DPR (set at render start, normally restored by finishRecording)
    const map=mapRef.current; const cont=map?.getContainer()
    if(cont){cont.style.width='';cont.style.height=''}
    if(map){try{map.resize()}catch{};if(typeof(map as any).setPixelRatio==='function'){try{(map as any).setPixelRatio(window.devicePixelRatio)}catch{}}}
    setVideoState('idle'); setRenderProgress(0); setVideoRecordedBlob(null)
  },[])

  const handleVideoDownload=useCallback(()=>{
    if(!videoRecordedBlob) return
    const ext=videoRecordedBlob.type.includes('mp4')?'mp4':'webm'
    if(videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
    const url=URL.createObjectURL(videoRecordedBlob)
    videoObjUrlRef.current=url
    const a=document.createElement('a');a.href=url;a.download=`dtrek-3d-${Date.now()}.${ext}`;a.click()
    setTimeout(()=>{ if(videoObjUrlRef.current===url){ URL.revokeObjectURL(url); videoObjUrlRef.current=null } },60_000)
    setShareToast('Video salvato!');setTimeout(()=>setShareToast(''),2500)
  },[videoRecordedBlob])

  const handleVideoShare=useCallback(async()=>{
    if(!videoRecordedBlob) return
    const ext=videoRecordedBlob.type.includes('mp4')?'mp4':'webm'
    const file=new File([videoRecordedBlob],`dtrek-3d-${Date.now()}.${ext}`,{type:videoRecordedBlob.type})
    if(typeof navigator!=='undefined'&&(navigator as any).canShare?.({files:[file]})){
      try{await navigator.share({title:title??'Percorso DTrek',text:'DTrek — Video 3D',files:[file]});setVideoState('idle');setVideoRecordedBlob(null);return}catch{}
    }
    handleVideoDownload()
  },[videoRecordedBlob,title,handleVideoDownload])

  const totalKm=+(totalDistRef.current/1000).toFixed(1)

  const generateCaption = useCallback(async () => {
    setCaptionLoading(true)
    setCaptionData(null)
    try {
      const km   = (distanceProp ?? totalDistRef.current) / 1000
      const gain = elevGainProp  ?? elevStatsRef.current.gain
      const alt  = elevStatsRef.current.altMax
      const res  = await fetch('/api/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title:         title ?? 'Escursione',
          distanceKm:    +km.toFixed(1),
          elevationGain: gain,
          maxAlt:        alt,
          date:          plannedDate,
          videoFormat:   videoOrientation,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message ?? `Errore ${res.status}`)
      setCaptionData(json)
    } catch (e: any) {
      setShareToast(e.message || 'Errore generazione caption')
      setTimeout(() => setShareToast(''), 3000)
    } finally {
      setCaptionLoading(false)
    }
  }, [title, distanceProp, elevGainProp, plannedDate, videoOrientation])

  const downloadCover = useCallback(() => {
    if (!coverPhotoId) return
    const photo = routePhotos.find(p => p.id === coverPhotoId)
    if (!photo) return
    const img = photoImgsRef.current.get(coverPhotoId)
    if (!img) return
    const [w, h] = VIDEO_DIMS[videoOrientation]
    const can = document.createElement('canvas'); can.width = w; can.height = h
    const c = can.getContext('2d')!
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'
    const imgAR = img.width / img.height, canAR = w / h
    let sx = 0, sy = 0, sw = img.width, sh = img.height
    if (imgAR > canAR) { sw = Math.round(sh * canAR); sx = (img.width - sw) / 2 }
    else { sh = Math.round(sw / canAR); sy = (img.height - sh) / 2 }
    c.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
    can.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `dtrek-cover-${Date.now()}.jpg`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setShareToast('Copertina salvata!')
      setTimeout(() => setShareToast(''), 2500)
    }, 'image/jpeg', 0.92)
  }, [coverPhotoId, routePhotos, videoOrientation])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{touchAction:'none'}}>
      <div ref={containerRef} className="flex-1 w-full h-full" />

      {/* Top bar */}
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
            {plannedTrackPoints && plannedTrackPoints.filter(p=>p.lat&&p.lon).length >= 2 && (
              <button onClick={()=>setShowPlannedRoute(v=>!v)} title="Percorso pianificato"
                className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-colors shadow-lg ${
                  showPlannedRoute ? 'bg-violet-500/80 hover:bg-violet-600 text-white' : 'bg-black/50 hover:bg-black/75 text-white'
                }`}>
                <Layers style={{width:'1.1rem',height:'1.1rem'}}/>
              </button>
            )}
            {pois && pois.length > 0 && (
              <button onClick={()=>setShowPois(v=>!v)} title="Punti di interesse"
                className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-colors shadow-lg ${
                  showPois ? 'bg-violet-500/80 hover:bg-violet-600 text-white' : 'bg-black/50 hover:bg-black/75 text-white'
                }`}>
                <MapPin style={{width:'1.1rem',height:'1.1rem'}}/>
              </button>
            )}
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
            const minA=Math.min(...altitudeSeries),maxA=Math.max(...altitudeSeries),range=maxA-minA||1,H=56
            const pp=altitudeSeries.map((a,i)=>`${((i/(altitudeSeries.length-1))*1000).toFixed(0)},${(H-((a-minA)/range)*(H-6)).toFixed(1)}`).join(' ')
            const cx=(progress*1000).toFixed(1)
            return(
              <div className="w-full rounded-xl overflow-hidden backdrop-blur-sm bg-black/30 border border-white/10" style={{height:`${H}px`}}>
                <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="w-full h-full">
                  <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity="0.45"/><stop offset="100%" stopColor="#3b82f6" stopOpacity="0.08"/></linearGradient></defs>
                  <polygon points={`0,${H} ${pp} 1000,${H}`} fill="url(#eg)"/>
                  <polyline points={pp} fill="none" stroke="#93c5fd" strokeWidth="2.5" strokeLinejoin="round"/>
                  <line x1={cx} y1="0" x2={cx} y2={H} stroke="white" strokeWidth="2" strokeDasharray="4,3" opacity="0.75"/>
                </svg>
              </div>
            )
          })():(
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div className="h-full rounded-full" style={{width:`${progress*100}%`,background:'linear-gradient(90deg,#3b82f6,#60a5fa)'}}/>
            </div>
          )}
          <input type="range" min={0} max={1} step={0.0005} value={progress} onChange={e=>handleScrub(+e.target.value)}
            className="absolute w-full opacity-0 cursor-pointer" style={{height:'64px',top:'50%',transform:'translateY(-50%)'}}/>
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

      {/* ══ VIDEO CONFIG ════════════════════════════════════════════════════════ */}
      {videoState==='config'&&(
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm flex items-end z-20 pointer-events-auto">
          <div className="w-full bg-stone-900/97 rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">Impostazioni video</h2>
              <button onClick={()=>setVideoState('idle')} className="text-white/50 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            {/* Preset Instagram */}
            <div className="space-y-2">
              <p className="text-white/45 text-[11px] font-semibold tracking-wider">FORMATO INSTAGRAM</p>
              <div className="grid grid-cols-3 gap-2">
                {(['reels','feed45','feed11'] as const).map(pr=>(
                  <button key={pr} onClick={()=>{
                    setVideoPreset(pr)
                    setVideoDuration(VIDEO_PRESETS[pr].duration)
                    switchStyle(VIDEO_PRESETS[pr].styleIdx)
                    setVideoOrientation(VIDEO_PRESETS[pr].orientation)
                    setVideoFps(30)
                    setVideoEnableAudio(true)
                  }} className={`py-3 rounded-xl flex flex-col items-center transition-all ${videoPreset===pr?'bg-blue-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    <span className="text-sm font-bold">{VIDEO_PRESETS[pr].label}</span>
                    <span className="text-[10px] opacity-65 mt-0.5">{VIDEO_PRESETS[pr].desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-white/45 text-[11px] font-semibold tracking-wider pt-1">STILE CINEMATICO</p>
              <div className="grid grid-cols-2 gap-2">
                {(['epico','snappy'] as const).map(pr=>(
                  <button key={pr} onClick={()=>{
                    setVideoPreset(pr)
                    setVideoDuration(VIDEO_PRESETS[pr].duration)
                    switchStyle(VIDEO_PRESETS[pr].styleIdx)
                    setVideoOrientation(VIDEO_PRESETS[pr].orientation)
                    setVideoFps(30)
                  }} className={`py-3 rounded-xl flex flex-col items-center transition-all ${videoPreset===pr?'bg-blue-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    <span className="text-sm font-bold">{VIDEO_PRESETS[pr].label}</span>
                    <span className="text-[10px] opacity-65 mt-0.5">{VIDEO_PRESETS[pr].desc}</span>
                  </button>
                ))}
              </div>
              <button onClick={()=>setVideoPreset('custom')} className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${videoPreset==='custom'?'bg-white/25 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                Custom — impostazioni manuali
              </button>
            </div>
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
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">DURATA PERCORSO</p>
              <div className="flex gap-2">
                {[15,30,60,90].map(d=>(
                  <button key={d} onClick={()=>setVideoDuration(d)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${videoDuration===d?'bg-blue-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    {d}s
                  </button>
                ))}
              </div>
              {(()=>{
                const introOutro = Math.round(Math.max(2, videoDuration*0.08) + Math.max(3, videoDuration*0.17))
                const photoTotal = Math.round(routePhotos.length*photoDurationSec)
                const est = videoDuration + photoTotal + introOutro
                const over = est > 60
                return (
                  <div className={`mt-2 rounded-xl px-3.5 py-2.5 ${over ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-white/5'}`}>
                    <p className={`text-xs font-semibold ${over ? 'text-amber-300' : 'text-white/70'}`}>
                      Percorso {videoDuration}s{routePhotos.length>0?` + foto ${routePhotos.length}×${photoDurationSec.toFixed(1)}s`:''} + intro/outro ~{introOutro}s = <span className="font-bold">~{est}s totali</span>
                    </p>
                    <p className="text-white/35 text-[11px] mt-1 leading-relaxed">
                      Questa durata è indicativa: il percorso viene sempre mostrato per intero, le foto aggiungono tempo oltre a quello impostato qui.
                    </p>
                    {over && (
                      <p className="text-amber-300/75 text-[11px] mt-1 leading-relaxed">
                        Supera il limite di 60s per i caroselli Instagram. Riduci la durata o rimuovi alcune foto.
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">FORMATO</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  {key:'9:16',   sub:'Reels/Story'},
                  {key:'4:5',    sub:'Feed verticale'},
                  {key:'1:1',    sub:'Feed quadrato'},
                  {key:'1.91:1', sub:'Feed orizzontale'},
                  {key:'16:9',   sub:'YouTube/PC'},
                ] as const).map(({key,sub})=>(
                  <button key={key} onClick={()=>setVideoOrientation(key as any)}
                    className={`py-2.5 rounded-xl flex flex-col items-center transition-all ${videoOrientation===key?'bg-blue-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    <span className="text-sm font-bold">{key}</span>
                    <span className="text-[9px] opacity-60 mt-0.5">{sub}</span>
                  </button>
                ))}
              </div>
            </div>
            {videoOrientation==='9:16'&&(
              <div>
                <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">FRAME RATE</p>
                <div className="flex gap-2">
                  {([30,60] as const).map(fps=>(
                    <button key={fps} onClick={()=>setVideoFps(fps)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${videoFps===fps?'bg-blue-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                      {fps} fps{fps===60?' · Reels':''}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">OVERLAY</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {l:'Titolo',v:videoShowTitle,s:setVideoShowTitle,ok:true},
                  {l:'Statistiche',v:videoShowStats,s:setVideoShowStats,ok:true},
                  {l:'Progresso',v:videoShowProgress,s:setVideoShowProgress,ok:true},
                  {l:'Dati corporei',v:videoShowBody,s:setVideoShowBody,ok:hasBodyData},
                  {l:'POI',v:videoShowPois,s:setVideoShowPois,ok:(pois?.length??0)>0},
                ].map(item=>(
                  <button key={item.l} onClick={()=>item.ok&&item.s(v=>!v)} disabled={!item.ok}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${!item.ok?'opacity-30 cursor-not-allowed bg-white/5 text-white/40':item.v?'bg-white text-stone-900':'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                    {item.l}
                    {!item.ok&&<span className="block text-[10px] font-normal opacity-60">non disponibile</span>}
                  </button>
                ))}
              </div>
              {videoShowPois&&<p className="text-white/30 text-[11px] mt-2 leading-relaxed">I punti di interesse non aggiungono tempo al video (a differenza delle foto) — vengono mostrati i {Math.min(MAX_VIDEO_POIS, pois?.length??0)} più rilevanti vicino al percorso.</p>}
            </div>
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">AUDIO</p>
              <button onClick={()=>setVideoEnableAudio(v=>!v)}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${videoEnableAudio?'bg-white text-stone-900':'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                {videoEnableAudio?'Colonna sonora ambient — attiva':'Colonna sonora ambient (drone pad)'}
              </button>
            </div>
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-3 tracking-wider">ZOOM CINEMATICO</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-white/55 text-xs w-28 shrink-0">Zoom iniziale</span>
                  <input type="range" min={7} max={14} step={0.5} value={zoomIntro} onChange={e=>setZoomIntro(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-blue-400 cursor-pointer"/>
                  <span className="text-white text-xs font-bold w-8 text-right">{zoomIntro.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white/55 text-xs w-28 shrink-0">Zoom percorso</span>
                  <input type="range" min={10} max={16} step={0.5} value={zoomFollow} onChange={e=>setZoomFollow(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-blue-400 cursor-pointer"/>
                  <span className="text-white text-xs font-bold w-8 text-right">{zoomFollow.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white/55 text-xs w-28 shrink-0">Zoom finale</span>
                  <input type="range" min={5} max={12} step={0.5} value={zoomOutro} onChange={e=>setZoomOutro(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-blue-400 cursor-pointer"/>
                  <span className="text-white text-xs font-bold w-8 text-right">{zoomOutro.toFixed(1)}</span>
                </div>
              </div>
            </div>
            <p className="text-white/30 text-[11px] text-center">
              MP4 · H.264/VP9 · AAC 44.1 kHz · {videoFps}fps · {videoFps===60?'25':'20'} Mbps sorgente · rendering frame-by-frame
            </p>
            <div className="flex gap-3">
              <button onClick={()=>setVideoState('idle')} className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20">Annulla</button>
              <button onClick={goToPostProd} className="flex-[2] py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold">Avanti → Montaggio</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ PHOTO PLACEMENT — click on route ════════════════════════════════════ */}
      {videoState==='postprod'&&placingPhoto?.step==='pos'&&(
        <div className="absolute inset-0 z-20 pointer-events-none">
          {/* Instruction banner */}
          <div className="absolute top-0 inset-x-0 pointer-events-auto">
            <div className="m-3 bg-blue-600/95 backdrop-blur-md rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl">
              <Navigation className="w-5 h-5 text-white shrink-0 animate-pulse"/>
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Tocca il percorso sulla mappa</p>
                <p className="text-blue-200 text-xs mt-0.5">La foto verrà posizionata nel punto più vicino</p>
              </div>
              <button onClick={()=>setPlacingPhoto(null)} className="text-blue-200 hover:text-white transition-colors pointer-events-auto">
                <X className="w-5 h-5"/>
              </button>
            </div>
          </div>
          {/* Photo thumbnail corner */}
          {routePhotos.find(p=>p.id===placingPhoto.id)&&(
            <div className="absolute top-20 right-3 pointer-events-none">
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-1.5 shadow-xl border border-white/20">
                <img src={routePhotos.find(p=>p.id===placingPhoto.id)!.url} alt="" className="w-16 h-16 rounded-lg object-cover"/>
              </div>
            </div>
          )}
        </div>
      )}


      {/* ══ POST-PRODUCTION ══════════════════════════════════════════════════════ */}
      {videoState==='postprod'&&!placingPhoto&&(
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-end z-20 pointer-events-auto">
          <div className="w-full bg-stone-900/97 rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-bold text-lg">Montaggio</h2>
                <p className="text-white/45 text-xs mt-0.5">Riordina inquadrature, aggiungi e posiziona le foto</p>
              </div>
              <button onClick={()=>setVideoState('config')} className="text-white/50 hover:text-white"><X className="w-5 h-5"/></button>
            </div>

            {/* Shot list */}
            <div className="mb-5">
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">INQUADRATURE</p>
              <div className="space-y-2">
                {shotPlan.map((shot,idx)=>(
                  <div key={shot.id} className="flex items-center gap-2 bg-white/7 rounded-xl px-3 py-2.5">
                    <GripVertical className="w-4 h-4 text-white/25 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{shot.label}</p>
                      <p className="text-white/38 text-[10px]">
                        {Math.round(shot.startP*100)}%→{Math.round(shot.endP*100)}% ·{' '}
                        {{'follow':'Seguimento','orbit-cw':'Orbita ↻','orbit-ccw':'Orbita ↺','side-left':'Lat. sx','side-right':'Lat. dx','overhead':'Zenitale'}[shot.bearingMode]}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button disabled={idx===0} onClick={()=>moveShot(shot.id,-1)}
                        className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 disabled:opacity-20">
                        <ChevronLeft className="w-3.5 h-3.5"/>
                      </button>
                      <button disabled={idx===shotPlan.length-1} onClick={()=>moveShot(shot.id,1)}
                        className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 disabled:opacity-20">
                        <ChevronRight className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Photo duration */}
            <div className="mb-5">
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">DURATA POLAROID</p>
              <div className="flex items-center gap-3">
                <input type="range" min={3} max={10} step={0.5} value={photoDurationSec} onChange={e=>setPhotoDurationSec(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-blue-400 cursor-pointer"/>
                <span className="text-white text-sm font-bold w-16 text-right">{photoDurationSec.toFixed(1)}s / foto</span>
              </div>
            </div>

            {/* Photos */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/45 text-[11px] font-semibold tracking-wider">
                  FOTO DEL PERCORSO {routePhotos.length>0&&<span className="text-blue-400">({routePhotos.length})</span>}
                </p>
                <label className={`flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer transition-colors ${photoBeingAdded?'opacity-50 pointer-events-none':''}`}>
                  {photoBeingAdded?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<ImagePlus className="w-3.5 h-3.5"/>}
                  Aggiungi
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload}/>
                </label>
              </div>
              {routePhotos.length===0?(
                <div className="border border-dashed border-white/15 rounded-xl p-5 text-center">
                  <p className="text-white/35 text-sm">Nessuna foto</p>
                  <p className="text-white/22 text-xs mt-1">GPS automatico da EXIF · tocca il percorso per posizionare</p>
                </div>
              ):(
                <div className="space-y-2.5">
                  {routePhotos.map(photo=>(
                    <div key={photo.id} className="bg-white/7 rounded-xl p-2.5">
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <img src={photo.url} alt="" className="w-14 h-14 rounded-lg object-cover"/>
                          {photo.hasExifGps&&(
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center" title="GPS automatico">
                              <Check className="w-2.5 h-2.5 text-white"/>
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Caption input */}
                          <input
                            value={photo.caption}
                            onChange={e=>setRoutePhotos(prev=>prev.map(p=>p.id===photo.id?{...p,caption:e.target.value}:p))}
                            onBlur={e=>{
                              const caption=e.target.value
                              updateActivityPhoto(photo.id,{caption}).catch(()=>{
                                setShareToast('Errore: didascalia non salvata'); setTimeout(()=>setShareToast(''),3000)
                              })
                            }}
                            placeholder="Testo della polaroid…"
                            className="w-full bg-transparent text-white text-xs font-medium placeholder:text-white/28 focus:outline-none border-b border-white/12 focus:border-white/35 pb-0.5 mb-2"
                          />
                          {/* Position + bearing row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Place by clicking */}
                            {!photo.hasExifGps&&(
                              <button onClick={()=>setPlacingPhoto({id:photo.id,step:'pos'})}
                                className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/15 rounded-lg px-2 py-1 transition-colors">
                                <Navigation className="w-3 h-3"/>
                                {photo.progress!==0.5?`${Math.round(photo.progress*100)}% ✓`:'Posiziona'}
                              </button>
                            )}
                            {photo.hasExifGps&&(
                              <span className="text-[10px] text-green-400 font-medium">📍 {Math.round(photo.progress*100)}%</span>
                            )}
                            {/* Remove */}
                            <button onClick={()=>{
                              const id=photo.id
                              setRoutePhotos(prev=>prev.filter(p=>p.id!==id));photoImgsRef.current.delete(id)
                              removeActivityPhoto(id).catch(()=>{
                                setShareToast('Errore: eliminazione foto non riuscita'); setTimeout(()=>setShareToast(''),3000)
                              })
                            }}
                              className="ml-auto text-white/25 hover:text-red-400 transition-colors">
                              <X className="w-3.5 h-3.5"/>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Proposals note */}
            <div className="mb-5 bg-white/5 rounded-xl px-3 py-2.5 border border-white/8">
              <p className="text-white/45 text-[10px] font-semibold uppercase tracking-wider mb-1">Effetti automatici attivi</p>
              <p className="text-white/38 text-[10px] leading-relaxed">
                ✦ Ken Burns sulle foto &nbsp;·&nbsp; ✦ Profilo altimetrico animato &nbsp;·&nbsp; ✦ Callout quota di vetta &nbsp;·&nbsp; ✦ End card con statistiche &nbsp;·&nbsp; ✦ Color grading per preset &nbsp;·&nbsp; ✦ Camera fluida con expo-smoothing
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={()=>setVideoState('config')} className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20">← Config</button>
              <button onClick={startRendering} className="flex-[2] py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white animate-pulse"/>
                Avvia rendering
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RENDERING ═══════════════════════════════════════════════════════════ */}
      {(videoState==='rendering'||videoState==='finalizing')&&(
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col">
          <div className="absolute inset-0 bg-black/35 pointer-events-auto"/>
          <div className="absolute top-4 left-4 right-4 pointer-events-auto">
            <div className="bg-black/80 backdrop-blur-md rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${videoState==='finalizing'?'bg-amber-400':'bg-red-500'}`}/>
                  <span className="text-white text-sm font-bold tracking-wide">{videoState==='finalizing'?'ELABORAZIONE':'RENDERING'}</span>
                </div>
                {videoState==='rendering'&&<button onClick={cancelRendering} className="text-white/60 hover:text-white text-xs font-semibold px-3 py-1 bg-white/10 rounded-full">Annulla</button>}
              </div>
              <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden mb-2">
                {videoState==='finalizing'
                  ? <div className="h-full w-2/5 rounded-full bg-amber-400 progress-indeterminate"/>
                  : <div className="h-full rounded-full bg-blue-500" style={{width:`${renderProgress*100}%`,transition:'none'}}/>
                }
              </div>
              {videoState==='finalizing'
                ? <p className="text-white/55 text-xs">Compressione in corso… ({finalizeElapsedSec}s)</p>
                : <p className="text-white/55 text-xs">Frame {renderFrame}/{renderTotal} · {Math.round(renderProgress*100)}%</p>
              }
              <p className="text-white/30 text-[10px] mt-0.5">
                {videoState==='finalizing'
                  ? 'Può richiedere fino a 20-30s con video lunghi o molte foto — non chiudere questa schermata'
                  : 'Frame-by-frame rendering — qualità cinematografica garantita'}
              </p>
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
              <p className="text-white/50 text-sm mt-1">1080p · {videoDuration}s · {videoOrientation} · {videoFps}fps</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <button onClick={handleVideoShare} className="w-full py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4"/>Condividi
              </button>
              <button onClick={handleVideoDownload} className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center justify-center gap-2">
                <Download className="w-4 h-4"/>Scarica
              </button>
            </div>

            {/* ── Copertina ────────────────────────────────────────────── */}
            {routePhotos.length>0&&(
              <div className="border-t border-white/10 pt-4 space-y-2.5">
                <p className="text-white/45 text-[11px] font-semibold tracking-wider">COPERTINA VIDEO</p>
                <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
                  {routePhotos.map(photo=>(
                    <button key={photo.id} onClick={()=>setCoverPhotoId(prev=>prev===photo.id?null:photo.id)}
                      className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${coverPhotoId===photo.id?'border-blue-400 scale-105 shadow-lg shadow-blue-500/30':'border-white/10 opacity-55 hover:opacity-90'}`}>
                      <img src={photo.url} className="w-full h-full object-cover" alt=""/>
                    </button>
                  ))}
                </div>
                {coverPhotoId?(
                  <button onClick={downloadCover}
                    className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all">
                    <Download className="w-3.5 h-3.5"/>Scarica copertina .jpg
                  </button>
                ):(
                  <p className="text-white/30 text-[11px] text-center">Tocca una foto per usarla come copertina su Instagram</p>
                )}
              </div>
            )}

            {/* ── Caption Instagram ─────────────────────────────────────── */}
            <div className="border-t border-white/10 pt-4 space-y-2.5">
              <p className="text-white/45 text-[11px] font-semibold tracking-wider">CAPTION INSTAGRAM</p>
              {!captionData ? (
                <button onClick={generateCaption} disabled={captionLoading}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all">
                  {captionLoading
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Generazione…</>
                    : <><Sparkles className="w-4 h-4"/>Genera Caption con AI</>
                  }
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="bg-white/8 rounded-xl px-3.5 py-3 text-white/85 text-sm leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {captionData.caption}
                  </div>
                  {captionData.hashtags && (
                    <div className="bg-white/5 rounded-xl px-3.5 py-2.5 text-blue-300/70 text-xs leading-relaxed max-h-20 overflow-y-auto">
                      {captionData.hashtags}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={()=>{
                      const full = captionData.hashtags
                        ? `${captionData.caption}\n\n${captionData.hashtags}`
                        : captionData.caption
                      navigator.clipboard.writeText(full)
                      setCaptionCopied(true); setTimeout(()=>setCaptionCopied(false), 2000)
                    }} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-all">
                      {captionCopied ? <><Check className="w-3.5 h-3.5 text-green-400"/>Copiata!</> : <><Copy className="w-3.5 h-3.5"/>Copia tutto</>}
                    </button>
                    <button onClick={()=>{ setCaptionData(null); setCaptionCopied(false) }}
                      className="px-4 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-white/55 text-sm font-semibold transition-all" title="Rigenera">
                      ↺
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2.5">
              <button onClick={()=>{setVideoState('postprod');setVideoRecordedBlob(null);setRenderProgress(0);setCaptionData(null);setCoverPhotoId(null)}}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold">← Montaggio</button>
              <button onClick={()=>{setVideoState('idle');setVideoRecordedBlob(null);setRenderProgress(0);setCaptionData(null);setCoverPhotoId(null)}}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold">Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
