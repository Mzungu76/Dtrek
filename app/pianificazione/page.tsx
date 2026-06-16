'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Loader2, Mountain, CalendarCheck, BookOpenCheck, CalendarDays, PenLine, ChevronRight } from 'lucide-react'

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
        border: '2px solid rgba(13,59,94,.10)',
        boxShadow: '0 4px 18px rgba(0,0,0,.22)',
        zIndex: 10,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0D3B5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="xMidYMid slice">
      <path d={d} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />
    </svg>
  )
}

// ── Card escursione pianificata ───────────────────────────────────────────────

function EscursioneCard({ hike }: { hike: PlannedHikeMeta }) {
  const poly    = (hike.routePolyline ?? []) as [number, number][]
  const hasGuide = !!hike.cachedGuide
  const date    = hike.plannedDate
    ? format(new Date(hike.plannedDate + 'T12:00'), 'd MMM yyyy', { locale: it })
    : null
  const km      = (hike.distanceMeters / 1000).toFixed(1)
  const dPlus   = Math.round(hike.elevationGain)
  const diff    = hike.assessment?.difficulty ?? hike.tags?.[0] ?? '–'
  const cts     = hike.cachedTrailScore

  return (
    <Link
      href={`/guida/${encodeURIComponent(hike.id)}`}
      className="block rounded-[14px] overflow-hidden bg-white"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,.07)' }}
    >
      {/* Header card 70px */}
      <div
        className="relative overflow-hidden flex items-start justify-between px-3 pt-2.5 pb-2"
        style={{
          height: '70px',
          background: 'linear-gradient(160deg, #0D3B5E 0%, #1C5F8A 75%, #2983C1 100%)',
        }}
      >
        <RouteSvgMini poly={poly} />
        {/* Badge stato */}
        <div className="relative z-10">
          {hasGuide ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold"
              style={{ background: 'rgba(255,255,255,.15)', color: 'white' }}
            >
              <BookOpenCheck className="w-2.5 h-2.5" />
              Guida completa
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold"
              style={{ background: 'rgba(255,255,255,.10)', color: 'rgba(255,255,255,.75)', border: '1px dashed rgba(255,255,255,.30)' }}
            >
              <PenLine className="w-2.5 h-2.5" />
              Bozza guida
            </span>
          )}
        </div>
        {date && (
          <span className="relative z-10 text-[9px] font-semibold" style={{ color: '#AED4EC' }}>
            {date}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p
          className="font-display font-bold text-[13px] leading-tight mb-1.5 truncate"
          style={{ color: '#0D3B5E', fontFamily: "'Lora', serif" }}
        >
          {hike.title}
        </p>

        {/* CTA */}
        <p
          className="text-[11px] font-medium mb-2"
          style={{ color: '#2983C1' }}
        >
          {hasGuide ? 'Leggi la guida →' : 'Genera guida turistica'}
        </p>

        {/* Dati tecnici */}
        <div className="flex items-center gap-3 text-[10px]" style={{ color: '#8a7f6e' }}>
          <span className="flex items-center gap-0.5">
            <Mountain className="w-3 h-3" /> {km} km
          </span>
          <span>D+ {dPlus} m</span>
          {diff && <span className="font-semibold" style={{ color: '#1C5F8A' }}>{diff.toUpperCase()}</span>}
          {cts != null && (
            <span className="ml-auto font-bold text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#EAF4FB', color: '#1C5F8A', fontFamily: "'DM Mono', monospace" }}>
              CTS {Math.round(cts)}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-20 gap-4 text-center px-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: '#EAF4FB' }}
      >
        <CalendarDays className="w-9 h-9" style={{ color: '#1C5F8A' }} />
      </div>
      <div>
        <p className="font-display font-bold text-lg" style={{ color: '#0D3B5E', fontFamily: "'Lora', serif" }}>
          Nessuna escursione pianificata
        </p>
        <p className="text-sm mt-1" style={{ color: '#8a7f6e' }}>
          Carica un file GPX/FIT/TCX per pianificare la tua prossima avventura.
        </p>
      </div>
      <Link
        href="/upload"
        className="flex items-center gap-2 px-6 py-3 rounded-[14px] text-white font-semibold text-sm"
        style={{ background: '#1C5F8A' }}
      >
        Carica traccia GPS
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PianificazionePage() {
  const [hikes,   setHikes]   = useState<PlannedHikeMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllPlanned(data => setHikes(data))
      .then(data => setHikes(data))
      .finally(() => setLoading(false))
  }, [])

  const nPlanned  = hikes.length
  const nGuide    = hikes.filter(h => !!h.cachedGuide).length
  const nextDate  = hikes
    .filter(h => h.plannedDate)
    .map(h => h.plannedDate!)
    .sort()[0]
  const nextLabel = nextDate
    ? format(new Date(nextDate + 'T12:00'), 'd MMM', { locale: it })
    : '–'

  return (
    <div className="min-h-screen pb-20 md:pb-0" style={{ background: '#EAF4FB' }}>
      <Navbar />

      {/* ── Header gradient ──────────────────────────────────────────── */}
      <div
        className="relative"
        style={{
          background: 'linear-gradient(160deg, #0D3B5E 0%, #1C5F8A 75%, #2983C1 100%)',
          padding: '14px 16px 20px',
          overflow: 'visible',
        }}
      >
        {/* Status bar spacer on mobile */}
        <div className="h-safe-top" />

        {/* Title row */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[2px] uppercase mb-0.5" style={{ color: '#AED4EC' }}>
              Le mie escursioni
            </p>
            <h1 style={{ fontFamily: "'Lora', serif", fontSize: '22px', fontWeight: 700, color: 'white', margin: 0 }}>
              future
            </h1>
          </div>
          {/* Avatar placeholder */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center border-2"
            style={{ borderColor: 'rgba(255,255,255,.25)', background: 'rgba(255,255,255,.10)' }}
          >
            <Mountain className="w-4 h-4 text-white opacity-70" />
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,.12)' }}>
            <CalendarCheck className="w-3.5 h-3.5" style={{ color: '#AED4EC' }} />
            <span className="text-white font-bold text-[13px]" style={{ fontFamily: "'DM Mono', monospace" }}>{nPlanned}</span>
            <span className="text-[10px] font-medium" style={{ color: '#AED4EC' }}>pianificate</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,.12)' }}>
            <BookOpenCheck className="w-3.5 h-3.5" style={{ color: '#AED4EC' }} />
            <span className="text-white font-bold text-[13px]" style={{ fontFamily: "'DM Mono', monospace" }}>{nGuide}</span>
            <span className="text-[10px] font-medium" style={{ color: '#AED4EC' }}>guide</span>
          </div>
          {nextDate && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,.12)' }}>
              <CalendarDays className="w-3.5 h-3.5" style={{ color: '#AED4EC' }} />
              <span className="text-white font-bold text-[13px]" style={{ fontFamily: "'DM Mono', monospace" }}>{nextLabel}</span>
            </div>
          )}
        </div>

        {/* Stats FAB */}
        <StatsFab />
      </div>

      {/* ── Content area ────────────────────────────────────────────── */}
      <div className="px-4" style={{ paddingTop: '36px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: '#1C5F8A' }}>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Caricamento…</span>
          </div>
        ) : hikes.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3 pb-4">
            {hikes.map(h => (
              <EscursioneCard key={h.id} hike={h} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
