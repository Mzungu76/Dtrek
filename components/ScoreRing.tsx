'use client'
import { useState, useEffect, useRef, type CSSProperties } from 'react'
import type { CLLabel, CLSignals, Sentinel2Data } from '@/lib/cl/types'
import type { SafetyScore } from '@/lib/safetyScore'
import type { TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { computeTrailScoreV2, SAFETY_VETO_THRESHOLD } from '@/lib/trailScoreV2'
import { CLBadge } from '@/components/CLBadge'
import { SafetyScoreWidget } from '@/components/SafetyScoreWidget'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import { ShadeWaterTile } from '@/components/ShadeWaterTile'
import Sheet from '@/components/ui/Sheet'

export interface CLProps {
  si?: number
  // Trasparenza sulla correzione di densità dati (Trail Score v2 spec §5) — vedi
  // lib/cl/signals/densitySignal.ts. siRaw è il valore prima della correzione,
  // dataDensityFactor il moltiplicatore applicato (0.3-1).
  siRaw?: number
  dataDensityFactor?: number
  label?: CLLabel
  signals?: CLSignals
  isGhostTrail?: boolean
  partial?: boolean
  loading?: boolean
  notMatched?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  refreshError?: string | null
}

export interface CtsProps {
  result: TrailScoreResult | null
  cached?: number
  beautyScore?: BeautyScore
  computing?: boolean
  onCompute?: () => void
}

export interface ShadeWaterProps {
  data: Sentinel2Data | null
  loading?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  refreshError?: string | null
}

interface Segment {
  key: 'cl' | 'safety' | 'cts' | 'shadewater'
  title: string
  value: number | null
  color: string
}

/** Trail Score (TS) v2 e 0-100, non piu una somma di 4 segmenti a 0-400 (vedi lib/trailScoreV2.ts).
 *  Il nome resta cosi com'e per non dover toccare ogni chiamante che lo importa solo come
 *  denominatore del proprio MiniScoreRing. */
export const TRAIL_SCORE_MAX = 100

function computeSegments(cl: CLProps, safety: SafetyScore | null, cts: CtsProps, shadeWater: ShadeWaterProps): Segment[] {
  const ctsValue    = cts.result?.ts ?? cts.cached ?? null
  const shadeWaterValue = shadeWater.data?.available && shadeWater.data.shadeScore != null
    ? shadeWater.data.shadeScore * 100 : null

  return [
    { key: 'cl',         title: 'Livello di affidabilità', value: cl.notMatched || cl.loading ? null : cl.si ?? null, color: colorForCL(cl.label) },
    { key: 'safety',     title: 'Sicurezza',                value: safety?.overall ?? null,                          color: safety?.color ?? '#a8a29e' },
    { key: 'cts',        title: 'Comfort TrailScore',       value: ctsValue,                                          color: cts.result?.color ?? '#a8a29e' },
    { key: 'shadewater', title: 'Ombra e acqua',            value: shadeWaterValue,                                   color: '#0ea5e9' },
  ]
}

/** Trail Score (TS) v2, 0-100 — sostituisce la vecchia somma lineare dei 4 segmenti (CL,
 *  Sicurezza, Comfort TrailScore, Ombra e acqua) con il framework a 3 livelli di
 *  lib/trailScoreV2.ts: Comfort TrailScore e Ombra e acqua si combinano in un "Value" (pesi che
 *  seguono la temperatura prevista se nota), la Sicurezza fa da gate non-compensabile su quel
 *  Value, e l'Affidabilita (gia corretta per densita dati) fa collassare il risultato verso un
 *  prior neutro quando i dati sono scarsi. Restituisce 0 finche CL/Sicurezza/Comfort TrailScore
 *  non sono TUTTI disponibili — un gate o uno shrinkage "assente" non ha un default onesto (vedi
 *  computeTrailScoreV2), quindi niente numero finche non lo sono, invece di uno silenziosamente
 *  sbagliato. Ombra e acqua invece e genuinamente opzionale (Livello 1, sostituibile da CTS). */
export function computeTrailScoreTotal(
  cl: CLProps, safety: SafetyScore | null, cts: CtsProps, shadeWater: ShadeWaterProps,
  forecastTempC?: number | null,
): number {
  const segments = computeSegments(cl, safety, cts, shadeWater)
  const clValue         = segments.find(s => s.key === 'cl')?.value ?? null
  const safetyValue     = segments.find(s => s.key === 'safety')?.value ?? null
  const ctsValue        = segments.find(s => s.key === 'cts')?.value ?? null
  const shadeWaterValue = segments.find(s => s.key === 'shadewater')?.value ?? null

  // Alcuni chiamanti (es. app/resoconto/ResocontoHub.tsx, per le attività già concluse) non
  // tracciano affatto Sicurezza/Affidabilità e passano cl.notMatched=true in modo esplicito e
  // permanente (non "ancora in caricamento" — vedi lib/cl/useCL.ts, dove notMatched parte a
  // false e scatta solo se una vera fetch risponde "nessun match"). Per quei contesti il gate/
  // shrinkage non ha nulla su cui lavorare: invece di bloccare il numero (che richiederebbe
  // sempre tutti e tre gli input), Trail Score v2 collassa al solo Value, cioè lo stesso esito
  // che avrebbe con Sicurezza/Affidabilità perfette (gate=1, C=1). Un vero percorso pianificato
  // non prende mai questa via: lì notMatched resta false finché la fetch non risponde davvero.
  const notApplicable = cl.notMatched === true && safetyValue == null
  const result = computeTrailScoreV2({
    cts: ctsValue, ombraAcqua: shadeWaterValue,
    safety: notApplicable ? 100 : safetyValue,
    affidabilita: notApplicable ? 100 : clValue,
    forecastTempC,
  })
  return result?.score ?? 0
}

/** True quando la Sicurezza e sotto la soglia di veto assoluta (Trail Score v2 spec §2) — usato
 *  per sovrapporre un badge di avviso al numero (non per sostituirlo: il gate sigmoide lo ha gia
 *  schiacciato quasi a zero da solo). */
export function isTrailScoreVetoed(safety: SafetyScore | null): boolean {
  return safety?.overall != null && safety.overall < SAFETY_VETO_THRESHOLD
}

/** TS tier coloring — thresholds sul totale 0-100 (non piu 0-400, vedi TRAIL_SCORE_MAX). */
export function tsColor(value: number): string {
  if (value <= 25) return '#dc2626' // rosso
  if (value <= 50) return '#eab308' // giallo
  if (value <= 75) return '#0ea5e9' // celeste
  return '#16a34a'                  // verde
}

const MINI_STROKE = 3

/** Small circular progress badge for the combined Trail Score — same fill logic as the big
 *  ScoreRing, shrunk down to sit inline among the other stat chips over the map. While the
 *  underlying data is still settling (`loading`), shows a neutral pulsing ring instead of a
 *  number that would otherwise jump several times before landing on its final value. `color`
 *  overrides the automatic TS-tier coloring (used by callers scoring on a different scale,
 *  e.g. Resoconto's 0-10 manual rating). */
export function MiniScoreRing({ value, max = TRAIL_SCORE_MAX, size = 30, loading = false, color: colorOverride, vetoed = false }: { value: number; max?: number; size?: number; loading?: boolean; color?: string; vetoed?: boolean }) {
  const r = (size - MINI_STROKE) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value / max))
  const color = colorOverride ?? tsColor(value)

  if (loading) {
    return (
      <div className="relative shrink-0 rounded-full bg-white shadow-sm animate-pulse" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#e7e5e4" strokeWidth={MINI_STROKE} />
          <circle
            cx={c} cy={c} r={r} fill="none" stroke="#d6d3d1" strokeWidth={MINI_STROKE} strokeLinecap="round"
            strokeDasharray={`${circumference * 0.25} ${circumference}`}
          />
        </svg>
      </div>
    )
  }

  return (
    <div className="relative shrink-0 rounded-full bg-white shadow-sm" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#e7e5e4" strokeWidth={MINI_STROKE} />
        <circle
          cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={MINI_STROKE} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold leading-none" style={{ color, fontSize: size * 0.32 }}>{Math.round(value)}</span>
      </div>
      {vetoed && (
        <span
          title="Sconsigliato — rischio elevato"
          className="absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-red-600 text-white leading-none"
          style={{ width: size * 0.4, height: size * 0.4, fontSize: size * 0.28 }}
        >
          ⚠
        </span>
      )}
    </div>
  )
}

function colorForCL(label?: CLLabel): string {
  switch (label?.color) {
    case 'green': return '#277134'
    case 'lime': return '#65a30d'
    case 'amber': return '#d97706'
    case 'red': return '#dc2626'
    default: return '#a8a29e'
  }
}

// Conta da 0 fino a `target` con easing — usato per il numero centrale del ring, così si "anima"
// anche quando i punteggi arrivano via via (CL/Sicurezza/CTS/Ombra e acqua si popolano in tempi
// diversi), non solo al primo mount.
function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return value
}

// Radar a 4 assi — alto/destra/basso/sinistra, nello stesso ordine di `computeSegments`
// (cl, safety, cts, shadewater). Le etichette sono <div> HTML sovrapposte all'SVG, non testo
// SVG: a differenza di <text>, vanno a capo correttamente e non escono dal contenitore qualunque
// sia la lunghezza (es. "OMBRA E ACQUA" contro "SICUREZZA").
const RADAR_OUTER  = 272 // lato del contenitore quadrato, margine incluso per le etichette
const RADAR_MARGIN = 50  // spazio riservato alle etichette su ogni lato
const RADAR_SIZE   = RADAR_OUTER - RADAR_MARGIN * 2
const RADAR_R      = RADAR_SIZE / 2
const RCX = RADAR_SIZE / 2
const RCY = RADAR_SIZE / 2
const AXES = [
  { dx: 0, dy: -1 },  // alto — cl (Affidabilità)
  { dx: 1, dy: 0 },   // destra — safety (Sicurezza)
  { dx: 0, dy: 1 },   // basso — cts (Comfort TrailScore)
  { dx: -1, dy: 0 },  // sinistra — shadewater (Ombra e acqua)
] as const

function axisPoint(i: number, level: number) {
  const a = AXES[i]
  return { x: RCX + a.dx * RADAR_R * level, y: RCY + a.dy * RADAR_R * level }
}

function ringPolygonPoints(level: number): string {
  return AXES.map((_, i) => { const p = axisPoint(i, level); return `${p.x},${p.y}` }).join(' ')
}

// Etichette compatte per gli assi del radar — la lista sotto mostra comunque il titolo per
// esteso (`s.title`), qui serve stare in ~44px di larghezza senza wrap eccessivo.
const RADAR_SHORT_TITLE: Record<Segment['key'], string> = {
  cl: 'Affidabilità',
  safety: 'Sicurezza',
  cts: 'Comfort',
  shadewater: 'Ombra e acqua',
}

/**
 * Radar a 4 assi (Affidabilità/Sicurezza/Comfort TrailScore/Ombra e acqua) — un solo elemento
 * compatto invece di una dashboard a sé, coerente con l'idea che tutta l'infrastruttura di
 * valutazione (che già incorpora la Bellezza/TEI come input alla Comfort TrailScore) resti
 * consultabile ma non occupi una sezione propria. Mostra anche la *forma* del punteggio, non
 * solo la somma: un percorso ottimo ma povero d'ombra si riconosce a colpo d'occhio dal poligono
 * "storto", cosa che l'anello precedente non comunicava. Click su un vertice/etichetta o su una
 * riga della lista sotto apre il dettaglio del punteggio corrispondente in un foglio a comparsa.
 */
export function ScoreRing({
  cl, safety, cts, shadeWater, forecastTempC,
}: {
  cl: CLProps
  safety: SafetyScore | null
  cts: CtsProps
  shadeWater: ShadeWaterProps
  /** Temperatura prevista (°C) nel giorno dell'escursione — vedi app/guida/useForecastTemp.ts.
   *  Assente ⇒ Trail Score v2 usa i pesi statici (nessuna ponderazione stagionale di Ombra&Acqua). */
  forecastTempC?: number | null
}) {
  const [activeKey, setActiveKey] = useState<Segment['key'] | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // Un frame di ritardo così il primo render dipinge il poligono a 0 — poi l'animazione CSS
    // sotto lo "disegna" fino alla forma vera invece di comparire già pieno.
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const segments = computeSegments(cl, safety, cts, shadeWater)
  const total   = computeTrailScoreTotal(cl, safety, cts, shadeWater, forecastTempC)
  const animatedTotal = useCountUp(mounted ? total : 0)
  const vetoed  = isTrailScoreVetoed(safety)
  const active  = segments.find(s => s.key === activeKey) ?? null

  const points = segments.map((s, i) => {
    const pct = mounted && s.value != null ? Math.max(0, Math.min(100, s.value)) / 100 : 0
    return { ...s, ...axisPoint(i, pct) }
  })
  const dataPolygon = points.map(p => `${p.x},${p.y}`).join(' ')

  const LABEL_STYLE: Record<number, { className: string; style: CSSProperties }> = {
    0: { className: 'absolute left-1/2 -translate-x-1/2 text-center', style: { bottom: RADAR_MARGIN + RADAR_SIZE, width: 140 } },
    1: { className: 'absolute top-1/2 -translate-y-1/2 text-left', style: { left: RADAR_MARGIN + RADAR_SIZE + 4, width: RADAR_MARGIN - 6 } },
    2: { className: 'absolute left-1/2 -translate-x-1/2 text-center', style: { top: RADAR_MARGIN + RADAR_SIZE, width: 140 } },
    3: { className: 'absolute top-1/2 -translate-y-1/2 text-right', style: { right: RADAR_MARGIN + RADAR_SIZE + 4, width: RADAR_MARGIN - 6 } },
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-5">
        <div className="relative shrink-0 mx-auto" style={{ width: RADAR_OUTER, height: RADAR_OUTER }}>
          <svg
            width={RADAR_SIZE} height={RADAR_SIZE} viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
            style={{ position: 'absolute', left: RADAR_MARGIN, top: RADAR_MARGIN, overflow: 'visible' }}
          >
            {[0.25, 0.5, 0.75, 1].map(level => (
              <polygon key={level} points={ringPolygonPoints(level)} fill="none" stroke="#e7e5e4" strokeWidth={1} />
            ))}
            {AXES.map((a, i) => (
              <line key={i} x1={RCX} y1={RCY} x2={RCX + a.dx * RADAR_R} y2={RCY + a.dy * RADAR_R} stroke="#dcd8cc" strokeWidth={1} />
            ))}
            <polygon
              points={dataPolygon}
              fill="url(#radarFillGrad)"
              stroke="#c05a17" strokeWidth={2} strokeLinejoin="round"
              style={{
                transformOrigin: `${RCX}px ${RCY}px`,
                transform: mounted ? 'scale(1)' : 'scale(0)',
                opacity: mounted ? 1 : 0,
                transition: 'transform 800ms cubic-bezier(.22,.8,.25,1), opacity 400ms ease',
              }}
            />
            <defs>
              <linearGradient id="radarFillGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#378d44" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#d97220" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            {points.map((p, i) => (
              <circle
                key={p.key} cx={p.x} cy={p.y} r={5} fill={p.value != null ? p.color : '#c4bead'}
                stroke="#fff" strokeWidth={1.5}
                style={{ cursor: 'pointer', opacity: mounted ? 1 : 0, transition: 'opacity 400ms ease 500ms' }}
                onClick={() => setActiveKey(p.key)}
              />
            ))}
          </svg>

          <div
            className="absolute flex flex-col items-center justify-center pointer-events-none"
            style={{ left: RADAR_MARGIN, top: RADAR_MARGIN, width: RADAR_SIZE, height: RADAR_SIZE }}
          >
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Punteggio</span>
            <span className="font-display font-black text-[28px] text-stone-900 leading-none mt-0.5 tabular-nums">{Math.round(animatedTotal)}</span>
            <span className="text-[10px] text-stone-400 font-semibold mt-0.5">su {TRAIL_SCORE_MAX}</span>
            {vetoed && (
              <span className="pointer-events-auto mt-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-bold uppercase tracking-wide">
                Sconsigliato — rischio elevato
              </span>
            )}
          </div>

          {points.map((p, i) => (
            <button
              key={p.key}
              onClick={() => setActiveKey(p.key)}
              className={`${LABEL_STYLE[i].className} font-barlow font-bold uppercase leading-tight text-[9px] tracking-[0.03em]`}
              style={{ ...LABEL_STYLE[i].style, color: p.value != null ? p.color : '#a9a18e' }}
            >
              {RADAR_SHORT_TITLE[p.key]}
            </button>
          ))}
        </div>

        <div className="w-full space-y-1.5">
          {segments.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveKey(s.key)}
              className="w-full flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded-xl transition-colors hover:bg-stone-100"
              style={s.value != null ? { backgroundColor: `${s.color}1a` } : undefined}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 0 3px ${s.color}33` }} />
              <span className="flex-1 text-xs text-stone-700 truncate">{s.title}</span>
              <span className="text-sm font-bold" style={{ color: s.value != null ? s.color : '#78716c' }}>{s.value != null ? Math.round(s.value) : '—'}</span>
            </button>
          ))}
        </div>
      </div>

      <Sheet open={!!active} onClose={() => setActiveKey(null)} title={active?.title}>
        <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
          {active?.key === 'cl' && (
            <CLBadge
              si={cl.si} siRaw={cl.siRaw} dataDensityFactor={cl.dataDensityFactor}
              label={cl.label} signals={cl.signals} isGhostTrail={cl.isGhostTrail}
              partial={cl.partial} loading={cl.loading} expanded defaultOpen
              onRefresh={cl.onRefresh} refreshing={cl.refreshing} refreshError={cl.refreshError}
            />
          )}
          {active?.key === 'safety' && <SafetyScoreWidget safety={safety} defaultOpen />}
          {active?.key === 'cts' && (
            <ComfortTrailScoreWidget result={cts.result} cached={cts.cached} beautyScore={cts.beautyScore} defaultOpen />
          )}
          {active?.key === 'shadewater' && (
            <ShadeWaterTile
              data={shadeWater.data} loading={shadeWater.loading} defaultOpen
              onRefresh={shadeWater.onRefresh} refreshing={shadeWater.refreshing} refreshError={shadeWater.refreshError}
            />
          )}
        </div>
      </Sheet>
    </div>
  )
}
