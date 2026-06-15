'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { BookOpen, FileDown, Loader2, Mountain, Route, Clock } from 'lucide-react'
import { ctsLabel } from '@/lib/trailScore'

interface Report {
  id: string
  activity_id: string
  title: string
  content: string
  created_at: string
}

function getExcerpt(content: string, maxLen = 500): string {
  const clean = content
    .replace(/^## .+$/gm, '')
    .replace(/\[curiosita\][\s\S]*?\[\/curiosita\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const paras = clean.split('\n\n').filter(p => p.trim().length > 0)
  const first = (paras[0] ?? '').trim()
  return first.length > maxLen ? first.slice(0, maxLen) + '…' : first
}

// ── Card singola escursione nel feed ──────────────────────────────────────────

interface FeedCardProps {
  activity: ActivityMeta
  report: Report | null
}

function FeedCard({ activity, report }: FeedCardProps) {
  const date = new Date(activity.startTime)
  const dateLabel = format(date, 'EEE · d MMM yyyy', { locale: it })
  const polyline = (activity.routePolyline ?? []) as [number, number][]
  const trailScore = (activity as ActivityMeta & { trailScore?: number }).trailScore
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dtrek_vp_${activity.id}`)
      if (!raw) return
      const photos = JSON.parse(raw) as { id: string; dataUrl: string }[]
      if (!photos.length) return
      const coverId = localStorage.getItem(`dtrek_cover_${activity.id}`)
      const photo = (coverId ? photos.find(p => p.id === coverId) : null) ?? photos[0] ?? null
      if (photo?.dataUrl) setCoverDataUrl(photo.dataUrl)
    } catch { /* localStorage non disponibile */ }
  }, [activity.id])

  return (
    <Link
      href={`/escursione/${encodeURIComponent(activity.id)}`}
      className="block bg-white rounded-2xl border border-stone-200 shadow-sm hover:shadow-md hover:border-forest-300 transition-all overflow-hidden"
    >
      {/* Thumbnail area */}
      <div className="relative h-44 bg-gradient-to-br from-forest-800 to-forest-600 overflow-hidden">
        {coverDataUrl ? (
          <img src={coverDataUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : polyline.length > 1 ? (
          <div className="absolute inset-0">
            <RouteThumb polyline={polyline} color="rgba(255,255,255,0.35)" strokeWidth={2.5} />
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />
        {/* Date badge */}
        <div className="absolute top-2 left-3 bg-black/30 rounded-md px-2 py-0.5">
          <span className="text-[9px] text-white/90 font-semibold capitalize">{dateLabel}</span>
        </div>
        {/* Racconto badge */}
        {report ? (
          <div className="absolute top-2 right-3 bg-forest-800 rounded-md px-2 py-0.5 flex items-center gap-1">
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-[8px] text-white font-bold">Resoconto scritto</span>
          </div>
        ) : (
          <div className="absolute top-2 right-3 bg-black/25 border border-white/20 rounded-md px-2 py-0.5">
            <span className="text-[8px] text-white/60 font-semibold">✎ da scrivere</span>
          </div>
        )}
        {/* CTS chip */}
        {trailScore != null && (() => {
          const cts = Math.round(trailScore)
          const { color } = ctsLabel(cts)
          return (
            <div className="absolute bottom-2 left-3 rounded px-1.5 py-0.5" style={{ backgroundColor: color }}>
              <span className="text-[8px] text-white font-bold">CTS {cts}</span>
            </div>
          )
        })()}
      </div>

      {/* Content */}
      <div className="px-3 pb-3 pt-2.5">
        <h3 className="font-lora text-[13px] font-bold text-stone-900 mb-1 leading-snug">
          {activity.title ?? 'Escursione'}
        </h3>

        {report ? (
          <p className="text-[11px] italic text-stone-500 leading-snug font-lora line-clamp-4 mb-2">
            "{getExcerpt(report.content)}"
          </p>
        ) : (
          <div className="bg-amber-50 border border-dashed border-amber-400 rounded-xl p-2.5 flex items-center gap-2.5 mb-2">
            <span className="text-base leading-none flex-shrink-0">✍</span>
            <div>
              <p className="text-[11px] font-bold text-amber-900 leading-none mb-0.5">Scrivi la storia</p>
              <p className="text-[10px] text-amber-700">Questa escursione non ha ancora un racconto</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <span className="text-[9px] text-stone-300 flex items-center gap-1">
              <Route className="w-2.5 h-2.5" />{(activity.distanceMeters / 1000).toFixed(1)} km
            </span>
            <span className="text-[9px] text-stone-300 flex items-center gap-1">
              <Mountain className="w-2.5 h-2.5" />{activity.elevationGain.toFixed(0)} m D+
            </span>
            <span className="text-[9px] text-stone-300 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{formatDuration(activity.totalTimeSeconds)}
            </span>
          </div>
          <span className="text-[10px] text-forest-600 font-semibold">
            {report ? 'Leggi →' : 'Apri →'}
          </span>
        </div>
      </div>
    </Link>
  )
}

// ── Pagina principale ─────────────────────────────────────────────────────────

export default function DiarioPage() {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getAllActivities(),
      fetch('/api/resoconto?all=true').then(r => r.json()).catch(() => []),
    ]).then(([acts, reps]) => {
      const sorted = [...acts].sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      )
      setActivities(sorted)
      setReports(Array.isArray(reps) ? reps : [])
    }).finally(() => setLoading(false))
  }, [])

  const reportMap = new Map<string, Report>(reports.map(r => [r.activity_id, r]))
  const stats = computeGlobalStats(activities)
  const writtenCount = activities.filter(a => reportMap.has(a.id)).length
  const missingCount = activities.length - writtenCount

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />

      {/* Header verde scuro */}
      <div className="bg-gradient-to-br from-forest-800 to-forest-900 text-white px-4 pt-5 pb-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] text-white/40 uppercase tracking-widest font-mono">
              {format(new Date(), 'EEEE · d MMMM yyyy', { locale: it })}
            </p>
            <div className="w-7 h-7 bg-forest-500 rounded-full flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
          </div>

          <h1 className="font-lora text-2xl font-bold text-white mb-0.5">Il mio Diario</h1>
          <p className="text-[10px] text-white/45 mb-3">
            {activities.length} escursion{activities.length === 1 ? 'e' : 'i'} · {writtenCount} resocont{writtenCount === 1 ? 'o' : 'i'} scritt{writtenCount === 1 ? 'o' : 'i'}
          </p>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-white/10 rounded-lg py-2 px-2.5 text-center">
              <div className="text-sm font-bold text-white leading-none">{(stats.totalDistanceKm).toFixed(0)} km</div>
              <div className="text-[7px] text-white/40 mt-1 tracking-wide">percorsi</div>
            </div>
            <div className="bg-white/10 rounded-lg py-2 px-2.5 text-center">
              <div className="text-sm font-bold text-white leading-none">{stats.totalElevationGain.toFixed(0)} m</div>
              <div className="text-[7px] text-white/40 mt-1 tracking-wide">dislivello</div>
            </div>
            {/* Racconti pill — evidenziato, con badge se mancano storie */}
            <div className="relative bg-forest-700/50 border border-forest-500/50 rounded-lg py-2 px-2.5 text-center">
              <div className="text-sm font-bold text-forest-300 leading-none">{writtenCount} / {activities.length}</div>
              <div className="text-[7px] text-white/40 mt-1 tracking-wide">racconti</div>
              {missingCount > 0 && (
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center border-2 border-forest-900">
                  <span className="text-[8px] font-bold text-white">{missingCount}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="max-w-2xl mx-auto px-3 pt-3 pb-6">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Le mie escursioni</span>
          <Link href="/calendario" className="text-[10px] text-forest-600 font-semibold">Calendario →</Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-stone-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Caricamento diario…</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm font-medium">Il tuo diario è ancora vuoto</p>
            <p className="text-stone-300 text-xs mt-1 mb-4">Carica la tua prima escursione per iniziare</p>
            <Link href="/upload"
              className="inline-flex items-center gap-2 px-4 py-2 bg-forest-600 text-white rounded-xl text-sm font-semibold hover:bg-forest-700 transition-colors">
              Carica escursione
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activities.map(activity => (
              <FeedCard
                key={activity.id}
                activity={activity}
                report={reportMap.get(activity.id) ?? null}
              />
            ))}
          </div>
        )}

        {/* Link al PDF export */}
        {activities.length > 0 && (
          <div className="mt-6 pt-5 border-t border-stone-200 flex items-center justify-center">
            <Link
              href="/diario/export"
              className="flex items-center gap-2 text-sm text-stone-400 hover:text-stone-600 transition-colors"
            >
              <FileDown className="w-4 h-4" />
              Esporta il Diario in PDF
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
