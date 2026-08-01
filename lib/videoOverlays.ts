// lib/videoOverlays.ts — primitive di disegno degli strati grafici del video.
//
// Estratte da components/RouteMap3D.tsx, che aveva superato le 4500 righe mescolando il componente
// React, la macchina di rendering e ogni singolo disegno su canvas. Qui dentro non c'è nulla di
// React e nulla di MapLibre: sono funzioni pure che ricevono un contesto 2D e dei numeri, quindi si
// possono provare in isolamento (ed è così che sono state verificate, renderizzandole in un browser
// headless) senza montare la mappa.
//
// Due regole valgono per TUTTO il file, e vanno rispettate da qualunque disegno si aggiunga:
//
// 1. Niente ctx.shadowBlur. È tra le operazioni più costose su canvas 2D e qui si ridisegna ad OGNI
//    fotogramma del video; in più una sfocatura larga, dopo la compressione H.264, diventa un anello
//    o una banda invece di un bagliore. La profondità si fa per estrusione (la stessa sagoma
//    ripetuta e scurita), le ombre con ellissi piene, i bagliori con contorni netti.
//
// 2. Ogni ctx.save() deve avere il suo ctx.restore() garantito da try/finally, non semplicemente
//    scritto qualche riga più sotto. Lo stesso contesto viene riusato per tutti i fotogrammi
//    dell'esportazione: se un'eccezione salta un restore, la pila resta sbilanciata e ogni
//    fotogramma successivo eredita clip, alpha o trasformazioni sbagliate. Con try/finally il danno
//    peggiore è perdere un elemento in un fotogramma.
import { polaroidRotationDeg } from '@/lib/videoPhotoCarousel'

// ── Geo helpers ────────────────────────────────────────────────────────────────

function rad(d: number) { return d * Math.PI / 180 }

export function distM(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000, a = Math.sin(rad((la2-la1)/2))**2 + Math.cos(rad(la1))*Math.cos(rad(la2))*Math.sin(rad((lo2-lo1)/2))**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function smoothArray(arr: number[], half = 4): number[] {
  return arr.map((_,i) => { const s=arr.slice(Math.max(0,i-half),Math.min(arr.length,i+half+1)); return s.reduce((a,b)=>a+b,0)/s.length })
}

export function lerp(a: number, b: number, t: number) { return a + (b-a)*t }

export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a) % 360 + 540) % 360 - 180
  return (a + d * t + 360) % 360
}


// ── Canvas helpers ─────────────────────────────────────────────────────────────

export function coverRect(sW: number, sH: number, dW: number, dH: number) {
  const sA=sW/sH, dA=dW/dH
  if (sA>dA) { const sw=Math.round(sH*dA); return {sx:Math.round((sW-sw)/2),sy:0,sw,sh:sH} }
  const sh=Math.round(sW/dA); return {sx:0,sy:Math.round((sH-sh)/2),sw:sW,sh}
}

export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const c=Math.min(r,w/2,h/2)
  ctx.beginPath()
  ctx.moveTo(x+c,y); ctx.lineTo(x+w-c,y); ctx.arcTo(x+w,y,x+w,y+c,c)
  ctx.lineTo(x+w,y+h-c); ctx.arcTo(x+w,y+h,x+w-c,y+h,c)
  ctx.lineTo(x+c,y+h); ctx.arcTo(x,y+h,x,y+h-c,c)
  ctx.lineTo(x,y+c); ctx.arcTo(x,y,x+c,y,c)
  ctx.closePath()
}

// ── Pin utente: "gettone 3D" ──────────────────────────────────────────────────
// Pin e cuore sono gettoni SPESSI: la profondità viene da una vera estrusione (la stessa sagoma
// ridisegnata più volte, spostata e scurita) invece che da un'ombra sfocata. shadowBlur è tra le
// operazioni più costose su canvas 2D ed entrambi si ridisegnano ad OGNI fotogramma del video; in
// più un bordo netto sopravvive alla compressione H.264, una sfocatura larga no (banding/anelli).

export type RGB = [number, number, number]
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
function lerpChannel(a: number, b: number, t: number): number { return Math.round(a + (b - a) * t) }
export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const k = clamp01(t)
  return [lerpChannel(a[0],b[0],k), lerpChannel(a[1],b[1],k), lerpChannel(a[2],b[2],k)]
}
export function rgbCss(c: RGB, alpha = 1): string {
  return alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`
}
/** f<1 scurisce; f>1 schiarisce verso il bianco (non satura i canali come farebbe una moltiplica). */
export function shade(c: RGB, f: number): RGB {
  if (f <= 1) return [Math.round(c[0]*f), Math.round(c[1]*f), Math.round(c[2]*f)]
  const k = Math.min(1, f - 1)
  return [lerpChannel(c[0],255,k), lerpChannel(c[1],255,k), lerpChannel(c[2],255,k)]
}

// Scala della fatica in stile "zone di frequenza cardiaca": celeste (riposo) → verde → ambra →
// rosso (sforzo massimo). Colora TUTTO il pin, foto compresa — vedi drawMapPin.
const EFFORT_STOPS: { at: number; c: RGB }[] = [
  { at: 0.00, c: hexToRgb('#22d3ee') },
  { at: 0.35, c: hexToRgb('#4ade80') },
  { at: 0.68, c: hexToRgb('#fbbf24') },
  { at: 1.00, c: hexToRgb('#ef4444') },
]
export function effortRgb(effort: number): RGB {
  const e = clamp01(effort)
  for (let i = 1; i < EFFORT_STOPS.length; i++) {
    const a = EFFORT_STOPS[i-1], b = EFFORT_STOPS[i]
    if (e <= b.at) return mixRgb(a.c, b.c, (e - a.at) / (b.at - a.at))
  }
  return EFFORT_STOPS[EFFORT_STOPS.length - 1].c
}
const PIN_NEUTRAL: RGB = hexToRgb('#3b82f6')

/** Sagoma del pin (cerchio + punta) come unico path chiuso: riusata identica per l'estrusione, la
 *  faccia e il bordo, così i tre strati combaciano perfettamente a qualunque scala. */
function pinSilhouette(ctx: CanvasRenderingContext2D, cx: number, tipY: number, R: number, tipH: number) {
  const ccY = tipY - R - tipH
  const ang = Math.asin(0.42)   // punto in cui la punta si stacca dal cerchio
  ctx.beginPath()
  ctx.arc(cx, ccY, R, Math.PI/2 - ang, Math.PI/2 + ang, true)   // il giro lungo, sopra
  ctx.lineTo(cx, tipY)
  ctx.closePath()
}

// Ogni ctx.save() qui sotto ha un ctx.restore() garantito da try/finally, non solo "in sequenza":
// se una qualunque chiamata canvas nel mezzo lancia un'eccezione imprevista (un valore non finito
// in un gradiente, per esempio), un ctx.restore() mancante lascerebbe la PILA save/restore del
// contesto sbilanciata — e siccome lo stesso ctx viene riusato per TUTTI i fotogrammi del video,
// non solo questo, una singola eccezione isolata potrebbe corrompere silenziosamente (clip/alpha/
// trasformazione residui) ogni fotogramma successivo per il resto dell'esportazione. Con try/
// finally, nel caso peggiore si perde solo il pin di QUESTO fotogramma — mai lo stato del contesto.
export function drawMapPin(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,    // tip of pin = GPS position
  sc: number,                // scale (outW/1080)
  faceImg: HTMLImageElement | null,
  effort: number | null = null,   // 0..1 fatica (vedi effortRgb); null = effetto spento, blu neutro
  slope = 0,                      // -1..1 pendenza normalizzata; 0 = ombra tonda di sempre
) {
  try {
  const R    = 34 * sc
  const tipH = 18 * sc
  const ccY  = cy - R - tipH   // centro del cerchio (la punta del pin è a cy)
  const base = effort == null ? PIN_NEUTRAL : effortRgb(effort)
  const light = shade(base, 1.5), dark = shade(base, 0.66), edgeDark = shade(base, 0.34)
  const DEPTH = 10 * sc        // spessore del gettone
  const DX    = DEPTH * 0.28   // luce da sinistra-alto: lo spessore si vede in basso a destra

  ctx.save()
  try {
    // Ombra a terra: ellisse piena sotto la punta — niente shadowBlur (vedi nota in testa).
    // Con `slope` diverso da zero si allunga e si inclina come farebbe su un pendio: comunica la
    // pendenza (quindi la fatica) senza scrivere un numero da nessuna parte.
    const sl = Math.max(-1, Math.min(1, slope))
    const asl = Math.abs(sl)
    ctx.fillStyle = `rgba(0,0,0,${0.28 + 0.12*asl})`
    ctx.beginPath()
    ctx.ellipse(cx + DX + sl*R*0.22, cy + DEPTH*0.9, R*0.46*(1 + 0.85*asl), R*0.15*(1 - 0.3*asl), -sl*0.42, 0, Math.PI*2)
    ctx.fill()

    // Spessore del gettone: la stessa sagoma ripetuta all'indietro, dal bordo più scuro alla faccia
    const STEPS = 9
    for (let i = STEPS; i >= 1; i--) {
      const f = i / STEPS
      ctx.fillStyle = rgbCss(mixRgb(dark, edgeDark, f))
      pinSilhouette(ctx, cx + DX*f, cy + DEPTH*f, R, tipH)
      ctx.fill()
    }

    // Faccia frontale
    const g = ctx.createRadialGradient(cx - R*0.36, ccY - R*0.40, R*0.04, cx, ccY, R*1.35)
    g.addColorStop(0, rgbCss(light)); g.addColorStop(0.52, rgbCss(base)); g.addColorStop(1, rgbCss(dark))
    pinSilhouette(ctx, cx, cy, R, tipH); ctx.fillStyle = g; ctx.fill()

    // Bordo bianco: stacca il gettone dalla mappa qualunque colore abbia preso la fatica
    ctx.strokeStyle = 'white'; ctx.lineWidth = 3.4*sc; ctx.lineJoin = 'round'
    pinSilhouette(ctx, cx, cy, R, tipH); ctx.stroke()

    // Foto (o sagoma) ritagliata nel cerchio interno, tinta del colore della fatica
    const ir = R - 7*sc
    ctx.save()
    try {
      ctx.beginPath(); ctx.arc(cx, ccY, ir, 0, Math.PI*2); ctx.clip()
      if (faceImg) {
        ctx.drawImage(faceImg, cx-ir, ccY-ir, ir*2, ir*2)
        if (effort != null) {
          // "tutto il pin, foto compresa, si colora in funzione della fatica": blend 'color' invece
          // di una velatura piatta — sostituisce tinta e saturazione MANTENENDO la luminanza, quindi
          // il viso resta leggibile invece di appiattirsi sotto un rettangolo semitrasparente.
          ctx.globalCompositeOperation = 'color'
          ctx.globalAlpha = 0.92
          ctx.fillStyle = rgbCss(base)
          ctx.fillRect(cx-ir, ccY-ir, ir*2, ir*2)
          ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
        }
      } else {
        ctx.fillStyle = rgbCss(dark)
        ctx.fillRect(cx-ir, ccY-ir, ir*2, ir*2)
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.beginPath(); ctx.arc(cx, ccY-ir*0.2, ir*0.32, 0, Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.ellipse(cx, ccY+ir*0.34, ir*0.46, ir*0.27, 0, Math.PI, 0); ctx.fill()
      }
      // Incavo: ombra interna sul bordo, fa sembrare la foto incassata nel gettone
      const rim = ctx.createRadialGradient(cx, ccY, ir*0.72, cx, ccY, ir)
      rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.42)')
      ctx.fillStyle = rim; ctx.fillRect(cx-ir, ccY-ir, ir*2, ir*2)
    } finally { ctx.restore() }

    // Anello del gettone attorno alla foto
    ctx.strokeStyle = rgbCss(shade(base, 0.8)); ctx.lineWidth = 2.6*sc
    ctx.beginPath(); ctx.arc(cx, ccY, ir + 1.3*sc, 0, Math.PI*2); ctx.stroke()

    // Highlight speculare netto (non un fade largo: i fade sottili comprimono male in video,
    // apparendo come anelli invece che come un bagliore) — è il vetro sopra al gettone.
    ctx.save()
    try {
      pinSilhouette(ctx, cx, cy, R, tipH); ctx.clip()
      ctx.fillStyle = 'rgba(255,255,255,0.30)'
      ctx.beginPath(); ctx.ellipse(cx-R*0.40, ccY-R*0.46, R*0.40, R*0.20, -0.6, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.88)'
      ctx.beginPath(); ctx.ellipse(cx-R*0.46, ccY-R*0.52, R*0.14, R*0.07, -0.6, 0, Math.PI*2); ctx.fill()
    } finally { ctx.restore() }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawMapPin error:', err) }
}

// ── Battito cardiaco sopra al pin (opzionale) ───────────────────────────────────
// Un cuore che pulsa fluttuante sopra al pin (non attaccato — stile "status icon" da videogioco),
// con il numero BPM corrente sopra di esso. Il periodo del battito è quello VERO (60/bpm secondi),
// non una velocità arbitraria — vedi l'accumulatore di fase in goToRendering (hrPulsePhaseRef) per
// il motivo per cui è un accumulatore incrementale e non un semplice "tempo % periodo".

function heartPulseScale(phase: number): number {
  // sin³: attacco rapido e rilascio morbido, zero (e derivata zero) sia a phase=0 sia a phase=1 —
  // nessuno scatto quando il ciclo si ripete.
  return 1 + 0.30 * Math.pow(Math.max(0, Math.sin(phase * Math.PI)), 3)
}

// Cuore pieno e largo quanto alto: la versione precedente era molto più alta che larga e, ingrandita
// a gettone, si leggeva come una goccia invece che come un cuore.
function drawHeartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath()
  ctx.moveTo(cx, cy + size*0.40)
  ctx.bezierCurveTo(cx - size*0.82, cy - size*0.12, cx - size*0.54, cy - size*0.80, cx, cy - size*0.30)
  ctx.bezierCurveTo(cx + size*0.54, cy - size*0.80, cx + size*0.82, cy - size*0.12, cx, cy + size*0.40)
  ctx.closePath()
}

export function drawHeartBadge(
  ctx: CanvasRenderingContext2D,
  pinCx: number, pinTipCy: number, sc: number,
  bpm: number, pulsePhase: number,
) {
  if (!(bpm > 0)) return
  try {
  const R = 34 * sc, tipH = 18 * sc
  const ccY = pinTipCy - R - tipH
  const scale = heartPulseScale(pulsePhase)
  const size = 50 * sc * scale   // gettone vero e proprio, non più un'icona: si legge a colpo d'occhio
  const hx = pinCx, hy = ccY - R * 2.35   // fluttua sopra al pin, staccato — non attaccato
  const DEPTH = 12 * sc, DX = DEPTH * 0.28
  const face = hexToRgb('#ef4444'), deep = hexToRgb('#7f1d1d')

  // Gettone a forma di cuore: stessa estrusione del pin (nessuno shadowBlur, nessun alone
  // sfumato — comprimeva in video come un anello netto invece che come un bagliore).
  ctx.save()
  try {
    const STEPS = 8
    for (let i = STEPS; i >= 1; i--) {
      const f = i / STEPS
      ctx.fillStyle = rgbCss(mixRgb(shade(face, 0.62), deep, f))
      drawHeartPath(ctx, hx + DX*f, hy + DEPTH*f, size)
      ctx.fill()
    }
    const hg = ctx.createLinearGradient(hx-size*0.5, hy-size*0.7, hx+size*0.35, hy+size*0.45)
    hg.addColorStop(0, '#fecaca'); hg.addColorStop(0.42, '#f87171'); hg.addColorStop(1, '#dc2626')
    ctx.fillStyle = hg
    drawHeartPath(ctx, hx, hy, size)
    ctx.fill()
    ctx.strokeStyle = 'white'; ctx.lineWidth = 2.2*sc; ctx.lineJoin = 'round'
    drawHeartPath(ctx, hx, hy, size); ctx.stroke()
    // Vetro sopra al gettone: highlight netto in stile "sticker", non un fade
    ctx.save()
    try {
      drawHeartPath(ctx, hx, hy, size); ctx.clip()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath(); ctx.ellipse(hx-size*0.24, hy-size*0.30, size*0.20, size*0.12, -0.5, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.beginPath(); ctx.ellipse(hx-size*0.27, hy-size*0.34, size*0.085, size*0.05, -0.5, 0, Math.PI*2); ctx.fill()
    } finally { ctx.restore() }
  } finally { ctx.restore() }

  ctx.save()
  try {
    const label = `${Math.round(bpm)}`
    ctx.font = `800 ${Math.round(26*sc)}px -apple-system,sans-serif`
    const lw = ctx.measureText(label).width + 22*sc, lh = 34*sc
    const ly = hy - size*0.92 - lh
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    rrect(ctx, hx-lw/2, ly, lw, lh, lh/2); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.4*sc
    rrect(ctx, hx-lw/2, ly, lw, lh, lh/2); ctx.stroke()
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, hx, ly + lh/2)
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawHeartBadge error:', err) }
}

/** Fatica 0..1 dalla FC nel punto `si`, normalizzata sull'escursione STESSA (min..max di questa
 *  uscita) invece che su soglie assolute arbitrarie: così la scala di colore viene usata tutta,
 *  qualunque sia la forma fisica di chi cammina. 0 = passo di riposo, 1 = punto di massimo sforzo. */
export function hrEffortAt(smoothHr: number[], si: number, hrMin: number, hrMax: number): number {
  return clamp01((smoothHr[si] - hrMin) / Math.max(1, hrMax - hrMin))
}

// ── Stelline all'arrivo finale (opzionale) ──────────────────────────────────────

function drawStarPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2
    const r = i % 2 === 0 ? size : size * 0.42
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** Scoppio di stelline dal punto (cx,cy) — un solo momento enfatizzato all'arrivo finale del
 *  percorso, non ripetuto ad ogni foto. `burstT` 0..1 copre l'intero scoppio (partenza→dissolvenza).
 *  Niente shadowBlur (per lo stesso motivo del cuore sopra — e qui sfocava anche le punte della
 *  stella fino a farla sembrare un cerchio): un contorno bianco netto dà definizione a costo fisso. */
export function drawArrivalStars(ctx: CanvasRenderingContext2D, cx: number, cy: number, sc: number, burstT: number) {
  try {
  const N = 14
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 + (i % 3) * 0.15
    const speed = (70 + (i % 4) * 22) * sc
    const delay = (i % 5) * 0.045
    const t = Math.max(0, Math.min(1, (burstT - delay) / (1 - delay)))
    if (t <= 0 || t >= 1) continue
    const eased = 1 - Math.pow(1 - t, 3)  // ease-out: parte veloce, rallenta
    const dist = speed * eased
    const alpha = 1 - t
    const x = cx + Math.cos(angle) * dist, y = cy + Math.sin(angle) * dist
    // Taglia base più grande di prima: una stella piccola perde le punte e si legge come un pallino.
    const starSize = (13 + (i % 3) * 4) * sc * (1 - t * 0.3)
    ctx.save()
    try {
      ctx.globalAlpha = alpha
      ctx.fillStyle = i % 2 === 0 ? '#fde047' : '#60a5fa'
      drawStarPath(ctx, x, y, starSize)
      ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1.4 * sc
      drawStarPath(ctx, x, y, starSize); ctx.stroke()
    } finally { ctx.restore() }
  }
  } catch (err) { console.error('[dtrek] drawArrivalStars error:', err) }
}

// ── Traguardi di percorso 25/50/75% (opzionale) ────────────────────────────────
/** Il numero nasce nel punto esatto del percorso toccato dal pin e sale sfumando, con un anello che
 *  si espande dallo stesso punto: l'occhio parte dal terreno, non da un'etichetta piovuta dall'alto.
 *  `t` copre 0..1 l'intera animazione. */
export function drawRouteMilestone(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, sc: number,
  pct: number, t: number,
) {
  try {
  const k = clamp01(t)
  const fadeIn = Math.min(1, k / 0.12)
  const fadeOut = k > 0.58 ? Math.max(0, 1 - (k - 0.58) / 0.42) : 1
  const alpha = fadeIn * fadeOut
  if (alpha <= 0.01) return

  // Anello che si espande dal punto toccato — resta ancorato a cy, non sale col numero
  if (k < 0.45) {
    const rt = k / 0.45
    ctx.save()
    try {
      ctx.globalAlpha = (1 - rt) * 0.85
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 5*sc * (1 - rt*0.6)
      ctx.beginPath(); ctx.arc(cx, cy, 30*sc + 130*sc * (1 - Math.pow(1-rt, 2)), 0, Math.PI*2); ctx.stroke()
    } finally { ctx.restore() }
  }

  const up = 1 - Math.pow(1 - k, 2.4)      // sale svelto, poi rallenta
  const y = cy - 260*sc * up
  // easeOutBack: piccolo scavalco e assestamento, il "pop" da videogioco
  const popT = Math.min(1, k / 0.26)
  const c1 = 1.70158, c3 = c1 + 1
  const back = 1 + c3*Math.pow(popT-1, 3) + c1*Math.pow(popT-1, 2)
  const scale = 0.5 + 0.5 * back

  ctx.save()
  try {
    ctx.globalAlpha = alpha
    ctx.translate(cx, y)
    ctx.scale(scale, scale)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    // Contorno pieno invece di shadowBlur/riquadro: leggibile su qualunque mappa sotto
    const label = `${pct}%`
    ctx.font = `900 ${Math.round(110*sc)}px -apple-system,sans-serif`
    ctx.strokeStyle = 'rgba(6,20,32,0.92)'; ctx.lineWidth = 12*sc
    ctx.strokeText(label, 0, 0)
    const g = ctx.createLinearGradient(0, -60*sc, 0, 60*sc)
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#fde047')
    ctx.fillStyle = g
    ctx.fillText(label, 0, 0)
    const cap = 'DEL PERCORSO'
    ctx.font = `800 ${Math.round(24*sc)}px -apple-system,sans-serif`
    ctx.strokeStyle = 'rgba(6,20,32,0.92)'; ctx.lineWidth = 6*sc
    ctx.strokeText(cap, 0, 78*sc)
    ctx.fillStyle = 'white'; ctx.fillText(cap, 0, 78*sc)
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawRouteMilestone error:', err) }
}

// ── Scia dietro al pin (opzionale) ─────────────────────────────────────────────
/** Coda che sfuma dietro al pin, già proiettata in coordinate del canvas composito (il chiamante
 *  fa la proiezione perché serve la telecamera di MapLibre). `pts` va dalla coda (più vecchio) alla
 *  punta (posizione attuale). Disegnata segmento per segmento con larghezza e opacità calanti: un
 *  gradiente lungo un percorso curvo non seguirebbe la curva, e comunque i fade larghi comprimono
 *  peggio di tanti tratti pieni corti. */
export function drawPinTrail(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], sc: number, color: RGB) {
  try {
  if (pts.length < 2) return
  ctx.save()
  try {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const n = pts.length
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1)            // 0 = coda, 1 = pin
      const a = pts[i-1], b = pts[i]
      if (!isFinite(a.x) || !isFinite(a.y) || !isFinite(b.x) || !isFinite(b.y)) continue
      // Alone largo e tenue sotto, tratto pieno sopra: dà corpo senza usare shadowBlur
      ctx.globalAlpha = 0.16 * t * t
      ctx.strokeStyle = rgbCss(color)
      ctx.lineWidth = (4 + 16 * t) * sc
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      ctx.globalAlpha = 0.85 * t * t
      ctx.strokeStyle = rgbCss(shade(color, 1.35))
      ctx.lineWidth = (1.5 + 6 * t) * sc
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawPinTrail error:', err) }
}

// ── Numeri "a rullo" stile contachilometri (opzionale) ─────────────────────────
/** Disegna `value` con ogni cifra che scorre verticalmente. Le cifre più significative scorrono solo
 *  nell'ultimo 10% prima del riporto (come un contatore meccanico vero); l'ultima cifra scorre in
 *  continuo. `ctx.font` e `ctx.fillStyle` vanno impostati dal chiamante. Ritorna la larghezza usata. */
export function drawOdometer(
  ctx: CanvasRenderingContext2D,
  value: number, decimals: number,
  x: number, yTop: number, digitH: number,
  align: 'left' | 'center' | 'right' = 'left',
): number {
  try {
  const v = Math.abs(value)
  const s = v.toFixed(decimals)
  const chars = (value < 0 ? '-' : '') + s
  const digitW = ctx.measureText('8').width
  const isDigit = (c: string) => c >= '0' && c <= '9'
  let total = 0
  for (const ch of chars) total += isDigit(ch) ? digitW : ctx.measureText(ch).width
  let cx = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total
  const startX = cx
  const dot = s.indexOf('.')
  const intLen = dot === -1 ? s.length : dot
  const nDigits = s.length - (dot === -1 ? 0 : 1)
  const prevAlign = ctx.textAlign, prevBase = ctx.textBaseline
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  // Estensione REALE delle cifre, misurata: il riquadro del font è più alto del glifo, e se la
  // finestra di scorrimento non combacia col glifo o si vede un vuoto a metà corsa (finestra troppo
  // alta) o spuntano fette della cifra vicina quando è ferma (finestra troppo bassa).
  const m0 = ctx.measureText('0')
  const hasMetrics = typeof m0.actualBoundingBoxAscent === 'number' && typeof m0.actualBoundingBoxDescent === 'number'
  const glyphTop = hasMetrics ? yTop - m0.actualBoundingBoxAscent : yTop + digitH * 0.22
  const glyphH = hasMetrics
    ? Math.max(1, m0.actualBoundingBoxAscent + m0.actualBoundingBoxDescent)
    : digitH * 0.72
  const margin = glyphH * 0.12
  const travel = glyphH + margin * 2           // corsa che porta la cifra uscente fuori dalla finestra
  const bandTop = glyphTop - margin, band = travel
  let idx = 0
  for (const ch of chars) {
    if (!isDigit(ch)) { ctx.fillText(ch, cx, yTop); cx += ctx.measureText(ch).width; continue }
    const place = intLen - 1 - idx
    const scaled = v / Math.pow(10, place)
    const base = Math.floor(scaled + 1e-9)
    const frac = scaled - base
    const d0 = ((base % 10) + 10) % 10
    const isLast = idx === nDigits - 1
    // La cifra sta ferma quasi sempre e passa in fretta: uno scorrimento lineare la lascerebbe a
    // metà corsa per gran parte del tempo, e a metà corsa si leggono due mezze cifre invece di una.
    // Le cifre più significative partono ancora più tardi, come i tamburi di un contatore meccanico.
    const raw = isLast
      ? clamp01((frac - 0.62) / 0.33)
      : (frac > 0.92 ? (frac - 0.92) / 0.08 : 0)
    const roll = raw * raw * (3 - 2 * raw)
    idx++
    ctx.save()
    try {
      ctx.beginPath(); ctx.rect(cx, bandTop, digitW, band); ctx.clip()
      ctx.fillText(String(d0), cx, yTop - roll * travel)
      ctx.fillText(String((d0 + 1) % 10), cx, yTop + (1 - roll) * travel)
    } finally { ctx.restore() }
    cx += digitW
  }
  ctx.textAlign = prevAlign; ctx.textBaseline = prevBase
  return cx - startX
  } catch (err) { console.error('[dtrek] drawOdometer error:', err); return 0 }
}

// ── Vetta conquistata (opzionale) ──────────────────────────────────────────────
/** Un solo momento in tutto il video, al punto più alto: lampo, raggi che si aprono dal pin e la
 *  quota in grande. `t` copre 0..1 l'intero momento. */
export function drawPeakConquered(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, w: number, h: number, sc: number,
  altM: number, t: number,
) {
  try {
  const k = clamp01(t)
  // Lampo pieno schermo, brevissimo: è lo "stacco" che segnala il momento
  if (k < 0.14) {
    const f = 1 - k / 0.14
    ctx.save()
    try { ctx.globalAlpha = f * 0.5; ctx.fillStyle = '#fff7d6'; ctx.fillRect(0, 0, w, h) } finally { ctx.restore() }
  }
  // Raggi che si aprono dal pin e ruotano lentamente
  if (k < 0.55) {
    const rt = k / 0.55
    ctx.save()
    try {
      ctx.globalAlpha = (1 - rt) * 0.55
      ctx.translate(cx, cy); ctx.rotate(rt * 0.5)
      ctx.fillStyle = '#fde047'
      const R0 = 40 * sc, R1 = (110 + 190 * (1 - Math.pow(1 - rt, 2))) * sc
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, sp = 0.05
        ctx.beginPath()
        ctx.moveTo(Math.cos(a - sp) * R0, Math.sin(a - sp) * R0)
        ctx.lineTo(Math.cos(a) * R1, Math.sin(a) * R1)
        ctx.lineTo(Math.cos(a + sp) * R0, Math.sin(a + sp) * R0)
        ctx.closePath(); ctx.fill()
      }
    } finally { ctx.restore() }
  }
  const fadeIn = Math.min(1, k / 0.12)
  const fadeOut = k > 0.62 ? Math.max(0, 1 - (k - 0.62) / 0.38) : 1
  const alpha = fadeIn * fadeOut
  if (alpha <= 0.01) return
  const up = 1 - Math.pow(1 - k, 2.4)
  const popT = Math.min(1, k / 0.26)
  const c1 = 1.70158, c3 = c1 + 1
  const scale = 0.5 + 0.5 * (1 + c3*Math.pow(popT-1, 3) + c1*Math.pow(popT-1, 2))
  ctx.save()
  try {
    ctx.globalAlpha = alpha
    ctx.translate(cx, cy - 250*sc * up)
    ctx.scale(scale, scale)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    ctx.font = `900 ${Math.round(30*sc)}px -apple-system,sans-serif`
    ctx.strokeStyle = 'rgba(6,20,32,0.92)'; ctx.lineWidth = 7*sc
    ctx.strokeText('▲ VETTA', 0, -66*sc); ctx.fillStyle = '#fde047'; ctx.fillText('▲ VETTA', 0, -66*sc)
    const label = `${Math.round(altM)} m`
    ctx.font = `900 ${Math.round(96*sc)}px -apple-system,sans-serif`
    ctx.strokeStyle = 'rgba(6,20,32,0.92)'; ctx.lineWidth = 12*sc
    ctx.strokeText(label, 0, 0)
    const g = ctx.createLinearGradient(0, -50*sc, 0, 50*sc)
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#fbbf24')
    ctx.fillStyle = g; ctx.fillText(label, 0, 0)
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawPeakConquered error:', err) }
}

// ── Mini-mappa d'insieme (opzionale) ───────────────────────────────────────────
/** Tracciato completo normalizzato in un riquadro 0..1, aspetto preservato e centrato: si calcola
 *  una volta sola per rendering, non ad ogni fotogramma. */
export function buildMiniRoute(pts: { lat?: number; lon?: number }[], maxPoints = 140): { x: number; y: number }[] {
  const valid = pts.filter(p => p.lat != null && p.lon != null) as { lat: number; lon: number }[]
  if (valid.length < 2) return []
  const step = Math.max(1, Math.floor(valid.length / maxPoints))
  const sampled = valid.filter((_, i) => i % step === 0 || i === valid.length - 1)
  const latMid = (Math.min(...sampled.map(p => p.lat)) + Math.max(...sampled.map(p => p.lat))) / 2
  const kx = Math.cos(latMid * Math.PI / 180)   // i gradi di longitudine si accorciano alle alte latitudini
  const xs = sampled.map(p => p.lon * kx), ys = sampled.map(p => -p.lat)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanX = Math.max(1e-9, maxX - minX), spanY = Math.max(1e-9, maxY - minY)
  const span = Math.max(spanX, spanY)   // stesso divisore sui due assi = niente deformazione
  const offX = (span - spanX) / 2, offY = (span - spanY) / 2
  return xs.map((x, i) => ({ x: (x - minX + offX) / span, y: (ys[i] - minY + offY) / span }))
}

/** Riquadro con il tracciato intero e il punto di avanzamento: dà il colpo d'occhio d'insieme che
 *  manca quando la telecamera è sempre incollata al pin. */
export function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number, sc: number,
  route: { x: number; y: number }[], progress: number, color: RGB,
) {
  try {
  if (route.length < 2) return
  const pad = size * 0.12, inner = size - pad * 2
  const px = (i: number) => x + pad + route[i].x * inner
  const py = (i: number) => y + pad + route[i].y * inner
  ctx.save()
  try {
    ctx.fillStyle = 'rgba(6,14,20,0.58)'
    rrect(ctx, x, y, size, size, size * 0.16); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5 * sc
    rrect(ctx, x, y, size, size, size * 0.16); ctx.stroke()
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    // Tracciato completo, tenue
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 2 * sc
    ctx.beginPath()
    for (let i = 0; i < route.length; i++) i === 0 ? ctx.moveTo(px(i), py(i)) : ctx.lineTo(px(i), py(i))
    ctx.stroke()
    // Parte già percorsa, piena
    const upTo = Math.max(1, Math.round(clamp01(progress) * (route.length - 1)))
    ctx.strokeStyle = rgbCss(color); ctx.lineWidth = 3 * sc
    ctx.beginPath()
    for (let i = 0; i <= upTo; i++) i === 0 ? ctx.moveTo(px(i), py(i)) : ctx.lineTo(px(i), py(i))
    ctx.stroke()
    // Punto corrente
    ctx.fillStyle = 'white'
    ctx.beginPath(); ctx.arc(px(upTo), py(upTo), 4 * sc, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = rgbCss(color)
    ctx.beginPath(); ctx.arc(px(upTo), py(upTo), 2.4 * sc, 0, Math.PI * 2); ctx.fill()
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawMiniMap error:', err) }
}

// ── Photo pin ─────────────────────────────────────────────────────────────────

export function drawPhotoPin(
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

export function drawPoiPin(
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

// ── Zoom sulla foto in sosta (stile video "Carosello") ──────────────────────────
// Niente striscia separata: il pin della foto già presente sul percorso si apre — da piccolo come
// appare in mappa fino a una polaroid ben visibile (non a schermo intero: un bordo sempre visibile
// intorno alla foto, così si legge chiaramente come una scelta di stile e non come un errore di
// crop) — mentre la telecamera è ferma su di esso, poi si richiude. La telecamera è centrata sulle
// coordinate della foto durante la sosta (vedi il chiamante in goToRendering), quindi
// l'origine/destinazione dello zoom è semplicemente il centro schermo. Stile polaroid (cornice
// color crema, didascalia in corsivo sotto la foto) coerente con drawPolaroid usato altrove
// nell'app. Vedi lib/videoPhotoCarousel.ts stopPhotoZoomAt per la forma temporale (apre/resta/
// richiude), condivisa con l'anteprima live. Niente shadowBlur: costa relativamente poco su un
// singolo elemento per frame, ma le soste durano diversi secondi a piena frequenza fotogrammi, e
// il costo si accumula per l'intera durata di ogni sosta — un'ombra "finta" (rettangolo pieno
// arretrato, senza sfocatura) dà comunque profondità a costo trascurabile.
export function aspectFitCrop(imgW: number, imgH: number, targetA: number): { sx: number; sy: number; sw: number; sh: number } {
  const srcA = imgW / imgH
  let sx = 0, sy = 0, sw = imgW, sh = imgH
  if (srcA > targetA) { sw = Math.round(sh * targetA); sx = (imgW - sw) / 2 }
  else { sh = Math.round(sw / targetA); sy = (imgH - sh) / 2 }
  return { sx, sy, sw, sh }
}

const POLAROID_PAD_FRAC = 0.05   // bordo crema su alto/lati, come frazione della larghezza della card
const POLAROID_CAP_FRAC = 0.22   // striscia in basso per la didascalia, come frazione della larghezza

export function drawStopPhotoZoom(
  ctx: CanvasRenderingContext2D,
  outW: number, outH: number, sc: number,
  img: HTMLImageElement, caption: string | undefined, photoId: string,
  zoomT: number, stopT: number,
) {
  if (!(img.complete && img.naturalWidth > 0)) return
  try {
  const peakW = Math.min(outW * 0.82, (outH * 0.72) / (1 + POLAROID_CAP_FRAC))
  const pinPx = Math.round(70 * sc)
  const cardW = pinPx + (peakW - pinPx) * zoomT
  const cardH = cardW * (1 + POLAROID_CAP_FRAC)
  const pad = cardW * POLAROID_PAD_FRAC
  const photoSide = cardW - pad * 2
  // Leggero respiro quando è aperta (non un fermo immagine assoluto) — una lenta deriva, stessa
  // idea del Ken Burns già usato per la rivelazione a schermo intero dello stile Classico.
  const breathe = zoomT > 0.995 ? Math.sin(stopT * Math.PI * 2.4) * 0.008 : 0
  const cx = outW / 2 + outW * breathe, cy = outH / 2
  const bx = cx - cardW / 2, by = cy - cardH / 2
  const r = Math.max(2 * sc, 8 * sc * zoomT)
  // Piccola rotazione finale (mai perfettamente ortogonale allo schermo), diversa per ogni foto ma
  // sempre la stessa per la stessa foto — vedi polaroidRotationDeg. Non fissa dall'inizio: ruota
  // MENTRE si apre (proporzionale a zoomT, che include già il leggero superamento elastico), come
  // una polaroid "posata" che si assesta, invece di comparire già storta.
  const rotRad = polaroidRotationDeg(photoId) * Math.PI / 180 * zoomT

  // La mappa si scurisce leggermente dietro la card mentre si apre (effetto "riflettore") — la
  // rende leggibile come una scelta deliberata, non un frame corrotto. Non ruotata: è a schermo intero.
  if (zoomT > 0.02) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.4, zoomT * 0.45)})`
    ctx.fillRect(0, 0, outW, outH)
  }

  // Ogni ctx.save() qui sotto ha un ctx.restore() garantito da try/finally: lo stesso ctx viene
  // riusato per l'intero video, quindi una pila save/restore sbilanciata per un'eccezione
  // imprevista in un frame corromperebbe (clip/trasformazione residui) anche tutti i successivi.
  ctx.save()
  try {
    ctx.translate(cx, cy); ctx.rotate(rotRad); ctx.translate(-cx, -cy)

    // Ombra finta (nessuna sfocatura): un rettangolo pieno arretrato, dello stesso raggio, dietro la card.
    const shOff = 6 * sc * zoomT
    ctx.fillStyle = `rgba(0,0,0,${0.35 * zoomT})`
    rrect(ctx, bx, by + shOff, cardW, cardH, r); ctx.fill()
    ctx.fillStyle = '#fffdf4'
    rrect(ctx, bx, by, cardW, cardH, r); ctx.fill()
    ctx.save()
    try {
      rrect(ctx, bx + pad, by + pad, photoSide, photoSide, r * 0.4); ctx.clip()
      const crop = aspectFitCrop(img.width, img.height, 1)
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, bx + pad, by + pad, photoSide, photoSide)
    } finally { ctx.restore() }

    // Didascalia, nella cornice sotto la foto — solo quando c'è abbastanza spazio per leggerla.
    if (caption && zoomT > 0.55) {
      const capAlpha = Math.min(1, (zoomT - 0.55) / 0.25)
      ctx.save()
      try {
        ctx.globalAlpha = capAlpha
        ctx.fillStyle = '#2c1a0e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const fontSz = Math.max(9, Math.round(cardW * 0.058))
        ctx.font = `italic ${fontSz}px Georgia,serif`
        const maxTW = cardW - pad * 2.5
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
        const capCenterY = by + pad + photoSide + (cardH - pad - (pad + photoSide)) / 2
        visLines.forEach((l, i) => ctx.fillText(l, cx, capCenterY + (i - (visLines.length - 1) / 2) * lineH))
      } finally { ctx.restore() }
    }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawStopPhotoZoom error:', err) }
}

// ── Graph (unchanged) ──────────────────────────────────────────────────────────

export interface GraphData {
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

export interface HUDOpts {
  showTitle:boolean; title:string; showStats:boolean; coveredKm:number; totalKm:number
  alt:number; elevGain:number; showProgress:boolean; progress:number
  showBody:boolean; hrData?:GraphData; speedData?:GraphData; shotLabel?:string
  photoMarks?:number[]   // avanzamenti 0..1 delle foto, come tacche sulla barra (opzionale)
  odometer?:boolean      // cifre a rullo invece di numeri che scattano (opzionale)
}

/** Tacche delle foto sulla barra di avanzamento: al passaggio del pin la tacca "scatta" con un
 *  lampo. Il lampo è calcolato dalla DISTANZA dall'avanzamento corrente, non da un timer, così è
 *  identico a qualunque frame rate e riproducibile fotogramma per fotogramma. */
export function drawProgressMarks(
  ctx: CanvasRenderingContext2D,
  barX: number, barY: number, barW: number, barH: number, sc: number,
  marks: number[], progress: number,
) {
  try {
  ctx.save()
  try {
    for (const m of marks) {
      if (!(m >= 0 && m <= 1)) continue
      const d = progress - m
      const hit = d >= 0
      const flash = (d >= 0 && d < 0.02) ? 1 - d / 0.02 : 0
      const mx = barX + barW * m, my = barY + barH / 2
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.85
        ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.5 * sc
        ctx.beginPath(); ctx.arc(mx, my, (5 + 16 * (1 - flash)) * sc, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalAlpha = 1
      const r = (3.2 + 2.4 * flash) * sc
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.beginPath(); ctx.arc(mx, my, r + 1.4 * sc, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = hit ? '#fde047' : 'rgba(255,255,255,0.75)'
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill()
    }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawProgressMarks error:', err) }
}

export function drawHUD(ctx: CanvasRenderingContext2D, w: number, h: number, opts: HUDOpts) {
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
    if(opts.photoMarks?.length) drawProgressMarks(ctx,0,yBase,w,barH,sc,opts.photoMarks,opts.progress)
    yBase-=Math.round(20*sc)
  }
  if(opts.showStats){
    ctx.textBaseline='bottom'; ctx.font=`bold ${statSz}px -apple-system,sans-serif`; ctx.fillStyle='white'
    if(opts.odometer){
      // yBase è una baseline "bottom": il rullo disegna dall'alto, quindi si converte in cima riga
      const dH=statSz, top=yBase-dH
      const kmW=drawOdometer(ctx,opts.coveredKm,1,pad,top,dH,'left')
      ctx.textBaseline='top'; ctx.fillText(`/${opts.totalKm} km`,pad+kmW,top)
      ctx.textBaseline='bottom'
      drawOdometer(ctx,opts.alt,0,w/2,top,dH,'center')
      ctx.textBaseline='top'; ctx.fillText(' m',w/2+ctx.measureText(String(opts.alt)).width/2,top)
      ctx.textBaseline='bottom'
    } else {
      ctx.fillText(`${opts.coveredKm}/${opts.totalKm} km`,pad,yBase)
      const aT=`${opts.alt} m`; ctx.fillText(aT,(w-ctx.measureText(aT).width)/2,yBase)
    }
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

// ── Elevation profile in video HUD ────────────────────────────────────────────

export function drawVideoElevProfile(
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

// ── Fascia superiore (stile video "Carosello") ──────────────────────────────────
// Sostituisce drawHUD/l'elevazione flottante/il callout di vetta/la scheda titolo per questo
// stile: titolo, statistiche, barra di avanzamento, profilo altimetrico e grafici corpo, tutti
// consolidati in un'unica fascia in alto — sovrapposta alla mappa con una leggera trasparenza (non
// una fascia dedicata separata: la mappa resta a schermo intero sotto). Lo stile "Classico" non usa
// questa funzione: le sue schermate restano esattamente come prima.
export interface TopBandOpts {
  title?: string; showTitle: boolean; showStats: boolean; showProgress: boolean
  coveredKm: number; totalKm: number; alt: number; elevGain: number; progress: number
  altitudeSeries: number[]; peakRouteP: number
  hrData?: GraphData; speedData?: GraphData
  photoMarks?: number[]   // avanzamenti 0..1 delle foto, come tacche sulla barra (opzionale)
  odometer?: boolean      // cifre a rullo invece di numeri che scattano (opzionale)
}

export function drawTopBand(ctx: CanvasRenderingContext2D, w: number, bandH: number, sc: number, opts: TopBandOpts) {
  // Sfumato (non pieno): la mappa sotto resta visibile in trasparenza, e la fascia sfuma nel nulla
  // verso il basso invece di tagliare con un bordo netto.
  const grad = ctx.createLinearGradient(0, 0, 0, bandH)
  grad.addColorStop(0, 'rgba(6,14,20,0.62)')
  grad.addColorStop(0.75, 'rgba(6,14,20,0.5)')
  grad.addColorStop(1, 'rgba(6,14,20,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, bandH)
  const pad = Math.round(28 * sc)
  let y = pad

  if (opts.showTitle && opts.title) {
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.font = `700 ${Math.round(26 * sc)}px -apple-system,sans-serif`
    let t = opts.title
    while (ctx.measureText(t).width > w - pad * 2 && t.length > 4) t = t.slice(0, -4) + '…'
    ctx.fillText(t, w / 2, y)
    y += Math.round(34 * sc)
  }

  if (opts.showStats) {
    const fs = Math.round(22 * sc)
    ctx.textBaseline = 'top'; ctx.font = `700 ${fs}px -apple-system,sans-serif`
    ctx.textAlign = 'left'; ctx.fillStyle = 'white'
    if (opts.odometer) {
      const kmW = drawOdometer(ctx, opts.coveredKm, 1, pad, y, fs, 'left')
      ctx.fillText(`/${opts.totalKm} km`, pad + kmW, y)
      const altW = drawOdometer(ctx, opts.alt, 0, w / 2, y, fs, 'center')
      ctx.fillText(' m', w / 2 + altW / 2, y)
    } else {
      ctx.fillText(`${opts.coveredKm}/${opts.totalKm} km`, pad, y)
      ctx.textAlign = 'center'; ctx.fillText(`${opts.alt} m`, w / 2, y)
    }
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText(`+${opts.elevGain} m`, w - pad, y)
    y += Math.round(32 * sc)
  }

  if (opts.showProgress) {
    const barH = Math.max(5, Math.round(6 * sc))
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; rrect(ctx, pad, y, w - 2 * pad, barH, barH / 2); ctx.fill()
    if (opts.progress > 0) {
      ctx.fillStyle = '#3b82f6'
      rrect(ctx, pad, y, Math.max(barH, (w - 2 * pad) * opts.progress), barH, barH / 2); ctx.fill()
    }
    if (opts.photoMarks?.length) drawProgressMarks(ctx, pad, y, w - 2 * pad, barH, sc, opts.photoMarks, opts.progress)
    y += barH + Math.round(14 * sc)
  }

  if (opts.altitudeSeries.length > 1) {
    const elH = Math.round(40 * sc)
    drawVideoElevProfile(ctx, opts.altitudeSeries, opts.progress, pad, y, w - 2 * pad, elH, sc)
    const peakDist = Math.abs(opts.progress - opts.peakRouteP)
    if (peakDist < 0.042) {
      const peakAlpha = Math.pow(Math.max(0, 1 - peakDist / 0.042), 0.5)
      const maxAlt = Math.round(Math.max(...opts.altitudeSeries))
      ctx.save()
      try {
        ctx.globalAlpha = peakAlpha
        ctx.fillStyle = '#60a5fa'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.font = `700 ${Math.round(15 * sc)}px -apple-system,sans-serif`
        ctx.fillText(`▲ ${maxAlt} m`, w / 2, y + elH + Math.round(4 * sc))
      } finally { ctx.restore() }
    }
    y += elH + Math.round(16 * sc)
  }

  if (opts.hrData || opts.speedData) {
    const gh = Math.min(Math.round(74 * sc), bandH - y - pad)
    if (gh > 20) {
      if (opts.hrData && opts.speedData) {
        const gap = Math.round(14 * sc), half = Math.floor((w - 2 * pad - gap) / 2)
        drawGraph(ctx, pad, y, half, gh, sc, opts.progress, opts.hrData)
        drawGraph(ctx, pad + half + gap, y, half, gh, sc, opts.progress, opts.speedData)
      } else {
        drawGraph(ctx, pad, y, w - 2 * pad, gh, sc, opts.progress, (opts.hrData ?? opts.speedData)!)
      }
    }
  }
}

// ── Modalità "Illustrativo": schede POI e pannello TEI ─────────────────────────
// Queste due non ricevono tipi dell'app di proposito (niente PoiItem, niente TeiResult): il
// chiamante passa già stringhe e colori risolti, così questo file resta senza dipendenze dal
// modello dati e provabile da solo. La selezione di QUALI POI arrivano qui sta in
// lib/videoPoiCards.ts, che è dove vive il problema difficile (la densità).

export interface PoiCardView {
  title: string          // nome del luogo, o etichetta del tipo se manca il nome
  kind: string           // "Cascata", "Rifugio"…
  emoji: string
  color: string          // colore del tipo, da POI_META
  extra?: string         // altri luoghi del grappolo, già uniti in una riga
  blurb?: string         // una riga dall'estratto Wikipedia
  /** Immagine del luogo, già caricata e CORS-pulita dal chiamante. Quando c'è, è lei il soggetto
   *  della scheda: un nome accanto a un'icona non racconta nulla che il segnaposto sulla mappa non
   *  dica già, ed è il motivo per cui la versione precedente di questa scheda non serviva a niente. */
  image?: CanvasImageSource & { width: number; height: number }
}

/** Unica casella a schermo per le schede POI: terzo basso, larghezza piena meno i margini.
 *  Essendo l'unica posizione possibile, due schede non possono sovrapporsi — vedi la nota in testa
 *  a lib/videoPoiCards.ts. `t` copre 0..1 la vita della scheda. */
export function drawPoiCard(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, sc: number,
  card: PoiCardView, t: number,
) {
  try {
  const k = clamp01(t)
  const inT = Math.min(1, k / 0.16)
  const outT = k > 0.86 ? (k - 0.86) / 0.14 : 0
  const alpha = inT * (1 - outT)
  if (alpha <= 0.01) return
  const ease = 1 - Math.pow(1 - inT, 3)
  const slide = (1 - ease) * 54 * sc + outT * 26 * sc

  const hasImg = !!card.image && card.image.width > 0 && card.image.height > 0
  const cardW = w - 88 * sc
  const imgH  = hasImg ? 240 * sc : 0
  const textH = (card.blurb ? 128 : card.extra ? 122 : 100) * sc
  const cardH = imgH + textH
  const x = (w - cardW) / 2
  const y = h * 0.72 - cardH / 2 + slide
  const R = 24 * sc

  ctx.save()
  try {
    ctx.globalAlpha = alpha
    // Fondo pieno e opaco: la mappa sotto è viva e mossa, e un pannello troppo trasparente rende
    // il testo illeggibile proprio nei fotogrammi in cui passa un crinale chiaro.
    ctx.fillStyle = 'rgba(8,18,26,0.9)'
    rrect(ctx, x, y, cardW, cardH, R); ctx.fill()

    if (hasImg) {
      // Foto ritagliata a riempire la fascia superiore, angoli alti arrotondati come la scheda
      ctx.save()
      try {
        ctx.beginPath()
        ctx.moveTo(x, y + imgH)
        ctx.lineTo(x, y + R); ctx.arcTo(x, y, x + R, y, R)
        ctx.lineTo(x + cardW - R, y); ctx.arcTo(x + cardW, y, x + cardW, y + R, R)
        ctx.lineTo(x + cardW, y + imgH)
        ctx.closePath(); ctx.clip()
        const src = aspectFitCrop(card.image!.width, card.image!.height, cardW / imgH)
        ctx.drawImage(card.image!, src.sx, src.sy, src.sw, src.sh, x, y, cardW, imgH)
        // Sfumatura in basso: il testo sotto stacca dalla foto senza una riga netta
        const g = ctx.createLinearGradient(0, y + imgH * 0.55, 0, y + imgH)
        g.addColorStop(0, 'rgba(8,18,26,0)'); g.addColorStop(1, 'rgba(8,18,26,0.92)')
        ctx.fillStyle = g; ctx.fillRect(x, y + imgH * 0.55, cardW, imgH * 0.45)
      } finally { ctx.restore() }
    }

    // Costa colorata del tipo di luogo, lungo tutto il fianco sinistro
    ctx.fillStyle = card.color
    rrect(ctx, x, y, 7 * sc, cardH, 3.5 * sc); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.5 * sc
    rrect(ctx, x, y, cardW, cardH, R); ctx.stroke()

    const padL = x + 30 * sc
    const maxTextW = cardW - 60 * sc
    let ty = y + imgH + 24 * sc
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'

    // Tipo del luogo, in piccolo e nel colore del tipo
    ctx.fillStyle = card.color
    ctx.font = `800 ${Math.round(15 * sc)}px -apple-system,sans-serif`
    ctx.fillText(`${card.emoji}  ${card.kind.toUpperCase()}`, padL, ty)
    ty += 22 * sc

    ctx.fillStyle = 'white'
    ctx.font = `800 ${Math.round(31 * sc)}px -apple-system,sans-serif`
    let title = card.title
    while (ctx.measureText(title).width > maxTextW && title.length > 4) title = title.slice(0, -4) + '…'
    ctx.fillText(title, padL, ty)
    ty += 40 * sc

    if (card.blurb) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)'
      ctx.font = `500 ${Math.round(17 * sc)}px -apple-system,sans-serif`
      let bl = card.blurb
      while (ctx.measureText(bl).width > maxTextW && bl.length > 4) bl = bl.slice(0, -4) + '…'
      ctx.fillText(bl, padL, ty)
      ty += 24 * sc
    }
    if (card.extra) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.font = `600 ${Math.round(15 * sc)}px -apple-system,sans-serif`
      let ex = card.extra
      while (ctx.measureText(ex).width > maxTextW && ex.length > 4) ex = ex.slice(0, -4) + '…'
      ctx.fillText(ex, padL, ty)
    }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawPoiCard error:', err) }
}

export interface TeiPart { label: string; value: number }   // value 0..1

/** Pannello del punteggio TEI: il numero, poi le cinque componenti che si riempiono a scalare, poi
 *  la penalità antropica che SOTTRAE — l'unica barra che cresce verso sinistra, così si legge a
 *  colpo d'occhio che è un malus e non un merito. */
export function drawTeiPanel(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, sc: number,
  data: { score: number; label: string; color: string; parts: TeiPart[]; penalty?: TeiPart },
  t: number,
) {
  try {
  const k = clamp01(t)
  const alpha = Math.min(1, k / 0.10) * (k > 0.92 ? Math.max(0, 1 - (k - 0.92) / 0.08) : 1)
  if (alpha <= 0.01) return

  ctx.save()
  try {
    ctx.globalAlpha = alpha
    ctx.fillStyle = 'rgba(6,14,20,0.82)'; ctx.fillRect(0, 0, w, h)

    const cx = w / 2
    let y = h * 0.26

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `800 ${Math.round(18 * sc)}px -apple-system,sans-serif`
    ctx.fillText('QUANTO VALE QUESTO PERCORSO', cx, y - 62 * sc)

    // Il punteggio sale da 0 al valore reale: un numero che si compone tiene lo sguardo
    const shown = data.score * (1 - Math.pow(1 - Math.min(1, k / 0.32), 3))
    ctx.fillStyle = data.color
    ctx.font = `900 ${Math.round(104 * sc)}px -apple-system,sans-serif`
    ctx.fillText(shown.toFixed(1), cx, y)
    ctx.fillStyle = 'white'
    ctx.font = `800 ${Math.round(26 * sc)}px -apple-system,sans-serif`
    ctx.fillText(data.label, cx, y + 68 * sc)

    // Le cinque componenti, una dopo l'altra
    y = h * 0.47
    const barW = w - 150 * sc, barX = (w - barW) / 2, rowH = 46 * sc
    ctx.textBaseline = 'middle'
    data.parts.forEach((p, i) => {
      const d = 0.30 + i * 0.06
      const f = clamp01((k - d) / 0.22)
      const fill = (1 - Math.pow(1 - f, 3)) * clamp01(p.value)
      const ry = y + i * rowH
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.font = `700 ${Math.round(17 * sc)}px -apple-system,sans-serif`
      ctx.fillText(p.label, barX, ry)
      const tw = 128 * sc, tx = barX + tw
      const tBarW = barW - tw
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      rrect(ctx, tx, ry - 7 * sc, tBarW, 14 * sc, 7 * sc); ctx.fill()
      if (fill > 0.001) {
        ctx.fillStyle = data.color
        rrect(ctx, tx, ry - 7 * sc, Math.max(14 * sc, tBarW * fill), 14 * sc, 7 * sc); ctx.fill()
      }
    })

    if (data.penalty) {
      const ry = y + data.parts.length * rowH + 12 * sc
      const f = clamp01((k - 0.30 - data.parts.length * 0.06) / 0.22)
      const fill = (1 - Math.pow(1 - f, 3)) * clamp01(data.penalty.value)
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(248,113,113,0.9)'
      ctx.font = `700 ${Math.round(17 * sc)}px -apple-system,sans-serif`
      ctx.fillText(data.penalty.label, barX, ry)
      const tw = 128 * sc, tx = barX + tw, tBarW = barW - tw
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      rrect(ctx, tx, ry - 7 * sc, tBarW, 14 * sc, 7 * sc); ctx.fill()
      if (fill > 0.001) {
        // Cresce da destra verso sinistra: toglie, non aggiunge
        const pw = Math.max(14 * sc, tBarW * fill)
        ctx.fillStyle = '#ef4444'
        rrect(ctx, tx + tBarW - pw, ry - 7 * sc, pw, 14 * sc, 7 * sc); ctx.fill()
      }
    }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawTeiPanel error:', err) }
}

/** Carta d'identità del percorso: i numeri oggettivi, quelli che valgono per chiunque lo faccia
 *  (niente CTS: è tarato sulla persona, non descrive il sentiero). */
export function drawIdentikit(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, sc: number,
  title: string, rows: { k: string; v: string }[], t: number,
) {
  try {
  const k = clamp01(t)
  const alpha = Math.min(1, k / 0.12) * (k > 0.9 ? Math.max(0, 1 - (k - 0.9) / 0.1) : 1)
  if (alpha <= 0.01) return
  ctx.save()
  try {
    ctx.globalAlpha = alpha
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(6,14,20,0.35)'); grad.addColorStop(1, 'rgba(6,14,20,0.85)')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h)

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'white'
    ctx.font = `900 ${Math.round(46 * sc)}px -apple-system,sans-serif`
    let tt = title
    while (ctx.measureText(tt).width > w - 110 * sc && tt.length > 4) tt = tt.slice(0, -4) + '…'
    ctx.fillText(tt, w / 2, h * 0.30)

    const cols = 2, cellW = (w - 130 * sc) / cols, x0 = 65 * sc
    rows.forEach((r, i) => {
      const d = 0.16 + i * 0.07
      const f = clamp01((k - d) / 0.2)
      if (f <= 0.01) return
      const ease = 1 - Math.pow(1 - f, 3)
      const cx = x0 + (i % cols) * cellW + cellW / 2
      const cy = h * 0.44 + Math.floor(i / cols) * 108 * sc + (1 - ease) * 22 * sc
      ctx.globalAlpha = alpha * ease
      ctx.fillStyle = 'white'
      ctx.font = `900 ${Math.round(40 * sc)}px -apple-system,sans-serif`
      ctx.fillText(r.v, cx, cy)
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.font = `700 ${Math.round(15 * sc)}px -apple-system,sans-serif`
      ctx.fillText(r.k.toUpperCase(), cx, cy + 32 * sc)
    })
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawIdentikit error:', err) }
}

// ── Stacchi: pannelli che fermano il volo per far leggere i dati ───────────────
// Convenzione condivisa: `t` 0..1 sulla vita del pannello, entrata/uscita gestite qui dentro.
// Tutti si appoggiano a questo fondale comune invece di ridisegnarselo, così gli stacchi si
// somigliano tra loro e si distinguono a colpo d'occhio dal volo sul percorso.

/** Fondale + titolo di uno stacco. Ritorna l'opacità e la `y` da cui il contenuto può partire.
 *  `contentH` serve a CENTRARE il blocco: su un 9:16 un pannello ancorato in alto lascia due terzi
 *  di vuoto sotto, e uno stacco pieno di vuoto sembra un errore invece di una scelta. */
function beatFrame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, sc: number,
  title: string, t: number, contentH: number,
): { alpha: number; y: number } | null {
  const k = clamp01(t)
  const alpha = Math.min(1, k / 0.10) * (k > 0.9 ? Math.max(0, 1 - (k - 0.9) / 0.1) : 1)
  if (alpha <= 0.01) return null
  ctx.globalAlpha = alpha
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(6,14,20,0.93)'); g.addColorStop(1, 'rgba(4,10,15,0.97)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  const HEAD = 74 * sc
  const top = Math.max(h * 0.12, (h - (HEAD + contentH)) / 2)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = `800 ${Math.round(17 * sc)}px -apple-system,sans-serif`
  ctx.fillText(title.toUpperCase(), w / 2, top)
  ctx.fillStyle = '#e08d3c'
  rrect(ctx, w / 2 - 22 * sc, top + 20 * sc, 44 * sc, 3 * sc, 1.5 * sc); ctx.fill()
  return { alpha, y: top + HEAD }
}

/** Altezza di una griglia di statistiche a `cols` colonne. */
function statsHeight(n: number, sc: number, cols = 2): number {
  return Math.ceil(n / cols) * 104 * sc
}

/** Voci grandi con etichetta sotto, in griglia — entrano a scalare. */
function beatStats(
  ctx: CanvasRenderingContext2D,
  w: number, sc: number, yTop: number, alpha: number, k: number,
  rows: { k: string; v: string }[], cols = 2,
) {
  const cellW = (w - 130 * sc) / cols, x0 = 65 * sc
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  rows.forEach((r, i) => {
    const f = clamp01((k - (0.16 + i * 0.07)) / 0.2)
    if (f <= 0.01) return
    const ease = 1 - Math.pow(1 - f, 3)
    const cx = x0 + (i % cols) * cellW + cellW / 2
    const cy = yTop + Math.floor(i / cols) * 104 * sc + (1 - ease) * 20 * sc
    ctx.globalAlpha = alpha * ease
    ctx.fillStyle = 'white'
    ctx.font = `900 ${Math.round(42 * sc)}px -apple-system,sans-serif`
    ctx.fillText(r.v, cx, cy)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = `700 ${Math.round(14 * sc)}px -apple-system,sans-serif`
    ctx.fillText(r.k.toUpperCase(), cx, cy + 32 * sc)
  })
  ctx.globalAlpha = alpha
}

export function drawNumbersBeat(
  ctx: CanvasRenderingContext2D, w: number, h: number, sc: number,
  rows: { k: string; v: string }[], t: number,
) {
  try {
  ctx.save()
  try {
    const f = beatFrame(ctx, w, h, sc, 'Il percorso in breve', t, statsHeight(rows.length, sc))
    if (!f) return
    beatStats(ctx, w, sc, f.y + 30 * sc, f.alpha, clamp01(t), rows)
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawNumbersBeat error:', err) }
}

/** Profilo altimetrico che si disegna da sinistra a destra mentre lo stacco avanza. */
export function drawElevationBeat(
  ctx: CanvasRenderingContext2D, w: number, h: number, sc: number,
  series: number[], rows: { k: string; v: string }[], t: number,
) {
  try {
  ctx.save()
  try {
    if (series.length < 2) return
    const gh = 230 * sc
    const f = beatFrame(ctx, w, h, sc, 'Il profilo', t, gh + 60 * sc + statsHeight(rows.length, sc))
    if (!f) return
    const k = clamp01(t)
    const gx = 70 * sc, gw = w - 140 * sc, gy = f.y, gh2 = gh
    const minA = Math.min(...series), maxA = Math.max(...series), range = maxA - minA || 1
    const drawn = 1 - Math.pow(1 - clamp01((k - 0.1) / 0.45), 3)
    const upTo = Math.max(1, Math.round(drawn * (series.length - 1)))
    const px = (i: number) => gx + (i / (series.length - 1)) * gw
    const py = (i: number) => gy + gh2 - ((series[i] - minA) / range) * gh2 * 0.9
    // Profilo intero appena accennato: si capisce subito quanto manca da vedere
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2 * sc
    ctx.beginPath()
    for (let i = 0; i < series.length; i++) i === 0 ? ctx.moveTo(px(i), py(i)) : ctx.lineTo(px(i), py(i))
    ctx.stroke()
    // Parte già "percorsa" dallo stacco, piena
    const ag = ctx.createLinearGradient(0, gy, 0, gy + gh2)
    ag.addColorStop(0, 'rgba(224,141,60,0.45)'); ag.addColorStop(1, 'rgba(224,141,60,0.03)')
    ctx.beginPath(); ctx.moveTo(px(0), gy + gh2)
    for (let i = 0; i <= upTo; i++) ctx.lineTo(px(i), py(i))
    ctx.lineTo(px(upTo), gy + gh2); ctx.closePath()
    ctx.fillStyle = ag; ctx.fill()
    ctx.strokeStyle = '#e08d3c'; ctx.lineWidth = 3.5 * sc; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i <= upTo; i++) i === 0 ? ctx.moveTo(px(i), py(i)) : ctx.lineTo(px(i), py(i))
    ctx.stroke()
    ctx.fillStyle = 'white'
    ctx.beginPath(); ctx.arc(px(upTo), py(upTo), 6 * sc, 0, Math.PI * 2); ctx.fill()
    beatStats(ctx, w, sc, gy + gh2 + 78 * sc, f.alpha, k, rows)
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawElevationBeat error:', err) }
}

export function drawNatureBeat(
  ctx: CanvasRenderingContext2D, w: number, h: number, sc: number,
  data: { belt: string; description: string; extra?: { k: string; v: string }[] }, t: number,
) {
  try {
  ctx.save()
  try {
    const contentH = 170 * sc + (data.extra?.length ? statsHeight(data.extra.length, sc) : 0)
    const f = beatFrame(ctx, w, h, sc, 'La natura intorno', t, contentH)
    if (!f) return
    const k = clamp01(t)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#8cc894'
    ctx.font = `900 ${Math.round(40 * sc)}px -apple-system,sans-serif`
    ctx.fillText(data.belt, w / 2, f.y)
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = `500 ${Math.round(21 * sc)}px -apple-system,sans-serif`
    wrapCentered(ctx, data.description, w / 2, f.y + 62 * sc, w - 150 * sc, 32 * sc, 4, clamp01((k - 0.14) / 0.3))
    if (data.extra?.length) beatStats(ctx, w, sc, f.y + 230 * sc, f.alpha, k, data.extra)
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawNatureBeat error:', err) }
}

/** Avvisi dalla guida. La data di verifica NON è decorativa: un video resta e circola, e chi lo
 *  guarda mesi dopo deve poter capire quanto è vecchia la notizia di una chiusura. */
export function drawNoticesBeat(
  ctx: CanvasRenderingContext2D, w: number, h: number, sc: number,
  data: { notices: { severity: 'danger' | 'warning' | 'info'; text: string }[]; verifiedOn?: string }, t: number,
) {
  try {
  ctx.save()
  try {
    const k = clamp01(t)
    const COL = { danger: '#e24b4a', warning: '#e08d3c', info: '#378add' }
    const ICON = { danger: '!', warning: '!', info: 'i' }
    const bx = 62 * sc, bw = w - 124 * sc
    // Le altezze si misurano PRIMA di disegnare il fondale: servono a beatFrame per centrare il
    // blocco, e dipendono da quante righe occupa ogni avviso una volta mandato a capo.
    ctx.font = `500 ${Math.round(20 * sc)}px -apple-system,sans-serif`
    const items = data.notices.slice(0, 3).map(n => {
      const lines = wrapLines(ctx, n.text, bw - 76 * sc, 3)
      return { n, lines, boxH: Math.max(66 * sc, lines.length * 28 * sc + 38 * sc) }
    })
    const contentH = items.reduce((sum, it) => sum + it.boxH + 16 * sc, 0) + (data.verifiedOn ? 46 * sc : 0)
    const f = beatFrame(ctx, w, h, sc, 'Da sapere prima di andare', t, contentH)
    if (!f) return
    let y = f.y
    items.forEach(({ n, lines, boxH }, i) => {
      const fIn = clamp01((k - (0.12 + i * 0.1)) / 0.24)
      if (fIn <= 0.01) { y += boxH + 16 * sc; return }
      const ease = 1 - Math.pow(1 - fIn, 3)
      ctx.globalAlpha = f.alpha * ease
      const col = COL[n.severity] ?? COL.info
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.font = `500 ${Math.round(20 * sc)}px -apple-system,sans-serif`
      const by = y + (1 - ease) * 18 * sc
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      rrect(ctx, bx, by, bw, boxH, 16 * sc); ctx.fill()
      ctx.fillStyle = col
      rrect(ctx, bx, by, 6 * sc, boxH, 3 * sc); ctx.fill()
      ctx.fillStyle = col
      ctx.beginPath(); ctx.arc(bx + 40 * sc, by + 32 * sc, 15 * sc, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#06111a'; ctx.textAlign = 'center'
      ctx.font = `900 ${Math.round(19 * sc)}px -apple-system,sans-serif`
      ctx.fillText(ICON[n.severity] ?? 'i', bx + 40 * sc, by + 22 * sc)
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = `500 ${Math.round(20 * sc)}px -apple-system,sans-serif`
      lines.forEach((l, li) => ctx.fillText(l, bx + 68 * sc, by + 18 * sc + li * 28 * sc))
      y += boxH + 16 * sc
    })
    if (data.verifiedOn) {
      ctx.globalAlpha = f.alpha * clamp01((k - 0.4) / 0.25)
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.42)'
      ctx.font = `600 ${Math.round(15 * sc)}px -apple-system,sans-serif`
      ctx.fillText(`Verificato il ${data.verifiedOn} — potrebbe essere cambiato`, w / 2, y + 18 * sc)
    }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawNoticesBeat error:', err) }
}

export function drawPlacesBeat(
  ctx: CanvasRenderingContext2D, w: number, h: number, sc: number,
  places: { name: string; kind: string; emoji: string; color: string }[], t: number,
) {
  try {
  ctx.save()
  try {
    const shown = places.slice(0, 5)
    const f = beatFrame(ctx, w, h, sc, 'Cosa incontri', t, shown.length * 84 * sc)
    if (!f) return
    const k = clamp01(t)
    const bx = 66 * sc, bw = w - 132 * sc
    shown.forEach((pl, i) => {
      const fIn = clamp01((k - (0.12 + i * 0.08)) / 0.24)
      if (fIn <= 0.01) return
      const ease = 1 - Math.pow(1 - fIn, 3)
      ctx.globalAlpha = f.alpha * ease
      const by = f.y + i * 84 * sc + (1 - ease) * 20 * sc
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      rrect(ctx, bx, by, bw, 68 * sc, 16 * sc); ctx.fill()
      ctx.fillStyle = pl.color
      ctx.beginPath(); ctx.arc(bx + 44 * sc, by + 34 * sc, 22 * sc, 0, Math.PI * 2); ctx.fill()
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = `${Math.round(22 * sc)}px -apple-system,sans-serif`
      ctx.fillText(pl.emoji, bx + 44 * sc, by + 36 * sc)
      ctx.textAlign = 'left'
      ctx.fillStyle = pl.color
      ctx.font = `800 ${Math.round(13 * sc)}px -apple-system,sans-serif`
      ctx.fillText(pl.kind.toUpperCase(), bx + 80 * sc, by + 24 * sc)
      ctx.fillStyle = 'white'
      ctx.font = `800 ${Math.round(24 * sc)}px -apple-system,sans-serif`
      let nm = pl.name
      while (ctx.measureText(nm).width > bw - 110 * sc && nm.length > 4) nm = nm.slice(0, -4) + '…'
      ctx.fillText(nm, bx + 80 * sc, by + 48 * sc)
    })
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawPlacesBeat error:', err) }
}

/** Spezza un testo in righe che stanno in `maxW`, al massimo `maxLines` (l'ultima con i puntini). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur); cur = wd
      if (lines.length === maxLines) break
    } else cur = test
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  if (lines.length === maxLines && cur && lines[maxLines - 1] !== cur) {
    let last = lines[maxLines - 1]
    while (ctx.measureText(last + '…').width > maxW && last.length > 4) last = last.slice(0, -2)
    lines[maxLines - 1] = last + '…'
  }
  return lines
}

/** Testo centrato su più righe, che compaiono una dopo l'altra. */
function wrapCentered(
  ctx: CanvasRenderingContext2D, text: string,
  cx: number, y: number, maxW: number, lineH: number, maxLines: number, reveal: number,
) {
  const lines = wrapLines(ctx, text, maxW, maxLines)
  const shown = Math.ceil(clamp01(reveal) * lines.length)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  lines.slice(0, shown).forEach((l, i) => ctx.fillText(l, cx, y + i * lineH))
}
