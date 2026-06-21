'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { fetchActivityPhotos, type RoutePhoto } from '@/lib/activityPhotos'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { formatDuration } from '@/lib/tcxParser'
import {
  BookMarked, FileDown, Share2, Copy, Link2Off, ExternalLink,
  Loader2, Image as ImageIcon, BarChart2, ChevronDown, X, Pencil,
  Route, Mountain, Clock, Flame, Trophy, TrendingUp,
} from 'lucide-react'

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
  } | null
}

interface StatsToggles {
  totali: boolean
  record:  boolean
  medie:   boolean
  andamento: boolean
}

// ── Section parser ─────────────────────────────────────────────────────────────

interface Section { title: string; body: string }
function parseSections(md: string): Section[] {
  return md.split(/\n(?=## )/)
    .map(part => {
      const nl = part.indexOf('\n')
      if (!part.startsWith('## ') || nl === -1) return null
      return { title: part.slice(3, nl).trim(), body: part.slice(nl + 1).trim() }
    })
    .filter((s): s is Section => s !== null)
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
  coverUrl, diaryTitle, diarySubtitle, diaryAuthor,
}: {
  coverUrl: string | null; diaryTitle: string; diarySubtitle: string; diaryAuthor: string
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

function DiarioIndice({ reports }: { reports: DiaryReport[] }) {
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
        {reports.map((rep, i) => {
          const act = rep.activity
          const dateStr = act?.start_time
            ? format(new Date(act.start_time), 'd MMMM yyyy', { locale: it })
            : rep.created_at ? format(new Date(rep.created_at), 'd MMMM yyyy', { locale: it }) : ''
          return (
            <div key={rep.id} className="pdf-block" style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              padding: '14px 0', borderBottom: '1px solid #f3f4f6',
            }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'Arial, sans-serif', fontWeight: 700, minWidth: 24 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontFamily: 'Arial Black, sans-serif', fontWeight: 900, color: '#1f2937', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {rep.title || act?.title || 'Escursione'}
                  </div>
                  {dateStr && (
                    <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'Georgia, serif', fontStyle: 'italic', marginTop: 2 }}>{dateStr}</div>
                  )}
                </div>
              </div>
              {act && (
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#6b7280', fontFamily: 'Arial, sans-serif', flexShrink: 0, marginLeft: 16 }}>
                  {act.distance_meters > 0 && <span>{(act.distance_meters / 1000).toFixed(1)} km</span>}
                  {act.elevation_gain > 0 && <span>{Math.round(act.elevation_gain)} m D+</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
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
        <div className="print:hidden" style={{ height: 400, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
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

  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'white', margin: '24px auto',
      padding: '72px 64px', boxShadow: '0 4px 32px rgba(0,0,0,0.14)',
    }}>
      <p style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', margin: '0 0 8px' }}>
        Statistiche
      </p>
      <h2 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 32, fontWeight: 900, color: '#111827', margin: '0 0 32px', textTransform: 'uppercase', letterSpacing: -0.5 }}>
        I tuoi numeri
      </h2>

      {toggles.totali && (
        <div className="pdf-block" style={{ marginBottom: 32 }}>
          <PillHeader label="Totali" accent={GREEN} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatCard value={`${gs.totalDistanceKm.toFixed(0)} km`} label="Percorsi" icon={<Route style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
            <StatCard value={`${gs.totalElevationGain.toFixed(0)} m`} label="Dislivello D+" icon={<Mountain style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
            <StatCard value={formatDuration(gs.totalTimeSeconds)} label="In cammino" icon={<Clock style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
            <StatCard value={`${gs.totalCalories.toFixed(0)}`} label="Calorie (kcal)" icon={<Flame style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
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

function DiarioReportPage({ report, photos }: { report: DiaryReport; photos: RoutePhoto[] }) {
  const act     = report.activity
  const sections = parseSections(report.content)
  const dateStr  = act?.start_time
    ? format(new Date(act.start_time), 'd MMMM yyyy', { locale: it })
    : report.created_at ? format(new Date(report.created_at), 'd MMMM yyyy', { locale: it }) : ''
  const heroPhoto = photos[0] ?? null

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
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      <div style={{ padding: '24px 32px' }}>
        {sections.map((section, i) => (
          <div key={i} className="pdf-block" style={{ marginBottom: 20 }}>
            <div style={{ background: SECTION_COLORS[i % SECTION_COLORS.length], padding: '5px 14px', borderRadius: '5px 5px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{String(i+1).padStart(2,'0')}</span>
              <span style={{ fontSize: 12, fontFamily: 'Arial Black, sans-serif', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: 0.5 }}>{section.title}</span>
            </div>
            <div style={{ padding: '10px 14px', background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 5px 5px' }}>
              {photos[i + 1] && (
                <div style={{ float: 'right', marginLeft: 10, marginBottom: 6, width: 100 }}>
                  <div style={{ position: 'relative' }}>
                    <img src={photos[i + 1].url} alt={photos[i + 1].caption}
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 5 }} />
                    <span style={{ position: 'absolute', top: 3, left: 3, width: 14, height: 14, background: '#f59e0b', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '14px', fontSize: 7, fontWeight: 'bold', fontFamily: 'Arial, sans-serif', display: 'block', boxSizing: 'border-box' }}>{i+2}</span>
                  </div>
                  {photos[i + 1].caption && <p style={{ fontSize: 7, color: '#78716c', textAlign: 'center', marginTop: 2, fontStyle: 'italic' }}>{photos[i + 1].caption}</p>}
                </div>
              )}
              {section.body.split(/\n\n+/).slice(0, 3).map((p, j) => (
                <p key={j} style={{ fontSize: 10, lineHeight: 1.65, color: '#374151', margin: '0 0 6px', fontFamily: 'Georgia, serif' }}>
                  {p.replace(/\[curiosita\]|\[\/curiosita\]/g, '').trim()}
                </p>
              ))}
            </div>
          </div>
        ))}

        {/* Photo row */}
        {photos.length > 0 && (
          <div className="pdf-block" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {photos.map((ph, i) => (
              <div key={ph.id} style={{ position: 'relative' }}>
                <img src={ph.url} alt={ph.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                <span style={{ position: 'absolute', top: 4, left: 4, width: 15, height: 15, background: '#f59e0b', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '15px', fontSize: 7, fontWeight: 'bold', fontFamily: 'Arial, sans-serif', display: 'block', boxSizing: 'border-box', border: '1px solid white' }}>{i+1}</span>
                {ph.caption && <p style={{ fontSize: 7, color: '#78716c', textAlign: 'center', marginTop: 3, fontStyle: 'italic' }}>{ph.caption}</p>}
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
  const [photosByAct,  setPhotosByAct]  = useState<Record<string, RoutePhoto[]>>({})
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
        // Remove OSM tile canvases (cross-origin tainted); replace Leaflet container
        // with a fresh <img> element so no Tailwind 'hidden' class can interfere.
        clone.querySelectorAll('canvas').forEach(c => c.remove())
        const leafletEl = clone.querySelector<HTMLElement>('.leaflet-container')
        if (leafletEl) {
          const wrapper = leafletEl.parentElement as HTMLElement
          wrapper.innerHTML = ''
          wrapper.style.height = 'auto'
          if (mapForPdf) {
            const img = document.createElement('img')
            img.src = mapForPdf
            img.style.cssText = 'width:100%;border-radius:12px;display:block'
            wrapper.appendChild(img)
          }
        }
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
        blob = await paginateToPdf(clones)
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
              <span className="text-xs text-stone-400 font-lora italic">{reports.length} resoconti</span>
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

      {/* Book */}
      {!loading && (
        <div id="diario-book" className="bg-stone-200 py-6 min-h-screen">
          <DiarioCover coverUrl={coverUrl} diaryTitle={diaryTitle} diarySubtitle={diarySubtitle} diaryAuthor={diaryAuthor} />
          {reports.length > 0 && <DiarioIndice reports={reports} />}
          {activities.length > 0 && <DiarioMappa activities={activities} mapImgUrl={mapImgUrl} />}
          {activities.length > 0 && showStats && (
            <DiarioStatistiche activities={activities} toggles={statsToggles} />
          )}
          {reports.map(rep => (
            <DiarioReportPage
              key={rep.id}
              report={rep}
              photos={photosByAct[rep.activity_id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}
