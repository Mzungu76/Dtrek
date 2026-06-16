'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { getPersonalRecords, computeStreaks } from '@/lib/stats'
import { formatDuration } from '@/lib/tcxParser'
import { ctsLabel } from '@/lib/trailScore'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Loader2, Mountain, Route, Clock, Trophy, TrendingUp,
  ArrowLeft, BarChart2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line,
} from 'recharts'

type TabId = 'panoramica' | 'percorsi' | 'progressione' | 'record'
const TABS: { id: TabId; label: string }[] = [
  { id: 'panoramica',   label: 'Panoramica'  },
  { id: 'percorsi',     label: 'Percorsi'    },
  { id: 'progressione', label: 'Progressione' },
  { id: 'record',       label: 'Record'      },
]

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] p-3 flex flex-col gap-1" style={{ background: '#F0F7F1' }}>
      <p className="text-[9px] font-semibold uppercase tracking-[1.5px]" style={{ color: '#4a9e5c' }}>{label}</p>
      <p className="text-[20px] font-bold leading-none" style={{ fontFamily: "'DM Mono', monospace", color: '#1a3320' }}>
        {value}
      </p>
      {sub && <p className="text-[10px]" style={{ color: '#8a7f6e' }}>{sub}</p>}
    </div>
  )
}

// ── Tab Panoramica ────────────────────────────────────────────────────────────

function TabPanoramica({ activities }: { activities: ActivityMeta[] }) {
  const stats  = computeGlobalStats(activities)
  const scores = activities
    .map(a => (a as ActivityMeta & { trailScore?: number }).trailScore)
    .filter((s): s is number => s != null)
  const avgCts = scores.length ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : null

  const difficulties = activities.reduce<Record<string, number>>((acc, a) => {
    const d = (a as ActivityMeta & { tags?: string[] }).tags?.[0] ?? 'T'
    acc[d] = (acc[d] ?? 0) + 1
    return acc
  }, {})

  const ctsBuckets = [
    { label: '90–100', count: scores.filter(s => s >= 90).length, color: '#166534' },
    { label: '80–89',  count: scores.filter(s => s >= 80 && s < 90).length, color: '#4a9e5c' },
    { label: '70–79',  count: scores.filter(s => s >= 70 && s < 80).length, color: '#7fd491' },
    { label: '60–69',  count: scores.filter(s => s >= 60 && s < 70).length, color: '#AED4EC' },
    { label: '< 60',   count: scores.filter(s => s < 60).length, color: '#d1d5db' },
  ]

  return (
    <div className="space-y-4">
      {/* 4 tile principali */}
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="km totali"   value={`${stats.totalDistanceKm.toFixed(0)} km`} />
        <StatTile label="dislivello"  value={`${Math.round(stats.totalElevationGain).toLocaleString('it')} m`} />
        <StatTile label="escursioni"  value={`${stats.totalActivities}`} />
        <StatTile label="ore in trail" value={formatDuration(stats.totalTimeSeconds)} />
      </div>

      {/* CTS medio */}
      {avgCts != null && (
        <div className="rounded-[12px] p-4" style={{ background: '#F0F7F1' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: '#4a9e5c' }}>
              CTS medio
            </p>
            <span
              className="px-2.5 py-0.5 rounded-lg text-white font-bold text-sm"
              style={{ fontFamily: "'DM Mono', monospace", background: ctsLabel(avgCts).color }}
            >
              {avgCts}
            </span>
          </div>
          {/* Distribuzione CTS */}
          <div className="space-y-1.5">
            {ctsBuckets.map(b => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="text-[9px] w-12 text-right" style={{ color: '#8a7f6e', fontFamily: "'DM Mono', monospace" }}>
                  {b.label}
                </span>
                <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,.06)' }}>
                  {b.count > 0 && (
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(b.count / Math.max(...ctsBuckets.map(x => x.count), 1)) * 100}%`, background: b.color }}
                    />
                  )}
                </div>
                <span className="text-[9px] w-4 text-right font-mono" style={{ color: '#8a7f6e' }}>{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barre difficoltà */}
      {Object.keys(difficulties).length > 0 && (
        <div className="rounded-[12px] p-4" style={{ background: '#F0F7F1' }}>
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-3" style={{ color: '#4a9e5c' }}>
            Per difficoltà
          </p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(difficulties).map(([diff, count]) => (
              <div key={diff} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'white' }}>
                <span className="font-bold text-sm" style={{ color: '#1C5F8A', fontFamily: "'DM Mono', monospace" }}>{diff}</span>
                <span className="text-xs" style={{ color: '#8a7f6e' }}>× {count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Percorsi ──────────────────────────────────────────────────────────────

function TabPercorsi({ activities }: { activities: ActivityMeta[] }) {
  const sorted = [...activities].sort((a, b) => {
    const sa = (a as ActivityMeta & { trailScore?: number }).trailScore ?? 0
    const sb = (b as ActivityMeta & { trailScore?: number }).trailScore ?? 0
    return sb - sa
  })

  return (
    <div className="space-y-2">
      {sorted.map((a, i) => {
        const cts  = (a as ActivityMeta & { trailScore?: number }).trailScore
        const diff = (a as ActivityMeta & { tags?: string[] }).tags?.[0]
        const ctsInfo = cts != null ? ctsLabel(Math.round(cts)) : null
        return (
          <div key={a.id} className="bg-white rounded-[12px] p-3 flex items-center gap-3" style={{ boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
            <span className="text-[11px] font-bold w-5 text-center" style={{ color: '#a9a18e', fontFamily: "'DM Mono', monospace" }}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold truncate" style={{ color: '#1a3320', fontFamily: "'Lora', serif" }}>
                {a.title ?? 'Escursione'}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: '#8a7f6e' }}>
                {(a.distanceMeters / 1000).toFixed(1)} km · D+ {Math.round(a.elevationGain)} m
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {diff && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#EAF4FB', color: '#1C5F8A' }}>
                  {diff}
                </span>
              )}
              {cts != null && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded text-white"
                  style={{ background: ctsInfo?.color ?? '#4a9e5c', fontFamily: "'DM Mono', monospace" }}
                >
                  {Math.round(cts)}
                </span>
              )}
            </div>
          </div>
        )
      })}
      {sorted.length === 0 && (
        <div className="text-center py-12" style={{ color: '#a9a18e' }}>
          <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessun percorso ancora</p>
        </div>
      )}
    </div>
  )
}

// ── Tab Progressione ──────────────────────────────────────────────────────────

function TabProgressione({ activities }: { activities: ActivityMeta[] }) {
  const monthlyKm = useMemo(() => {
    const map = new Map<string, number>()
    activities.forEach(a => {
      const key = format(new Date(a.startTime), 'MMM yy', { locale: it })
      map.set(key, (map.get(key) ?? 0) + a.distanceMeters / 1000)
    })
    return Array.from(map.entries())
      .map(([name, km]) => ({ name, km: parseFloat(km.toFixed(1)) }))
      .slice(-12)
  }, [activities])

  const ctsTrend = useMemo(() => {
    return activities
      .filter(a => (a as ActivityMeta & { trailScore?: number }).trailScore != null)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map(a => ({
        name: format(new Date(a.startTime), 'MMM yy', { locale: it }),
        cts:  Math.round((a as ActivityMeta & { trailScore?: number }).trailScore!),
      }))
      .slice(-20)
  }, [activities])

  return (
    <div className="space-y-4">
      {/* Km mensili */}
      <div className="rounded-[12px] p-4" style={{ background: '#F0F7F1' }}>
        <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-3" style={{ color: '#4a9e5c' }}>
          Km mensili
        </p>
        {monthlyKm.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={monthlyKm} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#8a7f6e' }} />
              <YAxis tick={{ fontSize: 8, fill: '#8a7f6e' }} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}
                formatter={(v: number) => [`${v} km`, 'Distanza']}
              />
              <Bar dataKey="km" fill="#4a9e5c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-center py-6" style={{ color: '#a9a18e' }}>Nessun dato</p>
        )}
      </div>

      {/* CTS nel tempo */}
      {ctsTrend.length > 1 && (
        <div className="rounded-[12px] p-4" style={{ background: '#F0F7F1' }}>
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-3" style={{ color: '#4a9e5c' }}>
            CTS nel tempo
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={ctsTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#8a7f6e' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: '#8a7f6e' }} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}
                formatter={(v: number) => [v, 'CTS']}
              />
              <Line type="monotone" dataKey="cts" stroke="#4a9e5c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Tab Record ────────────────────────────────────────────────────────────────

function TabRecord({ activities }: { activities: ActivityMeta[] }) {
  const records = getPersonalRecords(activities)
  const scores  = activities
    .map(a => ({ a, s: (a as ActivityMeta & { trailScore?: number }).trailScore }))
    .filter((x): x is { a: ActivityMeta; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s)
  const bestCts = scores[0]

  return (
    <div className="space-y-4">
      {/* Hero card miglior CTS */}
      {bestCts && (
        <div
          className="rounded-[14px] p-4 text-white"
          style={{ background: 'linear-gradient(135deg, #1a3320, #2d5c38)' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[2px] mb-1" style={{ color: '#7fd491' }}>
            Miglior CTS
          </p>
          <p
            className="text-[42px] font-bold leading-none mb-1"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            {Math.round(bestCts.s)}
          </p>
          <p className="text-[12px] font-semibold opacity-90 truncate" style={{ fontFamily: "'Lora', serif" }}>
            {bestCts.a.title ?? 'Escursione'}
          </p>
          <p className="text-[10px] opacity-60 mt-0.5">
            {format(new Date(bestCts.a.startTime), 'd MMM yyyy', { locale: it })}
          </p>
        </div>
      )}

      {/* 4 tile record */}
      <div className="grid grid-cols-2 gap-2">
        {records.longestKm && (
          <StatTile
            label="Percorso più lungo"
            value={`${(records.longestKm.distanceMeters / 1000).toFixed(1)} km`}
            sub={records.longestKm.title ?? undefined}
          />
        )}
        {records.highestGain && (
          <StatTile
            label="Maggior dislivello"
            value={`${Math.round(records.highestGain.elevationGain)} m`}
            sub={records.highestGain.title ?? undefined}
          />
        )}
        {records.highestAlt && (
          <StatTile
            label="Quota massima"
            value={`${Math.round(records.highestAlt.altitudeMax)} m`}
            sub={records.highestAlt.title ?? undefined}
          />
        )}
        {records.longestDuration && (
          <StatTile
            label="Escursione più lunga"
            value={formatDuration(records.longestDuration.totalTimeSeconds)}
            sub={records.longestDuration.title ?? undefined}
          />
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatistichePage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab, setTab] = useState<TabId>(
    (searchParams?.get('tab') as TabId | null) ?? 'panoramica'
  )

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])

  const records = useMemo(() => getPersonalRecords(activities), [activities])

  return (
    <div className="min-h-screen pb-20 md:pb-0" style={{ background: '#F0F7F1' }}>
      <Navbar />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        className="relative"
        style={{
          background: 'linear-gradient(160deg, #1a3320 0%, #2d5c38 100%)',
          padding: '14px 16px 20px',
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 mb-3 text-sm font-medium"
          style={{ color: '#7fd491' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Indietro
        </button>

        <div className="flex items-end justify-between">
          <div>
            <span
              className="inline-block text-[9px] font-bold tracking-[2px] uppercase px-2 py-0.5 rounded-md mb-2"
              style={{ background: 'rgba(127,212,145,.15)', color: '#7fd491' }}
            >
              I miei numeri
            </span>
            <h1 style={{ fontFamily: "'Lora', serif", fontSize: '22px', fontWeight: 700, color: 'white', margin: 0 }}>
              Statistiche <em>personali</em>
            </h1>
          </div>
          <BarChart2 className="w-8 h-8 opacity-20 text-white mb-1" />
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div
        className="flex overflow-x-auto border-b"
        style={{ background: 'white', borderColor: '#e5e7eb', scrollbarWidth: 'none' }}
      >
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-shrink-0 px-4 py-3 text-[12px] font-medium transition-colors"
            style={
              tab === t.id
                ? {
                    fontWeight: 700,
                    color: '#166534',
                    borderBottom: '2px solid #4a9e5c',
                  }
                : { color: '#bbb', borderBottom: '2px solid transparent' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: '#2d5c38' }}>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Caricamento statistiche…</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 text-center">
            <Mountain className="w-12 h-12 opacity-20" style={{ color: '#2d5c38' }} />
            <p className="font-display font-bold text-lg" style={{ color: '#1a3320', fontFamily: "'Lora', serif" }}>
              Nessuna escursione ancora
            </p>
          </div>
        ) : (
          <>
            {tab === 'panoramica'   && <TabPanoramica   activities={activities} />}
            {tab === 'percorsi'     && <TabPercorsi     activities={activities} />}
            {tab === 'progressione' && <TabProgressione activities={activities} />}
            {tab === 'record'       && <TabRecord       activities={activities} />}
          </>
        )}
      </div>
    </div>
  )
}
