'use client'

import { ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  Route, Mountain, Clock, Flame, Trophy, TrendingUp, NotebookPen, Lock, LockOpen, Eye, EyeOff,
  Leaf, PawPrint,
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

function PageHeader({ label, title }: { label: string; title: string }) {
  return (
    <>
      <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 4, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 8px' }}>
        {label}
      </p>
      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 32, fontWeight: 700, color: '#193b20', margin: '0 0 40px', letterSpacing: -0.5 }}>
        {title}
      </h2>
    </>
  )
}

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

/**
 * Output canvas height for a fixed-`outW` route map, derived from the
 * route's own aspect ratio (clamped) instead of a one-size-fits-all
 * landscape box — keeps drawLetterboxed's white margins minimal so the map
 * fills the page width like the rest of the layout, without touching its
 * zoom/crop selection.
 */
function mapOutH(aspect: number, outW = 660): number {
  const clamped = Math.min(3.2, Math.max(0.9, aspect))
  return Math.round(outW / clamped)
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
function ProgressChart({ series, photoMarkers, accent, unit, decimals = 0 }: {
  series: { progress: number; value: number }[]
  photoMarkers?: { progress: number; url: string }[]
  accent: AccentTheme
  unit: string
  decimals?: number
}) {
  // clipPath ids must be unique across the whole document — many ProgressChart instances
  // (one per report, possibly several per report) render simultaneously in the Diario book,
  // and duplicate ids made the browser pick the wrong clipPath for later charts.
  const uid = useId()
  if (series.length < 2) return null
  const values = series.map(s => s.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 660, H = 110, pad = 4
  const topPad = photoMarkers?.length ? 30 : 0
  const chartH = H - topPad
  const pts = series.map(({ progress, value }) => {
    const x = pad + progress * (W - pad * 2)
    const y = topPad + chartH - pad - ((value - min) / range) * (chartH - pad * 2)
    return [x, y]
  })
  const linePath = `M ${pts.map(p => p.join(',')).join(' L ')}`
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${topPad + chartH} L ${pts[0][0]},${topPad + chartH} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <defs>
        {photoMarkers?.map((m, i) => (
          <clipPath key={i} id={`photo-clip-${uid}-${i}`}>
            <circle cx={pad + Math.min(Math.max(m.progress, 0), 1) * (W - pad * 2)} cy={14} r={13} />
          </clipPath>
        ))}
      </defs>
      <path d={areaPath} fill={accent.iconColor} opacity={0.12} />
      <path d={linePath} fill="none" stroke={accent.iconColor} strokeWidth={1.6} />
      {photoMarkers?.map((m, i) => {
        const x = pad + Math.min(Math.max(m.progress, 0), 1) * (W - pad * 2)
        return (
          <g key={i}>
            <line x1={x} y1={28} x2={x} y2={topPad + chartH} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2,2" opacity={0.7} />
            <image href={m.url} x={x - 13} y={1} width={26} height={26} clipPath={`url(#photo-clip-${uid}-${i})`} preserveAspectRatio="xMidYMid slice" />
            <circle cx={x} cy={14} r={13} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
            <circle cx={x + 9} cy={5} r={5.5} fill="#f59e0b" stroke="white" strokeWidth={1} />
            <text x={x + 9} y={7.3} textAnchor="middle" fontSize={6} fill="white" fontFamily="Arial" fontWeight="bold">{i + 1}</text>
          </g>
        )
      })}
      <text x={pad} y={H - 2} fontSize={8} fill="#9ca3af" fontFamily="Arial">{min.toFixed(decimals)}{unit}</text>
      <text x={W - pad} y={topPad + 6} textAnchor="end" fontSize={8} fill="#9ca3af" fontFamily="Arial">{max.toFixed(decimals)}{unit}</text>
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
  coverUrl, diaryTitle, diarySubtitle, diaryAuthor, dateRange, totalActivities, totalKm, totalElevationGain,
}: {
  coverUrl: string | null; diaryTitle: string; diarySubtitle: string; diaryAuthor: string
  dateRange?: string; totalActivities?: number; totalKm?: number; totalElevationGain?: number
}) {
  const stats: { value: string; label: string }[] = []
  if (totalActivities)     stats.push({ value: String(totalActivities), label: 'Escursioni' })
  if (totalKm)              stats.push({ value: totalKm.toFixed(0), label: 'Km percorsi' })
  if (totalElevationGain)   stats.push({ value: Math.round(totalElevationGain).toLocaleString('it'), label: 'M dislivello' })

  return (
    <div className="diario-page" style={{
      width: 794, height: 1123,
      position: 'relative', overflow: 'hidden', margin: '24px auto',
      boxShadow: '0 8px 56px rgba(0,0,0,0.28)',
      background: coverUrl ? undefined : 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)',
    }}>
      {/* Full-bleed background photo, when the user has set one */}
      {coverUrl && (
        <img src={coverUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}

      {/* Topographic texture + mountain silhouette — only on the illustrated (no-photo) cover */}
      {!coverUrl && (
        <>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.045 }} viewBox="0 0 794 1123" preserveAspectRatio="xMidYMid slice">
            <path d="M0,900 Q200,820 400,840 Q600,860 794,780 L794,1123 L0,1123 Z" fill="white" opacity="0.6" />
            <path d="M0,780 Q180,700 380,720 Q580,740 794,665" stroke="white" strokeWidth="0.8" fill="none" />
            <path d="M0,660 Q200,590 400,610 Q600,630 794,555" stroke="white" strokeWidth="0.8" fill="none" />
            <path d="M0,545 Q220,480 400,500 Q600,520 794,445" stroke="white" strokeWidth="0.7" fill="none" />
            <path d="M0,430 Q200,372 400,392 Q600,412 794,340" stroke="white" strokeWidth="0.6" fill="none" />
            <path d="M0,315 Q200,265 400,285 Q600,305 794,235" stroke="white" strokeWidth="0.5" fill="none" />
          </svg>
          <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', opacity: 0.08 }} viewBox="0 0 794 320" preserveAspectRatio="none">
            <path d="M0,320 L70,215 L130,255 L225,125 L305,178 L385,58 L450,125 L520,72 L595,128 L660,82 L730,118 L794,88 L794,320 Z" fill="white" />
          </svg>
          <div style={{ position: 'absolute', top: 100, right: 40, fontFamily: 'Playfair Display, serif', fontSize: 220, fontWeight: 900, color: 'rgba(255,255,255,0.025)', lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>II</div>
        </>
      )}

      {/* Dark overlay — only needed for legibility over a photo */}
      {coverUrl && (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(8,24,14,0.68) 0%, rgba(8,24,14,0.48) 60%, rgba(8,24,14,0.55) 100%)' }} />
      )}

      {/* Terra top stripe */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#e08d3c' }} />

      {/* Brand header */}
      <div style={{ position: 'absolute', top: 38, left: 64, right: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 15, fontWeight: 900, letterSpacing: 7, color: '#e08d3c', textTransform: 'uppercase' }}>DTrek</span>
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Diario di Escursioni</span>
      </div>

      {/* Title block */}
      <div style={{ position: 'absolute', top: 270, left: 64, right: 100 }}>
        {dateRange && (
          <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: 6, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 22px' }}>
            {dateRange}
          </p>
        )}
        <h1 style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 64,
          fontWeight: 700,
          color: 'white',
          lineHeight: 1.05,
          letterSpacing: -1,
          margin: '0 0 30px',
        }}>
          {diaryTitle}
        </h1>
        <div style={{ width: 80, height: 2, background: '#e08d3c', margin: '0 0 30px' }} />
        {diarySubtitle && (
          <p style={{ fontFamily: 'Lora, serif', fontSize: 16, fontStyle: 'italic', color: 'rgba(255,255,255,0.58)', letterSpacing: 0.5, margin: '0 0 42px' }}>
            {diarySubtitle}
          </p>
        )}

        {/* Stats trio */}
        {stats.length > 0 && (
          <div style={{ display: 'flex', gap: 0, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 28 }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{
                flex: 1,
                padding: i === 0 ? '0 28px 0 0' : i === stats.length - 1 ? '0 0 0 28px' : '0 28px',
                borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.08)' : undefined,
              }}>
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 30, fontWeight: 500, color: 'white', margin: 0, lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, letterSpacing: 3, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', margin: '7px 0 0' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Author */}
      <div style={{ position: 'absolute', bottom: 52, left: 64, right: 64, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {diaryAuthor && (
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, letterSpacing: 5, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', margin: 0 }}>
            {diaryAuthor}
          </p>
        )}
        <p style={{ fontFamily: 'Lora, serif', fontSize: 10, fontStyle: 'italic', color: 'rgba(255,255,255,0.2)', margin: 0 }}>
          Stampato con DTrek
        </p>
      </div>

      {/* Terra bottom stripe */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#e08d3c 0%,#d97220 55%,transparent 100%)' }} />
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
      padding: '72px 64px', boxShadow: '0 8px 56px rgba(0,0,0,0.28)',
    }}>
      <PageHeader label="Indice" title="Le escursioni" />
      <div style={{ borderTop: '1px solid #eeece5' }}>
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
                <p style={{ fontSize: 11, color: '#e08d3c', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, letterSpacing: 4, margin: i === 0 ? '0 0 4px' : '24px 0 4px' }}>
                  {year}
                </p>
              )}
              <div className="pdf-block" style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                padding: '14px 0', borderBottom: '1px solid #eeece5',
              }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: '#a9a18e', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, minWidth: 24 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: isStub ? '#a9a18e' : '#193b20', letterSpacing: -0.2 }}>
                      {title} {isStub && <span style={{ fontSize: 9, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>· da narrare</span>}
                    </div>
                    {dateStr && (
                      <div style={{ fontSize: 10, color: '#a9a18e', fontFamily: 'Lora, serif', fontStyle: 'italic', marginTop: 2 }}>{dateStr}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#73695c', fontFamily: 'DM Sans, sans-serif', flexShrink: 0, marginLeft: 16 }}>
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
    <div className="diario-page diario-stub-page" style={{
      width: 794, minHeight: 1123, background: '#fafaf9', margin: '24px auto',
      boxShadow: '0 4px 32px rgba(0,0,0,0.14)', border: '2px dashed #d6d3d1', position: 'relative', overflow: 'hidden',
    }}>
      <span style={{
        position: 'absolute', top: 40, right: -50, transform: 'rotate(35deg)',
        fontSize: 13, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, letterSpacing: 4,
        color: 'rgba(115,105,92,0.18)', textTransform: 'uppercase', width: 240, textAlign: 'center',
      }}>
        Da narrare
      </span>

      <div style={{ padding: '32px 32px 0' }}>
        <p style={{ fontSize: 9, color: '#a9a18e', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', margin: '0 0 4px' }}>
          {dateStr}
        </p>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 26, fontWeight: 700, color: '#4d4740', margin: '0 0 20px' }}>
          {activity.title ?? 'Escursione'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ background: 'white', border: '1px solid #dcd8cc', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a9a18e', fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>Distanza</div>
            <div style={{ fontSize: 18, fontFamily: 'JetBrains Mono, monospace', color: '#4d4740' }}>{(activity.distanceMeters / 1000).toFixed(2)} km</div>
          </div>
          <div style={{ background: 'white', border: '1px solid #dcd8cc', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a9a18e', fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>Dislivello</div>
            <div style={{ fontSize: 18, fontFamily: 'JetBrains Mono, monospace', color: '#4d4740' }}>{Math.round(activity.elevationGain)} m</div>
          </div>
          <div style={{ background: 'white', border: '1px solid #dcd8cc', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a9a18e', fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>Durata</div>
            <div style={{ fontSize: 18, fontFamily: 'JetBrains Mono, monospace', color: '#4d4740' }}>{formatDuration(activity.totalTimeSeconds)}</div>
          </div>
          <div style={{ background: 'white', border: '1px solid #dcd8cc', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a9a18e', fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>Calorie</div>
            <div style={{ fontSize: 18, fontFamily: 'JetBrains Mono, monospace', color: '#4d4740' }}>{activity.calories ? `${activity.calories} kcal` : '—'}</div>
          </div>
        </div>

        {activity.routePolyline && activity.routePolyline.length > 1 && (
          <div style={{ height: 220, borderRadius: 10, overflow: 'hidden', border: '1px solid #dcd8cc', background: 'white', marginBottom: 20 }}>
            <RouteThumb polyline={activity.routePolyline} color="#a9a18e" />
          </div>
        )}
      </div>

      <div className="print:hidden" style={{ position: 'absolute', bottom: 32, left: 32, right: 32, textAlign: 'center' }}>
        <a href={`/resoconto/${encodeURIComponent(activity.id)}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: '#193b20', color: 'white',
            padding: '10px 20px', borderRadius: 10, fontFamily: 'Barlow Condensed, sans-serif', fontSize: 12, fontWeight: 700,
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
      width: 794, minHeight: 1123, background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)', margin: '24px auto',
      boxShadow: '0 8px 56px rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', position: 'relative',
    }}>
      <p style={{ fontSize: 11, color: '#e08d3c', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, letterSpacing: 6, textTransform: 'uppercase', margin: '0 0 16px' }}>
        Anno
      </p>
      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 96, fontWeight: 700, color: 'white', margin: 0, letterSpacing: -2 }}>
        {year}
      </h2>
      <div style={{ width: 80, height: 2, background: '#e08d3c', margin: '24px 0' }} />
      <div style={{ display: 'flex', gap: 24 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'DM Sans, sans-serif' }}>
          {count} {count === 1 ? 'escursione' : 'escursioni'}
        </span>
        {totalKm > 0 && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'DM Sans, sans-serif' }}>
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
          href={`/resoconto/${activity.id}`}
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

function DiarioNatura({ activities }: { activities: ActivityMeta[] }) {
  const withTrack = useMemo(
    () => activities
      .filter(a => (a.routePolyline?.length ?? 0) > 1)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 8),
    [activities],
  )
  if (withTrack.length === 0) return null
  return (
    <div className="print:hidden max-w-[794px] mx-auto mb-6">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="font-lora text-sm text-stone-700 mb-0.5">
          <Leaf className="inline w-4 h-4 -mt-0.5 mr-1 text-emerald-600" />
          Osservazioni natura
        </p>
        <p className="text-xs text-stone-400 mb-3">
          Flora e fauna della zona attraversata in queste escursioni
        </p>
        <div className="flex flex-wrap gap-2">
          {withTrack.map(a => (
            <div key={a.id} className="flex items-center gap-1 rounded-lg border border-stone-200 pl-2.5 pr-1 py-1">
              <span className="text-xs text-stone-600 truncate max-w-[140px]" title={a.title}>{a.title}</span>
              <a href={`/resoconto/${a.id}/flora`} title="Galleria Verde"
                className="flex items-center justify-center w-6 h-6 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors">
                <Leaf className="w-3.5 h-3.5" />
              </a>
              <a href={`/resoconto/${a.id}/animali`} title="Galleria Animali"
                className="flex items-center justify-center w-6 h-6 rounded-md text-amber-600 hover:bg-amber-50 transition-colors">
                <PawPrint className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DiarioMappa({ activities, mapImgUrl, mapsInteractive }: { activities: ActivityMeta[]; mapImgUrl: string | null; mapsInteractive: boolean }) {
  const routes = activities
    .filter(a => (a.routePolyline?.length ?? 0) > 1)
    .map(a => ({ id: a.id, title: a.title, startTime: a.startTime, polyline: a.routePolyline! }))

  const PALETTE = ['#166534','#0369a1','#9333ea','#c2410c','#0f766e','#b45309','#be123c','#1d4ed8']

  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'white', margin: '24px auto',
      padding: '72px 64px', boxShadow: '0 8px 56px rgba(0,0,0,0.28)',
    }}>
      <PageHeader label="Mappa" title="Tutti i percorsi" />

      {/* Screen map (Leaflet) */}
      {routes.length > 0 && (
        <div className="print:hidden diario-global-map" style={{ height: 400, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <AllRoutesMap routes={routes} height="400px" interactive={mapsInteractive} />
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
              <div style={{ width: 24, height: 3.5, background: PALETTE[i % PALETTE.length], borderRadius: 2 }} />
              <span style={{ fontSize: 9, color: '#73695c', fontFamily: 'DM Sans, sans-serif' }}>
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
      padding: '72px 64px', boxShadow: '0 8px 56px rgba(0,0,0,0.28)',
    }}>
      <PageHeader label="Statistiche" title="I tuoi numeri" />

      {narrative && (
        <p className="pdf-block" style={{
          fontFamily: 'Lora, serif', fontSize: 13, lineHeight: 1.8, color: '#4d4740',
          margin: '-20px 0 32px', fontStyle: 'italic',
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

/** Extracts `[curiosita]…[/curiosita]` blocks out of a section body so they can be
 * rendered as a pull quote / storytelling box instead of inline plain text. */
function extractCuriosita(body: string): { clean: string; quotes: string[] } {
  const quotes: string[] = []
  const clean = body.replace(/\[curiosita\]([\s\S]*?)\[\/curiosita\]/g, (_, inner) => { quotes.push(inner.trim()); return '' }).trim()
  return { clean, quotes }
}

function DiarioReportPage({ report, photos, meta, extras, trackPoints, mapsInteractive, escNumber }: {
  report: DiaryReport; photos: RoutePhoto[]; meta?: ActivityMeta; extras: ReportExtras
  trackPoints?: TrackPoint[]; mapsInteractive: boolean; escNumber: number
}) {
  const act = report.activity
  const sections = useMemo(() => parseSections(report.content).map(s => {
    const { clean, quotes } = extractCuriosita(s.body)
    return { title: s.title, body: clean, quotes }
  }), [report.content])
  const allQuotes  = useMemo(() => sections.flatMap(s => s.quotes), [sections])
  const pullQuote  = allQuotes[0]
  const storyBoxes = allQuotes.slice(1, 3)

  const escLabel = String(escNumber).padStart(2, '0')
  const dateStr  = act?.start_time
    ? format(new Date(act.start_time), 'd MMMM yyyy', { locale: it })
    : report.created_at ? format(new Date(report.created_at), 'd MMMM yyyy', { locale: it }) : ''
  const monthYear = act?.start_time ? format(new Date(act.start_time), 'MMMM yyyy', { locale: it }) : ''
  const heroPhoto = photos[0] ?? null
  const detailPhoto = photos[1] ?? null
  const weather = act?.weather_at_hike
  const weatherInfo = weather ? wmoInfo(weather.weathercode) : null
  const showMappa       = extras.mappa       && (meta?.routePolyline?.length ?? 0) > 1
  const showStatistiche = extras.statistiche && !!meta

  const tp = trackPoints ?? []
  const progress = useMemo(() => tp.length > 1 ? trackPointsProgress(tp) : [], [tp])
  const photoMarkers = useMemo(() => photos
    .filter(p => typeof p.progress === 'number')
    .map(p => ({ progress: p.progress, url: p.url })), [photos])

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

  const introSection = sections[0]
  const restSections = sections.slice(1)
  const STORY_ACCENTS = [
    { bg: '#fdf6ee', border: '#e08d3c', label: '#c05a17', text: '#6a2e18' },
    { bg: '#f1f8f2', border: '#378d44', label: '#277134', text: '#193b20' },
  ]

  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'white', margin: '24px auto',
      boxShadow: '0 8px 56px rgba(0,0,0,0.28)', overflow: 'hidden',
    }}>
      {/* Full-bleed hero */}
      <div style={{ height: 420, position: 'relative', overflow: 'hidden', background: heroPhoto ? undefined : 'linear-gradient(170deg,#0f2e1a 0%,#1b4332 30%,#193b20 62%,#0d1f12 100%)' }}>
        {heroPhoto && (
          <img src={heroPhoto.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {!heroPhoto && (
          <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', opacity: 0.1 }} viewBox="0 0 794 260" preserveAspectRatio="none">
            <path d="M0,260 L55,190 L115,225 L195,128 L278,172 L358,65 L418,118 L490,60 L558,108 L630,68 L704,105 L794,78 L794,260 Z" fill="white" />
          </svg>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 40%, transparent 25%, rgba(0,0,0,0.35) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, transparent 35%, rgba(0,0,0,0.72) 100%)' }} />

        <div style={{ position: 'absolute', top: 32, left: 48, right: 48 }}>
          <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: 5, color: '#e08d3c', textTransform: 'uppercase' }}>
            Escursione #{escLabel}{monthYear ? ` · ${monthYear}` : ''}
          </span>
        </div>

        <div style={{ position: 'absolute', bottom: 32, left: 48, right: 48 }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 48, fontWeight: 700, color: 'white', lineHeight: 1.02, letterSpacing: -1, margin: '0 0 18px' }}>
            {report.title || act?.title || 'Escursione'}
          </h1>
          <div style={{ width: 56, height: 2, background: '#e08d3c' }} />
        </div>
      </div>

      {/* Stat strip — dark forest */}
      {act && (
        <div style={{ background: '#193b20', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: '▸ Distanza', value: act.distance_meters > 0 ? `${(act.distance_meters / 1000).toFixed(1)}` : '—', sub: 'km' },
            { label: '▲ Dislivello', value: act.elevation_gain > 0 ? `${Math.round(act.elevation_gain)}` : '—', sub: 'm D+' },
            { label: '◷ Durata', value: act.total_time_seconds > 0 ? formatDuration(act.total_time_seconds) : '—', sub: 'in movimento' },
            weatherInfo && weather
              ? { label: '◆ Meteo', value: `${Math.round(weather.temperature)}°C`, sub: weatherInfo.label }
              : { label: '◆ Calorie', value: meta?.calories ? `${meta.calories}` : '—', sub: 'kcal' },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: '22px 28px', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.07)' : undefined }}>
              <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 7px' }}>{s.label}</p>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 26, fontWeight: 500, color: 'white', margin: 0, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.38)', margin: '5px 0 0' }}>{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Date bar */}
      {dateStr && (
        <div style={{ background: '#f8f7f4', padding: '12px 48px', borderTop: '1px solid #dcd8cc' }}>
          <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#8a7f6e', textTransform: 'uppercase', margin: 0 }}>
            {dateStr}
          </p>
        </div>
      )}

      <div style={{ padding: '48px 48px 40px' }}>
        <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 4, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 36px' }}>
          Cronaca · Escursione #{escLabel}
        </p>

        {/* Scheda editoriale + intro */}
        <div className="pdf-block" style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 36, marginBottom: 40 }}>
          <div>
            <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 8, fontWeight: 900, letterSpacing: 3, color: '#a9a18e', textTransform: 'uppercase', margin: '0 0 14px', paddingBottom: 9, borderBottom: '1.5px solid #e08d3c' }}>
              Scheda
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <SchedaField label="Escursione" value={`#${escLabel}`} />
              {dateStr && <SchedaField label="Periodo" value={dateStr} />}
              {!!meta?.altitudeMax && <SchedaField label="Quota massima" value={`${Math.round(meta.altitudeMax)} m`} />}
              {weatherInfo && weather && <SchedaField label="Meteo" value={`${weatherInfo.emoji} ${weatherInfo.label} · ${Math.round(weather.temperature)}°C`} />}
            </div>
          </div>

          <div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 32, fontWeight: 700, color: '#193b20', lineHeight: 1.12, margin: '0 0 24px', letterSpacing: -0.5 }}>
              {report.title || act?.title || 'Escursione'}
            </h2>
            {introSection && introSection.body.split(/\n\n+/).slice(0, 3).map((p, j) => {
              const text = p.trim()
              const dropCap = j === 0 && text.length > 0
              return (
                <p key={j} style={{ fontFamily: 'Lora, serif', fontSize: 13.5, lineHeight: 1.85, color: '#4d4740', margin: '0 0 16px' }}>
                  {dropCap ? (
                    <>
                      <span style={{ float: 'left', fontSize: 52, lineHeight: 0.8, fontWeight: 700, color: '#e08d3c', padding: '4px 7px 0 0', fontFamily: 'Playfair Display, serif' }}>
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

        {/* Pull quote */}
        {pullQuote && (
          <div className="pdf-block" style={{ margin: '0 -8px 40px', padding: '32px 40px', borderTop: '2px solid #193b20', borderBottom: '2px solid #193b20', position: 'relative' }}>
            <span style={{ position: 'absolute', top: -26, left: 36, fontFamily: 'Playfair Display, serif', fontSize: 70, lineHeight: 1, color: '#193b20', opacity: 0.12, userSelect: 'none' }}>&ldquo;</span>
            <p style={{ fontFamily: 'Playfair Display, serif', fontSize: 19, fontStyle: 'italic', lineHeight: 1.55, color: '#193b20', margin: 0 }}>
              {pullQuote}
            </p>
          </div>
        )}

        {/* Detail photo alongside remaining sections */}
        <div className="pdf-block" style={{ display: 'grid', gridTemplateColumns: detailPhoto ? '1fr 164px' : '1fr', gap: 32, marginBottom: 32 }}>
          <div>
            {restSections.map((section, i) => (
              <div key={i} style={{ marginBottom: 22 }}>
                <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, fontWeight: 900, letterSpacing: 3, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 8px' }}>
                  {section.title}
                </p>
                {section.body.split(/\n\n+/).slice(0, 3).map((p, j) => (
                  <p key={j} style={{ fontFamily: 'Lora, serif', fontSize: 13.5, lineHeight: 1.85, color: '#4d4740', margin: '0 0 14px' }}>{p.trim()}</p>
                ))}
              </div>
            ))}
          </div>
          {detailPhoto && (
            <div>
              <div style={{ width: 164, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                <img src={detailPhoto.url} alt={detailPhoto.caption} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 55%)' }} />
                {detailPhoto.caption && (
                  <p style={{ position: 'absolute', bottom: 10, left: 10, right: 10, fontFamily: 'Lora, serif', fontSize: 9, fontStyle: 'italic', color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.4 }}>
                    {detailPhoto.caption}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Storytelling boxes */}
        {storyBoxes.length > 0 && (
          <div className="pdf-block" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 36 }}>
            {storyBoxes.map((q, i) => {
              const acc = STORY_ACCENTS[i % STORY_ACCENTS.length]
              return (
                <div key={i} style={{ background: acc.bg, borderLeft: `3px solid ${acc.border}`, borderRadius: '0 6px 6px 0', padding: '18px 22px' }}>
                  <p style={{ fontFamily: 'Lora, serif', fontSize: 13, fontStyle: 'italic', lineHeight: 1.75, color: acc.text, margin: 0 }}>{q}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Dati & percorso */}
        {(showMappa || showStatistiche || showGrafico || showCuore || showVelocita) && (
          <div className="pdf-block" style={{ marginBottom: 32 }}>
            {showStatistiche && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                <StatCard value={`${(meta!.distanceMeters / 1000).toFixed(1)} km`} label="Distanza" icon={<Route style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
                <StatCard value={`${Math.round(meta!.elevationGain)} m`} label="Dislivello D+" icon={<Mountain style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
                <StatCard value={formatDuration(meta!.totalTimeSeconds)} label="Durata" icon={<Clock style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
                <StatCard value={meta!.calories ? `${meta!.calories}` : '—'} label="Calorie (kcal)" icon={<Flame style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
              </div>
            )}
            {showGrafico && (
              <div style={{ marginBottom: (showCuore || showVelocita) ? 16 : 0 }}>
                <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 9, color: '#a9a18e', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                  Profilo altimetrico {photoMarkers.length > 0 && '· con posizione foto'}
                </p>
                <div style={{ background: GREEN.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${GREEN.border}` }}>
                  <ProgressChart series={altitudeSeries} photoMarkers={photoMarkers} accent={GREEN} unit=" m" />
                </div>
              </div>
            )}
            {(showCuore || showVelocita) && (
              <div style={{ display: 'flex', gap: 16, marginBottom: showMappa ? 24 : 0 }}>
                {showCuore && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 9, color: '#a9a18e', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                      Frequenza cardiaca
                    </p>
                    <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 12px', border: '1px solid #fecaca' }}>
                      <ProgressChart series={hrSeries} accent={{ bg: '#fef2f2', border: '#fecaca', text: '#991b1b', iconBg: '#fee2e2', iconColor: '#dc2626' }} unit=" bpm" />
                    </div>
                  </div>
                )}
                {showVelocita && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 9, color: '#a9a18e', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                      Velocità
                    </p>
                    <div style={{ background: BLUE.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${BLUE.border}` }}>
                      <ProgressChart series={speedSeries} accent={BLUE} unit=" km/h" decimals={1} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {showMappa && (
              <>
                <p style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, fontWeight: 700, color: '#193b20', margin: '0 0 12px' }}>Il percorso</p>
                <div className="print:hidden diario-report-map" data-activity-id={meta!.id} style={{ height: 260, borderRadius: 10, overflow: 'hidden', border: '1px solid #dcd8cc' }}>
                  <AllRoutesMap
                    routes={[{ id: meta!.id, title: meta!.title ?? 'Percorso', startTime: meta!.startTime, polyline: meta!.routePolyline! }]}
                    height="260px"
                    interactive={mapsInteractive}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Photo row */}
        {photos.length > 0 && (
          <div className="pdf-block" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 32 }}>
            {photos.map((ph, i) => (
              <div key={ph.id} style={{ position: 'relative' }}>
                <img src={ph.url} alt={ph.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }} />
                <span style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, background: '#e08d3c', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '20px', fontSize: 10, fontWeight: 'bold', fontFamily: 'DM Sans, sans-serif', display: 'block', boxSizing: 'border-box', border: '1px solid white' }}>{i+1}</span>
                {ph.caption && <p style={{ fontSize: 9, color: '#73695c', textAlign: 'center', marginTop: 5, fontStyle: 'italic', fontFamily: 'Lora, serif' }}>{ph.caption}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Page footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eeece5', paddingTop: 14 }}>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, letterSpacing: 3, color: '#c4bead', textTransform: 'uppercase' }}>{report.title || act?.title || 'Escursione'}</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#c4bead' }}>{escLabel}</span>
        </div>
      </div>
    </div>
  )
}

function SchedaField({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 7.5, fontWeight: 600, letterSpacing: 2, color: '#a9a18e', textTransform: 'uppercase', margin: '0 0 3px' }}>{label}</p>
        <p style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#2c2520', margin: 0 }}>{value}</p>
      </div>
      <div style={{ height: 1, background: '#eeece5' }} />
    </>
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
  const [mapsInteractive, setMapsInteractive] = useState(false)
  const [showStubs, setShowStubs] = useState(true)
  const [statsToggles, setStatsToggles] = useState<StatsToggles>(() => {
    try { return JSON.parse(localStorage.getItem('dtrek_diary_stats') ?? '') }
    catch { return { totali: true, record: true, medie: true, andamento: true } }
  })
  const [reportExtras, setReportExtras] = useState<ReportExtras>(() => {
    const defaults: ReportExtras = { mappa: true, statistiche: true, grafico: true, cuore: true, velocita: true }
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

      // Core data (activities/reports/pages) is ready — show the book now
      // rather than waiting for every report's photos and full trackpoints to
      // load too. Those are fetched below in the background and populate the
      // charts/photos progressively as they arrive, instead of blocking the
      // initial render (which used to make opening the diary feel very slow
      // once there were many reports).
      setLoading(false)

      // Load photos for each activity from the server (migra automaticamente da localStorage se serve)
      Promise.all(sortedReps.map(async (rep: DiaryReport): Promise<readonly [string, RoutePhoto[]]> => {
        try {
          return [rep.activity_id, await fetchActivityPhotos(rep.activity_id)]
        } catch {
          return [rep.activity_id, []]
        }
      })).then(photoEntries => {
        const byAct: Record<string, RoutePhoto[]> = {}
        photoEntries.forEach(([activityId, photos]) => { if (photos.length) byAct[activityId] = photos })
        setPhotosByAct(byAct)
      })

      // Load full trackPoints per reported activity for the elevation/HR/speed charts
      Promise.all(sortedReps.map(async (rep: DiaryReport): Promise<readonly [string, TrackPoint[]]> => {
        try {
          const full = await getActivityById(rep.activity_id)
          return [rep.activity_id, full?.trackPoints ?? []]
        } catch {
          return [rep.activity_id, []]
        }
      })).then(trackPointEntries => {
        const tpByAct: Record<string, TrackPoint[]> = {}
        trackPointEntries.forEach(([activityId, tps]) => { if (tps.length) tpByAct[activityId] = tps })
        setTrackPointsByAct(tpByAct)
      })

      // Pre-generate a tiled raster map for native browser printing (Ctrl+P) —
      // our own PDF export path fetches a fresh one instead, ignoring this.
      import('@/utils/pdfExport').then(({ fetchAllRoutesSatMap, mapBoxAspect }) => {
        const allPts = sortedActs.filter(a => (a.routePolyline?.length ?? 0) > 1).flatMap(a => a.routePolyline!)
        return fetchAllRoutesSatMap(sortedActs, 660, mapOutH(mapBoxAspect(allPts, 0.12)))
      }).then(img => { if (img) setMapImgUrl(img) })
    }).catch(() => setLoading(false))
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
  }, [loading, bookPages, showStubs, activities, statsToggles, reportExtras, trackPointsByAct])

  const visibleBookPages = useMemo(
    () => showStubs ? bookPages : bookPages.filter(p => p.kind !== 'stub'),
    [bookPages, showStubs]
  )

  const reportNumbers = useMemo(() => {
    const m = new Map<string, number>()
    let n = 0
    visibleBookPages.forEach(p => { if (p.kind === 'report') { n++; m.set(p.report.id, n) } })
    return m
  }, [visibleBookPages])

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
      const { fetchAllRoutesSatMap, fetchSatMap, mapBoxAspect } = await import('@/utils/pdfExport')
      const allPts = activities.filter(a => (a.routePolyline?.length ?? 0) > 1).flatMap(a => a.routePolyline!)
      const mapForPdf = mapImgUrl || await fetchAllRoutesSatMap(activities, 660, mapOutH(mapBoxAspect(allPts, 0.12))) || null

      const actById = new Map(activities.map(a => [a.id, a]))
      const PALETTE = ['#166534','#0369a1','#9333ea','#c2410c','#0f766e','#b45309','#be123c','#1d4ed8']

      const host = document.createElement('div')
      host.style.cssText = 'position:absolute;left:-10000px;top:0;width:794px;background:#fff;z-index:-1'

      const clones: HTMLElement[] = []
      const reportPages = Array.from(
        document.querySelectorAll<HTMLElement>('#diario-book .diario-page')
      ).filter(p => !p.classList.contains('diario-stub-page'))

      // Clone all pages first (cheap, synchronous) and collect the per-report
      // map fetches needed, without awaiting them yet — they're fired off
      // together below with limited concurrency instead of one-at-a-time,
      // which is what made publishing scale linearly (and badly) with the
      // number of reports.
      const mapTasks: { el: HTMLElement; pts: [number, number][]; color: string }[] = []

      for (const p of reportPages) {
        const clone = p.cloneNode(true) as HTMLElement
        clone.style.margin = '0'
        clone.style.boxShadow = 'none'
        // Remove OSM tile canvases (cross-origin tainted by live Leaflet tiles);
        // both the global and per-report maps get replaced with fresh rasterized
        // tile images fetched directly (no canvas, no CORS taint).
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
        const reportMapEls = clone.querySelectorAll<HTMLElement>('.diario-report-map')
        for (const el of Array.from(reportMapEls)) {
          const actId = el.dataset.activityId
          const act = actId ? actById.get(actId) : undefined
          el.innerHTML = ''
          el.style.height = 'auto'
          if (act?.routePolyline && act.routePolyline.length > 1) {
            const idx = activities.indexOf(act)
            mapTasks.push({ el, pts: act.routePolyline, color: PALETTE[idx % PALETTE.length] })
          }
        }
        clone.querySelectorAll<HTMLElement>('img[alt="Mappa percorsi"]').forEach(i => {
          i.style.display = 'none'
        })
        host.appendChild(clone)
        clones.push(clone)
      }

      // Fetch report maps in parallel, capped at 5 concurrent requests so we
      // don't hammer the public OSM tile servers when there are many reports.
      const MAP_CONCURRENCY = 5
      for (let i = 0; i < mapTasks.length; i += MAP_CONCURRENCY) {
        const batch = mapTasks.slice(i, i + MAP_CONCURRENCY)
        const imgs = await Promise.all(batch.map(t => fetchSatMap(t.pts, 660, mapOutH(mapBoxAspect(t.pts, 0.18)), t.color)))
        batch.forEach((t, j) => {
          const mapImg = imgs[j]
          if (mapImg) {
            const img = document.createElement('img')
            img.src = mapImg
            img.style.cssText = 'width:100%;border-radius:10px;display:block'
            t.el.appendChild(img)
          }
        })
      }

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

          {/* Toggle map interactivity */}
          <button onClick={() => setMapsInteractive(v => !v)}
            title={mapsInteractive ? 'Blocca le mappe (evita spostamenti involontari)' : 'Sblocca le mappe per navigarle'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-barlow font-bold uppercase tracking-wide transition-colors ${
              mapsInteractive ? 'bg-forest-600 border-forest-600 text-white hover:bg-forest-700' : 'border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}>
            {mapsInteractive ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            Mappe {mapsInteractive ? 'navigabili' : 'bloccate'}
          </button>

          {/* Toggle stub (non narrate) pages visibility — they're never exported to PDF/link regardless */}
          <button onClick={() => setShowStubs(v => !v)}
            title={showStubs ? 'Nascondi i percorsi non ancora narrati' : 'Mostra i percorsi non ancora narrati'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-barlow font-bold uppercase tracking-wide transition-colors ${
              showStubs ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}>
            {showStubs ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Da narrare {showStubs ? 'visibili' : 'nascosti'}
          </button>

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
                dateRange={coverDateRange} totalActivities={activities.length}
                totalKm={computeGlobalStats(activities).totalDistanceKm}
                totalElevationGain={computeGlobalStats(activities).totalElevationGain}
              />
              <AnniversaryBanner activities={activities} />
              <DiarioNatura activities={activities} />
              {visibleBookPages.length > 0 && <DiarioIndice pages={visibleBookPages} />}
              {activities.length > 0 && <DiarioMappa activities={activities} mapImgUrl={mapImgUrl} mapsInteractive={mapsInteractive} />}
              {activities.length > 0 && showStats && (
                <DiarioStatistiche activities={activities} toggles={statsToggles} />
              )}
              {visibleBookPages.map((page, i) => {
                const year = new Date(page.startTime).getFullYear()
                const prevYear = i > 0 ? new Date(visibleBookPages[i - 1].startTime).getFullYear() : null
                const showDivider = year !== prevYear
                const yearPages = visibleBookPages.filter(p => new Date(p.startTime).getFullYear() === year)
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
                        mapsInteractive={mapsInteractive}
                        escNumber={reportNumbers.get(page.report.id) ?? 1}
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
