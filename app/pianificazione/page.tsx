'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PianificazioneSidebar from '@/components/PianificazioneSidebar'
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

// ── Route SVG hero ───────────────────────────────────────────────────────────

function RouteSvgHero({ poly }: { poly: [number, number][] }) {
  if (poly.length < 2) return null
  const lats = poly.map(p => p[0]), lons = poly.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const W = 400, H = 180, pad = 16
  const scLat = (H - 2 * pad) / (maxLat - minLat || 0.001)
  const scLon = (W - 2 * pad) / (maxLon - minLon || 0.001)
  const sc = Math.min(scLat, scLon)
  const offX = pad + ((W - 2 * pad) - (maxLon - minLon) * sc) / 2
  const offY = pad + ((H - 2 * pad) - (maxLat - minLat) * sc) / 2
  const px = (lon: number) => offX + (lon - minLon) * sc
  const py = (lat: number) => offY + (maxLat - lat) * sc
  const step = Math.max(1, Math.ceil(poly.length / 80))
  const pts  = poly.filter((_, i) => i % step === 0)
  const d = pts.map(([lat, lon], i) => `${i === 0 ? 'M' : 'L'} ${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full opacity-35" preserveAspectRatio="xMidYMid slice">
      <path d={d} fill="none" stroke="#AED4EC" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 4" />
    </svg>
  )
}

// ── Card escursione pianificata ───────────────────────────────────────────────

function EscursioneCard({ hike }: { hike: PlannedHikeMeta }) {
  const poly     = (hike.routePolyline ?? []) as [number, number][]
  const hasGuide = !!hike.cachedGuide
  const date     = hike.plannedDate
    ? format(new Date(hike.plannedDate + 'T12:00'), 'd MMM yyyy', { locale: it })
    : null
  const km       = (hike.distanceMeters / 1000).toFixed(1)
  const dPlus    = Math.round(hike.elevationGain)
  const diff     = hike.assessment?.difficulty ?? hike.tags?.[0] ?? null
  const cts      = hike.cachedTrailScore

  return (
    <Link
      href={`/guida/${encodeURIComponent(hike.id)}`}
      className="block rounded-[14px] overflow-hidden bg-white"
      style={{ boxShadow: '0 2px 16px rgba(0,0,0,.09)' }}
    >
      {/* Hero 180px */}
      <div
        className="relative overflow-hidden"
        style={{
          height: '180px',
          background: 'linear-gradient(160deg, #0D3B5E 0%, #1C5F8A 75%, #2983C1 100%)',
        }}
      >
        <RouteSvgHero poly={poly} />

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(10,35,65,.90) 0%, rgba(0,0,0,.20) 55%, transparent 100%)' }}
        />

        {/* Top row: guide status badge + date */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          {hasGuide ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold"
              style={{ background: 'rgba(0,0,0,.30)', color: 'white' }}
            >
              <BookOpenCheck className="w-2.5 h-2.5" />
              Guida completa
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold"
              style={{ background: 'rgba(0,0,0,.20)', color: 'rgba(255,255,255,.75)', border: '1px dashed rgba(174,212,236,.40)' }}
            >
              <PenLine className="w-2.5 h-2.5" />
              Bozza guida
            </span>
          )}
          {cts != null && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white"
              style={{ background: 'rgba(255,255,255,.20)', fontFamily: "'DM Mono', monospace" }}
            >
              CTS {Math.round(cts)}
            </span>
          )}
        </div>

        {/* Bottom overlay: title + date + stats */}
        <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
          <p
            className="text-white font-bold text-[16px] leading-tight mb-0.5 truncate"
            style={{ fontFamily: "'Lora', serif" }}
          >
            {hike.title}
          </p>
          {date && (
            <p className="text-[9px] capitalize font-medium" style={{ color: '#AED4EC' }}>{date}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[10px] text-white opacity-80">{km} km</span>
            <span className="text-[10px] text-white opacity-80">D+ {dPlus} m</span>
            {diff && (
              <span className="text-[10px] font-bold text-white opacity-90">{diff.toUpperCase()}</span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-[11px] font-medium" style={{ color: '#2983C1' }}>
          {hasGuide ? 'Leggi la guida →' : 'Genera guida turistica'}
        </p>
        {cts != null && (
          <p className="text-[10px] mt-0.5" style={{ color: '#8a7f6e', fontFamily: "'DM Mono', monospace" }}>
            CTS {Math.round(cts)}
          </p>
        )}
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
    <div className="min-h-screen" style={{ background: '#EAF4FB' }}>
      <Navbar />

      {/* ── Split-pane: sidebar (desktop) + main ──────────────────── */}
      <div className="md:flex md:h-[calc(100vh-56px)]">
        <PianificazioneSidebar />

        <main className="flex-1 min-w-0 md:overflow-y-auto pb-20 md:pb-0">

          {/* ── Header gradient ──────────────────────────────────── */}
          <div
            className="relative"
            style={{
              background: 'linear-gradient(160deg, #0D3B5E 0%, #1C5F8A 75%, #2983C1 100%)',
              padding: '14px 16px 20px',
              overflow: 'visible',
            }}
          >
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

          {/* ── Content area ────────────────────────────────────── */}
          <div className="px-4" style={{ paddingTop: '36px' }}>
            {loading ? (
              <div className="flex items-center justify-center py-24 gap-3" style={{ color: '#1C5F8A' }}>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">Caricamento…</span>
              </div>
            ) : hikes.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                {hikes.map(h => (
                  <EscursioneCard key={h.id} hike={h} />
                ))}
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  )
}
