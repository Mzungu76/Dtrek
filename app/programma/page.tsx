'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { formatDuration } from '@/lib/tcxParser'
import { ctsLabel } from '@/lib/trailScore'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarClock, Loader2, Mountain, Upload } from 'lucide-react'

/**
 * Landing della tab "Programma": salta dritto alla prossima escursione
 * pianificata (screen di prep con meteo, "come arrivare" e navigazione),
 * invece di essere un'ennesima lista — quella vive già nel Diario filtrato
 * su "Programmate". Con più pianificate in corso, propone una scelta.
 */
export default function ProgrammaIndexPage() {
  const router = useRouter()
  const [planned, setPlanned] = useState<PlannedHikeMeta[] | null>(null)

  useEffect(() => {
    getAllPlanned(setPlanned).then(setPlanned).catch(() => setPlanned([]))
  }, [])

  useEffect(() => {
    if (planned && planned.length === 1) {
      router.replace(`/programma/${encodeURIComponent(planned[0].id)}`)
    }
  }, [planned, router])

  const sorted = (planned ?? []).slice().sort((a, b) => {
    const da = a.plannedDate ? new Date(a.plannedDate).getTime() : Infinity
    const db = b.plannedDate ? new Date(b.plannedDate).getTime() : Infinity
    return da - db
  })

  return (
    <div className="min-h-screen bg-stone-50 pb-28 md:pb-0">
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden bg-gradient-to-br from-sky-800 to-sky-900 bg-topography">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-900/15 to-sky-900/85" />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8">
          <div className="max-w-[1400px] mx-auto">
            <p className="text-sky-300 text-[13px] font-semibold mb-1.5">Programma</p>
            <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
              La tua prossima escursione
            </h1>
          </div>
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
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Nessuna escursione in programma</h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6 px-4">
              Carica un file GPX per pianificare la tua prossima uscita e prepararla in anticipo.
            </p>
            <Link
              href="/upload"
              className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" /> Pianifica un&#39;escursione
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(hike => {
              const date      = hike.plannedDate ? new Date(hike.plannedDate) : null
              const ctsScore  = hike.cachedTrailScore
              const ctsData   = ctsScore != null ? ctsLabel(ctsScore) : null
              return (
                <Link
                  key={hike.id}
                  href={`/programma/${encodeURIComponent(hike.id)}`}
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
                    {date && (
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
      </main>
    </div>
  )
}
