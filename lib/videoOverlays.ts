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
  return (a + shortestAngleTo(a, b) * t + 360) % 360
}

/** Rotazione con segno (-180..180) da `from` a `to` percorrendo il verso più corto. Serve ovunque
 *  si voglia arrivare a un orientamento preciso senza far girare la telecamera dalla parte lunga —
 *  es. il raddrizzamento a nord dello zoom out finale in components/RouteMap3D.tsx. */
export function shortestAngleTo(from: number, to: number): number {
  return ((to - from) % 360 + 540) % 360 - 180
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

// ── Zone sicure dei social ─────────────────────────────────────────────────────
// Su Reels/TikTok/Shorts l'interfaccia dell'app copre stabilmente il fotogramma: didascalia, nome
// utente e pulsanti in basso, indicatori in alto, colonna di azioni a destra. Tutto ciò che
// finisce lì sotto è, di fatto, non pubblicato — e su un 9:16 è esattamente dove sta un HUD
// disegnato "al bordo".
//
// Questi margini sono frazioni dell'altezza/larghezza e si applicano SOLO ai formati verticali:
// su 16:9 (YouTube) o 1:1 nessuno copre niente, e restringere lì sprecherebbe spazio.
export interface SafeInsets { top: number; bottom: number; left: number; right: number }

const NO_INSETS: SafeInsets = { top: 0, bottom: 0, left: 0, right: 0 }

/** Margini in PIXEL per una tela w×h. Verticale = 9:16 e simili (rapporto sotto ~0.65). */
export function safeInsetsFor(w: number, h: number): SafeInsets {
  const vertical = w / h < 0.65
  if (!vertical) return NO_INSETS
  return {
    top: Math.round(h * 0.12),
    bottom: Math.round(h * 0.20),
    left: Math.round(w * 0.04),
    right: Math.round(w * 0.14),   // la colonna dei pulsanti sta a destra
  }
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

/** Segnaposto di posizione da usare al posto del pin quando l'utente lo spegne: senza di esso non
 *  si capisce più a che punto del percorso si è, perché la telecamera è sempre centrata e il
 *  tracciato colorato finisce esattamente al centro. Pulsa lentamente col colore del percorso, così
 *  si distingue dal tracciato pur essendone evidentemente la punta. `phase` 0..1 è ciclica. */
export function drawPositionDot(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, sc: number, color: string, phase: number,
) {
  try {
  // sin² invece di sin: resta più a lungo "acceso" e passa in fretta dal minimo, che a schermo si
  // legge come un battito e non come una dissolvenza continua
  const puls = Math.pow(Math.sin(clamp01(phase) * Math.PI * 2) * 0.5 + 0.5, 2)
  ctx.save()
  try {
    // Alone che si espande e sfuma: dà la pulsazione senza far cambiare taglia al punto vero,
    // che deve restare fermo perché è lui a indicare la posizione esatta
    const haloR = (20 + 24 * puls) * sc
    ctx.globalAlpha = 0.30 * (1 - puls)
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 0.55 + 0.45 * puls
    ctx.strokeStyle = color; ctx.lineWidth = 3 * sc
    ctx.beginPath(); ctx.arc(cx, cy, 18 * sc, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = 'white'
    ctx.beginPath(); ctx.arc(cx, cy, 13 * sc, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(cx, cy, 9.5 * sc, 0, Math.PI * 2); ctx.fill()
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawPositionDot error:', err) }
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

// ── Quota massima raggiunta (opzionale) ────────────────────────────────────────
/** Un solo momento in tutto il video, al punto più alto: lampo, raggi che si aprono dal pin e la
 *  quota in grande. "Quota massima" e non "vetta": il punto più alto di un tracciato è quasi mai
 *  una cima, e su un anello di fondovalle chiamarlo vetta sarebbe semplicemente falso.
 *  `t` copre 0..1 l'intero momento. */
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
    ctx.font = `900 ${Math.round(34*sc)}px -apple-system,sans-serif`
    ctx.strokeStyle = 'rgba(6,20,32,0.92)'; ctx.lineWidth = 7*sc
    ctx.strokeText('▲ QUOTA MAX', 0, -70*sc); ctx.fillStyle = '#fde047'; ctx.fillText('▲ QUOTA MAX', 0, -70*sc)
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

export interface StopPhoto { img: HTMLImageElement; caption?: string; id: string }

/** Sfalsamenti per gruppi di polaroid "sparpagliate sul tavolo", espressi in frazioni della
 *  LARGHEZZA DELLA CARD (non dello schermo): così restano corretti qualunque sia la dimensione a
 *  cui le card si aprono, e crescono insieme a loro durante l'apertura.
 *
 *  Fissi e scelti a mano invece che casuali: vanno abbastanza distanti da non coprirsi il centro a
 *  vicenda — è lì che sta il soggetto della foto — e un posizionamento casuale ci riesce raramente. */
const POLAROID_SCATTER: [number, number][][] = [
  [[0, 0]],
  [[-0.52, -0.06], [0.52, 0.06]],
  [[-0.64, -0.08], [0.00, 0.10], [0.64, -0.05]],
  [[-0.74, -0.12], [-0.25, 0.12], [0.25, -0.10], [0.74, 0.14]],
]

/** Una singola polaroid, già posizionata e ruotata dal chiamante. */
function drawOnePolaroid(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, cardW: number, rotRad: number, sc: number,
  img: HTMLImageElement, caption: string | undefined, zoomT: number, showCaption: boolean,
) {
  const cardH = cardW * (1 + POLAROID_CAP_FRAC)
  const pad = cardW * POLAROID_PAD_FRAC
  const photoSide = cardW - pad * 2
  const bx = cx - cardW / 2, by = cy - cardH / 2
  const r = Math.max(2 * sc, 8 * sc * zoomT)
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
    if (showCaption && caption && zoomT > 0.55) {
      ctx.save()
      try {
        ctx.globalAlpha = Math.min(1, (zoomT - 0.55) / 0.25)
        ctx.fillStyle = '#2c1a0e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const fontSz = Math.max(9, Math.round(cardW * 0.058))
        ctx.font = `italic ${fontSz}px Georgia,serif`
        const lines = wrapLines(ctx, caption, cardW - pad * 2.5, 2)
        const lineH = fontSz * 1.35
        const capCenterY = by + pad + photoSide + (cardH - pad - (pad + photoSide)) / 2
        lines.forEach((l, i) => ctx.fillText(l, cx, capCenterY + (i - (lines.length - 1) / 2) * lineH))
      } finally { ctx.restore() }
    }
  } finally { ctx.restore() }
}

/** Sosta su una o più foto. Con più foto si aprono INSIEME, sparpagliate come polaroid posate su un
 *  tavolo: foto scattate a pochi metri l'una dall'altra sono lo stesso momento, e mostrarle una
 *  dopo l'altra darebbe tre interruzioni di fila dove ne basta una. */
export function drawStopPhotoZoom(
  ctx: CanvasRenderingContext2D,
  outW: number, outH: number, sc: number,
  photos: StopPhoto[], zoomT: number, stopT: number,
) {
  try {
  const ready = photos.filter(ph => ph.img.complete && ph.img.naturalWidth > 0)
  if (ready.length === 0) return
  const shown = ready.slice(0, 4)
  const extra = ready.length - shown.length
  const n = shown.length

  // Con più card la singola si stringe, altrimenti il gruppo esce dallo schermo
  const spread = 1 - 0.18 * (n - 1)
  const peakW = Math.min(outW * 0.82, (outH * 0.72) / (1 + POLAROID_CAP_FRAC)) * spread
  const pinPx = Math.round(70 * sc)
  const cardW = pinPx + (peakW - pinPx) * zoomT
  // Leggero respiro quando è aperta (non un fermo immagine assoluto) — una lenta deriva, stessa
  // idea del Ken Burns già usato per la rivelazione a schermo intero dello stile Classico.
  const breathe = zoomT > 0.995 ? Math.sin(stopT * Math.PI * 2.4) * 0.008 : 0
  const cx0 = outW / 2 + outW * breathe, cy0 = outH / 2

  // La mappa si scurisce leggermente dietro le card mentre si aprono (effetto "riflettore") — le
  // rende leggibili come una scelta deliberata, non un frame corrotto.
  if (zoomT > 0.02) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.4, zoomT * 0.45)})`
    ctx.fillRect(0, 0, outW, outH)
  }

  const scatter = POLAROID_SCATTER[n - 1]
  shown.forEach((ph, i) => {
    const [ox, oy] = scatter[i]
    // Sfalsamento in unità di card: crescendo cardW con l'apertura, partono sovrapposte sul pin e
    // si distribuiscono da sole mentre si aprono, senza bisogno di interpolare a parte.
    const cx = cx0 + ox * cardW
    const cy = cy0 + oy * cardW
    // Rotazione propria della foto (sempre la stessa per la stessa foto) più un ventaglio di gruppo
    const fan = n > 1 ? (i - (n - 1) / 2) * 3.5 : 0
    const rotRad = (polaroidRotationDeg(ph.id) + fan) * Math.PI / 180 * zoomT
    // Con tre o più card la didascalia diventa illeggibile: resta la cornice, che basta a farle
    // leggere come polaroid
    drawOnePolaroid(ctx, cx, cy, cardW, rotRad, sc, ph.img, ph.caption, zoomT, n <= 2)
  })

  if (extra > 0 && zoomT > 0.6) {
    ctx.save()
    try {
      ctx.globalAlpha = Math.min(1, (zoomT - 0.6) / 0.25)
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = `700 ${Math.round(20 * sc)}px -apple-system,sans-serif`
      ctx.fillText(`+${extra}`, cx0, cy0 + peakW * 0.68)
    } finally { ctx.restore() }
  }
  } catch (err) { console.error('[dtrek] drawStopPhotoZoom error:', err) }
}

// ── Graph (unchanged) ──────────────────────────────────────────────────────────



// ── HUD overlay ────────────────────────────────────────────────────────────────

export interface HUDOpts {
  showTitle:boolean; title:string; showStats:boolean; coveredKm:number; totalKm:number
  alt:number; elevGain:number; showProgress:boolean; progress:number
  shotLabel?:string
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
  const sc=Math.min(w,h)/1080, lineH=Math.round(52*sc)
  // Il riempimento laterale non scende mai sotto il margine sicuro: su 9:16 un HUD "al bordo"
  // finisce sotto i pulsanti dell'app e tanto vale non averlo disegnato.
  const ins=safeInsetsFor(w,h)
  const pad=Math.max(Math.round(40*sc), ins.left)
  const statSz=Math.round(32*sc), labelSz=Math.round(22*sc), brandSz=Math.round(22*sc)
  const gradTop=h*0.62-ins.bottom*0.5
  const grad=ctx.createLinearGradient(0,gradTop,0,h)
  grad.addColorStop(0,'rgba(0,0,0,0)'); grad.addColorStop(0.28,'rgba(0,0,0,0.45)'); grad.addColorStop(0.60,'rgba(0,0,0,0.80)'); grad.addColorStop(1,'rgba(0,0,0,0.93)')
  ctx.fillStyle=grad; ctx.fillRect(0,gradTop,w,h-gradTop)
  ctx.textAlign='left'; let yBase=h-Math.max(pad,ins.bottom)
  if(opts.showProgress){
    const barH=Math.max(6,Math.round(8*sc)); yBase-=barH
    const barX=ins.left, barW=w-ins.left-ins.right
    ctx.fillStyle='rgba(255,255,255,0.22)'; rrect(ctx,barX,yBase,barW,barH,barH/2); ctx.fill()
    if(opts.progress>0){ctx.fillStyle='#3b82f6';rrect(ctx,barX,yBase,Math.max(barH,barW*opts.progress),barH,barH/2);ctx.fill()}
    if(opts.photoMarks?.length) drawProgressMarks(ctx,barX,yBase,barW,barH,sc,opts.photoMarks,opts.progress)
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
      const altW=drawOdometer(ctx,opts.alt,0,(w-ins.right+ins.left)/2,top,dH,'center')
      ctx.textBaseline='top'; ctx.fillText(' m',(w-ins.right+ins.left)/2+altW/2,top)
      ctx.textBaseline='bottom'
    } else {
      ctx.fillText(`${opts.coveredKm}/${opts.totalKm} km`,pad,yBase)
      const aT=`${opts.alt} m`; ctx.fillText(aT,(w-ins.right+ins.left-ctx.measureText(aT).width)/2,yBase)
    }
    ctx.fillStyle='rgba(255,255,255,0.82)'; const gT=`+${opts.elevGain} m`
    ctx.fillText(gT,w-ctx.measureText(gT).width-Math.max(pad,ins.right),yBase); yBase-=lineH
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
  ctx.textBaseline='bottom'; ctx.font=`bold ${brandSz}px -apple-system,sans-serif`; ctx.fillStyle='rgba(255,255,255,0.38)'
  // Ancorato AL margine sicuro, non a un offset dal fondo: su 9:16 il fondo è coperto dall'app.
  const brand='DTrek'
  ctx.fillText(brand,w-ctx.measureText(brand).width-Math.max(pad,ins.right),h-ins.bottom-Math.round(10*sc))
}

// ── Elevation profile in video HUD ────────────────────────────────────────────


// ── Fascia superiore (stile video "Carosello") ──────────────────────────────────
// Sostituisce drawHUD/l'elevazione flottante/il callout di vetta/la scheda titolo per questo
// stile: titolo, statistiche, barra di avanzamento, profilo altimetrico e grafici corpo, tutti
// consolidati in un'unica fascia in alto — sovrapposta alla mappa con una leggera trasparenza (non
// una fascia dedicata separata: la mappa resta a schermo intero sotto). Lo stile "Classico" non usa
// questa funzione: le sue schermate restano esattamente come prima.
export interface TopBandOpts {
  title?: string; showTitle: boolean; showStats: boolean; showProgress: boolean
  coveredKm: number; totalKm: number; alt: number; elevGain: number; progress: number
  photoMarks?: number[]   // avanzamenti 0..1 delle foto, come tacche sulla barra (opzionale)
  odometer?: boolean      // cifre a rullo invece di numeri che scattano (opzionale)
  /** Margini coperti dall'interfaccia social — vedi safeInsetsFor. Questa funzione riceve solo
   *  l'altezza della FASCIA, non quella della tela, quindi non può ricavarli da sé. */
  insets?: SafeInsets
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
  const ins = opts.insets ?? NO_INSETS
  const pad = Math.max(Math.round(28 * sc), ins.left)
  let y = Math.max(Math.round(28 * sc), ins.top)

  if (opts.showTitle && opts.title) {
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.font = `700 ${Math.round(26 * sc)}px -apple-system,sans-serif`
    let t = opts.title
    const titleMaxW = w - pad - Math.max(pad, ins.right)
    while (ctx.measureText(t).width > titleMaxW && t.length > 4) t = t.slice(0, -4) + '…'
    ctx.fillText(t, (pad + (w - Math.max(pad, ins.right))) / 2, y)
    y += Math.round(34 * sc)
  }

  if (opts.showStats) {
    const fs = Math.round(22 * sc)
    ctx.textBaseline = 'top'; ctx.font = `700 ${fs}px -apple-system,sans-serif`
    ctx.textAlign = 'left'; ctx.fillStyle = 'white'
    if (opts.odometer) {
      const mid = (pad + (w - Math.max(pad, ins.right))) / 2
      const kmW = drawOdometer(ctx, opts.coveredKm, 1, pad, y, fs, 'left')
      ctx.fillText(`/${opts.totalKm} km`, pad + kmW, y)
      const altW = drawOdometer(ctx, opts.alt, 0, mid, y, fs, 'center')
      ctx.fillText(' m', mid + altW / 2, y)
    } else {
      const mid = (pad + (w - Math.max(pad, ins.right))) / 2
      ctx.fillText(`${opts.coveredKm}/${opts.totalKm} km`, pad, y)
      ctx.textAlign = 'center'; ctx.fillText(`${opts.alt} m`, mid, y)
    }
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText(`+${opts.elevGain} m`, w - Math.max(pad, ins.right), y)
    y += Math.round(32 * sc)
  }

  if (opts.showProgress) {
    const barH = Math.max(5, Math.round(6 * sc))
    const barX = pad, barW = w - pad - Math.max(pad, ins.right)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; rrect(ctx, barX, y, barW, barH, barH / 2); ctx.fill()
    if (opts.progress > 0) {
      ctx.fillStyle = '#3b82f6'
      rrect(ctx, barX, y, Math.max(barH, barW * opts.progress), barH, barH / 2); ctx.fill()
    }
    if (opts.photoMarks?.length) drawProgressMarks(ctx, barX, y, barW, barH, sc, opts.photoMarks, opts.progress)
    y += barH + Math.round(14 * sc)
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

/** Cartellino di un luogo, ancorato al suo punto sulla mappa da una linea di richiamo.
 *
 *  Sostituisce la scheda a tutta larghezza nel terzo basso, che interrompeva: copriva la mappa
 *  proprio mentre ci si passava sopra, e slegava il testo dal posto a cui si riferiva. Qui il
 *  cartellino sta DISCOSTO dal punto — così non copre né il luogo né il pin — ed è la linea, con il
 *  suo puntino sull'ancora, a dire di chi si sta parlando. Stessa logica di un richiamo su una
 *  cartina stampata.
 *
 *  `ax, ay` sono l'ancora (il punto sulla mappa), già proiettata dal chiamante. Il cartellino si
 *  posiziona da sé sul lato che ha più spazio. */
export function drawPoiTag(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, sc: number,
  ax: number, ay: number,
  card: PoiCardView, t: number,
) {
  try {
  const k = clamp01(t)
  const inT = Math.min(1, k / 0.18)
  const outT = k > 0.84 ? (k - 0.84) / 0.16 : 0
  const alpha = inT * (1 - outT)
  if (alpha <= 0.01) return
  const ease = 1 - Math.pow(1 - inT, 3)

  const hasImg = !!card.image && card.image.width > 0 && card.image.height > 0
  const boxW = Math.min(w * 0.62, 420 * sc)
  const thumb = hasImg ? 76 * sc : 0
  const padIn = 16 * sc

  // Testo prima, per sapere quanto è alto il cartellino
  ctx.font = `500 ${Math.round(17 * sc)}px -apple-system,sans-serif`
  const textW = boxW - padIn * 2 - (hasImg ? thumb + 14 * sc : 0)
  const blurbLines = card.blurb ? wrapLines(ctx, card.blurb, textW, 2) : []
  const boxH = Math.max(hasImg ? thumb + padIn * 2 : 0, 62 * sc + blurbLines.length * 22 * sc)

  // Si mette dal lato con più spazio, e comunque dentro allo schermo
  const goRight = ax < w * 0.5
  const legX = 74 * sc * ease                      // lunghezza della linea di richiamo
  const legY = -54 * sc * ease
  let bx = goRight ? ax + legX : ax - legX - boxW
  let by = ay + legY - boxH / 2
  const ins = safeInsetsFor(w, h)
  bx = Math.max(ins.left + 8 * sc, Math.min(bx, w - ins.right - boxW - 8 * sc))
  by = Math.max(ins.top + 8 * sc, Math.min(by, h - ins.bottom - boxH - 8 * sc))

  ctx.save()
  try {
    ctx.globalAlpha = alpha

    // Linea di richiamo + ancora sul punto: si disegna PRIMA del cartellino così gli passa sotto
    const jx = goRight ? bx : bx + boxW
    const jy = by + boxH / 2
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2 * sc
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(jx, jy); ctx.stroke()
    ctx.fillStyle = card.color
    ctx.beginPath(); ctx.arc(ax, ay, 7 * sc, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'white'; ctx.lineWidth = 2.5 * sc
    ctx.beginPath(); ctx.arc(ax, ay, 7 * sc, 0, Math.PI * 2); ctx.stroke()

    // Cartellino
    const R = 16 * sc
    ctx.fillStyle = 'rgba(8,18,26,0.92)'
    rrect(ctx, bx, by, boxW, boxH, R); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5 * sc
    rrect(ctx, bx, by, boxW, boxH, R); ctx.stroke()
    ctx.fillStyle = card.color
    rrect(ctx, bx, by, 5 * sc, boxH, 2.5 * sc); ctx.fill()

    let tx = bx + padIn
    if (hasImg) {
      ctx.save()
      try {
        rrect(ctx, tx, by + padIn, thumb, thumb, 10 * sc); ctx.clip()
        const crop = aspectFitCrop(card.image!.width, card.image!.height, 1)
        ctx.drawImage(card.image!, crop.sx, crop.sy, crop.sw, crop.sh, tx, by + padIn, thumb, thumb)
      } finally { ctx.restore() }
      tx += thumb + 14 * sc
    }

    const maxTW = bx + boxW - padIn - tx
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillStyle = card.color
    ctx.font = `800 ${Math.round(13 * sc)}px -apple-system,sans-serif`
    ctx.fillText(`${card.emoji}  ${card.kind.toUpperCase()}`, tx, by + padIn + 1 * sc)
    ctx.fillStyle = 'white'
    ctx.font = `800 ${Math.round(24 * sc)}px -apple-system,sans-serif`
    let title = card.title
    while (ctx.measureText(title).width > maxTW && title.length > 4) title = title.slice(0, -4) + '…'
    ctx.fillText(title, tx, by + padIn + 20 * sc)
    if (blurbLines.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)'
      ctx.font = `500 ${Math.round(17 * sc)}px -apple-system,sans-serif`
      blurbLines.forEach((l, i) => ctx.fillText(l, tx, by + padIn + 52 * sc + i * 22 * sc))
    }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawPoiTag error:', err) }
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
  ctx.save()
  try {
    // Stesso telaio degli altri stacchi (fondale, titolo, centratura verticale) invece di un
    // pannello con le sue coordinate: prima il punteggio era ancorato a h*0.26 e le barre a h*0.47,
    // che su un 9:16 lasciava un terzo di schermo vuoto sotto e lo faceva sembrare un errore.
    const cx = w / 2
    const rowH = 66 * sc
    const contentH = 210 * sc + data.parts.length * rowH + (data.penalty ? rowH + 12 * sc : 0)
    const f = beatFrame(ctx, w, h, sc, 'Punteggio', t, contentH)
    if (!f) return
    let y = f.y + 74 * sc

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    // Il punteggio sale da 0 al valore reale: un numero che si compone tiene lo sguardo
    const shown = data.score * (1 - Math.pow(1 - Math.min(1, k / 0.32), 3))
    ctx.fillStyle = data.color
    ctx.font = `900 ${Math.round(124 * sc)}px -apple-system,sans-serif`
    ctx.fillText(shown.toFixed(1), cx, y)
    ctx.fillStyle = 'white'
    ctx.font = `800 ${Math.round(34 * sc)}px -apple-system,sans-serif`
    ctx.fillText(data.label, cx, y + 82 * sc)

    // Le cinque componenti, una dopo l'altra
    y = f.y + 210 * sc
    const barW = w - 120 * sc, barX = (w - barW) / 2
    ctx.textBaseline = 'middle'
    data.parts.forEach((p, i) => {
      const d = 0.30 + i * 0.06
      const f = clamp01((k - d) / 0.22)
      const fill = (1 - Math.pow(1 - f, 3)) * clamp01(p.value)
      const ry = y + i * rowH
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255,255,255,0.78)'
      ctx.font = `700 ${Math.round(28 * sc)}px -apple-system,sans-serif`
      ctx.fillText(p.label, barX, ry)
      const tw = 208 * sc, tx = barX + tw
      const tBarW = barW - tw
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      rrect(ctx, tx, ry - 9 * sc, tBarW, 18 * sc, 9 * sc); ctx.fill()
      if (fill > 0.001) {
        ctx.fillStyle = data.color
        rrect(ctx, tx, ry - 9 * sc, Math.max(18 * sc, tBarW * fill), 18 * sc, 9 * sc); ctx.fill()
      }
    })

    if (data.penalty) {
      const ry = y + data.parts.length * rowH + 12 * sc
      const f = clamp01((k - 0.30 - data.parts.length * 0.06) / 0.22)
      const fill = (1 - Math.pow(1 - f, 3)) * clamp01(data.penalty.value)
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(248,113,113,0.92)'
      ctx.font = `700 ${Math.round(28 * sc)}px -apple-system,sans-serif`
      ctx.fillText(data.penalty.label, barX, ry)
      const tw = 208 * sc, tx = barX + tw, tBarW = barW - tw
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      rrect(ctx, tx, ry - 9 * sc, tBarW, 18 * sc, 9 * sc); ctx.fill()
      if (fill > 0.001) {
        // Cresce da destra verso sinistra: toglie, non aggiunge
        const pw = Math.max(18 * sc, tBarW * fill)
        ctx.fillStyle = '#ef4444'
        rrect(ctx, tx + tBarW - pw, ry - 9 * sc, pw, 18 * sc, 9 * sc); ctx.fill()
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
  const HEAD = 92 * sc
  const top = Math.max(h * 0.12, (h - (HEAD + contentH)) / 2)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `800 ${Math.round(36 * sc)}px -apple-system,sans-serif`
  ctx.fillText(title.toUpperCase(), w / 2, top)
  ctx.fillStyle = '#e08d3c'
  rrect(ctx, w / 2 - 28 * sc, top + 27 * sc, 56 * sc, 4 * sc, 2 * sc); ctx.fill()
  return { alpha, y: top + HEAD }
}

/** Altezza di una griglia di statistiche a `cols` colonne. */
function statsHeight(n: number, sc: number, cols = 2): number {
  return Math.ceil(n / cols) * 164 * sc
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
    const cy = yTop + Math.floor(i / cols) * 130 * sc + (1 - ease) * 20 * sc
    ctx.globalAlpha = alpha * ease
    ctx.fillStyle = 'white'
    ctx.font = `900 ${Math.round(74 * sc)}px -apple-system,sans-serif`
    ctx.fillText(r.v, cx, cy)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `700 ${Math.round(25 * sc)}px -apple-system,sans-serif`
    ctx.fillText(r.k.toUpperCase(), cx, cy + 54 * sc)
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
    const gh = 260 * sc
    const f = beatFrame(ctx, w, h, sc, 'Il profilo', t, gh + 74 * sc + statsHeight(rows.length, sc))
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
    beatStats(ctx, w, sc, gy + gh2 + 92 * sc, f.alpha, k, rows)
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
    const contentH = 400 * sc + (data.extra?.length ? statsHeight(data.extra.length, sc) : 0)
    const f = beatFrame(ctx, w, h, sc, 'La natura intorno', t, contentH)
    if (!f) return
    const k = clamp01(t)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#8cc894'
    ctx.font = `900 ${Math.round(64 * sc)}px -apple-system,sans-serif`
    ctx.fillText(data.belt, w / 2, f.y)
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.font = `500 ${Math.round(42 * sc)}px -apple-system,sans-serif`
    wrapCentered(ctx, data.description, w / 2, f.y + 100 * sc, w - 110 * sc, 60 * sc, 4, clamp01((k - 0.14) / 0.3))
    if (data.extra?.length) beatStats(ctx, w, sc, f.y + 400 * sc, f.alpha, k, data.extra)
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
    ctx.font = `500 ${Math.round(40 * sc)}px -apple-system,sans-serif`
    const items = data.notices.slice(0, 3).map(n => {
      const lines = wrapLines(ctx, n.text, bw - 130 * sc, 3)
      return { n, lines, boxH: Math.max(122 * sc, lines.length * 54 * sc + 62 * sc) }
    })
    const contentH = items.reduce((sum, it) => sum + it.boxH + 20 * sc, 0) + (data.verifiedOn ? 68 * sc : 0)
    const f = beatFrame(ctx, w, h, sc, 'Da sapere prima di andare', t, contentH)
    if (!f) return
    let y = f.y
    items.forEach(({ n, lines, boxH }, i) => {
      const fIn = clamp01((k - (0.12 + i * 0.1)) / 0.24)
      if (fIn <= 0.01) { y += boxH + 20 * sc; return }
      const ease = 1 - Math.pow(1 - fIn, 3)
      ctx.globalAlpha = f.alpha * ease
      const col = COL[n.severity] ?? COL.info
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.font = `500 ${Math.round(40 * sc)}px -apple-system,sans-serif`
      const by = y + (1 - ease) * 18 * sc
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      rrect(ctx, bx, by, bw, boxH, 16 * sc); ctx.fill()
      ctx.fillStyle = col
      rrect(ctx, bx, by, 6 * sc, boxH, 3 * sc); ctx.fill()
      ctx.fillStyle = col
      ctx.beginPath(); ctx.arc(bx + 56 * sc, by + 54 * sc, 26 * sc, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#06111a'; ctx.textAlign = 'center'
      ctx.font = `900 ${Math.round(34 * sc)}px -apple-system,sans-serif`
      ctx.fillText(ICON[n.severity] ?? 'i', bx + 56 * sc, by + 39 * sc)
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255,255,255,0.94)'
      ctx.font = `500 ${Math.round(40 * sc)}px -apple-system,sans-serif`
      lines.forEach((l, li) => ctx.fillText(l, bx + 112 * sc, by + 30 * sc + li * 54 * sc))
      y += boxH + 20 * sc
    })
    if (data.verifiedOn) {
      ctx.globalAlpha = f.alpha * clamp01((k - 0.4) / 0.25)
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.42)'
      ctx.font = `600 ${Math.round(28 * sc)}px -apple-system,sans-serif`
      ctx.fillText(`Verificato il ${data.verifiedOn} — potrebbe essere cambiato`, w / 2, y + 30 * sc)
    }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawNoticesBeat error:', err) }
}

export interface PlaceRow {
  name: string
  kind: string
  emoji: string
  color: string
  /** Miniatura: foto Wikipedia del luogo o scatto dell'utente, già caricata. */
  image?: CanvasImageSource & { width: number; height: number }
  /** Didascalia scritta dall'utente, per le sue foto. */
  caption?: string
}

/** Elenco di ciò che si incontra: luoghi notevoli E foto dell'utente, mescolati in ordine di
 *  percorso. Tenerli separati non avrebbe senso — chi guarda vede "cosa c'è lungo il cammino", e
 *  una cascata famosa e una foto scattata da chi cammina sono due risposte alla stessa domanda. */
export function drawPlacesBeat(
  ctx: CanvasRenderingContext2D, w: number, h: number, sc: number,
  places: PlaceRow[], t: number,
) {
  try {
  ctx.save()
  try {
    const shown = places.slice(0, 4)
    const rowH = 152 * sc
    const f = beatFrame(ctx, w, h, sc, 'Cosa incontri', t, shown.length * rowH)
    if (!f) return
    const k = clamp01(t)
    const bx = 62 * sc, bw = w - 124 * sc
    shown.forEach((pl, i) => {
      const fIn = clamp01((k - (0.12 + i * 0.08)) / 0.24)
      if (fIn <= 0.01) return
      const ease = 1 - Math.pow(1 - fIn, 3)
      ctx.globalAlpha = f.alpha * ease
      const by = f.y + i * rowH + (1 - ease) * 20 * sc
      const boxH = 134 * sc
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      rrect(ctx, bx, by, bw, boxH, 18 * sc); ctx.fill()

      const thumb = 102 * sc, tx0 = bx + 16 * sc, ty0 = by + (boxH - thumb) / 2
      const hasImg = !!pl.image && pl.image.width > 0 && pl.image.height > 0
      if (hasImg) {
        ctx.save()
        try {
          rrect(ctx, tx0, ty0, thumb, thumb, 12 * sc); ctx.clip()
          const crop = aspectFitCrop(pl.image!.width, pl.image!.height, 1)
          ctx.drawImage(pl.image!, crop.sx, crop.sy, crop.sw, crop.sh, tx0, ty0, thumb, thumb)
        } finally { ctx.restore() }
        // Filetto del colore del tipo attorno alla miniatura, così il codice colore resta leggibile
        ctx.strokeStyle = pl.color; ctx.lineWidth = 2.5 * sc
        rrect(ctx, tx0, ty0, thumb, thumb, 12 * sc); ctx.stroke()
      } else {
        ctx.fillStyle = pl.color
        rrect(ctx, tx0, ty0, thumb, thumb, 12 * sc); ctx.fill()
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = `${Math.round(30 * sc)}px -apple-system,sans-serif`
        ctx.fillText(pl.emoji, tx0 + thumb / 2, ty0 + thumb / 2 + 2 * sc)
      }

      const tx = tx0 + thumb + 18 * sc
      const maxTW = bx + bw - tx - 18 * sc
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillStyle = pl.color
      ctx.font = `800 ${Math.round(24 * sc)}px -apple-system,sans-serif`
      ctx.fillText(pl.kind.toUpperCase(), tx, by + 22 * sc)
      ctx.fillStyle = 'white'
      ctx.font = `800 ${Math.round(42 * sc)}px -apple-system,sans-serif`
      let nm = pl.name
      while (ctx.measureText(nm).width > maxTW && nm.length > 4) nm = nm.slice(0, -4) + '…'
      ctx.fillText(nm, tx, by + 54 * sc)
      if (pl.caption) {
        ctx.fillStyle = 'rgba(255,255,255,0.58)'
        ctx.font = `italic 500 ${Math.round(26 * sc)}px Georgia,serif`
        let cp = pl.caption
        while (ctx.measureText(cp).width > maxTW && cp.length > 4) cp = cp.slice(0, -4) + '…'
        ctx.fillText(cp, tx, by + 100 * sc)
      }
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

// ── Didascalie dal testo della guida ───────────────────────────────────────────
/** Didascalia in stile film: sottili bande orizzontali che entrano ed escono, testo centrato in
 *  basso a gruppi di parole. Contorno pieno e mai un riquadro grigio dietro: sopra a una mappa in
 *  movimento un rettangolo semitrasparente è la cosa che fa sembrare il video "fatto in casa",
 *  mentre un contorno netto si legge su qualunque sfondo senza coprire niente. */
export function drawStoryCaption(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, sc: number,
  text: string, t: number,
) {
  try {
  const k = clamp01(t)
  const inT = Math.min(1, k / 0.18)
  const outT = k > 0.82 ? (k - 0.82) / 0.18 : 0
  const alpha = inT * (1 - outT)
  if (alpha <= 0.01) return

  ctx.save()
  try {
    // Bande cinematografiche: crescono all'entrata e si ritirano all'uscita
    const barEase = (1 - Math.pow(1 - inT, 3)) * (1 - outT)
    const barH = h * 0.055 * barEase
    if (barH > 0.5) {
      ctx.globalAlpha = alpha * 0.85
      ctx.fillStyle = 'rgba(4,10,15,0.92)'
      ctx.fillRect(0, 0, w, barH)
      ctx.fillRect(0, h - barH, w, barH)
    }

    ctx.globalAlpha = alpha
    ctx.font = `500 italic ${Math.round(38 * sc)}px Georgia,serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'

    // A capo su misura, al massimo tre righe
    const ins = safeInsetsFor(w, h)
    const maxW = w - Math.max(130 * sc, ins.left + ins.right)
    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let cur = ''
    for (const wd of words) {
      const test = cur ? cur + ' ' + wd : wd
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = wd } else cur = test
    }
    if (cur) lines.push(cur)
    const vis = lines.slice(0, 3)
    const lineH = 50 * sc
    // Ancorata al margine sicuro inferiore, non a una frazione dell'altezza: su 9:16 h*0.80 cade
    // in pieno nella fascia coperta da didascalia e pulsanti dell'app.
    const baseY = (h - ins.bottom - 40 * sc) - (vis.length - 1) * lineH

    vis.forEach((l, i) => {
      // Le righe entrano una dopo l'altra: dà il ritmo della lettura invece di scaricare
      // tutto il blocco addosso a chi guarda
      const li = clamp01((k - i * 0.06) / 0.18)
      const ease = 1 - Math.pow(1 - li, 3)
      const a = alpha * ease
      if (a <= 0.01) return
      const y = baseY + i * lineH + (1 - ease) * 22 * sc
      ctx.globalAlpha = a
      ctx.strokeStyle = 'rgba(4,12,18,0.88)'; ctx.lineWidth = 9 * sc
      const cxSafe = (ins.left + (w - ins.right)) / 2
      ctx.strokeText(l, cxSafe, y)
      ctx.fillStyle = 'rgba(255,255,255,0.96)'
      ctx.fillText(l, cxSafe, y)
    })
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawStoryCaption error:', err) }
}

// ── Quote lungo il percorso (opzionale) ────────────────────────────────────────
/** Etichetta di quota ancorata a un punto del tracciato, con icona di dislivello.
 *  Sostituisce il grafico altimetrico: un profilo in miniatura in un angolo non lo legge nessuno
 *  mentre la mappa si muove, mentre un numero che compare sul punto dice la stessa cosa nel momento
 *  in cui serve. `t` 0..1 copre entrata e uscita. */
export function drawElevationMarker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, sc: number,
  meters: number, trend: 'up' | 'down' | 'flat', t: number,
) {
  try {
  const k = clamp01(t)
  const alpha = Math.min(1, k / 0.18) * (k > 0.78 ? Math.max(0, (1 - k) / 0.22) : 1)
  if (alpha <= 0.01) return
  const ease = 1 - Math.pow(1 - Math.min(1, k / 0.18), 3)

  ctx.save()
  try {
    ctx.globalAlpha = alpha
    const label = `${Math.round(meters)} m`
    const fs = Math.round(26 * sc)
    ctx.font = `800 ${fs}px -apple-system,sans-serif`
    const iconW = 26 * sc
    const padX = 16 * sc
    const wBox = ctx.measureText(label).width + iconW + padX * 2 + 8 * sc
    const hBox = 46 * sc
    // Sale al suo posto entrando, come un'etichetta che si pianta sul terreno
    const by = y - hBox / 2 - (1 - ease) * 14 * sc
    const bx = x - wBox / 2

    ctx.fillStyle = 'rgba(8,18,26,0.86)'
    rrect(ctx, bx, by, wBox, hBox, hBox / 2); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5 * sc
    rrect(ctx, bx, by, wBox, hBox, hBox / 2); ctx.stroke()

    // Freccia di tendenza: dice se in quel punto si sta salendo o scendendo, che è
    // l'informazione che il profilo altimetrico dava e un numero da solo non darebbe
    const ax = bx + padX + iconW / 2, ay = by + hBox / 2
    const col = trend === 'up' ? '#e08d3c' : trend === 'down' ? '#58aa63' : 'rgba(255,255,255,0.55)'
    ctx.fillStyle = col
    ctx.beginPath()
    if (trend === 'flat') {
      ctx.roundRect?.(ax - 9 * sc, ay - 2 * sc, 18 * sc, 4 * sc, 2 * sc)
      if (!ctx.roundRect) ctx.rect(ax - 9 * sc, ay - 2 * sc, 18 * sc, 4 * sc)
    } else {
      const dir = trend === 'up' ? -1 : 1
      ctx.moveTo(ax, ay + dir * 10 * sc)
      ctx.lineTo(ax - 9 * sc, ay - dir * 6 * sc)
      ctx.lineTo(ax + 9 * sc, ay - dir * 6 * sc)
      ctx.closePath()
    }
    ctx.fill()

    ctx.fillStyle = 'white'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + padX + iconW + 8 * sc, ay + 1 * sc)
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawElevationMarker error:', err) }
}

// ── Apertura: titolo + dato d'impatto sull'intro aerea ────────────────────────
/** Sovrimpressione sull'intro, non una schermata a sé: l'intro dura comunque, e lasciarla muta
 *  significa aprire il video con qualche secondo in cui non c'è niente da leggere — sui social è il
 *  modo più efficace per farsi scorrere via. Qui il titolo e la cifra più forte entrano SOPRA il
 *  volo aereo, senza rubargli un fotogramma.
 *
 *  `t` è l'avanzamento dell'intro (0..1): il testo entra subito e sfuma verso la fine, così quando
 *  il percorso comincia lo schermo è già pulito. */
export function drawOpeningTitle(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, sc: number,
  title: string, headline: string | undefined, t: number,
) {
  try {
  const k = clamp01(t)
  const inT = Math.min(1, k / 0.22)
  const outT = k > 0.72 ? (k - 0.72) / 0.28 : 0
  const alpha = inT * (1 - outT)
  if (alpha <= 0.01) return
  const ease = 1 - Math.pow(1 - inT, 3)
  const ins = safeInsetsFor(w, h)
  const cx = (ins.left + (w - ins.right)) / 2
  const maxW = w - Math.max(120 * sc, ins.left + ins.right)

  ctx.save()
  try {
    ctx.globalAlpha = alpha
    // Velo dal basso: dà contrasto al testo senza spegnere la mappa, che è il soggetto
    const g = ctx.createLinearGradient(0, h * 0.34, 0, h)
    g.addColorStop(0, 'rgba(4,12,18,0)'); g.addColorStop(0.6, 'rgba(4,12,18,0.55)'); g.addColorStop(1, 'rgba(4,12,18,0.86)')
    ctx.fillStyle = g; ctx.fillRect(0, h * 0.34, w, h * 0.66)

    // Blocco ancorato al margine sicuro inferiore, non al bordo
    let y = h - ins.bottom - 40 * sc

    if (headline) {
      // La cifra più forte, grande: è il motivo per cui qualcuno smette di scorrere
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round'
      ctx.font = `900 ${Math.round(64 * sc)}px -apple-system,sans-serif`
      let hl = headline.toUpperCase()
      while (ctx.measureText(hl).width > maxW && hl.length > 4) hl = hl.slice(0, -4) + '…'
      const hy = y - (1 - ease) * 26 * sc
      ctx.strokeStyle = 'rgba(4,12,18,0.85)'; ctx.lineWidth = 10 * sc
      ctx.strokeText(hl, cx, hy)
      const hg = ctx.createLinearGradient(0, hy - 56 * sc, 0, hy)
      hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#f2cd9d')
      ctx.fillStyle = hg
      ctx.fillText(hl, cx, hy)
      y -= 82 * sc
    }

    // Titolo del percorso, sopra la cifra: dice DOVE, che è la seconda domanda dopo "quanto"
    const tEase = 1 - Math.pow(1 - clamp01((k - 0.06) / 0.22), 3)
    ctx.globalAlpha = alpha * tEase
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.font = `700 ${Math.round(30 * sc)}px -apple-system,sans-serif`
    let tt = title
    while (ctx.measureText(tt).width > maxW && tt.length > 4) tt = tt.slice(0, -4) + '…'
    const ty = y - (1 - tEase) * 18 * sc
    ctx.strokeStyle = 'rgba(4,12,18,0.8)'; ctx.lineWidth = 7 * sc
    ctx.strokeText(tt, cx, ty)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(tt, cx, ty)

    // Filetto d'accento: chiude il blocco e dà un movimento in più nei primi fotogrammi
    const barT = clamp01((k - 0.12) / 0.3)
    const barW = 120 * sc * (1 - Math.pow(1 - barT, 3))
    if (barW > 1) {
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#e08d3c'
      rrect(ctx, cx - barW / 2, ty - 52 * sc, barW, 5 * sc, 2.5 * sc); ctx.fill()
    }
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawOpeningTitle error:', err) }
}

// ── Schermata di chiusura ──────────────────────────────────────────────────────
/**
 * Il congedo del video: un velo sul paesaggio, il titolo, i due numeri che contano.
 *
 * Prima era disegnata a mano dentro RouteMap3D (l'unico disegno rimasto fuori da questo file) ed
 * erano DUE dissolvenze in fila: un nero che saliva fino a coprire tutto, la scheda che compariva
 * solo oltre l'82% di quel nero, e — con la chiusura ad anello — il nero che se ne andava
 * riscoprendo la mappa. Da fuori si vedeva "zoom indietro, buio, e di nuovo la mappa": tre eventi
 * scollegati che sembravano un errore di montaggio.
 *
 * Qui la mappa non sparisce MAI: il velo la scurisce quanto basta a leggere, e scheda e velo sono
 * una dissolvenza sola. `fade` 0..1 li governa entrambi — chi chiama lo porta a 1 e ce lo lascia
 * (finale normale), oppure lo riporta a 0 mentre la telecamera torna all'inquadratura d'apertura
 * (chiusura ad anello), e allora l'ultimo fotogramma è identico al primo.
 */
export function drawEndCard(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, sc: number,
  data: { title: string; km: number; elevGain: number },
  fade: number,
) {
  try {
  const fa = clamp01(fade)
  if (fa <= 0.001) return
  ctx.save()
  try {
    const veil = ctx.createLinearGradient(0, 0, 0, h)
    veil.addColorStop(0,    'rgba(4,11,17,0.58)')
    veil.addColorStop(0.45, 'rgba(4,11,17,0.82)')
    veil.addColorStop(1,    'rgba(4,11,17,0.68)')
    ctx.globalAlpha = fa; ctx.fillStyle = veil; ctx.fillRect(0, 0, w, h)

    // Il testo entra DOPO che il velo ha cominciato a scurire: scritte piene su mappa ancora chiara
    // sarebbero illeggibili nei primi fotogrammi, che è quando lo sguardo ci si posa.
    ctx.globalAlpha = Math.pow(clamp01((fa - 0.25) / 0.75), 1.1)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    ctx.fillStyle = '#22d3ee'
    ctx.font = `800 ${Math.round(30 * sc)}px -apple-system,sans-serif`
    ctx.fillText('DTrek', w / 2, h / 2 - Math.round(108 * sc))

    ctx.fillStyle = 'white'
    ctx.font = `700 ${Math.round(54 * sc)}px -apple-system,sans-serif`
    let et = data.title
    while (ctx.measureText(et).width > w - Math.round(80 * sc) && et.length > 4) et = et.slice(0, -4) + '…'
    ctx.fillText(et, w / 2, h / 2 - Math.round(36 * sc))

    const stats = [
      { v: `${+data.km.toFixed(1)} km`, l: 'distanza' },
      { v: `${Math.round(data.elevGain)} m`, l: 'D+' },
    ]
    const cw = Math.round(180 * sc), gap = Math.round(24 * sc)
    const total = stats.length * cw + (stats.length - 1) * gap
    const x0 = w / 2 - total / 2 + cw / 2, sy = h / 2 + Math.round(66 * sc)
    stats.forEach((s, i) => {
      const x = x0 + i * (cw + gap)
      ctx.fillStyle = 'white'
      ctx.font = `800 ${Math.round(50 * sc)}px -apple-system,sans-serif`
      ctx.fillText(s.v, x, sy)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = `600 ${Math.round(18 * sc)}px -apple-system,sans-serif`
      ctx.fillText(s.l.toUpperCase(), x, sy + Math.round(38 * sc))
    })

    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = `400 ${Math.round(16 * sc)}px -apple-system,sans-serif`
    ctx.fillText('Tracciato con DTrek', w / 2, h / 2 + Math.round(150 * sc))
  } finally { ctx.restore() }
  } catch (err) { console.error('[dtrek] drawEndCard error:', err) }
}
