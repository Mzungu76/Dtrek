import { useEffect, useRef, useState } from 'react'
import { Mountain, Loader2 } from 'lucide-react'
import type { CamminoPlan } from '@/lib/cammini/plan'
import type { TappaElevation } from '@/app/api/cammini/[id]/elevation/route'

// "Tappa per tappa" di un Cammino (docs/piano-cammini.md, Fase 5): le giornate del piano con le
// tappe dentro. Il dislivello si calcola dal DTM una volta per tappa e resta nel catalogo; qui si
// chiede in sequenza appena il widget compare, mai tutto insieme.

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

export default function CamminoTappeWidget({ plan, color }: { plan: CamminoPlan; color: string }) {
  const [elev, setElev] = useState<Record<number, TappaElevation | 'na'>>(() => {
    const init: Record<number, TappaElevation> = {}
    for (const t of plan.tappe) {
      if (t.elevationGainM != null && t.elevationLossM != null) init[t.ordinal] = { ordinal: t.ordinal, gainM: t.elevationGainM, lossM: t.elevationLossM }
    }
    return init
  })
  const started = useRef(false)

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

  const byOrdinal = new Map(plan.tappe.map(t => [t.ordinal, t]))
  let n = 0

  return (
    <div className="space-y-3">
      {plan.days.map((day, di) => {
        const ts = day.tappe.map(o => byOrdinal.get(o)).filter((x): x is NonNullable<typeof x> => !!x)
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
                return (
                  <li key={t.ordinal} className="flex items-center gap-3 px-3.5 py-2.5">
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
