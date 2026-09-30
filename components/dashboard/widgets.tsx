'use client'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { AreaChart, Area, LineChart, Line, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Sparkles, CalendarClock, HeartPulse, TrendingUp, BarChart3, Flame, Trophy,
  BookOpen, Compass, Layers, LayoutGrid, Award, Calendar, Activity, ChevronRight,
  Globe2, Mountain, type LucideIcon,
} from 'lucide-react'
import { wmoInfo } from '@/lib/weather'
import { HeatmapPanel, MonthlyBarChart, TssBarChart } from '@/components/bacheca/ChartPanels'
import type { DashboardData } from './types'
import type { DashboardWidgetId } from '@/lib/dashboardConfig'
import type { WidgetCatalogEntry } from './widgetKit'
import { EXTRA_WIDGETS } from './widgetsExtra'
import SafeImg from '@/components/ui/SafeImg'

export type { WidgetCatalogEntry } from './widgetKit'

interface WidgetProps { data: DashboardData }


// ── Helpers di stile condivisi — stessa identità della Bacheca precedente e del resto dell'app
//    (palette forest/terra/stone, Barlow Condensed maiuscolo per le etichette, Playfair per i
//    numeri grandi, Lora corsivo per le "letture"). ──────────────────────────────────────────────
const CARD = 'bg-white rounded-2xl border border-stone-200 p-4'
const EYEBROW = 'font-barlow text-[10px] font-bold uppercase tracking-[1.5px] text-stone-400'

function Ring({ value, color, size = 44 }: { value: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: `conic-gradient(${color} ${pct}%, #e7e3d8 ${pct}% 100%)` }}
    >
      <div className="rounded-full bg-white flex items-center justify-center" style={{ width: size - 10, height: size - 10 }}>
        <span className="font-display font-bold text-stone-800" style={{ fontSize: size * 0.3 }}>{Math.round(value)}</span>
      </div>
    </div>
  )
}

function WidgetEmpty({ text }: { text: string }) {
  return <p className="font-lora italic text-[12px] text-stone-400">{text}</p>
}

// ── Riepilogo del giorno ─────────────────────────────────────────────────────────────────────
function QuoteWidget({ data }: WidgetProps) {
  return (
    <div className={`${CARD} bg-gradient-to-br from-forest-50 to-white`}>
      <p className="font-lora italic text-[13px] text-stone-700 leading-relaxed">
        «{data.hasEnoughHistory ? data.recoveryPhrase : data.lowHistoryNote}»
      </p>
    </div>
  )
}

// ── Prossima uscita ──────────────────────────────────────────────────────────────────────────
function NextOutingWidget({ data }: WidgetProps) {
  if (data.nextOutingLoading) return <div className={CARD}><WidgetEmpty text="Caricamento…" /></div>
  const next = data.nextOuting
  if (!next) {
    return (
      <div className={CARD}>
        <div className={`${EYEBROW} mb-1.5`}>Prossima uscita</div>
        <WidgetEmpty text="Nessuna uscita in programma — assegna una data a un percorso da Guida." />
      </div>
    )
  }
  const weatherIcon = next.weather ? wmoInfo(next.weather.weathercode) : null
  return (
    <Link href={`/guida/${encodeURIComponent(next.id)}`} className={`${CARD} flex items-center gap-3`}>
      <div className="w-12 h-16 rounded-xl shrink-0 flex items-center justify-center bg-gradient-to-br from-terra-400 to-terra-700">
        <Mountain className="w-5 h-5 text-white/85" />
      </div>
      <div className="flex-1 min-w-0">
        <div className={EYEBROW}>{format(new Date(next.plannedDate), 'EEE d MMM', { locale: it })}</div>
        <div className="font-display font-semibold text-[15px] text-stone-800 truncate mt-0.5">{next.title}</div>
        <div className="text-[10.5px] text-stone-500 mt-0.5">
          {(next.distanceMeters / 1000).toFixed(1)} km · {Math.round(next.elevationGain)} m D+
          {next.weather && weatherIcon && ` · ${weatherIcon.emoji} ${Math.round(next.weather.tempMax)}°`}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
    </Link>
  )
}

// ── Recovery ─────────────────────────────────────────────────────────────────────────────────
function RecoveryWidget({ data }: WidgetProps) {
  return (
    <div className={CARD}>
      <div className={`${EYEBROW} mb-2`}>Recovery</div>
      <div className="flex items-center gap-3">
        <Ring value={data.recovery.score} color={data.recovery.color} />
        <div className="min-w-0">
          <span
            className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold"
            style={{ background: `${data.recovery.color}22`, color: data.recovery.color }}
          >
            {data.recovery.label}
          </span>
          <p className="text-[10.5px] text-stone-500 mt-1 leading-snug">
            {data.hasEnoughHistory ? data.recoveryPhrase : data.lowHistoryNote}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Forma / bilancio fisico ──────────────────────────────────────────────────────────────────
function FormaWidget({ data }: WidgetProps) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-1">
        <div className={EYEBROW}>Bilancio fisico</div>
        <span className="text-[11px] font-bold" style={{ color: data.forma.color }}>{data.forma.label}</span>
      </div>
      <p className="text-[10.5px] text-stone-500 mb-2 leading-snug">
        {data.hasEnoughHistory ? data.formaPhrase : data.lowHistoryNote}
      </p>
      {data.hasEnoughHistory && data.trainingLoadData.length > 0 && (
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={data.trainingLoadData}>
            <CartesianGrid vertical={false} stroke="#eeece5" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#a9a18e' }} tickFormatter={d => format(new Date(d), 'd/M')} minTickGap={40} />
            <Tooltip contentStyle={{ background: 'rgba(15,15,15,0.88)', border: 'none', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} labelFormatter={d => format(new Date(d), 'd MMM', { locale: it })} />
            <Line type="monotone" dataKey="ctl" name="Fitness" stroke="#377134" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="atl" name="Fatica" stroke="#e08d3c" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Volume settimanale ───────────────────────────────────────────────────────────────────────
function VolumeWidget({ data }: WidgetProps) {
  return (
    <div className={CARD}>
      <div className={`${EYEBROW} mb-1`}>Volume</div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-display font-bold text-xl text-stone-800">{data.currentWeekKm} km</span>
        {data.volumePhrase && <span className="text-[10.5px] text-forest-700 font-semibold">{data.volumePhrase}</span>}
      </div>
      <ResponsiveContainer width="100%" height={90}>
        <AreaChart data={data.weeklyVolume}>
          <defs>
            <linearGradient id="dashVolFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#377134" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#377134" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#a9a18e' }} />
          <Tooltip contentStyle={{ background: 'rgba(15,15,15,0.88)', border: 'none', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} formatter={(v: number) => [`${v} km`, 'Volume']} />
          <Area type="monotone" dataKey="km" stroke="#377134" strokeWidth={2} fill="url(#dashVolFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Streak ───────────────────────────────────────────────────────────────────────────────────
function StreakWidget({ data }: WidgetProps) {
  return (
    <div className={CARD}>
      <div className={`${EYEBROW} mb-1`}>Streak</div>
      <div className="flex items-center gap-2.5">
        <Flame className="w-7 h-7 text-terra-500 shrink-0" />
        <div>
          <span className="font-display font-bold text-xl text-stone-800">{data.streaks.currentWeeks} sett.</span>
          <p className="text-[10.5px] text-stone-500 leading-snug">{data.streakPhrase}</p>
        </div>
      </div>
    </div>
  )
}

// ── Traguardo più vicino ─────────────────────────────────────────────────────────────────────
function TraguardoWidget({ data }: WidgetProps) {
  const b = data.nearestBadge
  return (
    <div className={CARD}>
      <div className={`${EYEBROW} mb-1.5`}>Prossimo traguardo</div>
      {!b ? (
        <WidgetEmpty text="Tutti i traguardi attuali sono sbloccati." />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            {b.icon && <span className="text-lg">{b.icon}</span>}
            <span className="font-display font-semibold text-[14px] text-stone-800">{b.name}</span>
          </div>
          <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden mb-1">
            <div className="h-full bg-amber-500" style={{ width: `${b.progressPct ?? 0}%` }} />
          </div>
          <p className="text-[10.5px] text-stone-500">
            {b.progressCurrent?.toLocaleString('it')}{b.progressUnit ? ` ${b.progressUnit}` : ''} / {b.progressTarget?.toLocaleString('it')}{b.progressUnit ? ` ${b.progressUnit}` : ''} · {b.progressPct}%
          </p>
        </>
      )}
    </div>
  )
}

// ── Diario attivo ────────────────────────────────────────────────────────────────────────────
function DiarioAttivoWidget({ data }: WidgetProps) {
  const d = data.defaultDiary
  return (
    <Link href="/diario" className={`${CARD} flex items-center gap-3`}>
      <div className="w-11 h-11 rounded-xl shrink-0 overflow-hidden bg-forest-50 flex items-center justify-center">
        {d?.coverUrl
          ? // eslint-disable-next-line @next/next/no-img-element
            <SafeImg src={d.coverUrl} alt="" className="w-full h-full object-cover" fallback={<BookOpen className="w-5 h-5 text-forest-600" />} />
          : <BookOpen className="w-5 h-5 text-forest-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={EYEBROW}>Diario attivo</div>
        <div className="font-display font-semibold text-[14px] text-stone-800 truncate mt-0.5">{d?.title ?? 'Il mio Diario'}</div>
        {d && <div className="text-[10.5px] text-stone-500 mt-0.5">{d.reportageCount} reportage</div>}
      </div>
      <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
    </Link>
  )
}

// ── Percorsi per te ──────────────────────────────────────────────────────────────────────────
function PercorsiPerTeWidget({ data }: WidgetProps) {
  return (
    <Link href="/percorsi-per-te" className={`${CARD} flex items-center gap-3 bg-gradient-to-br from-terra-50 to-white`}>
      <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center bg-terra-100">
        <Compass className="w-5 h-5 text-terra-700" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold text-[14px] text-stone-800">Percorsi per te</div>
        <div className="text-[10.5px] text-stone-500 mt-0.5">
          {data.percorsiPerTe.status === 'ok' && data.percorsiPerTe.count > 0
            ? `${data.percorsiPerTe.count} scelti per te`
            : 'Scoprili ora'}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
    </Link>
  )
}

// ── Raccolte pubblicate ──────────────────────────────────────────────────────────────────────
function RaccolteWidget({ data }: WidgetProps) {
  if (data.publishedCollections.length === 0) {
    return (
      <div className={CARD}>
        <div className={`${EYEBROW} mb-1.5`}>Raccolte pubblicate</div>
        <WidgetEmpty text="Nessuna Raccolta pubblicata ancora — puoi farlo da Diari." />
      </div>
    )
  }
  return (
    <div className={CARD}>
      <div className={`${EYEBROW} mb-2`}>Raccolte pubblicate</div>
      <div className="space-y-2">
        {data.publishedCollections.slice(0, 3).map(c => (
          <Link key={c.id} href={`/raccolte/${encodeURIComponent(c.id)}`} className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-terra-600 shrink-0" />
            <span className="flex-1 min-w-0 text-[12.5px] font-medium text-stone-700 truncate">{c.title}</span>
            <Globe2 className="w-3.5 h-3.5 text-forest-600 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── Accesso rapido ───────────────────────────────────────────────────────────────────────────
function AccessoRapidoWidget() {
  const links = [
    { href: '/diario', label: 'Diario', icon: BookOpen, color: '#377134' },
    { href: '/diario', label: 'Raccolte', icon: Layers, color: '#c05a17' },
    { href: '/guida', label: 'Percorsi', icon: Compass, color: '#9f4315' },
  ]
  return (
    <div>
      <div className={`${EYEBROW} mb-2`}>Accesso rapido</div>
      <div className="flex gap-2.5">
        {links.map(l => (
          <Link key={l.label} href={l.href} className="flex-1 flex flex-col items-center gap-1.5 bg-white border border-stone-200 rounded-2xl py-3 px-1.5">
            <l.icon className="w-[18px] h-[18px]" style={{ color: l.color }} />
            <span className="text-[10px] font-semibold text-stone-700">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── Record personale in evidenza ─────────────────────────────────────────────────────────────
function RecordWidget({ data }: WidgetProps) {
  const g = data.globalStats
  if (g.totalActivities === 0) return <div className={CARD}><WidgetEmpty text="Nessuna escursione ancora." /></div>
  return (
    <Link href="/statistiche" className={`${CARD} flex items-center gap-3`}>
      <Award className="w-8 h-8 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={EYEBROW}>I tuoi numeri</div>
        <div className="font-display font-bold text-[16px] text-stone-800 mt-0.5">
          {g.totalDistanceKm.toFixed(0)} km · {Math.round(g.totalElevationGain)} m D+
        </div>
        <div className="text-[10.5px] text-stone-500 mt-0.5">{g.totalActivities} escursioni in totale — vedi tutti i record</div>
      </div>
      <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
    </Link>
  )
}

// ── Grafici più corposi — riusano ChartPanels.tsx così come sono (assi/tooltip pensati per un
//    fondo scuro): una card scura dedicata invece di riscriverli per un fondo chiaro. ──────────
function DarkChartCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-forest-900 rounded-2xl p-4">
      <div className="font-barlow text-[10px] font-bold uppercase tracking-[1.5px] text-white/50 mb-2">{label}</div>
      {children}
    </div>
  )
}

function HeatmapWidget({ data }: WidgetProps) {
  return <DarkChartCard label="Attività annuale"><HeatmapPanel activities={data.activities} /></DarkChartCard>
}
function MensileWidget({ data }: WidgetProps) {
  return <DarkChartCard label="Andamento mensile"><MonthlyBarChart activities={data.activities} /></DarkChartCard>
}
function TssWidget({ data }: WidgetProps) {
  return <DarkChartCard label="Carico giornaliero (TSS)"><TssBarChart activities={data.activities} /></DarkChartCard>
}

const BASE_WIDGETS: WidgetCatalogEntry[] = [
  { id: 'quote', label: 'Lettura del giorno', icon: Sparkles, Component: QuoteWidget, category: 'Oggi', description: 'Una frase sul tuo stato di forma di oggi.' },
  { id: 'prossima-uscita', label: 'Prossima uscita', icon: CalendarClock, Component: NextOutingWidget, category: 'Oggi', description: 'La prossima uscita in programma, con il meteo del giorno.' },
  { id: 'recovery', label: 'Recovery', icon: HeartPulse, Component: RecoveryWidget, category: 'Allenamento', description: 'Quanto sei recuperato, in un numero.' },
  { id: 'forma', label: 'Bilancio fisico', icon: TrendingUp, Component: FormaWidget, category: 'Allenamento', description: 'Bilancio tra carico e riposo.' },
  { id: 'volume', label: 'Volume settimanale', icon: BarChart3, Component: VolumeWidget, category: 'Allenamento', description: 'Chilometri della settimana rispetto alle precedenti.' },
  { id: 'streak', label: 'Streak', icon: Flame, Component: StreakWidget, category: 'Obiettivi e gioco', description: 'Settimane e giorni di fila in cui sei uscito.' },
  { id: 'traguardo', label: 'Prossimo traguardo', icon: Trophy, Component: TraguardoWidget, category: 'Obiettivi e gioco', description: 'Il prossimo badge da sbloccare.' },
  { id: 'diario-attivo', label: 'Diario attivo', icon: BookOpen, Component: DiarioAttivoWidget, category: 'Diario e reportage', description: 'Il diario su cui stai lavorando.' },
  { id: 'percorsi-per-te', label: 'Percorsi per te', icon: Compass, Component: PercorsiPerTeWidget, category: 'Pianificazione', description: 'Percorsi consigliati vicino a te.' },
  { id: 'raccolte', label: 'Raccolte pubblicate', icon: Layers, Component: RaccolteWidget, category: 'Diario e reportage', description: 'Le raccolte che hai pubblicato.' },
  { id: 'accesso-rapido', label: 'Accesso rapido', icon: LayoutGrid, Component: AccessoRapidoWidget, category: 'Scorciatoie', description: 'Collegamenti alle sezioni principali.' },
  { id: 'record', label: 'I tuoi numeri', icon: Award, Component: RecordWidget, category: 'Statistiche', description: 'I tuoi totali di sempre.' },
  { id: 'heatmap', label: 'Attività annuale', icon: Calendar, Component: HeatmapWidget, category: 'Statistiche', description: 'Le giornate attive dell’anno.' },
  { id: 'mensile', label: 'Andamento mensile', icon: BarChart3, Component: MensileWidget, category: 'Statistiche', description: 'Chilometri mese per mese.' },
  { id: 'tss', label: 'Carico giornaliero', icon: Activity, Component: TssWidget, category: 'Allenamento', description: 'Il carico di ogni giornata.' },
]

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [...BASE_WIDGETS, ...EXTRA_WIDGETS]

export const WIDGET_BY_ID: Record<DashboardWidgetId, WidgetCatalogEntry> =
  Object.fromEntries(WIDGET_CATALOG.map(w => [w.id, w])) as Record<DashboardWidgetId, WidgetCatalogEntry>
