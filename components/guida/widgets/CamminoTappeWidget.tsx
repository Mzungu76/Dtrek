import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Mountain, Loader2, Sparkles, Check, Navigation, Upload } from 'lucide-react'
import { POI_META } from '@/lib/overpass'
import { useCamminoDetail, dayColor } from '@/lib/cammini/useCamminoDetail'
import { computeTappaCts, type TappaCts } from '@/lib/cammini/tappaCts'
import type { CamminoPlan, CamminoPlanTappa } from '@/lib/cammini/plan'
import type { TappaElevation } from '@/app/api/cammini/[id]/elevation/route'
import type { TrackPoint } from '@/lib/tcxParser'
import ElevationProfileChart from '@/components/ElevationProfileChart'

const CamminoRouteMap = dynamic(() => import('./CamminoRouteMap'), { ssr: false })

type Kind = 'racconto' | 'natura' | 'sapori'
type Tab = 'percorso' | 'luoghi' | 'natura' | 'sapori'
const TAB_LABEL: Record<Tab, string> = { percorso: 'Percorso', luoghi: 'Luoghi', natura: 'Natura', sapori: 'Sapori' }
const TAB_ASK: Record<'natura' | 'sapori', string> = { natura: 'Scopri la natura di questa tappa', sapori: 'Scopri i sapori di questa tappa' }

// "Tappa per tappa" di un Cammino (docs/piano-cammini.md, Fase 5): le giornate del piano con le
// tappe dentro, ognuna espandibile. Chiusa mostra da → a, km e dislivello; aperta mostra profilo
// altimetrico, CTS stimato e il racconto di Giulia, che si scrive solo su richiesta (una tappa alla
// volta: una sezione unica per tutto il cammino superava il budget di token).

const WALK_KMH = 4

function fmtKm(m: number): string { return `${(m / 1000).toFixed(1)} km` }
function fmtHours(m: number): string {
  const min = Math.round((m / 1000 / WALK_KMH) * 60 / 5) * 5
  const h = Math.floor(min / 60), r = min % 60
  return h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${r}`
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

interface Props {
  plan: CamminoPlan
  hikeId: string
  color: string
  /** Chiamata quando un racconto di tappa viene scritto: il chiamante aggiorna la Meta in memoria. */
  onPlanChange: (plan: CamminoPlan) => void
  /** Tappe già percorse: ordinale → id dell'attività registrata o importata (mai dichiarate a mano). */
  completed?: Record<number, { activityId: string }>
  /** Registra la tappa col Navigator. */
  onRecord?: (ordinal: number) => void
  /** Importa un file del percorso (GPX…) per la tappa. */
  onImport?: (ordinal: number) => void
  /** Apre il Reportage dell'attività della tappa già percorsa. */
  onOpenActivity?: (activityId: string) => void
}

export default function CamminoTappeWidget({ plan, hikeId, color, onPlanChange, completed = {}, onRecord, onImport, onOpenActivity }: Props) {
  const [elev, setElev] = useState<Record<number, TappaElevation | 'na'>>(() => {
    const init: Record<number, TappaElevation> = {}
    for (const t of plan.tappe) {
      if (t.elevationGainM != null && t.elevationLossM != null) init[t.ordinal] = { ordinal: t.ordinal, gainM: t.elevationGainM, lossM: t.elevationLossM }
    }
    return init
  })
  const detailCatalog = useCamminoDetail(plan.camminoId)
  const todayIso = new Date().toISOString().slice(0, 10)
  const todayDay = plan.days.findIndex(d => d.date === todayIso)
  // La scheda iniziale è quella di oggi (durante il cammino), altrimenti la prima tappa non ancora percorsa.
  const seqOrdinals = plan.days.flatMap(d => d.tappe)
  const initialIndex = (() => {
    if (todayDay >= 0) return Math.max(0, seqOrdinals.indexOf(plan.days[todayDay].tappe[0]))
    const firstTodo = seqOrdinals.findIndex(o => !completed[o])
    return firstTodo >= 0 ? firstTodo : 0
  })()
  const [current, setCurrent] = useState(initialIndex)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLElement | null)[]>([])
  const [tab, setTab] = useState<Tab>('percorso')
  const [detail, setDetail] = useState<Record<number, TappaElevation | 'loading' | 'na'>>({})
  const detailRef = useRef(detail)
  detailRef.current = detail
  const [cts, setCts] = useState<Record<number, TappaCts | 'loading' | 'na'>>({})
  const [writing, setWriting] = useState<string | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  const planRef = useRef(plan)
  planRef.current = plan
  const started = useRef(false)

  // Dislivello leggero di ogni tappa (alla comparsa del widget, in sequenza).
  useEffect(() => {
    if (started.current) return
    started.current = true
    let cancelled = false
    ;(async () => {
      for (const t of plan.tappe) {
        if (cancelled) return
        if (elev[t.ordinal]) continue
        try {
          const res = await fetch(`/api/cammini/${encodeURIComponent(plan.camminoId)}/elevation?ordinal=${t.ordinal}`)
          if (!res.ok) throw new Error(String(res.status))
          const data = (await res.json()) as TappaElevation
          if (!cancelled) setElev(prev => ({ ...prev, [t.ordinal]: data }))
        } catch {
          if (!cancelled) setElev(prev => ({ ...prev, [t.ordinal]: 'na' }))
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.camminoId])

  async function ensureDetail(ordinal: number) {
    if (detailRef.current[ordinal]) return
    setDetail(prev => ({ ...prev, [ordinal]: 'loading' }))
    try {
      const res = await fetch(`/api/cammini/${encodeURIComponent(plan.camminoId)}/elevation?ordinal=${ordinal}&profile=1`)
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as TappaElevation
      setDetail(prev => ({ ...prev, [ordinal]: data }))
      setElev(prev => ({ ...prev, [ordinal]: { ordinal, gainM: data.gainM, lossM: data.lossM } }))
    } catch {
      setDetail(prev => ({ ...prev, [ordinal]: 'na' }))
    }
  }

  // Il profilo, i luoghi e il CTS si caricano per la scheda corrente (e la successiva, per averla pronta allo swipe).
  useEffect(() => {
    for (const idx of [current, current + 1]) {
      const o = seqOrdinals[idx]
      if (o != null) void ensureDetail(o)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // Posiziona il carosello sulla scheda iniziale (senza animazione) al primo render.
  useEffect(() => {
    const el = cardRefs.current[initialIndex]
    const sc = scrollerRef.current
    if (el && sc) sc.scrollLeft = el.offsetLeft - (sc.clientWidth - el.clientWidth) / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goTo(index: number) {
    const el = cardRefs.current[index]
    const sc = scrollerRef.current
    if (!el || !sc) return
    setCurrent(index)
    setTab('percorso')
    sc.scrollTo({ left: el.offsetLeft - (sc.clientWidth - el.clientWidth) / 2, behavior: 'smooth' })
  }

  // Lo swipe aggiorna la scheda corrente (la più vicina al centro), e con lei il binario.
  const rafRef = useRef<number | null>(null)
  function onScroll() {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const sc = scrollerRef.current
      if (!sc) return
      const center = sc.scrollLeft + sc.clientWidth / 2
      let best = 0, bestDist = Infinity
      cardRefs.current.forEach((el, i) => {
        if (!el) return
        const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - center)
        if (d < bestDist) { bestDist = d; best = i }
      })
      setCurrent(prev => { if (prev !== best) setTab('percorso'); return best })
    })
  }

  // CTS di ogni tappa aperta, appena profilo e luoghi sono arrivati (nel browser: usa preferenze e storico).
  useEffect(() => {
    for (const [k, d] of Object.entries(detail)) {
      const ordinal = Number(k)
      if (!d || d === 'loading' || d === 'na' || !d.points || cts[ordinal]) continue
      const tappa = plan.tappe.find(x => x.ordinal === ordinal)
      if (!tappa) continue
      setCts(prev => ({ ...prev, [ordinal]: 'loading' }))
      computeTappaCts({ points: d.points, distanceMeters: tappa.lengthM, gainM: d.gainM, lossM: d.lossM, maxM: d.maxM ?? 0, pois: d.pois ?? [] })
        .then(r => setCts(prev => ({ ...prev, [ordinal]: r ?? 'na' })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  async function writeTappa(ordinal: number, kind: Kind) {
    setWriting(`${ordinal}:${kind}`)
    setWriteError(null)
    try {
      const res = await fetch('/api/cammini/tappa-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hikeId, ordinal, kind }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data.text !== 'string') throw new Error(data.message ?? data.error ?? 'Non sono riuscita a scrivere la tappa, riprova.')
      const cur = planRef.current
      const field = kind === 'racconto' ? 'text' : kind
      onPlanChange({ ...cur, tappe: cur.tappe.map(t => (t.ordinal === ordinal ? { ...t, [field]: data.text } : t)) })
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : 'Non sono riuscita a scrivere la tappa, riprova.')
    } finally {
      setWriting(null)
    }
  }

  const byOrdinal = new Map(plan.tappe.map(t => [t.ordinal, t]))

  function textBlock(t: CamminoPlanTappa, kind: Kind) {
    const field = kind === 'racconto' ? t.text : kind === 'natura' ? t.natura : t.sapori
    const key = `${t.ordinal}:${kind}`
    const busy = writing === key
    if (field) {
      return (
        <div>
          <div className="text-[13.5px] leading-relaxed text-stone-700 whitespace-pre-line">{field}</div>
          <button type="button" disabled={writing != null} onClick={() => writeTappa(t.ordinal, kind)}
            className="mt-2 text-[11.5px] font-semibold text-stone-400 hover:text-stone-600 disabled:opacity-60">
            {busy ? 'Riscrivo…' : 'Riscrivi'}
          </button>
        </div>
      )
    }
    const label = kind === 'racconto' ? 'Racconta questa tappa con Giulia' : TAB_ASK[kind]
    return (
      <button type="button" disabled={writing != null} onClick={() => writeTappa(t.ordinal, kind)}
        className="w-full flex items-center justify-center gap-2 rounded-full border border-terra-200 bg-terra-50 hover:bg-terra-100 text-terra-700 text-[13px] font-semibold py-2.5 transition-colors disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {busy ? 'Giulia sta scrivendo…' : label}
      </button>
    )
  }

  function renderDetail(t: CamminoPlanTappa, dayIdx: number, seq: number) {
    const d = detail[t.ordinal]
    const loaded = d && d !== 'loading' && d !== 'na' ? d : null
    const ctsV = cts[t.ordinal]
    const trackPoints: TrackPoint[] | null = loaded?.points
      ? loaded.points.map(([lat, lon, alt]) => ({ time: '', lat, lon, altitudeMeters: alt }))
      : null
    const catalogTappa = detailCatalog?.tappe.find(x => x.ordinal === t.ordinal)
    const pois = loaded?.pois ?? []
    const namedPois = pois.slice(0, 40)
    const tabs: Tab[] = ['percorso', 'luoghi', 'natura', 'sapori']

    return (
      <div className="px-3.5 pb-3.5 pt-1 space-y-3">
        {textBlock(t, 'racconto')}

        <div role="tablist" className="flex gap-1 rounded-full bg-stone-100 p-1">
          {tabs.map(k => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`flex-1 rounded-full py-1.5 text-[12px] font-semibold transition-colors ${tab === k ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>
              {TAB_LABEL[k]}{k === 'luoghi' && namedPois.length > 0 ? ` ${namedPois.length}` : ''}
            </button>
          ))}
        </div>

        {tab === 'percorso' && (
          <div className="space-y-3">
            {catalogTappa ? (
              <CamminoRouteMap
                lines={[{ id: t.ordinal, points: catalogTappa.polyline, color: dayColor(dayIdx), label: String(seq) }]}
                activeId={t.ordinal}
                pois={namedPois}
                height={230}
              />
            ) : (
              <div className="h-[230px] rounded-xl bg-stone-50 flex items-center justify-center text-[12px] text-stone-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carico la mappa…</div>
            )}
            {d === 'loading' && <div className="flex items-center gap-2 text-[12px] text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calcolo profilo, luoghi e CTS della tappa…</div>}
            {d === 'na' && <p className="text-[11.5px] text-stone-400">Il profilo altimetrico di questa tappa non è disponibile.</p>}
            {loaded && (
              <>
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  {[
                    { v: `+${loaded.gainM}`, l: 'Salita m' },
                    { v: `−${loaded.lossM}`, l: 'Discesa m' },
                    { v: loaded.maxM != null ? String(loaded.maxM) : '–', l: 'Quota max' },
                    { v: ctsV && ctsV !== 'loading' && ctsV !== 'na' ? String(ctsV.ts) : ctsV === 'loading' ? '…' : '–', l: 'CTS', color: ctsV && ctsV !== 'loading' && ctsV !== 'na' ? ctsV.color : undefined },
                  ].map(x => (
                    <div key={x.l} className="rounded-xl bg-stone-50 py-2">
                      <p className="text-[14px] font-semibold tabular-nums text-stone-800" style={x.color ? { color: x.color } : undefined}>{x.v}</p>
                      <p className="text-[9.5px] uppercase tracking-wide text-stone-400">{x.l}</p>
                    </div>
                  ))}
                </div>
                {ctsV && ctsV !== 'loading' && ctsV !== 'na' && (
                  <p className="text-[10.5px] text-stone-400 -mt-1.5">CTS {ctsV.label.toLowerCase()} · calcolato su profilo, terreno e {ctsV.poisCount} luoghi lungo la tappa, con le tue preferenze e il tuo storico.</p>
                )}
                {ctsV === 'na' && <p className="text-[10.5px] text-stone-400 -mt-1.5">Non sono riuscita a calcolare il CTS di questa tappa.</p>}
                {trackPoints && trackPoints.length > 1 && (
                  <div className="rounded-xl border border-stone-100 overflow-hidden"><ElevationProfileChart trackPoints={trackPoints} /></div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'luoghi' && (
          d === 'loading' ? (
            <div className="flex items-center gap-2 text-[12px] text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cerco i luoghi lungo la tappa…</div>
          ) : namedPois.length === 0 ? (
            <p className="text-[12px] text-stone-400">Nessun luogo segnalato lungo questa tappa nei dati OpenStreetMap.</p>
          ) : (
            <ul className="rounded-xl border border-stone-100 divide-y divide-stone-100 bg-white">
              {namedPois.slice(0, 30).map(p => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-stone-50 flex items-center justify-center text-[14px]">{POI_META[p.type]?.emoji ?? '•'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-stone-800 truncate">{p.name ?? POI_META[p.type]?.label ?? 'Luogo'}</p>
                    <p className="text-[11px] text-stone-400">{POI_META[p.type]?.label ?? p.type}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-stone-400 tabular-nums">{Math.round(p.distFromTrack)} m</span>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === 'natura' && textBlock(t, 'natura')}
        {tab === 'sapori' && textBlock(t, 'sapori')}

        {writeError && seqOrdinals[current] === t.ordinal && <p className="text-[12px] text-red-600">{writeError}</p>}
      </div>
    )
  }

  // Sequenza di marcia: per ogni tappa, a quale giornata appartiene e il suo numero progressivo.
  const sequence = plan.days.flatMap((day, di) =>
    day.tappe.map(o => ({ ordinal: o, dayIdx: di, tappa: byOrdinal.get(o) })).filter((x): x is { ordinal: number; dayIdx: number; tappa: CamminoPlanTappa } => !!x.tappa),
  )
  const doneCount = sequence.filter(x => completed[x.ordinal]).length
  const doneKm = sequence.filter(x => completed[x.ordinal]).reduce((sum, x) => sum + x.tappa.lengthM, 0)
  const totalKm = sequence.reduce((sum, x) => sum + x.tappa.lengthM, 0)

  return (
    <div className="space-y-3">
      {/* Avanzamento */}
      <div>
        <div className="flex items-baseline justify-between text-[12px]">
          <p className="font-semibold text-stone-800">{doneCount} di {sequence.length} tappe percorse</p>
          <p className="text-stone-500 tabular-nums">{(doneKm / 1000).toFixed(0)} / {(totalKm / 1000).toFixed(0)} km</p>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-stone-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${totalKm > 0 ? (doneKm / totalKm) * 100 : 0}%`, background: color }} />
        </div>
      </div>

      {/* Binario: un punto per tappa, agganciato al carosello */}
      <div data-hscroll className="flex items-center gap-0 overflow-x-auto py-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} role="tablist" aria-label="Tappe del cammino">
        {sequence.map((x, i) => {
          const isDone = !!completed[x.ordinal]
          const isCurrent = i === current
          const isToday = x.dayIdx === todayDay
          return (
            <div key={x.ordinal} className="flex items-center shrink-0">
              {i > 0 && <span className="w-3 h-0.5" style={{ background: isDone || completed[sequence[i - 1].ordinal] ? color : '#e7e5e4' }} />}
              <button type="button" role="tab" aria-selected={isCurrent} aria-label={`Tappa ${i + 1}`} onClick={() => goTo(i)}
                className={`relative flex items-center justify-center rounded-full text-[11px] font-bold transition-all ${isCurrent ? 'w-9 h-9' : 'w-7 h-7'} ${isDone ? 'text-white' : isCurrent ? 'bg-white text-stone-800' : 'bg-stone-100 text-stone-500'}`}
                style={{
                  ...(isDone ? { background: color } : {}),
                  ...(isCurrent ? { boxShadow: `0 0 0 2px ${color}` } : isToday ? { boxShadow: `0 0 0 1.5px ${color}66` } : {}),
                }}>
                {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </button>
            </div>
          )
        })}
      </div>

      {/* Carosello a schede: una per tappa, scorrimento orizzontale agganciato */}
      <div ref={scrollerRef} data-hscroll onScroll={onScroll}
        className="-mx-4 flex items-start gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-2 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}>
        {sequence.map((x, i) => {
          const t = x.tappa
          const day = plan.days[x.dayIdx]
          const e = elev[t.ordinal]
          const isDone = completed[t.ordinal]
          const isCurrent = i === current
          return (
            <article key={t.ordinal} ref={el => { cardRefs.current[i] = el }} aria-label={`Tappa ${i + 1}`}
              className={`snap-center shrink-0 w-[calc(100%-2.5rem)] sm:w-[28rem] rounded-2xl border bg-white overflow-hidden transition-opacity ${isCurrent ? 'border-stone-200 opacity-100' : 'border-stone-100 opacity-60'}`}>
              <header className="px-3.5 pt-3 pb-2.5 border-b border-stone-100" style={{ background: `${dayColor(x.dayIdx)}12` }}>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <p className="font-semibold text-stone-600">
                    Giorno {x.dayIdx + 1}{day.date ? <span className="font-normal text-stone-400"> · {fmtDate(day.date)}</span> : null}
                    {x.dayIdx === todayDay && <span className="ml-2 rounded-full bg-forest-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Oggi</span>}
                  </p>
                  {isDone && <span className="flex items-center gap-1 font-semibold text-forest-700"><Check className="w-3.5 h-3.5" /> Percorsa</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white" style={{ background: dayColor(x.dayIdx) }}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-tight font-semibold text-stone-800 truncate">{t.fromName ?? 'Partenza'}</p>
                    <p className="text-[12px] leading-tight text-stone-500 truncate">→ {t.toName ?? 'Arrivo'}</p>
                  </div>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-stone-600 tabular-nums">
                  <span className="font-semibold">{fmtKm(t.lengthM)}</span>
                  <span>{fmtHours(t.lengthM)}</span>
                  {e && e !== 'na' ? <span className="flex items-center gap-1"><Mountain className="w-3 h-3" />+{e.gainM} / −{e.lossM} m</span> : e == null ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {t.endsAtAnchor === false && <span className="text-amber-600">chiude in aperta campagna</span>}
                </p>
              </header>

              {isCurrent ? renderDetail(t, x.dayIdx, i + 1) : (
                <div className="px-3.5 py-6 text-center text-[12px] text-stone-400">Scorri per aprire questa tappa</div>
              )}

              <footer className="px-3.5 py-3 border-t border-stone-100 bg-stone-50/60">
                {isDone ? (
                  <button type="button" onClick={() => onOpenActivity?.(isDone.activityId)}
                    className="w-full flex items-center justify-center gap-2 rounded-full border border-forest-200 bg-forest-50 text-forest-800 text-[13px] font-semibold py-2.5">
                    <Check className="w-4 h-4" /> Apri il reportage della tappa
                  </button>
                ) : (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button type="button" onClick={() => onRecord?.(t.ordinal)} disabled={!onRecord}
                      className="flex items-center justify-center gap-2 rounded-full bg-forest-600 hover:bg-forest-700 text-white text-[13px] font-semibold py-2.5 transition-colors disabled:opacity-50">
                      <Navigation className="w-4 h-4" /> Registra la tappa
                    </button>
                    <button type="button" onClick={() => onImport?.(t.ordinal)} disabled={!onImport} aria-label="Importa il file del percorso (GPX)"
                      className="flex items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white text-stone-700 text-[12.5px] font-semibold px-4 transition-colors disabled:opacity-50">
                      <Upload className="w-4 h-4" /> GPX
                    </button>
                  </div>
                )}
              </footer>
            </article>
          )
        })}
      </div>
      <p className="text-[10.5px] text-stone-400">Scorri le schede o tocca un numero. Tempi a 4 km/h, senza soste; il dislivello è indicativo (modello digitale del terreno). Una tappa risulta percorsa quando la registri col Navigator o importi il file del percorso.</p>
    </div>
  )
}
