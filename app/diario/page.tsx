'use client'

import { ReactNode, CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import { getAllActivities, getActivityById, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { fetchActivityPhotos, type RoutePhoto } from '@/lib/activityPhotos'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { formatDuration, type TrackPoint } from '@/lib/tcxParser'
import {
  BookMarked, FileDown, Share2, Copy, Link2Off, ExternalLink,
  Loader2, Image as ImageIcon, BarChart2, ChevronDown, X, Pencil,
  Route, Mountain, Clock, Flame, Trophy, TrendingUp, NotebookPen,
} from 'lucide-react'
import RouteThumb from '@/components/RouteThumb'
import { wmoInfo, type WeatherAtHike } from '@/lib/openmeteo'
import { findAnniversaries } from '@/lib/stats'
import { parseSections } from '@/lib/reportStore'

const AllRoutesMap = dynamic(() => import('@/components/AllRoutesMap'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────────

interface DiaryReport {
  id: string
  activity_id: string
  title: string
  content: string
  created_at: string
  activity: {
    id: string; title: string; start_time: string
    distance_meters: number; total_time_seconds: number; elevation_gain: number
    weather_at_hike?: WeatherAtHike | null
  } | null
}

interface StatsToggles {
  totali: boolean
  record:  boolean
  medie:   boolean
  andamento: boolean
}

interface ReportExtras {
  mappa:       boolean
  statistiche: boolean
  grafico:     boolean
  cuore:       boolean
  velocita:    boolean
}

// ── SVG Charts & Stats ─────────────────────────────────────────────────────────

type AccentTheme = { bg: string; border: string; text: string; iconBg: string; iconColor: string }

const GREEN:  AccentTheme = { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', iconBg: '#dcfce7', iconColor: '#16a34a' }
const AMBER:  AccentTheme = { bg: '#fffbeb', border: '#fde68a', text: '#78350f', iconBg: '#fef3c7', iconColor: '#d97706' }
const BLUE:   AccentTheme = { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', iconBg: '#dbeafe', iconColor: '#2563eb' }
const VIOLET: AccentTheme = { bg: '#f5f3ff', border: '#ddd6fe', text: '#4c1d95', iconBg: '#ede9fe', iconColor: '#7c3aed' }

function PillHeader({ label, accent }: { label: string; accent: AccentTheme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ background: accent.iconBg, color: accent.text, padding: '3px 10px', borderRadius: 20, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'Arial, sans-serif' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: '#f3f4f6' }} />
    </div>
  )
}

function MonthBarChart({ activities }: { activities: ActivityMeta[] }) {
  const counts = Array(12).fill(0)
  activities.forEach(a => {
    if (a.startTime) counts[new Date(a.startTime).getMonth()]++
  })
  const max = Math.max(...counts, 1)
  const months = ['G','F','M','A','M','G','L','A','S','O','N','D']
  const bw = 17
  function barColor(c: number): string {
    if (c === 0) return '#f3f4f6'
    if (c === 1) return '#bbf7d0'
    if (c <= 3) return '#4ade80'
    return '#16a34a'
  }
  return (
    <svg viewBox="0 0 260 90" className="w-full" style={{ height: 90 }}>
      {counts.map((c, i) => {
        const barH = c > 0 ? Math.max((c / max) * 56, 4) : 2
        const x = i * (260 / 12) + 1.5
        const by = 68 - barH
        return (
          <g key={i}>
            <rect x={x} y={by} width={bw} height={barH} fill={barColor(c)} rx={2} />
            {c > 0 && (
              <text x={x + bw / 2} y={by - 2} textAnchor="middle" fontSize={6} fill="#6b7280" fontFamily="Arial">{c}</text>
            )}
            <text x={x + bw / 2} y={82} textAnchor="middle" fontSize={7} fill="#9ca3af" fontFamily="Arial">{months[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

function haversineMDiario(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Maps each trackpoint to its fraction (0–1) of cumulative GPS distance along the route. */
function trackPointsProgress(trackPoints: TrackPoint[]): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < trackPoints.length; i++) {
    const p = trackPoints[i], q = trackPoints[i - 1]
    const d = (p.lat !== undefined && p.lon !== undefined && q.lat !== undefined && q.lon !== undefined)
      ? haversineMDiario(q.lat, q.lon, p.lat, p.lon) : 0
    cum.push(cum[i - 1] + d)
  }
  const total = cum[cum.length - 1] || 1
  return cum.map(d => d / total)
}

/**
 * Distance-aligned SVG chart (progress 0–1 on x-axis) so photo markers — placed by
 * RoutePhoto.progress — line up exactly with the metric series, unlike a time-based axis.
 */
function ProgressChart({ series, photoProgress, accent, unit, decimals = 0 }: {
  series: { progress: number; value: number }[]
  photoProgress?: number[]
  accent: AccentTheme
  unit: string
  decimals?: number
}) {
  if (series.length < 2) return null
  const values = series.map(s => s.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 660, H = 110, pad = 4
  const pts = series.map(({ progress, value }) => {
    const x = pad + progress * (W - pad * 2)
    const y = H - pad - ((value - min) / range) * (H - pad * 2)
    return [x, y]
  })
  const linePath = `M ${pts.map(p => p.join(',')).join(' L ')}`
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${H} L ${pts[0][0]},${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <path d={areaPath} fill={accent.iconColor} opacity={0.12} />
      <path d={linePath} fill="none" stroke={accent.iconColor} strokeWidth={1.6} />
      {photoProgress?.map((p, i) => {
        const x = pad + Math.min(Math.max(p, 0), 1) * (W - pad * 2)
        return (
          <g key={i}>
            <line x1={x} y1={0} x2={x} y2={H - 10} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2,2" opacity={0.7} />
            <circle cx={x} cy={H - 10} r={5} fill="#f59e0b" stroke="white" strokeWidth={1} />
            <text x={x} y={H - 7} textAnchor="middle" fontSize={6} fill="white" fontFamily="Arial" fontWeight="bold">{i + 1}</text>
          </g>
        )
      })}
      <text x={pad} y={H - 2} fontSize={8} fill="#9ca3af" fontFamily="Arial">{min.toFixed(decimals)}{unit}</text>
      <text x={W - pad} y={10} textAnchor="end" fontSize={8} fill="#9ca3af" fontFamily="Arial">{max.toFixed(decimals)}{unit}</text>
    </svg>
  )
}

function StatCard({ value, label, sub, icon, accent }: {
  value: string; label: string; sub?: string; icon?: ReactNode; accent: AccentTheme
}) {
  return (
    <div style={{ background: accent.bg, border: `1px solid ${accent.border}`, borderRadius: 10, padding: '14px 12px' }}>
      {icon && (
        <div style={{ width: 26, height: 26, borderRadius: 6, background: accent.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 22, fontWeight: 900, color: accent.text, fontFamily: 'Arial Black, sans-serif', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 2, fontFamily: 'Arial, sans-serif', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 8, color: '#9ca3af', fontStyle: 'italic', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Diario pages (A4) ─────────────────────────────────────────────────────────

function DiarioCover({
  coverUrl, diaryTitle, diarySubtitle, diaryAuthor, dateRange, totalActivities, totalKm,
}: {
  coverUrl: string | null; diaryTitle: string; diarySubtitle: string; diaryAuthor: string
  dateRange?: string; totalActivities?: number; totalKm?: number
}) {
  return (
    <div className="diario-page" style={{
      width: 794, height: 1123,
      position: 'relative', overflow: 'hidden', margin: '24px auto',
      boxShadow: '0 4px 32px rgba(0,0,0,0.14)',
    }}>
      {/* Full-bleed background */}
      <img
        src={coverUrl || '/diary-cover-default.png'}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Dark overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(8,24,14,0.68) 0%, rgba(8,24,14,0.48) 60%, rgba(8,24,14,0.55) 100%)' }} />

      {/* Title block — ~1/3 from top, left */}
      <div style={{ position: 'absolute', top: 340, left: 64, right: 120 }}>
        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 54,
          fontWeight: 700,
          color: 'white',
          margin: '0 0 18px',
          letterSpacing: 4,
          lineHeight: 1.2,
          textTransform: 'uppercase',
        }}>
          {diaryTitle}
        </h1>
        {/* Thin decorative rule */}
        <div style={{ width: 72, height: 1, background: 'rgba(255,255,255,0.45)', margin: '0 0 18px' }} />
        {/* Subtitle */}
        <p style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 14,
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.7)',
          margin: 0,
          letterSpacing: 1.5,
        }}>
          {diarySubtitle}
        </p>

        {/* Compact summary — date range + counters */}
        {(dateRange || totalActivities) && (
          <div style={{ display: 'flex', gap: 18, marginTop: 22 }}>
            {dateRange && (
              <span style={{ fontFamily: 'Arial, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {dateRange}
              </span>
            )}
            {!!totalActivities && (
              <span style={{ fontFamily: 'Arial, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {totalActivities} {totalActivities === 1 ? 'escursione' : 'escursioni'}
              </span>
            )}
            {!!totalKm && (
              <span style={{ fontFamily: 'Arial, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {totalKm.toFixed(0)} km
              </span>
            )}
          </div>
        )}
      </div>

      {/* Author — bottom center */}
      {diaryAuthor && (
        <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, textAlign: 'center' }}>
          <p style={{
            fontFamily: 'Arial, sans-serif',
            fontSize: 10,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: 5,
            textTransform: 'uppercase',
            margin: 0,
          }}>
            {diaryAuthor}
          </p>
        </div>
      )}
    </div>
  )
}

type BookPage =
  | { kind: 'report'; startTime: string; report: DiaryReport }
  | { kind: 'stub'; startTime: string; activity: ActivityMeta }

function DiarioIndice({ pages }: { pages: BookPage[] }) {
  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'white', margin: '24px auto',
      padding: '72px 64px', boxShadow: '0 4px 32px rgba(0,0,0,0.14)',
    }}>
      <p style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', margin: '0 0 8px' }}>
        Indice
      </p>
      <h2 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 32, fontWeight: 900, color: '#111827', margin: '0 0 40px', textTransform: 'uppercase', letterSpacing: -0.5 }}>
        Le escursioni
      </h2>
      <div style={{ borderTop: '1px solid #e5e7eb' }}>
        {pages.map((page, i) => {
          const isStub = page.kind === 'stub'
          const title = isStub ? (page.activity.title ?? 'Escursione') : (page.report.title || page.report.activity?.title || 'Escursione')
          const distanceM = isStub ? page.activity.distanceMeters : page.report.activity?.distance_meters ?? 0
          const elevGain  = isStub ? page.activity.elevationGain  : page.report.activity?.elevation_gain ?? 0
          const dateStr = format(new Date(page.startTime), 'd MMMM yyyy', { locale: it })
          const year = new Date(page.startTime).getFullYear()
          const prevYear = i > 0 ? new Date(pages[i - 1].startTime).getFullYear() : null
          const showYearHeader = year !== prevYear
          return (
            <div key={isStub ? `stub-${page.activity.id}` : `rep-${page.report.id}`}>
              {showYearHeader && (
                <p style={{ fontSize: 11, color: '#16a34a', fontFamily: 'Arial Black, sans-serif', fontWeight: 900, letterSpacing: 1, margin: i === 0 ? '0 0 4px' : '24px 0 4px' }}>
                  {year}
                </p>
              )}
              <div className="pdf-block" style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                padding: '14px 0', borderBottom: '1px solid #f3f4f6',
              }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'Arial, sans-serif', fontWeight: 700, minWidth: 24 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontFamily: 'Arial Black, sans-serif', fontWeight: 900, color: isStub ? '#9ca3af' : '#1f2937', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      {title} {isStub && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>· da narrare</span>}
                    </div>
                    {dateStr && (
                      <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'Georgia, serif', fontStyle: 'italic', marginTop: 2 }}>{dateStr}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#6b7280', fontFamily: 'Arial, sans-serif', flexShrink: 0, marginLeft: 16 }}>
                  {distanceM > 0 && <span>{(distanceM / 1000).toFixed(1)} km</span>}
                  {elevGain > 0 && <span>{Math.round(elevGain)} m D+</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DiarioStubPage({ activity }: { activity: ActivityMeta }) {
  const dateStr = format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it })
  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: '#fafaf9', margin: '24px auto',
      boxShadow: '0 4px 32px rgba(0,0,0,0.14)', border: '2px dashed #d6d3d1', position: 'relative', overflow: 'hidden',
    }}>
      <span style={{
        position: 'absolute', top: 40, right: -50, transform: 'rotate(35deg)',
        fontSize: 13, fontFamily: 'Arial, sans-serif', fontWeight: 900, letterSpacing: 4,
        color: 'rgba(120,113,108,0.18)', textTransform: 'uppercase', width: 240, textAlign: 'center',
      }}>
        Da narrare
      </span>

      <div style={{ padding: '32px 32px 0' }}>
        <p style={{ fontSize: 9, color: '#a8a29e', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', margin: '0 0 4px' }}>
          {dateStr}
        </p>
        <h2 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 22, fontWeight: 900, color: '#57534e', margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {activity.title ?? 'Escursione'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ background: 'white', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a8a29e', fontFamily: 'Arial, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>Distanza</div>
            <div style={{ fontSize: 18, fontFamily: 'Arial Black, sans-serif', color: '#57534e' }}>{(activity.distanceMeters / 1000).toFixed(2)} km</div>
          </div>
          <div style={{ background: 'white', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a8a29e', fontFamily: 'Arial, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>Dislivello</div>
            <div style={{ fontSize: 18, fontFamily: 'Arial Black, sans-serif', color: '#57534e' }}>{Math.round(activity.elevationGain)} m</div>
          </div>
          <div style={{ background: 'white', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a8a29e', fontFamily: 'Arial, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>Durata</div>
            <div style={{ fontSize: 18, fontFamily: 'Arial Black, sans-serif', color: '#57534e' }}>{formatDuration(activity.totalTimeSeconds)}</div>
          </div>
          <div style={{ background: 'white', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a8a29e', fontFamily: 'Arial, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>Calorie</div>
            <div style={{ fontSize: 18, fontFamily: 'Arial Black, sans-serif', color: '#57534e' }}>{activity.calories ? `${activity.calories} kcal` : '—'}</div>
          </div>
        </div>

        {activity.routePolyline && activity.routePolyline.length > 1 && (
          <div style={{ height: 220, borderRadius: 10, overflow: 'hidden', border: '1px solid #e7e5e4', background: 'white', marginBottom: 20 }}>
            <RouteThumb polyline={activity.routePolyline} color="#a8a29e" />
          </div>
        )}
      </div>

      <div className="print:hidden" style={{ position: 'absolute', bottom: 32, left: 32, right: 32, textAlign: 'center' }}>
        <a href={`/resoconto/${encodeURIComponent(activity.id)}/racconta`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1b4332', color: 'white',
            padding: '10px 20px', borderRadius: 10, fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: 700,
            textDecoration: 'none', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
          Racconta questa escursione →
        </a>
      </div>
    </div>
  )
}

function DiarioYearDivider({ year, count, totalKm }: { year: string; count: number; totalKm: number }) {
  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'linear-gradient(135deg,#1b4332,#2d6a4f)', margin: '24px auto',
      boxShadow: '0 4px 32px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', position: 'relative',
    }}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 6, textTransform: 'uppercase', margin: '0 0 12px' }}>
        Anno
      </p>
      <h2 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 96, fontWeight: 900, color: 'white', margin: 0, letterSpacing: -2 }}>
        {year}
      </h2>
      <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'Arial, sans-serif' }}>
          {count} {count === 1 ? 'escursione' : 'escursioni'}
        </span>
        {totalKm > 0 && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'Arial, sans-serif' }}>
            {totalKm.toFixed(0)} km
          </span>
        )}
      </div>
    </div>
  )
}

function AnniversaryBanner({ activities }: { activities: ActivityMeta[] }) {
  const anniversaries = useMemo(() => findAnniversaries(activities), [activities])
  if (anniversaries.length === 0) return null
  return (
    <div className="print:hidden max-w-[794px] mx-auto mb-6 flex flex-col gap-2">
      {anniversaries.map(({ activity, yearsAgo }) => (
        <a
          key={activity.id}
          href={`/escursione/${activity.id}`}
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <span className="text-sm text-amber-900">
            🎉 <span className="font-semibold">{yearsAgo} anno{yearsAgo === 1 ? '' : 'i'} fa</span>
            {' '}facevi <span className="font-semibold">{activity.title}</span>
            {' '}({(activity.distanceMeters / 1000).toFixed(1)} km, {format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it })})
          </span>
        </a>
      ))}
    </div>
  )
}

function DiarioMappa({ activities, mapImgUrl }: { activities: ActivityMeta[]; mapImgUrl: string | null }) {
  const routes = activities
    .filter(a => (a.routePolyline?.length ?? 0) > 1)
    .map(a => ({ id: a.id, title: a.title, startTime: a.startTime, polyline: a.routePolyline! }))

  const PALETTE = ['#166534','#0369a1','#9333ea','#c2410c','#0f766e','#b45309','#be123c','#1d4ed8']

  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'white', margin: '24px auto',
      padding: '72px 64px', boxShadow: '0 4px 32px rgba(0,0,0,0.14)',
    }}>
      <p style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', margin: '0 0 8px' }}>
        Mappa
      </p>
      <h2 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 32, fontWeight: 900, color: '#111827', margin: '0 0 24px', textTransform: 'uppercase', letterSpacing: -0.5 }}>
        Tutti i percorsi
      </h2>

      {/* Screen map (Leaflet) */}
      {routes.length > 0 && (
        <div className="print:hidden diario-global-map" style={{ height: 400, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <AllRoutesMap routes={routes} height="400px" />
        </div>
      )}

      {/* PDF map (canvas raster) */}
      {mapImgUrl && (
        <img src={mapImgUrl} alt="Mappa percorsi"
          className="hidden print:block"
          style={{ width: '100%', borderRadius: 12, display: 'none' }} />
      )}

      {/* Legend */}
      {routes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 16 }}>
          {routes.slice(0, 8).map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 3, background: PALETTE[i % PALETTE.length], borderRadius: 2 }} />
              <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'Arial, sans-serif' }}>
                {r.title || 'Percorso'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiarioStatistiche({ activities, toggles }: { activities: ActivityMeta[]; toggles: StatsToggles }) {
  const gs = computeGlobalStats(activities)

  const longestAct = activities.reduce<ActivityMeta | null>((best, a) =>
    !best || a.distanceMeters > best.distanceMeters ? a : best, null)
  const highestAct = activities.reduce<ActivityMeta | null>((best, a) =>
    !best || a.altitudeMax > best.altitudeMax ? a : best, null)
  const maxD = activities.reduce((m, a) => Math.max(m, a.elevationGain), 0)

  // ── Year-by-year breakdown ──────────────────────────────────────────────────
  const yearMap = new Map<number, { count: number; km: number; elevGain: number }>()
  activities.forEach(a => {
    const year = new Date(a.startTime).getFullYear()
    const entry = yearMap.get(year) ?? { count: 0, km: 0, elevGain: 0 }
    entry.count++
    entry.km += a.distanceMeters / 1000
    entry.elevGain += a.elevationGain
    yearMap.set(year, entry)
  })
  const years = Array.from(yearMap.entries()).sort((a, b) => a[0] - b[0])

  // ── Best month (across all years, by total km) ─────────────────────────────
  const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
  const monthKm = Array(12).fill(0)
  activities.forEach(a => { monthKm[new Date(a.startTime).getMonth()] += a.distanceMeters / 1000 })
  const bestMonthIdx = monthKm.reduce((best, v, i) => v > monthKm[best] ? i : best, 0)
  const bestMonthLabel = monthKm[bestMonthIdx] > 0 ? MONTH_NAMES[bestMonthIdx] : null

  // ── Narrative paragraph (uses DEP for an evocative comparison) ─────────────
  const italyLengths = gs.totalDepKm / 1300
  const narrative = activities.length > 0
    ? `In ${years.length} ${years.length === 1 ? 'anno' : 'anni'} di escursioni hai percorso ${gs.totalDistanceKm.toFixed(0)} km e accumulato ${Math.round(gs.totalElevationGain).toLocaleString('it')} m di dislivello positivo — l'equivalente di ${(gs.totalElevationGain / 8849).toFixed(1)} volte l'altezza dell'Everest. ` +
      `Considerando lo sforzo in DEP, hai coperto una distanza equivalente in piano di ${gs.totalDepKm.toFixed(0)} km: come attraversare l'Italia da nord a sud ${italyLengths.toFixed(1)} ${italyLengths === 1 ? 'volta' : 'volte'}. ` +
      (bestMonthLabel ? `Il tuo mese più attivo è stato ${bestMonthLabel}.` : '')
    : ''

  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'white', margin: '24px auto',
      padding: '72px 64px', boxShadow: '0 4px 32px rgba(0,0,0,0.14)',
    }}>
      <p style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', margin: '0 0 8px' }}>
        Statistiche
      </p>
      <h2 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 32, fontWeight: 900, color: '#111827', margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: -0.5 }}>
        I tuoi numeri
      </h2>

      {narrative && (
        <p className="pdf-block" style={{
          fontFamily: 'Georgia, serif', fontSize: 12, lineHeight: 1.7, color: '#374151',
          margin: '0 0 32px', fontStyle: 'italic',
        }}>
          {narrative}
        </p>
      )}

      {years.length > 1 && (
        <div className="pdf-block" style={{ marginBottom: 32 }}>
          <PillHeader label="Anno per anno" accent={GREEN} />
          <table style={{ width: '100%', fontSize: 11, fontFamily: 'Arial, sans-serif', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: 9, letterSpacing: 1 }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Anno</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Escursioni</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Distanza</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Dislivello</th>
              </tr>
            </thead>
            <tbody>
              {years.map(([year, d]) => (
                <tr key={year} style={{ color: '#374151' }}>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>{year}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{d.count}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{d.km.toFixed(0)} km</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{Math.round(d.elevGain).toLocaleString('it')} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toggles.totali && (
        <div className="pdf-block" style={{ marginBottom: 32 }}>
          <PillHeader label="Totali" accent={GREEN} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatCard value={`${gs.totalDistanceKm.toFixed(0)} km`} label="Percorsi" icon={<Route style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
            <StatCard value={`${gs.totalElevationGain.toFixed(0)} m`} label="Dislivello D+" icon={<Mountain style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
            <StatCard value={formatDuration(gs.totalTimeSeconds)} label="In cammino" icon={<Clock style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
            <StatCard value={`${gs.totalCalories.toFixed(0)}`} label="Calorie (kcal)" icon={<Flame style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
            <StatCard value={`${gs.totalDepKm.toFixed(0)} km`} label="DEP totale" icon={<Route style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
          </div>
        </div>
      )}

      {toggles.record && (
        <div className="pdf-block" style={{ marginBottom: 32 }}>
          <PillHeader label="Record personali" accent={AMBER} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <StatCard value={`${gs.longestKm.toFixed(1)} km`} label="Escursione più lunga" sub={longestAct?.title} icon={<Trophy style={{ color: AMBER.iconColor, width: 13, height: 13 }} />} accent={AMBER} />
            <StatCard value={`${gs.highestAlt} m`} label="Quota massima" sub={highestAct?.title} icon={<Mountain style={{ color: AMBER.iconColor, width: 13, height: 13 }} />} accent={AMBER} />
            <StatCard value={`${maxD.toFixed(0)} m D+`} label="Dislivello max" icon={<TrendingUp style={{ color: AMBER.iconColor, width: 13, height: 13 }} />} accent={AMBER} />
          </div>
        </div>
      )}

      {toggles.medie && activities.length > 0 && (
        <div className="pdf-block" style={{ marginBottom: 32 }}>
          <PillHeader label="Medie per uscita" accent={BLUE} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <StatCard value={`${(gs.totalDistanceKm / activities.length).toFixed(1)} km`} label="Distanza media" icon={<Route style={{ color: BLUE.iconColor, width: 13, height: 13 }} />} accent={BLUE} />
            <StatCard value={`${(gs.totalElevationGain / activities.length).toFixed(0)} m`} label="Dislivello medio" icon={<Mountain style={{ color: BLUE.iconColor, width: 13, height: 13 }} />} accent={BLUE} />
            <StatCard value={formatDuration(gs.totalTimeSeconds / activities.length)} label="Durata media" icon={<Clock style={{ color: BLUE.iconColor, width: 13, height: 13 }} />} accent={BLUE} />
          </div>
        </div>
      )}

      {toggles.andamento && (
        <div className="pdf-block">
          <PillHeader label="Andamento mensile" accent={VIOLET} />
          <div style={{ background: VIOLET.bg, borderRadius: 10, padding: '16px 20px', border: `1px solid ${VIOLET.border}` }}>
            <MonthBarChart activities={activities} />
          </div>
        </div>
      )}
    </div>
  )
}

const SECTION_COLORS = ['#2d6a4f','#40916c','#74c69d','#b7e4c7','#d8f3dc']

function DiarioReportPage({ report, photos, meta, extras, trackPoints }: {
  report: DiaryReport; photos: RoutePhoto[]; meta?: ActivityMeta; extras: ReportExtras
  trackPoints?: TrackPoint[]
}) {
  const act     = report.activity
  const sections = parseSections(report.content)
  const dateStr  = act?.start_time
    ? format(new Date(act.start_time), 'd MMMM yyyy', { locale: it })
    : report.created_at ? format(new Date(report.created_at), 'd MMMM yyyy', { locale: it }) : ''
  const heroPhoto = photos[0] ?? null
  const weather = act?.weather_at_hike
  const weatherInfo = weather ? wmoInfo(weather.weathercode) : null
  const showMappa       = extras.mappa       && (meta?.routePolyline?.length ?? 0) > 1
  const showStatistiche = extras.statistiche && !!meta

  const tp = trackPoints ?? []
  const progress = useMemo(() => tp.length > 1 ? trackPointsProgress(tp) : [], [tp])
  const photoProgress = useMemo(() => photos.map(p => p.progress).filter(p => typeof p === 'number'), [photos])

  const altitudeSeries = useMemo(() => tp
    .map((p, i) => p.altitudeMeters !== undefined ? { progress: progress[i], value: p.altitudeMeters } : null)
    .filter((x): x is { progress: number; value: number } => x !== null), [tp, progress])
  const hrSeries = useMemo(() => tp
    .map((p, i) => p.heartRateBpm !== undefined ? { progress: progress[i], value: p.heartRateBpm } : null)
    .filter((x): x is { progress: number; value: number } => x !== null), [tp, progress])
  const speedSeries = useMemo(() => tp
    .map((p, i) => p.speedMs !== undefined ? { progress: progress[i], value: p.speedMs * 3.6 } : null)
    .filter((x): x is { progress: number; value: number } => x !== null), [tp, progress])

  const showGrafico  = extras.grafico  && altitudeSeries.length > 1
  const showCuore    = extras.cuore    && hrSeries.length > 1
  const showVelocita = extras.velocita && speedSeries.length > 1

  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'white', margin: '24px auto',
      boxShadow: '0 4px 32px rgba(0,0,0,0.14)', overflow: 'hidden',
    }}>
      {/* Report header */}
      <div style={{ position: 'relative', height: 180, overflow: 'hidden' }}>
        {heroPhoto
          ? <img src={heroPhoto.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1b4332,#40916c)' }} />
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 60%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 32px' }}>
          {dateStr && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', margin: '0 0 4px' }}>{dateStr}</p>}
          <h2 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 22, fontWeight: 900, color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {report.title || act?.title || 'Escursione'}
          </h2>
          {act && (
            <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              {act.distance_meters > 0 && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', fontFamily: 'Arial, sans-serif' }}>{(act.distance_meters / 1000).toFixed(1)} km</span>}
              {act.elevation_gain > 0 && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', fontFamily: 'Arial, sans-serif' }}>{Math.round(act.elevation_gain)} m D+</span>}
              {act.total_time_seconds > 0 && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', fontFamily: 'Arial, sans-serif' }}>{formatDuration(act.total_time_seconds)}</span>}
              {weatherInfo && weather && (
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', fontFamily: 'Arial, sans-serif' }}>
                  {weatherInfo.emoji} {Math.round(weather.temperature)}°C
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      <div style={{ padding: '24px 32px' }}>
        {(showMappa || showStatistiche || showGrafico || showCuore || showVelocita) && (
          <div className="pdf-block" style={{ marginBottom: 24 }}>
            {showMappa && (
              <div className="print:hidden diario-report-map" style={{ height: 260, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                <AllRoutesMap
                  routes={[{ id: meta!.id, title: meta!.title ?? 'Percorso', startTime: meta!.startTime, polyline: meta!.routePolyline! }]}
                  height="260px"
                />
              </div>
            )}
            {showStatistiche && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: (showGrafico || showCuore || showVelocita) ? 16 : 0 }}>
                <StatCard value={`${(meta!.distanceMeters / 1000).toFixed(1)} km`} label="Distanza" icon={<Route style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
                <StatCard value={`${Math.round(meta!.elevationGain)} m`} label="Dislivello D+" icon={<Mountain style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
                <StatCard value={formatDuration(meta!.totalTimeSeconds)} label="Durata" icon={<Clock style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
                <StatCard value={meta!.calories ? `${meta!.calories}` : '—'} label="Calorie (kcal)" icon={<Flame style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
              </div>
            )}
            {showGrafico && (
              <div style={{ marginBottom: (showCuore || showVelocita) ? 16 : 0 }}>
                <p style={{ fontSize: 8, color: '#9ca3af', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                  Profilo altimetrico {photoProgress.length > 0 && '· con posizione foto'}
                </p>
                <div style={{ background: GREEN.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${GREEN.border}` }}>
                  <ProgressChart series={altitudeSeries} photoProgress={photoProgress} accent={GREEN} unit=" m" />
                </div>
              </div>
            )}
            {showCuore && (
              <div style={{ marginBottom: showVelocita ? 16 : 0 }}>
                <p style={{ fontSize: 8, color: '#9ca3af', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                  Frequenza cardiaca
                </p>
                <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 12px', border: '1px solid #fecaca' }}>
                  <ProgressChart series={hrSeries} accent={{ bg: '#fef2f2', border: '#fecaca', text: '#991b1b', iconBg: '#fee2e2', iconColor: '#dc2626' }} unit=" bpm" />
                </div>
              </div>
            )}
            {showVelocita && (
              <div>
                <p style={{ fontSize: 8, color: '#9ca3af', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                  Velocità
                </p>
                <div style={{ background: BLUE.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${BLUE.border}` }}>
                  <ProgressChart series={speedSeries} accent={BLUE} unit=" km/h" decimals={1} />
                </div>
              </div>
            )}
          </div>
        )}

        {sections.map((section, i) => (
          <div key={i} className="pdf-block" style={{ marginBottom: 20 }}>
            <div style={{ background: SECTION_COLORS[i % SECTION_COLORS.length], padding: '5px 14px', borderRadius: '5px 5px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{String(i+1).padStart(2,'0')}</span>
              <span style={{ fontSize: 12, fontFamily: 'Arial Black, sans-serif', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: 0.5 }}>{section.title}</span>
            </div>
            <div style={{ padding: '10px 14px', background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 5px 5px' }}>
              {photos[i + 1] && (
                <div style={{ float: 'right', marginLeft: 18, marginBottom: 10, width: 190, shapeOutside: 'margin-box' } as CSSProperties}>
                  <div style={{ position: 'relative' }}>
                    <img src={photos[i + 1].url} alt={photos[i + 1].caption}
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 7, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }} />
                    <span style={{ position: 'absolute', top: 5, left: 5, width: 18, height: 18, background: '#f59e0b', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '18px', fontSize: 9, fontWeight: 'bold', fontFamily: 'Arial, sans-serif', display: 'block', boxSizing: 'border-box' }}>{i+2}</span>
                  </div>
                  {photos[i + 1].caption && <p style={{ fontSize: 9, color: '#78716c', textAlign: 'center', marginTop: 5, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{photos[i + 1].caption}</p>}
                </div>
              )}
              {section.body.split(/\n\n+/).slice(0, 3).map((p, j) => {
                const text = p.replace(/\[curiosita\]|\[\/curiosita\]/g, '').trim()
                const dropCap = i === 0 && j === 0
                return (
                  <p key={j} style={{ fontSize: 11, lineHeight: 1.75, color: '#374151', margin: '0 0 8px', fontFamily: 'Georgia, serif' }}>
                    {dropCap && text.length > 0 ? (
                      <>
                        <span style={{ float: 'left', fontSize: 38, lineHeight: 0.8, fontWeight: 700, color: SECTION_COLORS[0], padding: '4px 4px 0 0', fontFamily: 'Georgia, serif' }}>
                          {text[0]}
                        </span>
                        {text.slice(1)}
                      </>
                    ) : text}
                  </p>
                )
              })}
            </div>
          </div>
        ))}

        {/* Photo row */}
        {photos.length > 0 && (
          <div className="pdf-block" style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {photos.map((ph, i) => (
              <div key={ph.id} style={{ position: 'relative' }}>
                <img src={ph.url} alt={ph.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }} />
                <span style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, background: '#f59e0b', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '20px', fontSize: 10, fontWeight: 'bold', fontFamily: 'Arial, sans-serif', display: 'block', boxSizing: 'border-box', border: '1px solid white' }}>{i+1}</span>
                {ph.caption && <p style={{ fontSize: 9, color: '#78716c', textAlign: 'center', marginTop: 5, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{ph.caption}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DiarioPage() {
  const [activities,   setActivities]   = useState<ActivityMeta[]>([])
  const [reports,      setReports]      = useState<DiaryReport[]>([])
  const [bookPages,    setBookPages]    = useState<BookPage[]>([])
  const [photosByAct,  setPhotosByAct]  = useState<Record<string, RoutePhoto[]>>({})
  const [trackPointsByAct, setTrackPointsByAct] = useState<Record<string, TrackPoint[]>>({})
  const [coverUrl,     setCoverUrl]     = useState<string | null>(null)
  const [mapImgUrl,    setMapImgUrl]    = useState<string | null>(null)
  const [ownerName,    setOwnerName]    = useState('')
  const [loading,      setLoading]      = useState(true)
  const [diaryPdfUrl,  setDiaryPdfUrl]  = useState<string | null>(null)
  const [diaryToken,   setDiaryToken]   = useState<string | null>(null)
  const [downloading,  setDownloading]  = useState(false)
  const [publishing,   setPublishing]   = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [copyOk,       setCopyOk]       = useState(false)
  const [showStatsMenu, setShowStatsMenu] = useState(false)
  const [showTextMenu,  setShowTextMenu]  = useState(false)
  const [statsToggles, setStatsToggles] = useState<StatsToggles>(() => {
    try { return JSON.parse(localStorage.getItem('dtrek_diary_stats') ?? '') }
    catch { return { totali: true, record: true, medie: true, andamento: true } }
  })
  const [reportExtras, setReportExtras] = useState<ReportExtras>(() => {
    const defaults: ReportExtras = { mappa: true, statistiche: true, grafico: true, cuore: false, velocita: false }
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('dtrek_diary_report_extras') ?? '') } }
    catch { return defaults }
  })
  const bookOuterRef = useRef<HTMLDivElement>(null)
  const bookInnerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [innerHeight, setInnerHeight] = useState(0)
  const [diaryTitle,    setDiaryTitle]    = useState<string>(() => {
    try { return localStorage.getItem('dtrek_diary_title')    ?? 'DIARIO di VIAGGIO' } catch { return 'DIARIO di VIAGGIO' }
  })
  const [diarySubtitle, setDiarySubtitle] = useState<string>(() => {
    try { return localStorage.getItem('dtrek_diary_subtitle') ?? 'I miei percorsi'   } catch { return 'I miei percorsi'   }
  })
  const [diaryAuthor,   setDiaryAuthor]   = useState<string>(() => {
    try { return localStorage.getItem('dtrek_diary_author')   ?? ''                  } catch { return ''                  }
  })
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      getAllActivities(),
      fetch('/api/resoconto?all=true').then(r => r.ok ? r.json() : []),
      fetch('/api/diary-token').then(r => r.ok ? r.json() : {}),
      fetch('/api/user-settings').then(r => r.ok ? r.json() : {}),
    ]).then(async ([acts, reps, dt, us]) => {
      const sortedActs = (acts as ActivityMeta[]).sort((a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      setActivities(sortedActs)

      const sortedReps = Array.isArray(reps) ? [...reps].sort((a: DiaryReport, b: DiaryReport) =>
        new Date(a.activity?.start_time ?? a.created_at).getTime() -
        new Date(b.activity?.start_time ?? b.created_at).getTime()
      ) : []
      setReports(sortedReps)

      const reportedIds = new Set(sortedReps.map((r: DiaryReport) => r.activity_id))
      const unreportedActivities = sortedActs.filter(a => !reportedIds.has(a.id))
      const pages: BookPage[] = [
        ...sortedReps.map((rep: DiaryReport): BookPage => ({
          kind: 'report', startTime: rep.activity?.start_time ?? rep.created_at, report: rep,
        })),
        ...unreportedActivities.map((a): BookPage => ({
          kind: 'stub', startTime: a.startTime, activity: a,
        })),
      ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      setBookPages(pages)

      // Load diary PDF url and viewer token
      const dtData = dt as { diary_pdf_url?: string | null; diary_token?: string | null }
      if (dtData.diary_pdf_url) setDiaryPdfUrl(dtData.diary_pdf_url)
      if (dtData.diary_token)   setDiaryToken(dtData.diary_token)

      // Owner name
      const usData = us as { display_name?: string; name?: string }
      const name = usData.display_name ?? usData.name ?? ''
      setOwnerName(name)

      // Default author from profile if user hasn't set one
      try {
        if (!localStorage.getItem('dtrek_diary_author') && name) setDiaryAuthor(name)
      } catch { /* ignore */ }

      // Load cover photo from localStorage
      const cover = localStorage.getItem('dtrek_diary_cover')
      if (cover) setCoverUrl(cover)

      // Load photos for each activity from the server (migra automaticamente da localStorage se serve)
      const photoEntries = await Promise.all(sortedReps.map(async (rep: DiaryReport): Promise<readonly [string, RoutePhoto[]]> => {
        try {
          return [rep.activity_id, await fetchActivityPhotos(rep.activity_id)]
        } catch {
          return [rep.activity_id, []]
        }
      }))
      const byAct: Record<string, RoutePhoto[]> = {}
      photoEntries.forEach(([activityId, photos]) => { if (photos.length) byAct[activityId] = photos })
      setPhotosByAct(byAct)

      // Load full trackPoints per reported activity for the elevation/HR/speed charts
      const trackPointEntries = await Promise.all(sortedReps.map(async (rep: DiaryReport): Promise<readonly [string, TrackPoint[]]> => {
        try {
          const full = await getActivityById(rep.activity_id)
          return [rep.activity_id, full?.trackPoints ?? []]
        } catch {
          return [rep.activity_id, []]
        }
      }))
      const tpByAct: Record<string, TrackPoint[]> = {}
      trackPointEntries.forEach(([activityId, tps]) => { if (tps.length) tpByAct[activityId] = tps })
      setTrackPointsByAct(tpByAct)

      // Pre-generate canvas map for PDF
      import('@/utils/pdfExport').then(({ chartAllRoutes }) => {
        const img = chartAllRoutes(sortedActs, 660, 400)
        if (img) setMapImgUrl(img)
      })
    }).finally(() => setLoading(false))
  }, [])

  function toggleStat(key: keyof StatsToggles) {
    setStatsToggles(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('dtrek_diary_stats', JSON.stringify(next))
      return next
    })
  }

  function toggleReportExtra(key: keyof ReportExtras) {
    setReportExtras(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('dtrek_diary_report_extras', JSON.stringify(next))
      return next
    })
  }

  // Scale the fixed-794px book to fit the viewport, like a responsive PDF viewer —
  // recalculated on resize and whenever content height changes (photos load async).
  useLayoutEffect(() => {
    if (loading) return
    const outer = bookOuterRef.current
    const inner = bookInnerRef.current
    if (!outer || !inner) return

    function recalc() {
      const outerWidth = outer!.clientWidth
      setScale(Math.min(1, outerWidth / 794))
      setInnerHeight(inner!.scrollHeight)
    }
    recalc()

    const ro = new ResizeObserver(recalc)
    ro.observe(outer)
    ro.observe(inner)
    window.addEventListener('resize', recalc)
    return () => { ro.disconnect(); window.removeEventListener('resize', recalc) }
  }, [loading, bookPages, activities, statsToggles, reportExtras, trackPointsByAct])

  function handleCoverUpload(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const url = e.target?.result as string
      setCoverUrl(url)
      localStorage.setItem('dtrek_diary_cover', url)
    }
    reader.readAsDataURL(file)
  }

  async function generateAndUploadPdf(download = false) {
    const key = download ? setDownloading : setPublishing
    key(true); setPublishError(null)
    try {
      const { paginateToPdf, nextLayout } = await import('@/lib/pdfPaginate')
      const { chartAllRoutes } = await import('@/utils/pdfExport')
      const mapForPdf = mapImgUrl || chartAllRoutes(activities, 660, 400) || null

      const host = document.createElement('div')
      host.style.cssText = 'position:absolute;left:-10000px;top:0;width:794px;background:#fff;z-index:-1'

      const clones: HTMLElement[] = []
      document.querySelectorAll<HTMLElement>('#diario-book .diario-page').forEach(p => {
        const clone = p.cloneNode(true) as HTMLElement
        clone.style.margin = '0'
        clone.style.boxShadow = 'none'
        // Remove OSM tile canvases (cross-origin tainted); the global all-routes map
        // gets replaced with a fresh <img> raster, per-report route maps are screen-only
        // (no per-route raster generated) so they're simply dropped from the PDF.
        clone.querySelectorAll('canvas').forEach(c => c.remove())
        const globalMapWrapper = clone.querySelector<HTMLElement>('.diario-global-map')
        if (globalMapWrapper) {
          globalMapWrapper.innerHTML = ''
          globalMapWrapper.style.height = 'auto'
          if (mapForPdf) {
            const img = document.createElement('img')
            img.src = mapForPdf
            img.style.cssText = 'width:100%;border-radius:12px;display:block'
            globalMapWrapper.appendChild(img)
          }
        }
        clone.querySelectorAll<HTMLElement>('.diario-report-map').forEach(el => el.remove())
        clone.querySelectorAll<HTMLElement>('img[alt="Mappa percorsi"]').forEach(i => {
          i.style.display = 'none'
        })
        host.appendChild(clone)
        clones.push(clone)
      })

      document.body.appendChild(host)
      await nextLayout()

      let blob: Blob
      try {
        blob = await paginateToPdf(clones, '.pdf-block', { diaryTitle, authorName: diaryAuthor })
      } finally {
        document.body.removeChild(host)
      }

      if (download) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'diario-dtrek.pdf'
        a.click(); URL.revokeObjectURL(url)
      } else {
        const { getBrowserSupabase } = await import('@/lib/supabaseBrowser')
        const sb = getBrowserSupabase()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) throw new Error('Non autenticato')
        const { uploadDiaryPdf } = await import('@/lib/pdfUpload')
        const pdfUrl = await uploadDiaryPdf(user.id, blob)
        const patchRes = await fetch('/api/diary-token', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ diaryPdfUrl: pdfUrl }),
        })
        const patchData = await patchRes.json() as { diary_token?: string }
        setDiaryPdfUrl(pdfUrl)
        if (patchData.diary_token) setDiaryToken(patchData.diary_token)
      }
    } catch (e) {
      if (!download) setPublishError(String(e))
    } finally {
      key(false)
    }
  }

  const showStats = Object.values(statsToggles).some(Boolean)

  const coverDateRange = useMemo(() => {
    if (!activities.length) return undefined
    const first = format(new Date(activities[0].startTime), 'MMMM yyyy', { locale: it })
    const last  = format(new Date(activities[activities.length - 1].startTime), 'MMMM yyyy', { locale: it })
    return first === last ? first : `${first} – ${last}`
  }, [activities])

  return (
    <div className="min-h-screen bg-stone-100 pb-24 md:pb-0">
      <Navbar />

      {/* Toolbar */}
      <div className="sticky top-14 z-30 bg-white border-b border-stone-200 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 mr-auto">
            <BookMarked className="w-4 h-4 text-forest-600" />
            <span className="font-barlow font-bold text-stone-700 uppercase tracking-wide text-sm">Diario</span>
            {!loading && (
              <span className="text-xs text-stone-400 font-lora italic">
                {reports.length} resoconti
                {bookPages.filter(p => p.kind === 'stub').length > 0 &&
                  ` · ${bookPages.filter(p => p.kind === 'stub').length} da narrare`}
              </span>
            )}
          </div>

          {/* Cover upload */}
          <button onClick={() => coverInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-barlow font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
            <ImageIcon className="w-3.5 h-3.5" /> Foto
          </button>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { handleCoverUpload(f); e.target.value = '' } }} />

          {/* Cover text editor */}
          <div className="relative">
            <button onClick={() => setShowTextMenu(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-barlow font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Testi <ChevronDown className="w-3 h-3" />
            </button>
            {showTextMenu && (
              <div className="absolute left-0 top-9 w-72 bg-white rounded-xl border border-stone-200 shadow-lg z-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400">Testi copertina</p>
                  <button onClick={() => setShowTextMenu(false)} className="text-stone-400 hover:text-stone-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-0.5">Titolo</label>
                <input
                  value={diaryTitle}
                  onChange={e => { setDiaryTitle(e.target.value); try { localStorage.setItem('dtrek_diary_title', e.target.value) } catch {} }}
                  className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-forest-400"
                  placeholder="DIARIO di VIAGGIO"
                />
                <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-0.5">Sottotitolo</label>
                <input
                  value={diarySubtitle}
                  onChange={e => { setDiarySubtitle(e.target.value); try { localStorage.setItem('dtrek_diary_subtitle', e.target.value) } catch {} }}
                  className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-forest-400"
                  placeholder="I miei percorsi"
                />
                <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-0.5">Autore</label>
                <input
                  value={diaryAuthor}
                  onChange={e => { setDiaryAuthor(e.target.value); try { localStorage.setItem('dtrek_diary_author', e.target.value) } catch {} }}
                  className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-forest-400"
                  placeholder="Nome Cognome"
                />
              </div>
            )}
          </div>

          {/* Stats toggle */}
          <div className="relative">
            <button onClick={() => setShowStatsMenu(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-barlow font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
              <BarChart2 className="w-3.5 h-3.5" /> Statistiche <ChevronDown className="w-3 h-3" />
            </button>
            {showStatsMenu && (
              <div className="absolute right-0 top-9 w-48 bg-white rounded-xl border border-stone-200 shadow-lg z-50 py-1">
                <button className="absolute top-2 right-2 text-stone-400 hover:text-stone-600" onClick={() => setShowStatsMenu(false)}>
                  <X className="w-3.5 h-3.5" />
                </button>
                <p className="px-3 pt-2 pb-1 text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400">Sezioni</p>
                {([
                  ['totali', 'Totali'],
                  ['record', 'Record personali'],
                  ['medie', 'Medie'],
                  ['andamento', 'Andamento'],
                ] as [keyof StatsToggles, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => toggleStat(k)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs font-bold ${statsToggles[k] ? 'bg-forest-600 border-forest-600 text-white' : 'border-stone-300'}`}>
                      {statsToggles[k] ? '✓' : ''}
                    </span>
                    {l}
                  </button>
                ))}
                <p className="px-3 pt-2 pb-1 text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 border-t border-stone-100 mt-1">Per ogni percorso</p>
                {([
                  ['mappa', 'Mappa percorso'],
                  ['statistiche', 'Statistiche dettagliate'],
                  ['grafico', 'Grafico altimetria'],
                  ['cuore', 'Frequenza cardiaca'],
                  ['velocita', 'Velocità'],
                ] as [keyof ReportExtras, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => toggleReportExtra(k)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs font-bold ${reportExtras[k] ? 'bg-forest-600 border-forest-600 text-white' : 'border-stone-300'}`}>
                      {reportExtras[k] ? '✓' : ''}
                    </span>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Download PDF */}
          <button onClick={() => generateAndUploadPdf(true)} disabled={downloading || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-barlow font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 disabled:opacity-50 transition-colors">
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            Scarica PDF
          </button>

          {/* Publish */}
          {diaryPdfUrl ? (
            <div className="flex items-center gap-1.5">
              {diaryToken && (
                <a href={`/leggi/d/${diaryToken}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-barlow font-bold uppercase tracking-wide transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> Apri lettore
                </a>
              )}
              <button onClick={async () => {
                const url = diaryToken
                  ? `${window.location.origin}/leggi/d/${diaryToken}`
                  : diaryPdfUrl
                await navigator.clipboard.writeText(url)
                setCopyOk(true); setTimeout(() => setCopyOk(false), 2000)
              }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
              </button>
              <button onClick={async () => { await fetch('/api/diary-token', { method: 'DELETE' }); setDiaryPdfUrl(null); setDiaryToken(null) }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-red-200 text-red-400 text-xs hover:bg-red-50 transition-colors">
                <Link2Off className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              {publishError && <span className="text-xs text-red-500">{publishError}</span>}
              <button onClick={() => generateAndUploadPdf(false)} disabled={publishing || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 disabled:opacity-50 transition-colors">
                {publishing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pubblicazione…</> : <><Share2 className="w-3.5 h-3.5" /> Pubblica online</>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="font-lora italic">Caricamento diario…</span>
        </div>
      )}

      {/* Book — scaled to fit the viewport width, like a responsive PDF viewer */}
      {!loading && (
        <div ref={bookOuterRef} className="bg-stone-200 min-h-screen overflow-hidden">
          <div style={{ height: innerHeight ? innerHeight * scale + 48 : undefined, position: 'relative' }}>
            <div
              ref={bookInnerRef}
              id="diario-book"
              className="py-6"
              style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top center', position: 'absolute', top: 0, left: '50%', marginLeft: -397 }}
            >
              <DiarioCover
                coverUrl={coverUrl} diaryTitle={diaryTitle} diarySubtitle={diarySubtitle} diaryAuthor={diaryAuthor}
                dateRange={coverDateRange} totalActivities={activities.length} totalKm={computeGlobalStats(activities).totalDistanceKm}
              />
              <AnniversaryBanner activities={activities} />
              {bookPages.length > 0 && <DiarioIndice pages={bookPages} />}
              {activities.length > 0 && <DiarioMappa activities={activities} mapImgUrl={mapImgUrl} />}
              {activities.length > 0 && showStats && (
                <DiarioStatistiche activities={activities} toggles={statsToggles} />
              )}
              {bookPages.map((page, i) => {
                const year = new Date(page.startTime).getFullYear()
                const prevYear = i > 0 ? new Date(bookPages[i - 1].startTime).getFullYear() : null
                const showDivider = year !== prevYear
                const yearPages = bookPages.filter(p => new Date(p.startTime).getFullYear() === year)
                const yearKm = yearPages.reduce((s, p) =>
                  s + (p.kind === 'stub' ? p.activity.distanceMeters : p.report.activity?.distance_meters ?? 0), 0) / 1000
                return (
                  <div key={page.kind === 'report' ? `rep-${page.report.id}` : `stub-${page.activity.id}`}>
                    {showDivider && (
                      <DiarioYearDivider year={String(year)} count={yearPages.length} totalKm={yearKm} />
                    )}
                    {page.kind === 'report' ? (
                      <DiarioReportPage
                        report={page.report}
                        photos={photosByAct[page.report.activity_id] ?? []}
                        meta={activities.find(a => a.id === page.report.activity_id)}
                        extras={reportExtras}
                        trackPoints={trackPointsByAct[page.report.activity_id]}
                      />
                    ) : (
                      <DiarioStubPage activity={page.activity} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
