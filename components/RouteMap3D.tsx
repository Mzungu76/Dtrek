'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl, { Map as MLMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'
import {
  X, Play, Pause, RotateCcw, Mountain, Camera, Images, Film,
  Download, Share2, ChevronLeft, ChevronRight, ImagePlus,
  Loader2, GripVertical, Check, Navigation,
} from 'lucide-react'
import StreetViewPanel from '@/components/StreetViewPanel'
import { fetchDayHourly, wmoInfo } from '@/lib/openmeteo'
import { getProfile } from '@/lib/userProfile'

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''

const SPEEDS = [
  { label: '½×', v: 0.5 },
  { label: '1×', v: 1   },
  { label: '3×', v: 3   },
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
type PlacingStep = 'pos' | 'mapbear'

interface ShotSegment {
  id: string; label: string; startP: number; endP: number
  pitch: [number, number]; zoom: [number, number]
  bearingMode: BearingMode; orbitDeg?: number
}

interface RoutePhoto {
  id:              string
  dataUrl:         string
  progress:        number       // 0-1 on route
  caption:         string       // mandatory — shown in polaroid
  viewingBearing?: number       // camera direction (0-360) when photo was taken
  hasExifGps:      boolean      // true = auto-placed, false = needs manual placement
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

function bearingToCompass(b: number): string {
  const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO']
  return d[Math.round(b / 22.5) % 16]
}

function destinationPoint(lat: number, lon: number, bearingDeg2: number, distM: number): {lat:number;lon:number} {
  const R=6371000, d=distM/R, b=rad(bearingDeg2)
  const la1=rad(lat), lo1=rad(lon)
  const la2=Math.asin(Math.sin(la1)*Math.cos(d)+Math.cos(la1)*Math.sin(d)*Math.cos(b))
  const lo2=lo1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(la1),Math.cos(d)-Math.sin(la1)*Math.sin(la2))
  return {lat:la2*180/Math.PI,lon:((lo2*180/Math.PI)+540)%360-180}
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
  const R    = 28 * sc
  const tipH = 14 * sc
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
  const gradTop=hasBody?h*0.58:h*0.72
  const grad=ctx.createLinearGradient(0,gradTop,0,h)
  grad.addColorStop(0,'rgba(0,0,0,0)'); grad.addColorStop(0.5,'rgba(0,0,0,0.55)'); grad.addColorStop(1,'rgba(0,0,0,0.88)')
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

function planShots(pts: TrackPoint[]): ShotSegment[] {
  const N=pts.length; if(N<2) return []
  const alts=pts.map(p=>p.altitudeMeters??0), maxA=Math.max(...alts), minA=Math.min(...alts)
  let peakP=0.5, bestSum=-Infinity, W=Math.round(N*0.08)
  for(let i=W;i<N-W;i++){const s=alts.slice(i-W,i+W).reduce((a,b)=>a+b,0);if(s>bestSum){bestSum=s;peakP=i/(N-1)}}
  const hasPeak=(maxA-minA)>200&&peakP>0.25&&peakP<0.85
  const shots:ShotSegment[]=[]
  // 3 shots only: no mid-section camera acrobatics that cause nausea
  shots.push({id:'intro',label:'Intro aereo',startP:0,endP:0.08,pitch:[24,64],zoom:[10.0,14.0],bearingMode:'orbit-cw',orbitDeg:70})
  shots.push({id:'follow',label:'Seguimento',startP:0.08,endP:0.83,pitch:[48,48],zoom:[13.8,13.8],bearingMode:'follow'})
  shots.push({id:'outro',label:'Pullback finale',startP:0.83,endP:1.0,pitch:[65,10],zoom:[14.2,9.2],bearingMode:'orbit-ccw',orbitDeg:140})
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

// BearingPicker removed — orientation is now set directly on the map

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  trackPoints: TrackPoint[]
  title?: string
  onClose: () => void
  plannedDate?: string
}

export default function RouteMap3D({ trackPoints, title, onClose, plannedDate }: Props) {
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

  // Smooth camera refs (exponential interpolation)
  const smoothBearRef  = useRef(0)
  const smoothPitchRef = useRef(65)
  const smoothZoomRef  = useRef(14)

  // Face image
  const faceImgRef   = useRef<HTMLImageElement | null>(null)
  const photoImgsRef = useRef<Map<string, HTMLImageElement>>(new Map())

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
  const [streetViewPos,  setStreetViewPos] = useState<[number,number]|null>(null)

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
  const [shotPlan,        setShotPlan]       = useState<ShotSegment[]>([])
  const [routePhotos,     setRoutePhotos]    = useState<RoutePhoto[]>([])
  const [placingPhoto,    setPlacingPhoto]   = useState<{id:string;step:PlacingStep;lat?:number;lon?:number}|null>(null)
  const [tempBearing,     setTempBearing]    = useState(0)
  const tempBearingRef = useRef(0)
  const placingPhotoRef = useRef<{id:string;step:PlacingStep;lat?:number;lon?:number}|null>(null)
  useEffect(()=>{ placingPhotoRef.current=placingPhoto },[placingPhoto])
  const [photoBeingAdded, setPhotoBeingAdded]= useState(false)

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
      setRoutePhotos(prev=>prev.map(p=>p.id===placingPhoto.id?{...p,progress:prog}:p))
      // default bearing = route direction at that point
      const li=Math.min(bestIdx+Math.max(2,Math.round(pts.length*0.01)),pts.length-1)
      const defaultBear=Math.round(bearingDeg(pts[bestIdx].lat!,pts[bestIdx].lon!,pts[li].lat!,pts[li].lon!))
      setTempBearing(defaultBear); tempBearingRef.current=defaultBear
      setPlacingPhoto({id:placingPhoto.id,step:'mapbear',lat:pts[bestIdx].lat!,lon:pts[bestIdx].lon!})
    }
    map.on('click',handler)
    return ()=>{map.off('click',handler)}
  },[placingPhoto])

  // ── Map bearing orientation (drag arrow on map) ───────────────────────────────

  useEffect(() => {
    const map=mapRef.current
    if(!map||!placingPhoto||placingPhoto.step!=='mapbear') return
    const photoId=placingPhoto.id
    const fromLat=placingPhoto.lat??0, fromLon=placingPhoto.lon??0
    const DIST=380

    // Always clean up stale layers first (handles style reloads / double-invocations)
    const cleanup=()=>{
      try{if(map.getLayer('_bear-line'))map.removeLayer('_bear-line')}catch{}
      try{if(map.getLayer('_bear-cone'))map.removeLayer('_bear-cone')}catch{}
      try{if(map.getSource('_bear-line'))map.removeSource('_bear-line')}catch{}
      try{if(map.getSource('_bear-cone'))map.removeSource('_bear-cone')}catch{}
    }
    cleanup()

    function arrowData(bear: number) {
      const end=destinationPoint(fromLat,fromLon,bear,DIST)
      const fL=destinationPoint(fromLat,fromLon,(bear-40+360)%360,DIST*0.65)
      const fR=destinationPoint(fromLat,fromLon,(bear+40)%360,DIST*0.65)
      return {
        line:{type:'Feature' as const,geometry:{type:'LineString' as const,coordinates:[[fromLon,fromLat],[end.lon,end.lat]]},properties:{}},
        cone:{type:'Feature' as const,geometry:{type:'Polygon' as const,coordinates:[[[fromLon,fromLat],[fL.lon,fL.lat],[end.lon,end.lat],[fR.lon,fR.lat],[fromLon,fromLat]]]},properties:{}},
      }
    }

    map.addSource('_bear-line',{type:'geojson',data:arrowData(tempBearingRef.current).line})
    map.addSource('_bear-cone',{type:'geojson',data:arrowData(tempBearingRef.current).cone})
    map.addLayer({id:'_bear-cone',type:'fill',source:'_bear-cone',paint:{'fill-color':'#3b82f6','fill-opacity':0.18}})
    map.addLayer({id:'_bear-line',type:'line',source:'_bear-line',paint:{'line-color':'#60a5fa','line-width':5,'line-opacity':0.95},layout:{'line-cap':'round'}})

    const mapInst=map  // local alias — TypeScript can't narrow `map` inside nested functions
    function update(bear: number) {
      const d=arrowData(bear)
      ;(mapInst.getSource('_bear-line') as any)?.setData(d.line)
      ;(mapInst.getSource('_bear-cone') as any)?.setData(d.cone)
      tempBearingRef.current=bear
      setTempBearing(bear)
    }

    function onMove(e: any) {
      if(!e.lngLat) return
      const {lat,lng}=e.lngLat
      update(Math.round(bearingDeg(fromLat,fromLon,lat,lng)))
    }

    // Clicking on the map confirms the bearing (natural interaction — point and tap)
    function onMapClick(e: any) {
      if(!e.lngLat) return
      const {lat,lng}=e.lngLat
      const b=Math.round(bearingDeg(fromLat,fromLon,lat,lng))
      setRoutePhotos(prev=>prev.map(p=>p.id===photoId?{...p,viewingBearing:b}:p))
      setPlacingPhoto(null)
    }

    map.on('mousemove',onMove)
    map.on('touchmove',onMove)
    map.on('click',onMapClick)

    return () => {
      map.off('mousemove',onMove)
      map.off('touchmove',onMove)
      map.off('click',onMapClick)
      cleanup()
    }
  },[placingPhoto]) // eslint-disable-line react-hooks/exhaustive-deps

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
      cancelAnimationFrame(animRef.current)
      isPlayingRef.current=false
      if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){mediaRecorderRef.current.onstop=null;mediaRecorderRef.current.stop()}
      if(videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
      map.remove(); mapRef.current=null; markerRef.current=null
    }
  },[setupLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{exaggRef.current=exaggeration;const map=mapRef.current;if(!map||!mapReady) return;try{map.setTerrain({source:'terrain',exaggeration})}catch{}},[exaggeration,mapReady])

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
    const files=Array.from(e.target.files??[]); e.target.value=''; if(!files.length) return
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
      let progress=0.5, hasExifGps=false
      if(gpsCoords&&pts.length>1){
        hasExifGps=true
        let minD=Infinity, bestIdx=0
        for(let i=0;i<pts.length;i++){const d=distM(pts[i].lat!,pts[i].lon!,gpsCoords.lat,gpsCoords.lon);if(d<minD){minD=d;bestIdx=i}}
        progress=bestIdx/(pts.length-1)
      }

      const id=`photo-${Date.now()}-${Math.random().toString(36).slice(2)}`
      photoImgsRef.current.set(id,ci)
      setRoutePhotos(prev=>[...prev,{
        id, dataUrl:cropped, progress,
        caption: file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ').slice(0,40),
        hasExifGps,
      }])
    }
    setPhotoBeingAdded(false)
  }

  // ── Post-production helpers ───────────────────────────────────────────────────

  function goToPostProd() { setShotPlan(planShots(gpsRef.current)); setVideoState('postprod') }

  function moveShot(id: string, dir: -1|1) {
    setShotPlan(prev=>{
      const idx=prev.findIndex(s=>s.id===id); if(idx<0) return prev
      const next=[...prev], si=idx+dir; if(si<0||si>=next.length) return prev
      ;[next[idx],next[si]]=[next[si],next[idx]]
      let p=0; return next.map((s,i)=>{const dur=s.endP-s.startP,sP=p,eP=Math.min(1,p+dur);p=eP;return{...s,startP:sP,endP:i===next.length-1?1:eP}})
    })
  }

  function confirmBearing() {
    if(!placingPhoto) return
    setRoutePhotos(prev=>prev.map(p=>p.id===placingPhoto.id?{...p,viewingBearing:tempBearingRef.current}:p))
    setPlacingPhoto(null)
  }

  function handleSetBearing(photo: RoutePhoto) {
    const pts=gpsRef.current; if(!pts.length) return
    const rawIdx=photo.progress*(pts.length-1)
    const i0=Math.min(Math.floor(rawIdx),pts.length-1), i1=Math.min(i0+1,pts.length-1), frac=rawIdx-i0
    const lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
    const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac
    const bear=photo.viewingBearing??0
    setTempBearing(bear); tempBearingRef.current=bear
    setPlacingPhoto({id:photo.id,step:'mapbear',lat,lon})
  }

  // ── Cinematic rendering ───────────────────────────────────────────────────────

  const startRendering=useCallback(async ()=>{
    const map=mapRef.current; if(!map) return
    if(typeof MediaRecorder==='undefined'){
      setShareToast('Registrazione video non supportata su questo browser')
      setTimeout(()=>setShareToast(''),3000); setVideoState('idle'); return
    }

    cancelAnimationFrame(animRef.current); isPlayingRef.current=false; setIsPlaying(false)
    progressRef.current=0; setProgress(0)
    const pts=gpsRef.current; if(pts.length<2) return

    const [outW,outH]=VIDEO_DIMS[videoOrientation]

    // Resize map container to output resolution so tiles load at correct density
    const cont=containerRef.current!
    const dpr=window.devicePixelRatio||1
    cont.style.width=`${outW/dpr}px`
    cont.style.height=`${outH/dpr}px`
    map.resize()
    await new Promise<void>(r=>map.once('idle',r as any))

    // Hide HTML marker during rendering
    const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='0'

    // Initialize smooth camera
    smoothBearRef.current=map.getBearing()
    smoothPitchRef.current=map.getPitch()
    smoothZoomRef.current=map.getZoom()
    orbitBaseRef.current=map.getBearing()

    // Setup progressive route reveal
    try { setupRouteReveal(map, pts) } catch {}

    const mapCanvas=map.getCanvas(), srcW=mapCanvas.width, srcH=mapCanvas.height
    const composite=document.createElement('canvas'); composite.width=outW; composite.height=outH
    compositeCanvasRef.current=composite
    const ctx=composite.getContext('2d')!
    ctx.imageSmoothingEnabled=true
    ctx.imageSmoothingQuality='high'

    // Prefer H.264/MP4: iOS Safari records natively → no re-encoding on Instagram/TikTok
    const mimeType=[
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ].find(t=>MediaRecorder.isTypeSupported(t))??''
    const stream=(composite as any).captureStream(30) as MediaStream
    const recorder=new MediaRecorder(stream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:25_000_000})
    videoChunksRef.current=[]
    recorder.ondataavailable=(e:BlobEvent)=>{if(e.data.size>0)videoChunksRef.current.push(e.data)}
    recorder.onstop=()=>{
      const blob=new Blob(videoChunksRef.current,{type:mimeType||'video/webm'})
      setVideoRecordedBlob(blob); setVideoState('done')
      if(mEl) mEl.style.opacity='1'
      try { cleanupRouteReveal(map) } catch {}
      // Restore container to CSS-driven dimensions
      cont.style.width=''; cont.style.height=''; map.resize()
    }
    mediaRecorderRef.current=recorder; recorder.start(100)

    // Pre-compute smooth route bearings to avoid per-frame jitter
    const N=pts.length
    const rawRouteBears=Array.from({length:Math.max(1,N-1)},(_,i)=>bearingDeg(pts[i].lat!,pts[i].lon!,pts[Math.min(i+1,N-1)].lat!,pts[Math.min(i+1,N-1)].lon!))
    // Circular mean (handles 350°/10° north crossings) + wide window
    const smoothRouteBears=circularMeanBearings(rawRouteBears,35)

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
    const hrMax=Math.max(...rawHr), hrMin=Math.min(...rawHr.filter(v=>v>0),hrMax)
    const spMax=Math.max(...smoothSpeed), hasHr=hrMax>0, hasSpeed=spMax>0
    const totalKm=totalDistRef.current/1000, {gain:elevGain}=elevStatsRef.current
    const cr=coverRect(srcW,srcH,outW,outH)

    const TARGET_FPS=30, TOTAL_FRAMES=Math.round(TARGET_FPS*videoDuration)
    setRenderTotal(TOTAL_FRAMES); setRenderFrame(0); frameCountRef.current=0; renderAbortRef.current=false

    // Photo schedule
    const sortedPhotos=[...routePhotos].sort((a,b)=>a.progress-b.progress)
    const photoSchedule=sortedPhotos.map(ph=>({
      photo:ph, img:photoImgsRef.current.get(ph.id),
      startFrame:Math.round(ph.progress*TOTAL_FRAMES),
      holdFrames:Math.round(TARGET_FPS*4.5),
    })).filter(s=>!!s.img)

    const currentShots=shotPlan.length>0?shotPlan:planShots(pts)

    const TITLE_DUR = Math.round(TARGET_FPS * 2.2)  // 2.2s title card
    const PHOTO_WINDOW = 0.028   // 2.8% route = ~camera-align window

    function renderNextFrame() {
      if(renderAbortRef.current) return
      const frameIdx=frameCountRef.current
      if(frameIdx>=TOTAL_FRAMES){recorder.stop();return}

      const p=frameIdx/TOTAL_FRAMES
      setRenderProgress(p); setRenderFrame(frameIdx)

      const rawIdx=p*(N-1), i0=Math.floor(rawIdx), i1=Math.min(i0+1,N-1), frac=rawIdx-i0
      const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac
      const lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
      const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac

      // Route bearing: look 12% ahead so camera anticipates direction (more natural)
      const lookIdx=Math.min(Math.round((p+0.12)*(N-1)),smoothRouteBears.length-1)
      const routeBear=smoothRouteBears[lookIdx]

      // Photo bearing influence: gently rotate toward viewingBearing when near a photo
      let blendBear=routeBear
      for(const sched of photoSchedule){
        const dist=Math.abs(p-sched.photo.progress)
        if(dist<PHOTO_WINDOW&&sched.photo.viewingBearing!==undefined){
          const influence=Math.pow(1-dist/PHOTO_WINDOW,2)
          blendBear=lerpAngle(blendBear,sched.photo.viewingBearing,influence*0.7)
        }
      }

      // Find active shot
      const activShot=currentShots.find(s=>p>=s.startP&&p<=s.endP)??currentShots[currentShots.length-1]
      const prevP=(frameIdx-1)/TOTAL_FRAMES
      const prevShot=currentShots.find(s=>prevP>=s.startP&&prevP<=s.endP)
      if(activShot&&prevShot&&activShot.id!==prevShot.id) orbitBaseRef.current=mapRef.current?.getBearing()??0

      // Compute target camera
      const cam=shotCamera(activShot,blendBear,p,orbitBaseRef)

      // Only smooth bearing — pitch and zoom from planned curve (already smooth by design)
      // α=0.022 → ~1.4s lag → camera rotates like a hawk, never snaps
      smoothBearRef.current = lerpAngle(smoothBearRef.current, cam.bearing, 0.022)

      // Pin center to route start/end during orbit shots — avoids abrupt movements from moving GPS center
      const camCenterLon=activShot.id==='intro'?pts[0].lon!:activShot.id==='outro'?pts[N-1].lon!:lon
      const camCenterLat=activShot.id==='intro'?pts[0].lat!:activShot.id==='outro'?pts[N-1].lat!:lat
      mapRef.current?.jumpTo({
        center:[camCenterLon,camCenterLat], bearing:smoothBearRef.current,
        pitch:cam.pitch, zoom:cam.zoom,
      })

      // Progressive route reveal (every 20 frames)
      if(frameIdx%20===0&&mapRef.current){
        const cov=pts.slice(0,Math.min(i0+2,N)).map(pp=>[pp.lon!,pp.lat!])
        try{(mapRef.current.getSource('route-traveled') as any)?.setData({type:'Feature',geometry:{type:'LineString',coordinates:cov},properties:{}})}catch{}
      }

      // Capture frame after rAF (map settles after jumpTo)
      requestAnimationFrame(()=>{
        if(!mapRef.current) return

        // Color grading: warm cinematic look
        try { ctx.filter='contrast(1.05) saturate(1.18) brightness(1.02)' } catch {}
        ctx.drawImage(mapCanvas,cr.sx,cr.sy,cr.sw,cr.sh,0,0,outW,outH)
        try { ctx.filter='none' } catch {}

        // Map pin at GPS position
        const mp=mapRef.current!.project([lon,lat] as [number,number])
        const px=(mp.x-cr.sx)/cr.sw*outW, py=(mp.y-cr.sy)/cr.sh*outH
        if(px>=-60&&px<=outW+60&&py>=-80&&py<=outH+60){
          drawMapPin(ctx,px,py,outW/1080,faceImgRef.current)
        }

        // Photo polaroid overlays
        for(const sched of photoSchedule){
          if(frameIdx>=sched.startFrame&&frameIdx<sched.startFrame+sched.holdFrames){
            drawPolaroid(ctx,outW,outH,{photo:sched.photo,img:sched.img!,startFrame:sched.startFrame,holdFrames:sched.holdFrames},frameIdx)
          }
        }

        // Title card (first 2.2s)
        if(videoShowTitle&&title&&frameIdx<TITLE_DUR){
          const fi=frameIdx/(TARGET_FPS*0.55), fo=frameIdx>(TITLE_DUR-TARGET_FPS*0.55)?(TITLE_DUR-frameIdx)/(TARGET_FPS*0.55):1
          const alpha=Math.min(1,Math.min(fi,fo))
          ctx.fillStyle=`rgba(0,0,0,${alpha*0.58})`; ctx.fillRect(0,0,outW,outH)
          const sc2=Math.min(outW,outH)/1080
          ctx.globalAlpha=alpha
          ctx.fillStyle='rgba(255,255,255,0.52)'; ctx.font=`700 ${Math.round(20*sc2)}px -apple-system,sans-serif`
          ctx.textAlign='center'; ctx.textBaseline='bottom'
          ctx.fillText('DTrek',outW/2,outH/2-Math.round(36*sc2))
          ctx.fillStyle='white'; ctx.font=`700 ${Math.round(62*sc2)}px -apple-system,sans-serif`; ctx.textBaseline='middle'
          let tt=title; while(ctx.measureText(tt).width>outW-Math.round(120*sc2)&&tt.length>4) tt=tt.slice(0,-4)+'…'
          ctx.fillText(tt,outW/2,outH/2)
          ctx.globalAlpha=1
        }

        // HUD (skip if title card is prominent)
        const showHUD = !(videoShowTitle&&title&&frameIdx<TITLE_DUR&&frameIdx<Math.round(TARGET_FPS*1.5))
        if(showHUD){
          const si=Math.min(Math.round(p*(SAMPLES-1)),SAMPLES-1)
          const hrData:GraphData|undefined=(hasHr&&videoShowBody)?{series:rawHr,label:'BPM',icon:'♥',strokeColor:'#ef4444',fillColor:'rgba(239,68,68,0.28)',minVal:Math.max(0,hrMin-5),maxVal:hrMax+5,currentValue:rawHr[si]}:undefined
          const speedData:GraphData|undefined=(hasSpeed&&videoShowBody)?{series:smoothSpeed,label:'km/h',icon:'⚡',strokeColor:'#60a5fa',fillColor:'rgba(96,165,250,0.28)',minVal:0,maxVal:spMax+1,currentValue:smoothSpeed[si]}:undefined
          drawHUD(ctx,outW,outH,{showTitle:videoShowTitle,title:title??'',showStats:videoShowStats,coveredKm:+(p*totalKm).toFixed(1),totalKm:+totalKm.toFixed(1),alt:Math.round(alt),elevGain,showProgress:videoShowProgress,progress:p,showBody:videoShowBody,hrData,speedData,shotLabel:activShot?.label})
        }

        // Fade to black at the end of outro (last 6% of video)
        const FADE_START=0.94
        if(p>FADE_START){
          const fa=Math.pow((p-FADE_START)/(1-FADE_START),1.4)
          ctx.globalAlpha=fa; ctx.fillStyle='black'; ctx.fillRect(0,0,outW,outH); ctx.globalAlpha=1
        }

        frameCountRef.current++
        renderNextFrame()
      })
    }

    setVideoState('rendering')
    renderNextFrame()
  },[videoDuration,videoOrientation,videoShowTitle,videoShowStats,videoShowProgress,videoShowBody,title,routePhotos,shotPlan])

  const cancelRendering=useCallback(()=>{
    renderAbortRef.current=true; cancelAnimationFrame(animRef.current)
    if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){mediaRecorderRef.current.onstop=null;mediaRecorderRef.current.stop()}
    mediaRecorderRef.current=null; compositeCanvasRef.current=null
    const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='1'
    if(mapRef.current) try{cleanupRouteReveal(mapRef.current)}catch{}
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
      try{await navigator.share({title:title??'Percorso DTrek',text:'DTrek — Video 3D',files:[file]});setVideoState('idle');setVideoRecordedBlob(null);return}catch{}
    }
    handleVideoDownload()
  },[videoRecordedBlob,title,handleVideoDownload])

  const totalKm=+(totalDistRef.current/1000).toFixed(1)

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
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">DURATA</p>
              <div className="flex gap-2">
                {[15,30,60,90].map(d=>(
                  <button key={d} onClick={()=>setVideoDuration(d)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${videoDuration===d?'bg-blue-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>
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
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">OVERLAY</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {l:'Titolo',v:videoShowTitle,s:setVideoShowTitle,ok:true},
                  {l:'Statistiche',v:videoShowStats,s:setVideoShowStats,ok:true},
                  {l:'Progresso',v:videoShowProgress,s:setVideoShowProgress,ok:true},
                  {l:'Dati corporei',v:videoShowBody,s:setVideoShowBody,ok:hasBodyData},
                ].map(item=>(
                  <button key={item.l} onClick={()=>item.ok&&item.s(v=>!v)} disabled={!item.ok}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${!item.ok?'opacity-30 cursor-not-allowed bg-white/5 text-white/40':item.v?'bg-white text-stone-900':'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                    {item.l}
                    {!item.ok&&<span className="block text-[10px] font-normal opacity-60">non disponibile</span>}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-white/30 text-[11px] text-center">
              1080p · 10 Mbps · rendering frame-by-frame + color grading cinematico
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
                <img src={routePhotos.find(p=>p.id===placingPhoto.id)!.dataUrl} alt="" className="w-16 h-16 rounded-lg object-cover"/>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ ON-MAP BEARING ORIENTATION ══════════════════════════════════════════ */}
      {videoState==='postprod'&&placingPhoto?.step==='mapbear'&&(
        <div className="absolute inset-0 z-20 pointer-events-none">
          <div className="absolute top-0 inset-x-0 pointer-events-auto">
            <div className="m-3 bg-indigo-700/96 backdrop-blur-md rounded-2xl px-4 py-3 shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <Navigation className="w-5 h-5 text-white shrink-0 animate-pulse"/>
                <div className="flex-1">
                  <p className="text-white font-bold text-sm">Tocca la mappa nella direzione dello scatto</p>
                  <p className="text-indigo-200 text-xs mt-0.5">
                    Muovi per vedere l'anteprima · tocca/clicca per confermare
                    {tempBearing!==undefined ? ` · ${Math.round(tempBearing)}° ${bearingToCompass(Math.round(tempBearing))}` : ''}
                  </p>
                </div>
                <button onClick={()=>setPlacingPhoto(null)} className="text-indigo-300 hover:text-white transition-colors">
                  <X className="w-5 h-5"/>
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>{setRoutePhotos(prev=>prev.map(p=>p.id===placingPhoto!.id?{...p,viewingBearing:undefined}:p));setPlacingPhoto(null)}}
                  className="flex-1 py-2 rounded-xl bg-indigo-900/70 text-white/70 text-sm font-semibold hover:bg-indigo-900">
                  Salta
                </button>
                <button onClick={confirmBearing}
                  className="flex-[2] py-2 rounded-xl bg-white text-indigo-700 font-bold text-sm flex items-center justify-center gap-1.5">
                  <Check className="w-3.5 h-3.5"/> Conferma direzione
                </button>
              </div>
            </div>
          </div>
          {/* Photo thumbnail */}
          {routePhotos.find(p=>p.id===placingPhoto.id)&&(
            <div className="absolute top-36 right-3 pointer-events-none">
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-1.5 shadow-xl border border-white/20">
                <img src={routePhotos.find(p=>p.id===placingPhoto.id)!.dataUrl} alt="" className="w-16 h-16 rounded-lg object-cover"/>
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
                  <p className="text-white/22 text-xs mt-1">GPS automatico da EXIF · clic sul percorso per posizionare · muovi sulla mappa per la direzione</p>
                </div>
              ):(
                <div className="space-y-2.5">
                  {routePhotos.map(photo=>(
                    <div key={photo.id} className="bg-white/7 rounded-xl p-2.5">
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <img src={photo.dataUrl} alt="" className="w-14 h-14 rounded-lg object-cover"/>
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
                            {/* Bearing button → on-map orientation */}
                            <button onClick={()=>handleSetBearing(photo)}
                              className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/15 rounded-lg px-2 py-1 transition-colors">
                              <Navigation className="w-3 h-3"/>
                              {photo.viewingBearing!==undefined
                                ? `${bearingToCompass(photo.viewingBearing)} ${Math.round(photo.viewingBearing)}°`
                                : 'Direzione'}
                            </button>
                            {/* Remove */}
                            <button onClick={()=>{setRoutePhotos(prev=>prev.filter(p=>p.id!==photo.id));photoImgsRef.current.delete(photo.id)}}
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
                ✦ Percorso rivelato progressivamente in arancione &nbsp;·&nbsp; ✦ Color grading cinematico (contrasto+saturazione) &nbsp;·&nbsp; ✦ Title card all'apertura &nbsp;·&nbsp; ✦ Camera fluida bird-in-flight con expo-smoothing
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
      {videoState==='rendering'&&(
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col">
          <div className="absolute inset-0 bg-black/35 pointer-events-auto"/>
          <div className="absolute top-4 left-4 right-4 pointer-events-auto">
            <div className="bg-black/80 backdrop-blur-md rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"/>
                  <span className="text-white text-sm font-bold tracking-wide">RENDERING</span>
                </div>
                <button onClick={cancelRendering} className="text-white/60 hover:text-white text-xs font-semibold px-3 py-1 bg-white/10 rounded-full">Annulla</button>
              </div>
              <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-blue-500 rounded-full" style={{width:`${renderProgress*100}%`,transition:'none'}}/>
              </div>
              <p className="text-white/55 text-xs">Frame {renderFrame}/{renderTotal} · {Math.round(renderProgress*100)}%</p>
              <p className="text-white/30 text-[10px] mt-0.5">Frame-by-frame rendering — qualità cinematografica garantita</p>
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
              <button onClick={handleVideoShare} className="w-full py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4"/>Condividi
              </button>
              <button onClick={handleVideoDownload} className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center justify-center gap-2">
                <Download className="w-4 h-4"/>Scarica
              </button>
            </div>
            <div className="flex gap-2.5">
              <button onClick={()=>{setVideoState('postprod');setVideoRecordedBlob(null);setRenderProgress(0)}}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold">← Montaggio</button>
              <button onClick={()=>{setVideoState('idle');setVideoRecordedBlob(null);setRenderProgress(0)}}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold">Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
