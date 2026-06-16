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
import { BookOpen, FileDown, Loader2, Mountain, Route, Clock, PenLine, UploadCloud } from 'lucide-react'
import { ctsLabel } from '@/lib/trailScore'

interface Report {
  id: string
  activity_id: string
  title: string
  content: string
  created_at: string
}

function getExcerpt(content: string, maxLen = 160): string {
  const clean = content
    .replace(/^## .+$/gm, '')
    .replace(/\[curiosita\][\s\S]*?\[\/curiosita\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const paras = clean.split('\n\n').filter(p => p.trim().length > 0)
  const first = (paras[0] ?? '').trim()
  return first.length > maxLen ? first.slice(0, maxLen) + '…' : first
}

// ── Stats FAB ─────────────────────────────────────────────────────────────────

function StatsFab() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push('/diario/statistiche')}
      title="Statistiche personali"
      style={{
        position: 'absolute',
        bottom: '-23px',
        right: '14px',
        width: '46px',
        height: '46px',
        borderRadius: '50%',
        background: 'white',
        border: '2px solid rgba(26,51,32,.10)',
        boxShadow: '0 4px 18px rgba(0,0,0,.22)',
        zIndex: 10,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a3320" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    </button>
  )
}

// ── Route SVG decorativa ───────────────────────────────────────────────────────

function RouteSvgMini({ poly }: { poly: [number, number][] }) {
  if (poly.length < 2) return null
  const lats = poly.map(p => p[0]), lons = poly.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const W = 400, H = 70, pad = 8
  const scLat = (H - 2 * pad) / (maxLat - minLat || 0.001)
  const scLon = (W - 2 * pad) / (maxLon - minLon || 0.001)
  const sc = Math.min(scLat, scLon)
  const offX = pad + ((W - 2 * pad) - (maxLon - minLon) * sc) / 2
  const offY = pad + ((H - 2 * pad) - (maxLat - minLat) * sc) / 2
  const px = (lon: number) => offX + (lon - minLon) * sc
  const py = (lat: number) => offY + (maxLat - lat) * sc
  const d = poly.map(([lat, lon], i) => `${i === 0 ? 'M' : 'L'} ${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full opacity-25" preserveAspectRatio="xMidYMid slice">
      <path d={d} fill="none" stroke="#4a9e5c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── ResocontoCard ─────────────────────────────────────────────────────────────

interface ResocontoCardProps {
  activity: ActivityMeta
  report: Report | null
}

function ResocontoCard({ activity, report }: ResocontoCardProps) {
  const date       = new Date(activity.startTime)
  const dateLabel  = format(date, 'd MMM yyyy', { locale: it })
  const poly       = (activity.routePolyline ?? []) as [number, number][]
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

  const hasCts   = trailScore != null
  const cts      = hasCts ? Math.round(trailScore!) : null
  const ctsInfo  = cts != null ? ctsLabel(cts) : null
  const excerpt  = report ? getExcerpt(report.content) : null

  return (
    <Link
      href={`/resoconto/${encodeURIComponent(activity.id)}`}
      className="block rounded-[14px] overflow-hidden bg-white"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,.07)' }}
    >
      {/* Header card 70px */}
      <div
        className="relative overflow-hidden"
        style={{
          height: '70px',
          background: 'linear-gradient(160deg, #1a3320 0%, #2d5c38 75%, #4a9e5c 100%)',
        }}
      >
        {coverDataUrl ? (
          <img src={coverDataUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        ) : (
          <RouteSvgMini poly={poly} />
        )}
        <div className="absolute inset-0 flex items-start justify-between px-3 pt-2.5">
          {/* Data badge */}
          <span
            className="text-[9px] font-semibold px-2 py-0.5 rounded-md"
            style={{ background: 'rgba(255,255,255,.15)', color: '#7fd491' }}
          >
            {dateLabel}
          </span>
          {/* Stato racconto badge */}
          {report ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold"
              style={{ background: 'rgba(255,255,255,.15)', color: 'white' }}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Resoconto scritto
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold"
              style={{ background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.65)', border: '1px dashed rgba(127,212,145,.40)' }}
            >
              <PenLine className="w-2.5 h-2.5" />
              da scrivere
            </span>
          )}
        </div>
        {/* CTS badge */}
        {cts != null && (
          <div
            className="absolute bottom-2 left-3 px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
            style={{ background: ctsInfo?.color ?? '#4a9e5c', fontFamily: "'DM Mono', monospace" }}
          >
            CTS {cts}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p
          className="font-display font-bold text-[13px] leading-tight mb-1 truncate"
          style={{ color: '#1a3320', fontFamily: "'Lora', serif" }}
        >
          {activity.title ?? 'Escursione'}
        </p>

        {/* Excerpt narrativo o CTA */}
        {excerpt ? (
          <p
            className="text-[11px] leading-snug mb-2 line-clamp-2"
            style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', color: '#5e564c' }}
          >
            &ldquo;{excerpt}&rdquo;
          </p>
        ) : (
          <div
            className="rounded-[10px] p-2 mb-2 flex items-center gap-2"
            style={{ background: '#F0F7F1', border: '1px dashed #4a9e5c' }}
          >
            <PenLine className="w-3.5 h-3.5 shrink-0" style={{ color: '#4a9e5c' }} />
            <p className="text-[10px] font-medium" style={{ color: '#2d5c38' }}>Racconto da scrivere</p>
          </div>
        )}

        {/* Dati tecnici */}
        <div className="flex items-center gap-3 text-[10px]" style={{ color: '#8a7f6e' }}>
          <span className="flex items-center gap-0.5">
            <Route className="w-3 h-3" /> {(activity.distanceMeters / 1000).toFixed(1)} km
          </span>
          <span className="flex items-center gap-0.5">
            <Mountain className="w-3 h-3" /> D+ {activity.elevationGain.toFixed(0)} m
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" /> {formatDuration(activity.totalTimeSeconds)}
          </span>
          <span className="ml-auto text-[10px] font-semibold" style={{ color: '#4a9e5c' }}>
            {report ? 'Leggi →' : 'Apri →'}
          </span>
        </div>
      </div>
    </Link>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-20 gap-4 text-center px-6">
      <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: '#F0F7F1' }}>
        <BookOpen className="w-9 h-9" style={{ color: '#2d5c38' }} />
      </div>
      <div>
        <p className="font-display font-bold text-lg" style={{ color: '#1a3320', fontFamily: "'Lora', serif" }}>
          Il tuo diario è vuoto
        </p>
        <p className="text-sm mt-1" style={{ color: '#8a7f6e' }}>
          Carica la tua prima escursione per iniziare il racconto.
        </p>
      </div>
      <Link
        href="/upload"
        className="flex items-center gap-2 px-6 py-3 rounded-[14px] text-white font-semibold text-sm"
        style={{ background: '#2d5c38' }}
      >
        <UploadCloud className="w-4 h-4" />
        Carica escursione
      </Link>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DiarioPage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [reports,    setReports]    = useState<Report[]>([])
  const [loading,    setLoading]    = useState(true)

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

  const reportMap    = new Map<string, Report>(reports.map(r => [r.activity_id, r]))
  const stats        = computeGlobalStats(activities)
  const writtenCount = activities.filter(a => reportMap.has(a.id)).length
  const missingCount = activities.length - writtenCount

  return (
    <div className="min-h-screen pb-20 md:pb-0" style={{ background: '#F0F7F1' }}>
      <Navbar />

      {/* ── Header gradient ──────────────────────────────────────────── */}
      <div
        className="relative"
        style={{
          background: 'linear-gradient(160deg, #1a3320 0%, #2d5c38 75%, #4a9e5c 100%)',
          padding: '14px 16px 20px',
          overflow: 'visible',
        }}
      >
        {/* Title row */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[2px] uppercase mb-0.5" style={{ color: '#7fd491' }}>
              Le mie escursioni
            </p>
            <h1 style={{ fontFamily: "'Lora', serif", fontSize: '22px', fontWeight: 700, color: 'white', margin: 0 }}>
              passate
            </h1>
          </div>
          {/* Racconti badge */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,.12)' }}
          >
            <BookOpen className="w-3.5 h-3.5" style={{ color: '#7fd491' }} />
            <span className="text-white font-bold text-[13px]" style={{ fontFamily: "'DM Mono', monospace" }}>
              {writtenCount}/{activities.length}
            </span>
            {missingCount > 0 && (
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                style={{ background: '#f97316' }}
              >
                {missingCount}
              </span>
            )}
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,.12)' }}>
            <Route className="w-3.5 h-3.5" style={{ color: '#7fd491' }} />
            <span className="text-white font-bold text-[13px]" style={{ fontFamily: "'DM Mono', monospace" }}>
              {stats.totalDistanceKm.toFixed(0)}
            </span>
            <span className="text-[10px] font-medium" style={{ color: '#7fd491' }}>km</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,.12)' }}>
            <Mountain className="w-3.5 h-3.5" style={{ color: '#7fd491' }} />
            <span className="text-white font-bold text-[13px]" style={{ fontFamily: "'DM Mono', monospace" }}>
              {stats.totalElevationGain.toFixed(0)}
            </span>
            <span className="text-[10px] font-medium" style={{ color: '#7fd491' }}>m D+</span>
          </div>
        </div>

        {/* Stats FAB */}
        <StatsFab />
      </div>

      {/* ── Content area ────────────────────────────────────────────── */}
      <div className="px-4" style={{ paddingTop: '36px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: '#2d5c38' }}>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Caricamento…</span>
          </div>
        ) : activities.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3 pb-4">
            {activities.map(activity => (
              <ResocontoCard
                key={activity.id}
                activity={activity}
                report={reportMap.get(activity.id) ?? null}
              />
            ))}
            {activities.length > 0 && (
              <div className="pt-3 pb-2 flex justify-center">
                <Link
                  href="/diario/export"
                  className="flex items-center gap-2 text-sm transition-colors"
                  style={{ color: '#8a7f6e' }}
                >
                  <FileDown className="w-4 h-4" />
                  Esporta Diario in PDF
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
