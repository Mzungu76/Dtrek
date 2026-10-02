'use client'
import { useMemo, useRef, useState } from 'react'
import { Navigation, Upload, Check, ChevronRight, BookOpen } from 'lucide-react'
import { POI_META } from '@/lib/overpass'
import { useTappaData } from '@/lib/cammini/useTappaData'
import { poisAlongTappa } from '@/lib/cammini/tappaPois'
import { buildSequence, currentTappa } from '@/lib/cammini/progress'
import type { CamminoPlan } from '@/lib/cammini/plan'
import { fmtDay, type TappaDone } from './CamminoTappaDetail'

// Guida di un cammino, schermata B (docs/piano-cammini.md, Fase 5): in alto la tappa di oggi (o la prossima),
// con CTS, luoghi davanti a te e Naviga; sotto il diario di marcia con tutte le tappe — percorse e da
// percorrere — ognuna apribile per vedere cosa aspetta.

const WALK_KMH = 4
const fmtHours = (m: number) => {
  const min = Math.round((m / 1000 / WALK_KMH) * 60 / 5) * 5
  const h = Math.floor(min / 60), r = min % 60
  return h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${r}`
}
const fmtDur = (s: number) => `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`
const kmL = (m: number) => (m / 1000).toFixed(1).replace('.', ',')

interface CommonProps {
  plan: CamminoPlan
  hikeId: string
  done: Record<number, TappaDone>
  onPlanChange: (plan: CamminoPlan) => void
  onOpenTappa: (ordinal: number) => void
  onNaviga: (ordinal: number) => void
  onImporta: (ordinal: number) => void
  onOpenReportage: () => void
}

export function CamminoOggiCard({ plan, hikeId, done, onPlanChange, onOpenTappa, onNaviga, onImporta }: CommonProps) {
  const planRef = useRef(plan)
  planRef.current = plan
  const todayIso = new Date().toISOString().slice(0, 10)
  const cur = useMemo(() => currentTappa(plan, new Set(Object.keys(done).map(Number)), todayIso), [plan, done, todayIso])
  const ordinal = cur?.item.ordinal ?? null
  const state = useTappaData(plan, hikeId, ordinal, (o, cts) => {
    onPlanChange({ ...planRef.current, tappe: planRef.current.tappe.map(x => (x.ordinal === o ? { ...x, cts: { ts: cts.ts, label: cts.label, color: cts.color, computedAt: new Date().toISOString() } } : x)) })
  })
  if (!cur) return null
  const { item, isToday } = cur
  const t = item.tappa
  const total = buildSequence(plan).length
  const ready = state.status === 'ready' ? state : null
  const ctsV = ready?.cts
  const cts = ctsV && ctsV !== 'loading' && ctsV !== 'na' ? ctsV : t.cts ?? null
  const along = ready?.data.points && ready.data.profile ? poisAlongTappa((ready.data.pois ?? []).filter(p => p.name), ready.data.points, ready.data.profile, plan.direction === 'reverse') : []
  const finished = !!done[item.ordinal]
  const day = plan.days[item.dayIdx]

  return (
    <div className="px-4 pt-4">
      <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-forest-700 to-forest-900 p-4 text-white">
        <div className="flex items-center justify-between">
          <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.14em] text-[#e9d9a8]">
            {finished ? 'Ultima tappa' : isToday ? 'Oggi' : 'Prossima tappa'} · {isToday ? `giorno ${item.dayIdx + 1} di ${plan.days.length}` : `${item.seq} di ${total}`}
          </p>
          {day?.date && <p className="text-[12px] font-semibold text-white/80">{fmtDay(day.date)}</p>}
        </div>
        <button type="button" onClick={() => onOpenTappa(item.ordinal)} className="mt-2 block w-full text-left">
          <p className="font-display text-[25px] font-bold leading-[1.12]">{t.fromName ?? 'Partenza'} → {t.toName ?? 'Arrivo'}</p>
        </button>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 text-[13px] text-white/80">
          <span><b className="text-[15px] text-white">{kmL(t.lengthM)}</b> km</span>
          <span><b className="text-[15px] text-white">{fmtHours(t.lengthM)}</b></span>
          <span><b className="text-[15px] text-white">{(ready?.data.gainM ?? t.elevationGainM) != null ? `+${Math.round((ready?.data.gainM ?? t.elevationGainM) as number)}` : '–'}</b> m</span>
          <span className="rounded-full px-2.5 py-0.5 text-[13px] font-bold text-white" style={{ background: cts?.color ?? 'rgba(255,255,255,.22)' }}>CTS {cts ? cts.ts : ctsV === 'na' ? '–' : '…'}</span>
        </div>
        <div className="mt-3.5 grid grid-cols-[1fr_auto] gap-2">
          {finished ? (
            <button type="button" onClick={() => onOpenTappa(item.ordinal)} className="flex items-center justify-center gap-2 rounded-full bg-white py-3 text-[14px] font-bold text-forest-900"><Check className="w-4 h-4" /> Tappa percorsa · apri</button>
          ) : (
            <button type="button" onClick={() => onNaviga(item.ordinal)} className="flex items-center justify-center gap-2 rounded-full bg-white py-3 text-[14px] font-bold text-forest-900"><Navigation className="w-4 h-4" /> Naviga</button>
          )}
          {!finished && <button type="button" onClick={() => onImporta(item.ordinal)} className="flex items-center gap-1.5 rounded-full border-[1.5px] border-white/55 px-4 text-[13px] font-bold"><Upload className="w-4 h-4" /> Importa</button>}
        </div>
      </div>

      {along.length > 0 && (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white px-3.5 pb-1 pt-2.5">
          <div className="flex items-baseline justify-between">
            <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Luoghi sulla strada</p>
            <button type="button" onClick={() => onOpenTappa(item.ordinal)} className="text-[12px] font-bold text-forest-700">Tutti ›</button>
          </div>
          <ul className="divide-y divide-stone-100">
            {along.slice(0, 3).map(({ poi, km }) => (
              <li key={poi.id} className="flex items-center gap-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-800">{poi.name}</span>
                <span className="shrink-0 text-[11px] text-stone-500">{POI_META[poi.type]?.label ?? ''}</span>
                <span className="w-12 shrink-0 text-right text-[12px] font-bold tabular-nums text-stone-600">km {km.toFixed(1).replace('.', ',')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function CamminoDiario({ plan, done, onOpenTappa, onOpenReportage }: CommonProps) {
  const seq = useMemo(() => buildSequence(plan), [plan])
  const [showDone, setShowDone] = useState(false)
  const [showFuture, setShowFuture] = useState(false)
  const todayIso = new Date().toISOString().slice(0, 10)
  const cur = useMemo(() => currentTappa(plan, new Set(Object.keys(done).map(Number)), todayIso), [plan, done, todayIso])
  const doneItems = seq.filter(x => done[x.ordinal])
  const todo = seq.filter(x => !done[x.ordinal])
  const hiddenDone = doneItems.length > 3 && !showDone ? doneItems.slice(0, doneItems.length - 2) : []
  const shownDone = hiddenDone.length ? doneItems.slice(-2) : doneItems
  const shownTodo = showFuture || todo.length <= 5 ? todo : todo.slice(0, 4)
  const km = doneItems.reduce((s, x) => s + (done[x.ordinal]?.distanceMeters ?? 0), 0)

  const dot = (variant: 'done' | 'now' | 'todo') => variant === 'done'
    ? <span className="absolute -left-[30px] top-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-forest-600"><Check className="h-3 w-3 text-white" strokeWidth={3.5} /></span>
    : variant === 'now'
      ? <span className="absolute -left-[33px] top-0 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[12px] font-bold shadow-[0_0_0_3px_#9A7B3F]" />
      : <span className="absolute -left-[28px] top-1 h-[18px] w-[18px] rounded-full border-2 border-stone-300 bg-white" />

  return (
    <div className="px-4 pt-2">
      <div className="flex items-baseline justify-between">
        <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Diario di marcia</p>
        <p className="text-[12px] text-stone-500">{doneItems.length} di {seq.length} tappe · {(km / 1000).toFixed(0)} km</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-forest-600" style={{ width: `${seq.length ? (doneItems.length / seq.length) * 100 : 0}%` }} /></div>

      <div className="relative mt-3 pl-[34px]">
        <div className="absolute bottom-2 left-[13px] top-2 w-0.5 bg-stone-300" />
        {hiddenDone.length > 0 && (
          <button type="button" onClick={() => setShowDone(true)} className="relative mb-2.5 block text-left">
            {dot('done')}
            <span className="text-[13px] font-semibold text-stone-700">+ {hiddenDone.length} tappe percorse ›</span>
          </button>
        )}
        {shownDone.map(x => {
          const d = done[x.ordinal]
          return (
            <button key={x.ordinal} type="button" onClick={() => onOpenTappa(x.ordinal)} className="relative mb-2.5 block w-full text-left">
              {dot('done')}
              <span className="flex items-baseline justify-between gap-2"><span className="text-[13px] font-bold text-stone-800">{x.tappa.fromName} → {x.tappa.toName}</span><span className="shrink-0 text-[11px] text-stone-500">{new Date(d.startTime).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span></span>
              <span className="flex items-center gap-2 text-[12px] text-stone-500">{kmL(d.distanceMeters)} km · {fmtDur(d.totalTimeSeconds)} · +{Math.round(d.elevationGain)} m{x.tappa.cts && <span className="rounded-full px-1.5 py-px text-[10.5px] font-bold text-white" style={{ background: x.tappa.cts.color }}>CTS {x.tappa.cts.ts}</span>}</span>
            </button>
          )
        })}
        {shownTodo.map((x, i) => {
          const isNow = cur?.item.ordinal === x.ordinal
          return (
            <button key={x.ordinal} type="button" onClick={() => onOpenTappa(x.ordinal)} className={`relative block w-full text-left ${i === shownTodo.length - 1 ? '' : 'mb-2.5'}`}>
              {isNow ? <span className="absolute -left-[33px] top-0 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[12px] font-bold shadow-[0_0_0_3px_#9A7B3F]">{x.seq}</span> : dot('todo')}
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-[13px] ${isNow ? 'font-bold text-[#7a5f28]' : 'font-semibold text-stone-700'}`}>{isNow ? 'Oggi · ' : ''}{x.tappa.fromName} → {x.tappa.toName}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
              </span>
              <span className="flex items-center gap-2 text-[12px] text-stone-500">{kmL(x.tappa.lengthM)} km · {fmtHours(x.tappa.lengthM)}{x.tappa.elevationGainM != null && ` · +${Math.round(x.tappa.elevationGainM)} m`}{x.tappa.cts && <span className="rounded-full px-1.5 py-px text-[10.5px] font-bold text-white" style={{ background: x.tappa.cts.color }}>CTS {x.tappa.cts.ts}</span>}</span>
            </button>
          )
        })}
        {!showFuture && todo.length > 5 && (
          <button type="button" onClick={() => setShowFuture(true)} className="relative mt-2.5 block text-left">
            {dot('todo')}
            <span className="text-[13px] font-semibold text-stone-600">e altre {todo.length - 4} tappe ›</span>
          </button>
        )}
      </div>

      {doneItems.length > 0 && (
        <button type="button" onClick={onOpenReportage} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-forest-200 bg-forest-50 py-2.5 text-[13px] font-bold text-forest-800">
          <BookOpen className="h-4 w-4" /> Reportage del cammino{plan.report?.chapters.length ? ` · ${plan.report.chapters.length} ${plan.report.chapters.length === 1 ? 'capitolo' : 'capitoli'}` : ''}
        </button>
      )}
    </div>
  )
}
