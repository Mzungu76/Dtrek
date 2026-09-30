'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Target, Flag, Mountain, Trophy, CalendarHeart, GitCompareArrows, TrendingUp, Ruler, CalendarDays,
  Clock, CalendarRange, Activity, Lightbulb, Moon, Sunrise, CloudSun, PenLine, Repeat, Image as ImageIcon,
  Pencil, ChevronRight, RefreshCw, X, Loader2,
} from 'lucide-react'
import { getMoonIllumination } from 'suncalc'
import { fetchNearbyWiki, isSpecificName, type WikiPage } from '@/lib/wikipedia'
import { fetchDayHourly, wmoInfo, type HourlyWeatherFull } from '@/lib/weather'
import { getSunTimes } from '@/lib/daylight'
import { fetchActivityPhotos } from '@/lib/activityPhotos'
import { getQuestionnaire } from '@/lib/questionnaireStore'
import {
  weekOverWeek, yearProgress, monthChallenge, yearRecords, topAltitudes, anniversaries,
  distanceDistribution, DISTANCE_BUCKETS, weekdayCounts, startHourDistribution, START_HOUR_BUCKETS,
  cumulativeKmByMonth, busiestMonth, recentElevations,
} from '@/lib/dashboardStats'
import type { ActivityMeta } from '@/lib/blobStore'
import type { PlannedHikeMeta } from '@/lib/plannedStore'
import {
  CARD, EYEBROW, WidgetEmpty, WidgetShell, MiniBars, ProgressBar, fmtKm, fmtDate, readLocal, writeLocal,
  type WidgetProps, type WidgetCatalogEntry,
} from './widgetKit'

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const ACTIVITY_HREF = (id: string) => `/resoconto/${encodeURIComponent(id)}`

/** Punto di partenza più recente noto: ultima uscita registrata, altrimenti una Meta pianificata. */
export function referencePoint(activities: ActivityMeta[], planned: PlannedHikeMeta[]): { lat: number; lon: number; label: string } | null {
  const withRoute = [...activities]
    .filter((a) => a.routePolyline && a.routePolyline.length > 0)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0]
  if (withRoute?.routePolyline) return { lat: withRoute.routePolyline[0][0], lon: withRoute.routePolyline[0][1], label: withRoute.title }
  const p = planned.find((h) => h.routePolyline && h.routePolyline.length > 0)
  if (p?.routePolyline) return { lat: p.routePolyline[0][0], lon: p.routePolyline[0][1], label: p.title }
  return null
}

// ── Obiettivi e gioco ────────────────────────────────────────────────────────────────────────
const GOAL_KEY = 'dtrek:dashboard-goal-km'
const DEFAULT_GOAL_KM = 1000

function ObiettivoAnnualeWidget({ data }: WidgetProps) {
  const [goal, setGoal] = useState(DEFAULT_GOAL_KM)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  useEffect(() => {
    const raw = Number(readLocal(GOAL_KEY))
    if (Number.isFinite(raw) && raw > 0) setGoal(raw)
  }, [])
  const now = useMemo(() => new Date(), [])
  const p = useMemo(() => yearProgress(data.activities, now), [data.activities, now])
  const expected = (p.dayOfYear / p.daysInYear) * goal
  const diff = p.doneKm - expected
  const save = () => {
    const n = Math.round(Number(draft))
    if (Number.isFinite(n) && n >= 10 && n <= 100000) { setGoal(n); writeLocal(GOAL_KEY, String(n)) }
    setEditing(false)
  }
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <div className={EYEBROW}>Obiettivo {now.getFullYear()}</div>
        <button onClick={() => { setDraft(String(goal)); setEditing(true) }} aria-label="Cambia obiettivo" className="w-8 h-8 -mr-2 -mt-2 flex items-center justify-center text-stone-400">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
      {editing ? (
        <div className="flex items-center gap-2 mt-1">
          <input
            id="goal-km" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            className="w-24 px-3 py-2 rounded-lg border border-stone-300 text-sm" aria-label="Chilometri da percorrere quest'anno"
          />
          <span className="text-sm text-stone-500">km nell&apos;anno</span>
          <button onClick={save} className="ml-auto px-3 py-2 rounded-lg bg-forest-600 text-white text-sm font-semibold">Salva</button>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display font-bold text-[26px] text-stone-800 tabular-nums">{Math.round(p.doneKm).toLocaleString('it-IT')}</span>
            <span className="text-sm text-stone-500">/ {goal.toLocaleString('it-IT')} km</span>
          </div>
          <div className="mt-2"><ProgressBar pct={(p.doneKm / goal) * 100} marker={(p.dayOfYear / p.daysInYear) * 100} /></div>
          <p className="text-[11px] text-stone-500 mt-2 leading-snug">
            {p.doneKm >= goal ? 'Obiettivo raggiunto.' : diff >= 0
              ? `${fmtKm(diff)} avanti rispetto al ritmo dell'anno.`
              : `${fmtKm(-diff)} indietro rispetto al ritmo dell'anno.`}
            {p.projectedKm != null && p.doneKm < goal && ` Di questo passo chiudi a ${fmtKm(p.projectedKm)}.`}
          </p>
          <p className="text-[10px] text-stone-400 mt-1">Dislivello quest&apos;anno: {Math.round(p.doneElevation).toLocaleString('it-IT')} m</p>
        </>
      )}
    </div>
  )
}

function SfidaMeseWidget({ data }: WidgetProps) {
  const now = useMemo(() => new Date(), [])
  const c = useMemo(() => monthChallenge(data.activities, now), [data.activities, now])
  const done = Math.min(c.done, c.target)
  return (
    <div className={CARD}>
      <div className={`${EYEBROW} mb-1`}>Sfida di {MONTHS[c.monthLabelIndex]}</div>
      <p className="font-display font-semibold text-[15px] text-stone-800">{c.target} uscite nel mese</p>
      <div className="flex gap-1.5 mt-2.5" role="img" aria-label={`${done} di ${c.target} uscite`}>
        {Array.from({ length: c.target }, (_, i) => (
          <span key={i} className={`h-2.5 flex-1 rounded-full ${i < done ? 'bg-forest-500' : 'bg-stone-200'}`} />
        ))}
      </div>
      <p className="text-[11px] text-stone-500 mt-2">
        {c.done >= c.target ? 'Sfida completata.' : `${c.done} fatte, ne mancano ${c.target - c.done}.`} Il traguardo è la tua media mensile più una.
      </p>
    </div>
  )
}

function QuoteMassimeWidget({ data }: WidgetProps) {
  const top = useMemo(() => topAltitudes(data.activities, 3), [data.activities])
  if (top.length === 0) return <WidgetShell title="Le tue quote"><WidgetEmpty text="Le quote compaiono quando carichi uscite con altimetria." /></WidgetShell>
  return (
    <WidgetShell title="Le tue quote più alte">
      <ul className="space-y-2">
        {top.map((a, i) => (
          <li key={a.id}>
            <Link href={ACTIVITY_HREF(a.id)} className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-forest-50 text-forest-700 text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate text-[13px] text-stone-800">{a.title}</span>
              <span className="text-[13px] font-semibold text-stone-700 tabular-nums">{Math.round(a.altitudeMax).toLocaleString('it-IT')} m</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/vette" className="mt-3 flex items-center text-[11px] font-semibold text-forest-700">Tutte le vette raggiunte <ChevronRight className="w-3.5 h-3.5" /></Link>
    </WidgetShell>
  )
}

function RecordAnnoWidget({ data }: WidgetProps) {
  const year = new Date().getFullYear()
  const r = useMemo(() => yearRecords(data.activities, year), [data.activities, year])
  if (!r.longest) return <WidgetShell title={`Record ${year}`}><WidgetEmpty text="Nessuna uscita quest'anno, per ora." /></WidgetShell>
  const rows: { label: string; a: ActivityMeta; value: string }[] = [
    { label: 'Più lunga', a: r.longest, value: `${(r.longest.distanceMeters / 1000).toFixed(1).replace('.', ',')} km` },
    ...(r.mostElevation ? [{ label: 'Più dislivello', a: r.mostElevation, value: `+${Math.round(r.mostElevation.elevationGain)} m` }] : []),
    ...(r.highest && r.highest.altitudeMax > 0 ? [{ label: 'Più in alto', a: r.highest, value: `${Math.round(r.highest.altitudeMax)} m` }] : []),
  ]
  return (
    <WidgetShell title={`Record ${year}`}>
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.label}>
            <Link href={ACTIVITY_HREF(row.a.id)} className="flex items-center gap-2.5">
              <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[10.5px] text-stone-400">{row.label}</span>
                <span className="block truncate text-[13px] text-stone-800">{row.a.title}</span>
              </span>
              <span className="text-[13px] font-semibold text-stone-700 tabular-nums">{row.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}

function AnniversariWidget({ data }: WidgetProps) {
  const list = useMemo(() => anniversaries(data.activities, new Date()).slice(0, 3), [data.activities])
  if (list.length === 0) return <WidgetShell title="In questo periodo"><WidgetEmpty text="Negli anni scorsi non hai uscite registrate in questi giorni." /></WidgetShell>
  return (
    <WidgetShell title="In questo periodo, negli anni scorsi">
      <ul className="space-y-2.5">
        {list.map(({ activity: a, yearsAgo }) => (
          <li key={a.id}>
            <Link href={ACTIVITY_HREF(a.id)} className="flex items-center gap-2.5">
              <CalendarHeart className="w-4 h-4 text-terra-500 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] text-stone-800">{a.title}</span>
                <span className="block text-[10.5px] text-stone-400">{yearsAgo === 1 ? 'Un anno fa' : `${yearsAgo} anni fa`} · {fmtDate(a.startTime)} · {(a.distanceMeters / 1000).toFixed(1).replace('.', ',')} km</span>
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}

// ── Statistiche ──────────────────────────────────────────────────────────────────────────────
function Delta({ now, before, unit }: { now: number; before: number; unit: string }) {
  const d = now - before
  if (Math.round(d) === 0) return <span className="text-stone-400">come la scorsa</span>
  return <span className={d > 0 ? 'text-forest-700' : 'text-terra-600'}>{d > 0 ? '+' : '−'}{Math.abs(Math.round(d)).toLocaleString('it-IT')} {unit}</span>
}

function ConfrontoSettimanaWidget({ data }: WidgetProps) {
  const w = useMemo(() => weekOverWeek(data.activities, new Date()), [data.activities])
  return (
    <WidgetShell title="Questa settimana e la scorsa" footer="A parità di giorni trascorsi, da lunedì.">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Uscite', now: w.thisWeek.count, before: w.lastWeek.count, unit: '', fmt: (n: number) => String(n) },
          { label: 'Chilometri', now: w.thisWeek.km, before: w.lastWeek.km, unit: 'km', fmt: (n: number) => n.toFixed(1).replace('.', ',') },
          { label: 'Dislivello', now: w.thisWeek.elevation, before: w.lastWeek.elevation, unit: 'm', fmt: (n: number) => Math.round(n).toLocaleString('it-IT') },
        ].map((c) => (
          <div key={c.label}>
            <div className="font-display font-bold text-[20px] text-stone-800 tabular-nums">{c.fmt(c.now)}</div>
            <div className="text-[10px] text-stone-400">{c.label}</div>
            <div className="text-[10.5px] font-semibold mt-0.5"><Delta now={c.now} before={c.before} unit={c.unit} /></div>
          </div>
        ))}
      </div>
    </WidgetShell>
  )
}

function DistanzaCumulataWidget({ data }: WidgetProps) {
  const series = useMemo(() => cumulativeKmByMonth(data.activities, new Date(), 12), [data.activities])
  if (data.activities.length === 0) return <WidgetShell title="Chilometri totali"><WidgetEmpty text="Nessuna uscita ancora." /></WidgetShell>
  return (
    <WidgetShell title="Chilometri totali, ultimi 12 mesi">
      <div className="h-28 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 6, left: 6, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#a8a29e' }} axisLine={false} tickLine={false} interval={1} />
            <Tooltip formatter={(v) => [`${v} km`, 'Totale']} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Area type="monotone" dataKey="km" stroke="#277134" fill="#bbe0bf" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </WidgetShell>
  )
}

function DistribuzioneDistanzeWidget({ data }: WidgetProps) {
  const counts = useMemo(() => distanceDistribution(data.activities), [data.activities])
  const top = counts.indexOf(Math.max(...counts))
  if (data.activities.length === 0) return <WidgetShell title="Che uscite fai"><WidgetEmpty text="Nessuna uscita ancora." /></WidgetShell>
  return (
    <WidgetShell title="Che uscite fai" footer={DISTANCE_BUCKETS.map((b) => `${b.label}: ${b.hint}`).join(' · ')}>
      <MiniBars values={counts} labels={DISTANCE_BUCKETS.map((b) => b.label)} highlight={top} />
    </WidgetShell>
  )
}

function GiorniSettimanaWidget({ data }: WidgetProps) {
  const counts = useMemo(() => weekdayCounts(data.activities), [data.activities])
  if (data.activities.length === 0) return <WidgetShell title="Giorni preferiti"><WidgetEmpty text="Nessuna uscita ancora." /></WidgetShell>
  return (
    <WidgetShell title="Il tuo giorno preferito">
      <MiniBars values={counts} labels={['L', 'M', 'M', 'G', 'V', 'S', 'D']} highlight={counts.indexOf(Math.max(...counts))} />
    </WidgetShell>
  )
}

function OraPartenzaWidget({ data }: WidgetProps) {
  const counts = useMemo(() => startHourDistribution(data.activities), [data.activities])
  if (data.activities.length === 0) return <WidgetShell title="A che ora parti"><WidgetEmpty text="Nessuna uscita ancora." /></WidgetShell>
  return (
    <WidgetShell title="A che ora parti">
      <MiniBars values={counts} labels={[...START_HOUR_BUCKETS]} highlight={counts.indexOf(Math.max(...counts))} />
    </WidgetShell>
  )
}

function MeseRecordWidget({ data }: WidgetProps) {
  const best = useMemo(() => busiestMonth(data.activities), [data.activities])
  if (!best) return <WidgetShell title="Il tuo mese"><WidgetEmpty text="Nessuna uscita ancora." /></WidgetShell>
  return (
    <WidgetShell title="Il mese in cui cammini di più">
      <p className="font-display font-bold text-[22px] text-stone-800 capitalize">{MONTHS[best.month]}</p>
      <p className="text-[11px] text-stone-500 mt-0.5">{best.count} uscite in totale in questo mese dell&apos;anno · {fmtKm(best.km)}</p>
    </WidgetShell>
  )
}

function DislivelloUsciteWidget({ data }: WidgetProps) {
  const rows = useMemo(() => recentElevations(data.activities, 10), [data.activities])
  if (rows.length === 0) return <WidgetShell title="Dislivello per uscita"><WidgetEmpty text="Nessuna uscita ancora." /></WidgetShell>
  const max = rows.reduce((m, r, i) => (r.elevation > rows[m].elevation ? i : m), 0)
  return (
    <WidgetShell title="Dislivello delle ultime uscite" footer={`Più alto: ${rows[max].title} (+${rows[max].elevation} m)`}>
      <MiniBars values={rows.map((r) => r.elevation)} labels={rows.map((_, i) => String(i + 1))} highlight={max} />
    </WidgetShell>
  )
}

// ── Cultura e curiosità ──────────────────────────────────────────────────────────────────────
export type CuriosityState =
  | { status: 'noref' } | { status: 'loading' } | { status: 'error' } | { status: 'empty' }
  | { status: 'ok'; page: WikiPage; label: string; another: () => void; count: number }

/** Una voce di Wikipedia vicino all'ultima uscita (o a un percorso pianificato): una diversa ogni
 *  giorno, `another()` passa alla successiva. Condiviso dal widget e dalla tessera fissabile. */
export function useCuriosity(data: WidgetProps['data']): CuriosityState {
  const ref = useMemo(() => referencePoint(data.activities, data.plannedHikes), [data.activities, data.plannedHikes])
  const [pages, setPages] = useState<WikiPage[] | null>(null)
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!ref) return
    let cancelled = false
    fetchNearbyWiki(ref.lat, ref.lon, 12000, 12)
      .then((list) => {
        if (cancelled) return
        const good = list.filter((p) => isSpecificName(p.title) && p.extract && p.extract.length > 80)
        setPages(good)
        setIndex(good.length > 0 ? Math.floor(Date.now() / 86400000) % good.length : 0) // stabile nella giornata
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [ref])

  if (!ref) return { status: 'noref' }
  if (failed) return { status: 'error' }
  if (!pages) return { status: 'loading' }
  if (pages.length === 0) return { status: 'empty' }
  return { status: 'ok', page: pages[index % pages.length], label: ref.label, count: pages.length, another: () => setIndex((i) => (i + 1) % pages.length) }
}

/** Testo completo di una curiosità, a schermo intero (portale in body, come PhotoLightbox). */
export function CuriosityModal({ page, label, onClose, onAnother }: { page: WikiPage; label: string; onClose: () => void; onAnother?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[3200] bg-black/60 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={page.title} onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[80vh] overflow-y-auto bg-[#fdfcfa] rounded-t-3xl sm:rounded-3xl p-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className={EYEBROW}>Lo sapevi che · vicino a {label}</div>
            <h3 className="font-display font-semibold text-[20px] text-stone-900 leading-tight mt-1">{page.title}</h3>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="w-10 h-10 -mr-2 -mt-2 rounded-full flex items-center justify-center text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <p className="font-lora text-[14px] text-stone-700 leading-relaxed mt-3 whitespace-pre-line">{page.extract}</p>
        <p className="text-[11px] text-stone-400 mt-3">Fonte: <a href={page.url} target="_blank" rel="noopener noreferrer" className="underline">Wikipedia</a> (CC BY-SA)</p>
        {onAnother && <button onClick={onAnother} className="mt-4 px-4 py-2.5 rounded-xl bg-stone-100 text-stone-700 text-sm font-semibold flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Un&apos;altra curiosità</button>}
      </div>
    </div>,
    document.body,
  )
}

function Spinner({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 font-lora italic text-[12px] text-stone-400">
      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> {text}
    </p>
  )
}

function LoSapeviWidget({ data }: WidgetProps) {
  const c = useCuriosity(data)
  const [open, setOpen] = useState(false)
  if (c.status === 'noref') return <WidgetShell title="Lo sapevi che"><WidgetEmpty text="Registra o pianifica un'uscita: cerco cosa c'è di interessante nei dintorni." /></WidgetShell>
  if (c.status === 'error') return <WidgetShell title="Lo sapevi che"><WidgetEmpty text="Non riesco a leggere Wikipedia in questo momento." /></WidgetShell>
  if (c.status === 'loading') return <WidgetShell title="Lo sapevi che"><Spinner text="Cerco curiosità vicino a te…" /></WidgetShell>
  if (c.status === 'empty') return <WidgetShell title="Lo sapevi che"><WidgetEmpty text="Nessuna voce di Wikipedia trovata nei dintorni." /></WidgetShell>
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <div className={EYEBROW}>Lo sapevi che · vicino a {c.label}</div>
        {c.count > 1 && (
          <button onClick={c.another} aria-label="Un'altra curiosità" className="w-8 h-8 -mr-2 -mt-2 flex items-center justify-center text-stone-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <button onClick={() => setOpen(true)} className="block w-full text-left">
        <h3 className="font-display font-semibold text-[15px] text-stone-800 mt-0.5">{c.page.title}</h3>
        <p className="font-lora text-[12.5px] text-stone-600 leading-relaxed mt-1 line-clamp-5">{c.page.extract}</p>
      </button>
      <p className="text-[10px] text-stone-400 mt-2">
        Fonte: <a href={c.page.url} target="_blank" rel="noopener noreferrer" className="underline">Wikipedia</a> (CC BY-SA)
      </p>
      {open && <CuriosityModal page={c.page} label={c.label} onClose={() => setOpen(false)} onAnother={c.count > 1 ? c.another : undefined} />}
    </div>
  )
}

const MOON_EMOJI = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']
const MOON_NAMES = ['Luna nuova', 'Luna crescente', 'Primo quarto', 'Gibbosa crescente', 'Luna piena', 'Gibbosa calante', 'Ultimo quarto', 'Luna calante']
const SYNODIC_DAYS = 29.53

function FaseLunareWidget() {
  const m = useMemo(() => getMoonIllumination(new Date()), [])
  const idx = Math.round(m.phase * 8) % 8
  const daysToFull = ((0.5 - m.phase + 1) % 1) * SYNODIC_DAYS
  const daysToNew = ((1 - m.phase) % 1) * SYNODIC_DAYS
  return (
    <div className={`${CARD} flex items-center gap-3`}>
      <span className="text-4xl leading-none" aria-hidden>{MOON_EMOJI[idx]}</span>
      <div className="min-w-0">
        <div className={EYEBROW}>Luna di stasera</div>
        <div className="font-display font-semibold text-[15px] text-stone-800">{MOON_NAMES[idx]}</div>
        <div className="text-[10.5px] text-stone-500 mt-0.5">
          Illuminata al {Math.round(m.fraction * 100)}% · {daysToFull < daysToNew ? `piena tra ${Math.round(daysToFull)} giorni` : `nuova tra ${Math.round(daysToNew)} giorni`}
        </div>
      </div>
    </div>
  )
}

function fmtTime(d: Date | null): string { return d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—' }

function AlbaTramontoWidget({ data }: WidgetProps) {
  const ref = useMemo(() => referencePoint(data.activities, data.plannedHikes), [data.activities, data.plannedHikes])
  const times = useMemo(() => (ref ? getSunTimes(ref.lat, ref.lon, new Date()) : null), [ref])
  if (!ref || !times) return <WidgetShell title="Alba e tramonto"><WidgetEmpty text="Servono un'uscita registrata o un percorso pianificato per sapere dove sei." /></WidgetShell>
  const daylightMin = times.sunrise && times.sunset ? Math.round((times.sunset.getTime() - times.sunrise.getTime()) / 60000) : null
  return (
    <WidgetShell title="Alba e tramonto oggi" footer={`Calcolati per la zona di ${ref.label}.`}>
      <div className="flex items-center gap-4">
        <Sunrise className="w-7 h-7 text-amber-500 shrink-0" />
        <div className="grid grid-cols-3 gap-2 flex-1 text-center">
          <div><div className="font-display font-bold text-[18px] text-stone-800 tabular-nums">{fmtTime(times.sunrise)}</div><div className="text-[10px] text-stone-400">alba</div></div>
          <div><div className="font-display font-bold text-[18px] text-stone-800 tabular-nums">{fmtTime(times.sunset)}</div><div className="text-[10px] text-stone-400">tramonto</div></div>
          <div><div className="font-display font-bold text-[18px] text-stone-800 tabular-nums">{daylightMin != null ? `${Math.floor(daylightMin / 60)}h ${String(daylightMin % 60).padStart(2, '0')}` : '—'}</div><div className="text-[10px] text-stone-400">di luce</div></div>
        </div>
      </div>
    </WidgetShell>
  )
}

// ── Natura e meteo ───────────────────────────────────────────────────────────────────────────
export type NextOutingWeather =
  | { status: 'none' } | { status: 'nopoint' } | { status: 'loading' } | { status: 'error' }
  | { status: 'ok'; title: string; hours: HourlyWeatherFull[] }

/** Previsione oraria del giorno della prossima uscita pianificata (dal suo punto di partenza).
 *  Condiviso dal widget e dalla tessera fissabile. */
export function useNextOutingWeather(data: WidgetProps['data']): NextOutingWeather {
  const next = data.nextOuting
  const hike = useMemo(() => data.plannedHikes.find((h) => h.id === next?.id), [data.plannedHikes, next?.id])
  const point = hike?.routePolyline?.[0]
  const dateStr = next?.plannedDate?.slice(0, 10)
  const [hours, setHours] = useState<HourlyWeatherFull[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!point || !dateStr) return
    let cancelled = false
    setHours(null); setFailed(false)
    fetchDayHourly(point[0], point[1], dateStr)
      .then((h) => { if (!cancelled) setHours(h) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [point, dateStr])

  if (!next) return data.nextOutingLoading ? { status: 'loading' } : { status: 'none' }
  if (!point) return { status: 'nopoint' }
  if (failed) return { status: 'error' }
  if (!hours) return { status: 'loading' }
  return { status: 'ok', title: next.title, hours }
}

function MeteoUscitaWidget({ data }: WidgetProps) {
  const w = useNextOutingWeather(data)
  if (w.status === 'none') return <WidgetShell title="Meteo della prossima uscita"><WidgetEmpty text="Nessuna uscita in programma." /></WidgetShell>
  if (w.status === 'nopoint') return <WidgetShell title="Meteo della prossima uscita"><WidgetEmpty text="Questo percorso non ha ancora un punto di partenza." /></WidgetShell>
  if (w.status === 'error') return <WidgetShell title="Meteo della prossima uscita"><WidgetEmpty text="Previsioni non disponibili per questa data (oltre circa 9 giorni o senza rete)." /></WidgetShell>
  if (w.status === 'loading') return <WidgetShell title="Meteo della prossima uscita"><Spinner text="Carico le previsioni…" /></WidgetShell>
  const slots = w.hours.filter((h) => { const hh = Number(h.time.slice(11, 13)); return hh >= 6 && hh <= 20 && hh % 2 === 0 })
  return (
    <WidgetShell
      title={`Meteo: ${w.title}`}
      footer={<>Previsioni <a href="https://www.met.no/" target="_blank" rel="noopener noreferrer" className="underline">MET Norway</a> (CC BY 4.0).</>}
    >
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {slots.map((h) => {
          const info = wmoInfo(h.weathercode)
          return (
            <div key={h.time} className="shrink-0 w-14 text-center">
              <div className="text-[10.5px] text-stone-400 tabular-nums">{h.time.slice(11, 16)}</div>
              <div className="text-xl leading-tight" title={info.label}>{info.emoji}</div>
              <div className="font-display font-bold text-[14px] text-stone-800 tabular-nums">{Math.round(h.temperature)}°</div>
              <div className="text-[10px] text-sky-600 tabular-nums">{h.precipitation > 0 ? `${h.precipitation.toFixed(1)} mm` : ' '}</div>
              <div className="text-[10px] text-stone-400 tabular-nums">{Math.round(h.windspeed)} km/h</div>
            </div>
          )
        })}
      </div>
    </WidgetShell>
  )
}

// ── Diario e reportage ───────────────────────────────────────────────────────────────────────
const REPORT_WINDOW_DAYS = 90
const REPORT_MAX_CHECKED = 8

function ReportageDaScrivereWidget({ data }: WidgetProps) {
  const recent = useMemo(() => {
    const limit = Date.now() - REPORT_WINDOW_DAYS * 86400000
    return [...data.activities]
      .filter((a) => new Date(a.startTime).getTime() >= limit)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, REPORT_MAX_CHECKED)
  }, [data.activities])
  const [pending, setPending] = useState<{ activity: ActivityMeta; started: boolean }[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(recent.map(async (a) => {
      const q = await getQuestionnaire(a.id).catch(() => null)
      if (q?.status === 'completed' || q?.status === 'skipped') return null
      return { activity: a, started: q?.status === 'in_progress' && Object.keys(q.answers ?? {}).length > 0 }
    })).then((rows) => { if (!cancelled) setPending(rows.filter((r): r is { activity: ActivityMeta; started: boolean } => r != null)) })
    return () => { cancelled = true }
  }, [recent])

  if (recent.length === 0) return <WidgetShell title="Reportage da scrivere"><WidgetEmpty text="Nessuna uscita negli ultimi tre mesi." /></WidgetShell>
  if (!pending) return <WidgetShell title="Reportage da scrivere"><WidgetEmpty text="Controllo le tue uscite…" /></WidgetShell>
  if (pending.length === 0) return <WidgetShell title="Reportage da scrivere"><WidgetEmpty text="Hai raccontato tutte le uscite recenti." /></WidgetShell>
  return (
    <WidgetShell title="Reportage da scrivere">
      <ul className="space-y-2.5">
        {pending.slice(0, 4).map(({ activity: a, started }) => (
          <li key={a.id}>
            <Link href={`${ACTIVITY_HREF(a.id)}/racconta`} className="flex items-center gap-2.5">
              <PenLine className="w-4 h-4 text-terra-500 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] text-stone-800">{a.title}</span>
                <span className="block text-[10.5px] text-stone-400">{fmtDate(a.startTime)} · {started ? 'iniziato, da finire' : 'da raccontare'}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {pending.length > 4 && <p className="text-[10.5px] text-stone-400 mt-2">e altri {pending.length - 4}</p>}
    </WidgetShell>
  )
}

function DaRiprovareWidget({ data }: WidgetProps) {
  const list = useMemo(
    () => data.plannedHikes.filter((h) => h.favorite && !h.archivedAt)
      .sort((a, b) => (a.firstCompletedAt ? 1 : 0) - (b.firstCompletedAt ? 1 : 0))
      .slice(0, 4),
    [data.plannedHikes],
  )
  if (list.length === 0) return <WidgetShell title="Percorsi da riprovare"><WidgetEmpty text="Segna un percorso come preferito dalla sua scheda e lo ritrovi qui." /></WidgetShell>
  return (
    <WidgetShell title="I tuoi percorsi preferiti">
      <ul className="space-y-2.5">
        {list.map((h) => (
          <li key={h.id}>
            <Link href={`/guida/${encodeURIComponent(h.id)}`} className="flex items-center gap-2.5">
              <Repeat className="w-4 h-4 text-forest-600 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] text-stone-800">{h.title}</span>
                <span className="block text-[10.5px] text-stone-400">
                  {(h.distanceMeters / 1000).toFixed(1).replace('.', ',')} km · +{Math.round(h.elevationGain)} m · {h.firstCompletedAt ? `fatto il ${fmtDate(h.firstCompletedAt)}` : 'mai percorso'}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}

const PHOTO_CANDIDATES = 8

/** Generatore pseudo-casuale con seme (mulberry32): stessa foto per tutto il giorno finché non si
 *  chiede un'altra, ma davvero diversa ogni giorno e a ogni richiesta. */
function seeded(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export interface ArchivePhoto { activity: ActivityMeta; thumb: string; full: string; caption: string }

/** Foto a tutto schermo: portata in body perché il pannello della Dashboard ha una trasformazione
 *  CSS che romperebbe un elemento `fixed` al suo interno. Si chiude con Esc, con la X o toccando fuori. */
export function PhotoLightbox({ photo, onClose, onAnother }: { photo: ArchivePhoto; onClose: () => void; onAnother: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[3200] bg-black/90 flex flex-col" role="dialog" aria-modal="true" aria-label={photo.activity.title} onClick={onClose}>
      <div className="flex justify-end p-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <button onClick={onClose} aria-label="Chiudi" className="w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.full} alt={photo.caption || photo.activity.title} className="max-w-full max-h-full object-contain rounded-lg" />
      </div>
      <div className="p-4 text-white" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-semibold text-[16px]">{photo.activity.title}</div>
        <div className="text-[12px] text-white/70">{fmtDate(photo.activity.startTime)}</div>
        {photo.caption && <p className="font-lora italic text-[13px] text-white/85 mt-1.5">{photo.caption}</p>}
        <div className="flex gap-2 mt-3">
          <Link href={ACTIVITY_HREF(photo.activity.id)} className="flex-1 text-center py-2.5 rounded-xl bg-white text-stone-900 text-sm font-semibold">Apri il reportage</Link>
          <button onClick={onAnother} className="px-4 py-2.5 rounded-xl bg-white/15 text-white text-sm font-semibold flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Un&apos;altra
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Sceglie una foto a caso tra quelle delle uscite (stabile durante la giornata, diversa a ogni
 *  `another()`). `found`: undefined = sto cercando, null = nessuna foto trovata. Condiviso dal widget
 *  della dashboard e dalla tessera fissabile sulla mappa della Home. */
export function useArchivePhoto(activities: ActivityMeta[]): { found: ArchivePhoto | null | undefined; another: () => void } {
  const [seed, setSeed] = useState(() => Math.floor(Date.now() / 86400000))
  const [found, setFound] = useState<ArchivePhoto | null | undefined>(undefined)

  const candidates = useMemo(() => {
    const rand = seeded(seed)
    const all = [...activities]
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]] }
    return all.slice(0, PHOTO_CANDIDATES)
  }, [activities, seed])

  useEffect(() => {
    let cancelled = false
    setFound(undefined)
    ;(async () => {
      const rand = seeded(seed ^ 0x9e3779b9)
      for (const a of candidates) {
        const photos = await fetchActivityPhotos(a.id).catch(() => [])
        if (photos.length > 0) {
          const p = photos[Math.floor(rand() * photos.length)]
          if (!cancelled) setFound({ activity: a, thumb: p.thumbUrl ?? p.url, full: p.url, caption: p.caption })
          return
        }
      }
      if (!cancelled) setFound(null)
    })()
    return () => { cancelled = true }
  }, [candidates, seed])

  return { found, another: () => setSeed(Math.floor(Math.random() * 1e9)) }
}

function FotoDiarioWidget({ data }: WidgetProps) {
  const { found, another } = useArchivePhoto(data.activities)
  const [open, setOpen] = useState(false)

  if (found === undefined) return <WidgetShell title="Dal tuo archivio"><WidgetEmpty text="Cerco una foto…" /></WidgetShell>
  if (found === null) return <WidgetShell title="Dal tuo archivio"><WidgetEmpty text="Aggiungi foto alle uscite e ne comparirà una qui." /></WidgetShell>
  return (
    <div className={`${CARD} flex items-center gap-3`}>
      <button onClick={() => setOpen(true)} aria-label="Ingrandisci la foto" className="shrink-0 w-[84px] h-[84px] rounded-xl overflow-hidden bg-stone-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={found.thumb} alt={found.caption || found.activity.title} className="w-full h-full object-cover" loading="lazy" />
      </button>
      <div className="flex-1 min-w-0">
        <div className={EYEBROW}>Dal tuo archivio · {fmtDate(found.activity.startTime)}</div>
        <Link href={ACTIVITY_HREF(found.activity.id)} className="block font-display font-semibold text-[14px] text-stone-800 truncate mt-0.5">{found.activity.title}</Link>
        {found.caption && <p className="font-lora italic text-[11.5px] text-stone-500 mt-0.5 line-clamp-2">{found.caption}</p>}
      </div>
      <button onClick={another} aria-label="Un'altra foto" className="w-9 h-9 -mr-1.5 shrink-0 flex items-center justify-center text-stone-400">
        <RefreshCw className="w-4 h-4" />
      </button>
      {open && <PhotoLightbox photo={found} onClose={() => setOpen(false)} onAnother={another} />}
    </div>
  )
}

export const EXTRA_WIDGETS: WidgetCatalogEntry[] = [
  { id: 'obiettivo-annuale', label: 'Obiettivo annuale', icon: Target, Component: ObiettivoAnnualeWidget, category: 'Obiettivi e gioco', description: 'Chilometri dell’anno contro il tuo obiettivo, con la proiezione a fine anno.' },
  { id: 'sfida-mese', label: 'Sfida del mese', icon: Flag, Component: SfidaMeseWidget, category: 'Obiettivi e gioco', description: 'Quante uscite fare questo mese per battere la tua media.' },
  { id: 'quote-massime', label: 'Le tue quote', icon: Mountain, Component: QuoteMassimeWidget, category: 'Obiettivi e gioco', description: 'Le tre uscite più alte di sempre.' },
  { id: 'record-anno', label: 'Record dell’anno', icon: Trophy, Component: RecordAnnoWidget, category: 'Obiettivi e gioco', description: 'Più lunga, più dislivello e più in alto dell’anno.' },
  { id: 'anniversari', label: 'Anniversari', icon: CalendarHeart, Component: AnniversariWidget, category: 'Obiettivi e gioco', description: 'Cosa facevi in questi giorni negli anni passati.' },
  { id: 'confronto-settimana', label: 'Settimana a confronto', icon: GitCompareArrows, Component: ConfrontoSettimanaWidget, category: 'Statistiche', description: 'Uscite, chilometri e dislivello contro la settimana scorsa.' },
  { id: 'distanza-cumulata', label: 'Chilometri totali', icon: TrendingUp, Component: DistanzaCumulataWidget, category: 'Statistiche', description: 'Il totale che cresce negli ultimi 12 mesi.' },
  { id: 'distribuzione-distanze', label: 'Che uscite fai', icon: Ruler, Component: DistribuzioneDistanzeWidget, category: 'Statistiche', description: 'Quante corte, medie e lunghe.' },
  { id: 'giorni-settimana', label: 'Giorno preferito', icon: CalendarDays, Component: GiorniSettimanaWidget, category: 'Statistiche', description: 'In quali giorni della settimana esci di più.' },
  { id: 'ora-partenza', label: 'Ora di partenza', icon: Clock, Component: OraPartenzaWidget, category: 'Statistiche', description: 'A che ora parti di solito.' },
  { id: 'mese-record', label: 'Il tuo mese', icon: CalendarRange, Component: MeseRecordWidget, category: 'Statistiche', description: 'Il mese dell’anno in cui cammini di più.' },
  { id: 'dislivello-uscite', label: 'Dislivello per uscita', icon: Activity, Component: DislivelloUsciteWidget, category: 'Statistiche', description: 'Il dislivello delle ultime dieci uscite.' },
  { id: 'lo-sapevi', label: 'Lo sapevi che', icon: Lightbulb, Component: LoSapeviWidget, category: 'Cultura e curiosità', description: 'Una voce di Wikipedia sui luoghi vicini alle tue uscite.' },
  { id: 'fase-lunare', label: 'Fase lunare', icon: Moon, Component: FaseLunareWidget, category: 'Cultura e curiosità', description: 'La luna di stasera e quando sarà piena.' },
  { id: 'alba-tramonto', label: 'Alba e tramonto', icon: Sunrise, Component: AlbaTramontoWidget, category: 'Natura e meteo', description: 'Ore di luce oggi nella zona delle tue uscite.' },
  { id: 'meteo-uscita', label: 'Meteo della prossima uscita', icon: CloudSun, Component: MeteoUscitaWidget, category: 'Natura e meteo', description: 'Temperatura, pioggia e vento ora per ora.' },
  { id: 'reportage-da-scrivere', label: 'Reportage da scrivere', icon: PenLine, Component: ReportageDaScrivereWidget, category: 'Diario e reportage', description: 'Le uscite recenti che non hai ancora raccontato.' },
  { id: 'da-riprovare', label: 'Percorsi preferiti', icon: Repeat, Component: DaRiprovareWidget, category: 'Pianificazione', description: 'I percorsi che hai segnato come preferiti.' },
  { id: 'foto-diario', label: 'Foto dal diario', icon: ImageIcon, Component: FotoDiarioWidget, category: 'Diario e reportage', description: 'Una miniatura delle tue foto: si ingrandisce con un tocco e se ne può chiedere un’altra.' },
]
