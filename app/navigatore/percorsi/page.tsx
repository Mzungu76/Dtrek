'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import MapRouteThumb from '@/components/MapRouteThumb'
import OfflinePackageDownloader from '@/components/navigation/OfflinePackageDownloader'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { formatDuration } from '@/lib/tcxParser'
import { openMainApp } from '@/lib/native/mainAppLinks'
import { Loader2, Mountain, ExternalLink } from 'lucide-react'

/**
 * Full list of planned routes — moved here from app/navigatore/page.tsx (now a map-first home,
 * see its own doc comment) so it's one option among several behind the menu, not the app's first
 * screen. Both apps read the same `planned_hike` rows (shared Supabase project + per-app login),
 * so a route planned on the main app just shows up here once the user is signed in — no per-row
 * limit, unlike what Navigator itself lets you import/record (lib/navigatorSlot.ts).
 */
export default function PercorsiPage() {
  const router = useRouter()
  const [planned, setPlanned] = useState<PlannedHikeMeta[] | null>(null)

  useEffect(() => {
    getAllPlanned(setPlanned).then(setPlanned).catch(() => setPlanned([]))
  }, [])

  const routes = (planned ?? [])
    .filter((h) => !h.archivedAt && h.routePolyline && h.routePolyline.length > 1)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <div className="bg-gradient-to-br from-sky-800 to-sky-900 px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-6 flex items-center gap-3">
        <button onClick={() => router.push('/navigatore')} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="font-display text-lg font-bold text-white">Percorsi pianificati</h1>
          <p className="text-sky-200 text-[13px]">Scegli un percorso per avviare la navigazione GPS.</p>
        </div>
      </div>

      <main className="flex-1 max-w-[900px] w-full mx-auto px-4 py-6">
        {planned === null ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : routes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center mb-6">
              <Mountain className="w-10 h-10 text-sky-400" />
            </div>
            <h2 className="font-display text-xl font-semibold text-stone-700 mb-2">Nessun percorso pianificato</h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6">
              Pianifica o importa un percorso dall&apos;app DTrek principale — comparirà qui, pronto per la navigazione.
            </p>
            <button
              onClick={() => openMainApp('/guida')}
              className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Apri DTrek per pianificare
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {routes.map((hike) => (
              <Link
                key={hike.id}
                href={`/guida/${encodeURIComponent(hike.id)}/naviga`}
                className="block bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-stone-200"
              >
                <div className="relative h-[140px] bg-gradient-to-b from-sky-50 to-stone-50 bg-topography">
                  <MapRouteThumb polyline={hike.routePolyline!} color="#0284c7" strokeWidth={3} />
                  {/* Download-for-offline directly from the list — previously only reachable after
                      already starting live navigation on a route (ActiveNavigationView.tsx's own
                      sheet), which meant there was effectively nowhere to see or manage this before
                      committing to a hike offline. stopPropagation/preventDefault: this whole card
                      is a Link to the navigation screen, and a nested button/anchor click would
                      otherwise also trigger that navigation. */}
                  <div
                    className="absolute top-2 right-2 z-10"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                  >
                    <OfflinePackageDownloader
                      hikeId={hike.id}
                      routePolyline={hike.routePolyline!}
                      hikeData={{ cachedPois: hike.cachedPois }}
                      compact
                    />
                  </div>
                </div>
                <div className="px-[18px] pt-4 pb-[18px]">
                  <p className="text-[16px] font-bold text-sky-900 mb-2 truncate">{hike.title}</p>
                  <div className="flex items-center gap-4 text-[13px] text-stone-500 flex-wrap">
                    <span>{(hike.distanceMeters / 1000).toFixed(1)} km</span>
                    <span>{Math.round(hike.elevationGain)} m D+</span>
                    <span>{formatDuration(hike.estimatedTimeSeconds)} stim.</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
