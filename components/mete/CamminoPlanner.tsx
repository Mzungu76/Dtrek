'use client'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowLeftRight, Loader2, Calendar, Check } from 'lucide-react'
import type { CamminoDetail } from '@/app/api/cammini/[id]/route'
import {
  buildCamminoPlan, selectionPolyline, selectTappe, orderForDirection,
  DEFAULT_DAY_KM, MAX_DAY_KM, MIN_DAY_KM, type CamminoPlan, type DayGrouping,
} from '@/lib/cammini/plan'

// Un cammino lungo non si fa in una volta: qui si sceglie quali tappe, in che verso, quanti
// chilometri al giorno e da quando (docs/piano-cammini.md, Fase 4). Le tappe sono i tratti reali del
// cammino e non si spezzano: "più tappe al giorno" le accorpa, mai le divide. L'anteprima sulla
// mappa mostra la selezione in tempo reale.

const DEFAULT_RETE_TAPPE = 6

function fmtKm(m: number): string {
  return `${(m / 1000).toFixed(m >= 100_000 ? 0 : 1)} km`
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default function CamminoPlanner({ detail, creating, error, onBack, onPreview, onCreate }: {
  detail: CamminoDetail
  creating: boolean
  error: string | null
  onBack: () => void
  /** Selezione corrente come polilinea da evidenziare sulla mappa (null alla chiusura). */
  onPreview: (polyline: [number, number][] | null) => void
  onCreate: (plan: CamminoPlan) => void
}) {
  const tappe = detail.tappe
  const first = tappe[0]?.ordinal ?? 1
  const last = tappe[tappe.length - 1]?.ordinal ?? 1
  const isRete = detail.stats.structure === 'rete'

  const [fromOrd, setFromOrd] = useState(first)
  // Una rete non si fa intera: si parte da un tratto breve, da allargare.
  const [toOrd, setToOrd] = useState(isRete ? Math.min(last, first + DEFAULT_RETE_TAPPE - 1) : last)
  const [direction, setDirection] = useState<'forward' | 'reverse'>('forward')
  const [perDay, setPerDay] = useState(false)
  const [maxKm, setMaxKm] = useState(DEFAULT_DAY_KM)
  const [startDate, setStartDate] = useState('')
  // Selezione a due tocchi: prima tappa, poi ultima. `anchor` è la prima in attesa della seconda.
  const [anchor, setAnchor] = useState<number | null>(null)

  const grouping: DayGrouping = perDay ? { mode: 'max_km', maxKm } : { mode: 'one_per_day' }
  const today = new Date().toISOString().slice(0, 10)

  const plan = useMemo(() => {
    try {
      return buildCamminoPlan(detail, { fromOrdinal: fromOrd, toOrdinal: toOrd, direction, grouping, startDate: startDate || undefined })
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, fromOrd, toOrd, direction, perDay, maxKm, startDate])

  // Anteprima sulla mappa; alla chiusura del pianificatore la selezione sparisce.
  useEffect(() => {
    onPreview(plan ? selectionPolyline(detail, { fromOrdinal: fromOrd, toOrdinal: toOrd, direction }) : null)
    return () => onPreview(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  const selected = selectTappe(tappe, fromOrd, toOrd)
  const ordered = orderForDirection(selected, direction)
  const totalM = selected.reduce((s, t) => s + t.lengthM, 0)
  const startName = ordered[0]?.fromName ?? 'Inizio'
  const endName = ordered[ordered.length - 1]?.toName ?? 'Fine'
  const forwardStart = selected[0]?.fromName ?? 'Inizio'
  const forwardEnd = selected[selected.length - 1]?.toName ?? 'Fine'

  const pickTappa = (ord: number) => {
    if (anchor == null) { setFromOrd(ord); setToOrd(ord); setAnchor(ord) }
    else { setFromOrd(Math.min(anchor, ord)); setToOrd(Math.max(anchor, ord)); setAnchor(null) }
  }
  const selectAll = () => { setFromOrd(first); setToOrd(last); setAnchor(null) }

  const sectionLabel = 'text-[10.5px] font-bold uppercase tracking-wide text-stone-400'
  const segBase = 'rounded-xl px-2.5 py-2.5 text-[12px] transition-colors border'
  const segOn = 'bg-forest-50 border-forest-300 text-forest-900 font-semibold'
  const segOff = 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-stone-500 hover:text-stone-700 mb-2.5 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Torna alle tappe
      </button>
      <p className="font-display text-[14px] font-semibold text-stone-800 mb-3">Pianifica il tuo cammino</p>

      {isRete && (
        <p className="text-[11px] text-stone-500 bg-stone-50 rounded-xl px-3 py-2 mb-3">
          Questa è una rete di percorsi: scegli il tratto che vuoi fare, non l&apos;intera rete.
        </p>
      )}

      {/* Quali tappe: elenco a due tocchi (prima e ultima), con il tratto scelto evidenziato. */}
      <div className="flex items-end justify-between mb-1.5">
        <p className={sectionLabel}>Quali tappe</p>
        {!(fromOrd === first && toOrd === last) && (
          <button type="button" onClick={selectAll} className="text-[11px] font-semibold text-forest-700 hover:text-forest-800">Tutto il cammino</button>
        )}
      </div>
      <p className="text-[11px] text-stone-500 mb-1.5">
        {anchor != null ? 'Ora tocca l\u2019ultima tappa del tratto.' : 'Tocca la prima tappa, poi l\u2019ultima.'}
      </p>
      <ul className="relative max-h-[232px] overflow-y-auto overscroll-contain rounded-2xl border border-stone-100 bg-white divide-y divide-stone-100 mb-3">
        {tappe.map(t => {
          const inRange = t.ordinal >= fromOrd && t.ordinal <= toOrd
          const edge = t.ordinal === fromOrd || t.ordinal === toOrd
          return (
            <li key={t.ordinal}>
              <button type="button" onClick={() => pickTappa(t.ordinal)} aria-pressed={inRange}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${inRange ? 'bg-forest-50/70' : 'hover:bg-stone-50'}`}>
                <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${edge ? 'bg-forest-600 text-white' : inRange ? 'bg-forest-100 text-forest-800' : 'bg-stone-100 text-stone-500'}`}>
                  {t.ordinal}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[12.5px] leading-tight ${inRange ? 'text-forest-900 font-semibold' : 'text-stone-700'}`}>{t.fromName ?? 'Partenza'}</span>
                  <span className="block truncate text-[11px] leading-tight text-stone-400">→ {t.toName ?? 'Arrivo'}</span>
                </span>
                <span className="shrink-0 text-[11.5px] font-semibold text-stone-500 tabular-nums">{fmtKm(t.lengthM)}</span>
                {inRange && <Check className="shrink-0 w-3.5 h-3.5 text-forest-600" />}
              </button>
            </li>
          )
        })}
      </ul>

      {/* In che verso */}
      <p className={`${sectionLabel} mb-1.5`}>In che verso</p>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {([['forward', forwardStart, forwardEnd], ['reverse', forwardEnd, forwardStart]] as const).map(([d, from, to]) => (
          <button key={d} type="button" onClick={() => setDirection(d)} aria-pressed={direction === d}
            className={`${segBase} text-left leading-tight ${direction === d ? segOn : segOff}`}>
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-stone-400 mb-0.5">
              {d === 'forward' ? <ArrowRight className="w-3 h-3" /> : <ArrowLeftRight className="w-3 h-3" />}{d === 'forward' ? 'Come nel catalogo' : 'Al contrario'}
            </span>
            <span className="block truncate">{from}</span>
            <span className="block truncate text-stone-400">→ {to}</span>
          </button>
        ))}
      </div>

      {/* Quanto al giorno */}
      <p className={`${sectionLabel} mb-1.5`}>Giornate</p>
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        {([[false, 'Una tappa al giorno'], [true, 'Più tappe al giorno']] as const).map(([v, label]) => (
          <button key={String(v)} type="button" onClick={() => setPerDay(v)} aria-pressed={perDay === v}
            className={`${segBase} ${perDay === v ? segOn : segOff}`}>
            {label}
          </button>
        ))}
      </div>
      {perDay && (
        <div className="mb-3">
          <p className="text-[11.5px] text-stone-600 mb-1">Fino a <span className="font-bold text-stone-800">{maxKm} km</span> al giorno</p>
          <input type="range" min={MIN_DAY_KM} max={MAX_DAY_KM} step={1} value={maxKm} onChange={e => setMaxKm(Number(e.target.value))}
            aria-label="Chilometri massimi al giorno" className="w-full accent-forest-600" />
          <p className="text-[10.5px] text-stone-400">Le tappe non si spezzano: una più lunga del limite resta una giornata a sé.</p>
        </div>
      )}
      {!perDay && <div className="mb-3" />}

      {/* Quando */}
      <label className="block mb-3">
        <span className={`flex items-center gap-1 ${sectionLabel} mb-1.5`}><Calendar className="w-3 h-3" /> Quando parti (facoltativo)</span>
        <input type="date" value={startDate} min={today} onChange={e => setStartDate(e.target.value)}
          className="w-full text-[13px] bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 outline-none focus:border-forest-400" />
      </label>

      {/* Riepilogo */}
      {plan && (
        <div className="bg-forest-50/50 border border-forest-100 rounded-2xl p-3.5 mb-3">
          <p className="text-[12px] font-semibold text-stone-800">
            {plan.tappe.length} {plan.tappe.length === 1 ? 'tappa' : 'tappe'} · {fmtKm(totalM)} · {plan.days.length} {plan.days.length === 1 ? 'giorno' : 'giorni'}
          </p>
          <p className="text-[11px] text-stone-500 mb-2">{startName} → {endName}</p>
          <ol className="space-y-1">
            {plan.days.map((d, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="text-stone-700">
                  <span className="font-semibold">Giorno {i + 1}</span>{d.date ? <span className="text-stone-400"> · {fmtDate(d.date)}</span> : null}
                  <span className="text-stone-400"> · {d.tappe.length === 1 ? `tappa ${d.tappe[0]}` : `tappe ${d.tappe[0]}–${d.tappe[d.tappe.length - 1]}`}</span>
                </span>
                <span className={`shrink-0 font-semibold ${d.lengthM > 35_000 ? 'text-amber-600' : 'text-stone-600'}`}>{fmtKm(d.lengthM)}</span>
              </li>
            ))}
          </ol>
          {plan.days.some(d => d.lengthM > 35_000) && (
            <p className="text-[10.5px] text-amber-600 mt-2">Alcune giornate superano i 35 km: sono tappe lunghe, valuta di riposare o spezzare il programma.</p>
          )}
        </div>
      )}

      {/* Sempre raggiungibile: il pulsante resta fisso in fondo al foglio mentre si scorrono le scelte. */}
      <div className="sticky bottom-0 -mx-4 px-4 pt-2.5 pb-1.5 bg-white border-t border-stone-100">
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <button type="button" disabled={!plan || creating} onClick={() => plan && onCreate(plan)}
          className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-forest-600 hover:bg-forest-700 disabled:opacity-60 rounded-full py-3 transition-colors">
          {creating && <Loader2 className="w-4 h-4 animate-spin" />} Crea guida
        </button>
      </div>
    </div>
  )
}
