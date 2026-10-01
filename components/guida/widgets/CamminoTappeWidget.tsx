import { useEffect, useRef, useState } from 'react'
import { Mountain, Loader2, ChevronDown, Sparkles } from 'lucide-react'
import type { CamminoPlan, CamminoPlanTappa } from '@/lib/cammini/plan'
import type { TappaElevation } from '@/app/api/cammini/[id]/elevation/route'
import type { TrackPoint } from '@/lib/tcxParser'
import ElevationProfileChart from '@/components/ElevationProfileChart'

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
}

export default function CamminoTappeWidget({ plan, hikeId, color, onPlanChange }: Props) {
  const [elev, setElev] = useState<Record<number, TappaElevation | 'na'>>(() => {
    const init: Record<number, TappaElevation> = {}
    for (const t of plan.tappe) {
      if (t.elevationGainM != null && t.elevationLossM != null) init[t.ordinal] = { ordinal: t.ordinal, gainM: t.elevationGainM, lossM: t.elevationLossM }
    }
    return init
  })
  const [open, setOpen] = useState<number | null>(null)
  const [detail, setDetail] = useState<Record<number, TappaElevation | 'loading' | 'na'>>({})
  const [writing, setWriting] = useState<number | null>(null)
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

  async function toggle(ordinal: number) {
    const next = open === ordinal ? null : ordinal
    setOpen(next)
    setWriteError(null)
    if (next == null || detail[ordinal]) return
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

  async function writeTappa(ordinal: number) {
    setWriting(ordinal)
    setWriteError(null)
    try {
      const res = await fetch('/api/cammini/tappa-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hikeId, ordinal }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data.text !== 'string') throw new Error(data.message ?? data.error ?? 'Non sono riuscita a scrivere la tappa, riprova.')
      const cur = planRef.current
      onPlanChange({ ...cur, tappe: cur.tappe.map(t => (t.ordinal === ordinal ? { ...t, text: data.text } : t)) })
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : 'Non sono riuscita a scrivere la tappa, riprova.')
    } finally {
      setWriting(null)
    }
  }

  const byOrdinal = new Map(plan.tappe.map(t => [t.ordinal, t]))
  let n = 0

  function renderDetail(t: CamminoPlanTappa) {
    const d = detail[t.ordinal]
    const trackPoints: TrackPoint[] | null = d && d !== 'loading' && d !== 'na' && d.points
      ? d.points.map(([lat, lon, alt]) => ({ time: '', lat, lon, altitudeMeters: alt }))
      : null
    return (
      <div className="px-3.5 pb-3.5 pt-1 space-y-3">
        {d === 'loading' && (
          <div className="flex items-center gap-2 text-[12px] text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calcolo il profilo della tappa…</div>
        )}
        {d === 'na' && <p className="text-[11.5px] text-stone-400">Il profilo altimetrico di questa tappa non è disponibile.</p>}
        {d && d !== 'loading' && d !== 'na' && (
          <>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                { v: `+${d.gainM}`, l: 'Salita m' },
                { v: `−${d.lossM}`, l: 'Discesa m' },
                { v: d.maxM != null ? String(d.maxM) : '–', l: 'Quota max' },
                { v: d.cts ? String(d.cts.ts) : '–', l: 'CTS stimato', color: d.cts?.color },
              ].map(s => (
                <div key={s.l} className="rounded-xl bg-stone-50 py-2">
                  <p className="text-[14px] font-semibold tabular-nums text-stone-800" style={s.color ? { color: s.color } : undefined}>{s.v}</p>
                  <p className="text-[9.5px] uppercase tracking-wide text-stone-400">{s.l}</p>
                </div>
              ))}
            </div>
            {d.cts && <p className="text-[10.5px] text-stone-400 -mt-1.5">CTS {d.cts.label.toLowerCase()} · stima dal solo profilo della tappa, senza i luoghi lungo la strada.</p>}
            {trackPoints && trackPoints.length > 1 && (
              <div className="rounded-xl border border-stone-100 overflow-hidden"><ElevationProfileChart trackPoints={trackPoints} /></div>
            )}
          </>
        )}

        {t.text ? (
          <div>
            <div className="text-[13.5px] leading-relaxed text-stone-700 whitespace-pre-line">{t.text}</div>
            <button type="button" disabled={writing != null} onClick={() => writeTappa(t.ordinal)}
              className="mt-2 text-[11.5px] font-semibold text-stone-400 hover:text-stone-600 disabled:opacity-60">
              {writing === t.ordinal ? 'Riscrivo…' : 'Riscrivi'}
            </button>
          </div>
        ) : (
          <button type="button" disabled={writing != null} onClick={() => writeTappa(t.ordinal)}
            className="w-full flex items-center justify-center gap-2 rounded-full border border-terra-200 bg-terra-50 hover:bg-terra-100 text-terra-700 text-[13px] font-semibold py-2.5 transition-colors disabled:opacity-60">
            {writing === t.ordinal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {writing === t.ordinal ? 'Giulia sta scrivendo…' : 'Racconta questa tappa con Giulia'}
          </button>
        )}
        {writeError && open === t.ordinal && <p className="text-[12px] text-red-600">{writeError}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {plan.days.map((day, di) => {
        const ts = day.tappe.map(o => byOrdinal.get(o)).filter((x): x is CamminoPlanTappa => !!x)
        return (
          <section key={di} className="rounded-2xl border border-stone-100 bg-white overflow-hidden">
            <header className="flex items-baseline justify-between gap-2 px-3.5 py-2.5 bg-stone-50 border-b border-stone-100">
              <p className="text-[12.5px] font-semibold text-stone-800">
                Giorno {di + 1}{day.date ? <span className="font-normal text-stone-400"> · {fmtDate(day.date)}</span> : null}
              </p>
              <p className="text-[11.5px] text-stone-500 tabular-nums">{fmtKm(day.lengthM)} · {fmtHours(day.lengthM)}</p>
            </header>
            <ol className="divide-y divide-stone-100">
              {ts.map(t => {
                n += 1
                const e = elev[t.ordinal]
                const isOpen = open === t.ordinal
                return (
                  <li key={t.ordinal}>
                    <button type="button" onClick={() => toggle(t.ordinal)} aria-expanded={isOpen}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-stone-50/70 transition-colors">
                      <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: color }}>{n}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-tight font-semibold text-stone-800 truncate">{t.fromName ?? 'Partenza'}</p>
                        <p className="text-[11.5px] leading-tight text-stone-400 truncate">→ {t.toName ?? 'Arrivo'}</p>
                        {t.endsAtAnchor === false && <p className="text-[10.5px] text-amber-600 mt-0.5">Si chiude in aperta campagna: verifica dove dormire.</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[12px] font-semibold text-stone-700 tabular-nums">{fmtKm(t.lengthM)}</p>
                        <p className="text-[10.5px] text-stone-400 tabular-nums flex items-center justify-end gap-1">
                          {e == null ? <Loader2 className="w-3 h-3 animate-spin" /> : e === 'na' ? null : <><Mountain className="w-3 h-3" />+{e.gainM} / −{e.lossM} m</>}
                        </p>
                      </div>
                      <ChevronDown className={`shrink-0 w-4 h-4 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && renderDetail(t)}
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
      <p className="text-[10.5px] text-stone-400">Tempi a 4 km/h, senza soste. Il dislivello è indicativo, calcolato sul modello digitale del terreno.</p>
    </div>
  )
}
