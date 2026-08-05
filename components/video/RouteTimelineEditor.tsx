'use client'

/**
 * components/video/RouteTimelineEditor.tsx — il percorso su cui si posano foto e stacchi.
 *
 * Sostituisce il problema invece di risolverlo un'altra volta: il montaggio automatico può solo
 * fare del suo meglio con lo spazio che trova, e su un percorso corto e pieno di foto quel meglio
 * resta una fila di interruzioni ravvicinate. Qui la disposizione si vede — dove parte, da che
 * parte si cammina, dove cadono le foto — e si sposta con un dito.
 *
 * NON è una mappa: nessuna tile, nessuno sfondo, nessun nord. È la forma del cammino, che è quanto
 * basta per rispondere a «questa foto sta prima o dopo quella curva?» — e su un telefono lascia
 * tutto lo spazio alle cose da trascinare invece che alla cartografia.
 *
 * La geometria sta in lib/videoTimeline.ts, verificabile da sola; qui c'è solo il disegno e il
 * gesto.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  buildTimelineShape, pointAtProgress, progressAtPoint, directionArrows,
  findCrowding, MIN_ITEM_GAP_SEC,
  type TimelineItem,
} from '@/lib/videoTimeline'
import type { TrackPoint } from '@/lib/tcxParser'
import type { InterludeKind } from '@/lib/videoInterludes'
import type { TrackShape } from '@/lib/geoUtils'

const VIEW_W = 340
const VIEW_H = 300
const PADDING = 26

/** Un'icona per tipo di stacco: sul percorso i pallini si distinguono per forma, non per colore —
 *  che su uno schermo piccolo e sotto un dito è la sola differenza che regge. */
export const INTERLUDE_GLYPH: Record<InterludeKind, string> = {
  visione: '◎',
  numeri:  '#',
  profilo: '△',
  natura:  '❦',
  tei:     '★',
  avvisi:  '!',
  luoghi:  '◆',
}

const INTERLUDE_TINT: Record<InterludeKind, string> = {
  visione: '#38bdf8',
  numeri:  '#a3e635',
  profilo: '#f59e0b',
  natura:  '#34d399',
  tei:     '#c084fc',
  avvisi:  '#fb7185',
  luoghi:  '#f472b6',
}

export interface TimelineEditorItem extends TimelineItem {
  /** Solo per le foto: miniatura da mostrare nel pallino. */
  thumbUrl?: string
  interludeKind?: InterludeKind
}

interface Props {
  trackPoints: TrackPoint[]
  items: TimelineEditorItem[]
  /** Secondi di solo volo: serve a dire in SECONDI quanto due elementi sono vicini. */
  routeSeconds: number
  shape?: TrackShape
  /** Percorso lineare camminato anche al ritorno: il video mostra la sola andata, e va detto. */
  roundTrip?: boolean
  onMove: (id: string, atP: number) => void
}

export default function RouteTimelineEditor({
  trackPoints, items, routeSeconds, shape: trackShape, roundTrip, onMove,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const shape = useMemo(
    () => buildTimelineShape(trackPoints, { width: VIEW_W, height: VIEW_H, padding: PADDING }),
    [trackPoints],
  )

  const crowding = useMemo(
    () => findCrowding(items, routeSeconds, MIN_ITEM_GAP_SEC),
    [items, routeSeconds],
  )

  const pathD = useMemo(() => {
    if (!shape) return ''
    return shape.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  }, [shape])

  const arrows = useMemo(() => (shape ? directionArrows(shape, 5) : []), [shape])

  /** Coordinate del riquadro dal gesto: il viewBox non coincide coi pixel dello schermo, e senza
   *  questa conversione il trascinamento andrebbe alla deriva su ogni larghezza diversa. */
  const toViewBox = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return {
      x: ((clientX - r.left) / Math.max(1, r.width)) * VIEW_W,
      y: ((clientY - r.top) / Math.max(1, r.height)) * VIEW_H,
    }
  }, [])

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!dragId || !shape) return
    onMove(dragId, progressAtPoint(shape, toViewBox(clientX, clientY)))
  }, [dragId, shape, onMove, toViewBox])

  if (!shape) {
    return (
      <p className="text-white/40 text-[11px] leading-relaxed">
        Il tracciato non ha abbastanza punti con coordinate per disegnare il percorso.
      </p>
    )
  }

  const start = pointAtProgress(shape, 0)
  const end = pointAtProgress(shape, 1)

  return (
    <div className="select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto touch-none rounded-2xl bg-white/[0.04] border border-white/10"
        onPointerMove={e => { if (dragId) { e.preventDefault(); handleMove(e.clientX, e.clientY) } }}
        onPointerUp={() => setDragId(null)}
        onPointerLeave={() => setDragId(null)}
      >
        {/* Il tracciato: un tratto spesso e sordo sotto, il colore sopra — così i pallini che ci
            stanno addosso restano leggibili anche dove la linea si ripiega su se stessa. */}
        <path d={pathD} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathD} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

        {arrows.map((a, i) => (
          <g key={i} transform={`translate(${a.x} ${a.y}) rotate(${a.angleDeg})`}>
            <path d="M-5,-4 L5,0 L-5,4 Z" fill="rgba(255,255,255,0.85)" stroke="rgba(0,0,0,0.4)" strokeWidth={0.8} />
          </g>
        ))}

        <g>
          <circle cx={start.x} cy={start.y} r={8} fill="#22c55e" stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
          <text x={start.x} y={start.y + 21} textAnchor="middle" fontSize={9} fontWeight={700} fill="rgba(255,255,255,0.8)">
            PARTENZA
          </text>
        </g>
        {/* Su un anello l'arrivo coincide con la partenza: due pallini sovrapposti direbbero solo
            che il percorso si chiude, cosa che la linea dice già. */}
        {trackShape !== 'loop' && (
          <g>
            <circle cx={end.x} cy={end.y} r={7} fill="#ef4444" stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
            <text x={end.x} y={end.y - 13} textAnchor="middle" fontSize={9} fontWeight={700} fill="rgba(255,255,255,0.8)">
              {roundTrip ? 'GIRO DI BOA' : 'ARRIVO'}
            </text>
          </g>
        )}

        {items.map(it => {
          const p = pointAtProgress(shape, it.atP)
          const crowded = crowding.ids.has(it.id)
          const dragging = dragId === it.id
          const tint = it.kind === 'photo'
            ? '#ffffff'
            : INTERLUDE_TINT[it.interludeKind ?? 'numeri'] ?? '#ffffff'
          const r = it.kind === 'photo' ? 13 : 12
          return (
            <g
              key={it.id}
              transform={`translate(${p.x} ${p.y})`}
              className="cursor-grab"
              onPointerDown={e => {
                (e.target as Element).setPointerCapture?.(e.pointerId)
                setDragId(it.id)
              }}
            >
              {crowded && <circle r={r + 6} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.9} />}
              {dragging && <circle r={r + 10} fill="rgba(255,255,255,0.14)" />}
              <circle r={r} fill={it.kind === 'photo' ? 'rgba(15,23,20,0.92)' : tint}
                stroke={it.kind === 'photo' ? tint : 'rgba(0,0,0,0.45)'} strokeWidth={2} />
              {it.kind === 'photo'
                ? <text y={4} textAnchor="middle" fontSize={12} fill="#fff">▣</text>
                : <text y={4} textAnchor="middle" fontSize={12} fontWeight={800} fill="rgba(10,15,12,0.9)">
                    {INTERLUDE_GLYPH[it.interludeKind ?? 'numeri']}
                  </text>}
            </g>
          )
        })}
      </svg>

      <p className="text-white/30 text-[11px] mt-2 leading-relaxed">
        Trascina i pallini lungo il percorso per decidere dove cade ogni foto e ogni stacco.
        {roundTrip && ' Il percorso è un andata e ritorno: il video mostra la sola andata, quindi tutto va posizionato su quella.'}
      </p>

      {crowding.pairs.length > 0 && (
        <div className="mt-2 rounded-xl bg-amber-500/12 border border-amber-400/35 px-3.5 py-2.5">
          <p className="text-amber-200 text-[11px] leading-relaxed">
            {crowding.pairs.length === 1
              ? `Due elementi cadono a ${crowding.pairs[0].apartSec.toFixed(1)}s l'uno dall'altro`
              : `${crowding.pairs.length} coppie di elementi cadono a meno di ${MIN_ITEM_GAP_SEC}s l'una dall'altra`}
            {' '}(cerchiati in giallo): il video si fermerebbe due volte di fila senza percorso in mezzo.
            Allontanali per dare respiro al montaggio.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
        {items.filter(i => i.kind === 'interlude').map(i => (
          <span key={i.id} className="flex items-center gap-1.5 text-[10px] text-white/45">
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-stone-900"
              style={{ background: INTERLUDE_TINT[i.interludeKind ?? 'numeri'] }}>
              {INTERLUDE_GLYPH[i.interludeKind ?? 'numeri']}
            </span>
            {i.label}
          </span>
        ))}
      </div>
    </div>
  )
}
