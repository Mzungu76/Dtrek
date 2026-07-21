'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { formatDuration } from '@/lib/tcxParser'
import { ctsLabel } from '@/lib/trailScore'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarClock, Loader2, Mountain, Upload, Archive } from 'lucide-react'

function pendingBadge(hike: PlannedHikeMeta): { label: string; className: string } | null {
  if (hike.archivedAt) return null
  if (!hike.pendingExpiresAt) return null
  const expired = new Date(hike.pendingExpiresAt).getTime() < Date.now()
  if (expired) return { label: 'Scaduto — proroga o archivia', className: 'bg-amber-500 text-white' }
  const daysLeft = Math.ceil((new Date(hike.pendingExpiresAt).getTime() - Date.now()) / 86400000)
  return { label: `In attesa · ${daysLeft}g`, className: 'bg-sky-600/90 text-white' }
}

/**
 * Index del tab Guida: lista dei percorsi importati (via GPX, manualmente o da
 * un resoconto esistente) ancora "in attesa" di essere percorsi. Con più
 * percorsi in sospeso una griglia serve meglio di un redirect automatico al
 * prossimo — quella scorciatoia viveva qui quando la tab si chiamava Programma.
 */
export default function GuidaIndexPage() {
  const [planned, setPlanned] = useState<PlannedHikeMeta[] | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    getAllPlanned(setPlanned).then(setPlanned).catch(() => setPlanned([]))
  }, [])

  useCtsUpdated(() => { getAllPlanned().then(setPlanned).catch(() => {}) })

  const all      = planned ?? []
  const active   = all.filter(h => !h.archivedAt)
  const archived = all.filter(h => h.archivedAt)
  const sorted = active.slice().sort((a, b) => {
    const da = a.pendingExpiresAt ? new Date(a.pendingExpiresAt).getTime() : Infinity
    const db = b.pendingExpiresAt ? new Date(b.pendingExpiresAt).getTime() : Infinity
    return da - db
  })

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden bg-gradient-to-br from-sky-800 to-sky-900 bg-topography">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-900/15 to-sky-900/85" />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8 flex items-end justify-between gap-4">
          <div className="max-w-[1400px]">
            <p className="text-sky-300 text-[13px] font-semibold mb-1.5">Guida</p>
            <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
              Percorsi in attesa
            </h1>
          </div>
          <Link
            href="/upload?tab=gpx"
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white text-sky-900 rounded-xl font-semibold text-sm shadow-lg hover:bg-sky-50 transition-colors"
          >
            <Upload className="w-4 h-4" /> Importa
          </Link>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 py-6 sm:py-8">
        {planned === null ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center mb-6">
              <CalendarClock className="w-10 h-10 text-sky-400" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Nessun percorso in attesa</h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6 px-4">
              Importa un percorso già trovato altrove — file GPX, a mano, o da un resoconto che hai già —
              e DTrek ne genera automaticamente la guida turistica.
            </p>
            <Link
              href="/upload?tab=gpx"
              className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" /> Importa un percorso
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(hike => {
              const date      = hike.plannedDate ? new Date(hike.plannedDate) : null
              const ctsScore  = hike.cachedTrailScore
              const ctsData   = ctsScore != null ? ctsLabel(ctsScore) : null
              const badge     = pendingBadge(hike)
              return (
                <Link
                  key={hike.id}
                  href={`/guida/${encodeURIComponent(hike.id)}`}
                  className="block bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-dashed border-sky-200"
                >
                  <div className="relative h-[160px] bg-gradient-to-b from-sky-50 to-stone-50 bg-topography">
                    {hike.routePolyline && hike.routePolyline.length > 1 ? (
                      <div className="absolute inset-3">
                        <RouteThumb polyline={hike.routePolyline} color="#0284c7" strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Mountain className="w-10 h-10 text-sky-200" />
                      </div>
                    )}
                    {badge ? (
                      <span className={`absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm ${badge.className}`}>
                        {badge.label}
                      </span>
                    ) : date && (
                      <span className="absolute top-3 right-3 text-[11px] font-bold bg-white/92 text-sky-700 px-2.5 py-1 rounded-full shadow-sm">
                        {format(date, 'd MMM', { locale: it })}
                      </span>
                    )}
                  </div>
                  <div className="px-[18px] pt-4 pb-[18px]">
                    <p className="text-[16px] font-bold text-sky-900 mb-2 truncate">{hike.title}</p>
                    <div className="flex items-center gap-4 text-[13px] text-stone-500 flex-wrap">
                      <span>{(hike.distanceMeters / 1000).toFixed(1)} km</span>
                      <span>{Math.round(hike.elevationGain)} m D+</span>
                      <span>{formatDuration(hike.estimatedTimeSeconds)} stim.</span>
                      {ctsData && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md text-white" style={{ backgroundColor: ctsData.color }}>
                          CTS {Math.round(ctsScore!)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {archived.length > 0 && (
          <div className="mt-8 pt-6 border-t border-stone-200">
            <button
              onClick={() => setShowArchived(v => !v)}
              className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-600 font-medium mb-4"
            >
              <Archive className="w-4 h-4" /> {archived.length} guid{archived.length === 1 ? 'a archiviata' : 'e archiviate'}
            </button>
            {showArchived && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
                {archived.map(hike => (
                  <Link
                    key={hike.id}
                    href={`/guida/${encodeURIComponent(hike.id)}`}
                    className="block bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-stone-200 px-[18px] py-4"
                  >
                    <p className="text-[15px] font-bold text-stone-700 truncate">{hike.title}</p>
                    <p className="text-[12px] text-stone-400 mt-1">{(hike.distanceMeters / 1000).toFixed(1)} km</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
