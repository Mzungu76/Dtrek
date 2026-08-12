'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MapRouteThumb from '@/components/MapRouteThumb'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { lsClearAll } from '@/lib/localStore'
import { formatDuration } from '@/lib/tcxParser'
import { openMainApp } from '@/lib/native/mainAppLinks'
import { Compass, LogOut, Loader2, Mountain, MapPinned, ExternalLink } from 'lucide-react'

/**
 * Entry screen of the standalone DTrek Navigator app (separate Android/iOS
 * install from the main DTrek app — see docs/navigation-engine-analysis.md
 * "Architettura a due app"). Deliberately minimal: this app's only job is
 * to start GPS navigation on a route already planned in the main app, not
 * to plan/search/browse guides — that full experience stays in the main
 * app's `/guida` tab. Both apps read the same `planned_hike` rows (via the
 * shared Supabase project + per-app login), so a route planned on the main
 * app just shows up here once the user is signed in.
 *
 * A user can perfectly well install this app before ever opening the main
 * one, though — no planned routes to show yet. Rather than being a dead
 * end, that state (and the list state too) always offers two ways forward:
 * record a track with no plan at all (app/navigatore/traccia), or open the
 * main app to actually plan one.
 */
export default function NavigatorePage() {
  const router = useRouter()
  const [planned, setPlanned] = useState<PlannedHikeMeta[] | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    getAllPlanned(setPlanned).then(setPlanned).catch(() => setPlanned([]))
  }, [])

  const routes = (planned ?? [])
    .filter((h) => !h.archivedAt && h.routePolyline && h.routePolyline.length > 1)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  async function handleSignOut() {
    setSigningOut(true)
    await getBrowserSupabase().auth.signOut()
    await lsClearAll()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <div className="bg-gradient-to-br from-sky-800 to-sky-900 px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Compass className="w-6 h-6 text-white" />
            <h1 className="font-display text-xl font-bold text-white">DTrek Navigator</h1>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            title="Esci"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 text-white hover:bg-white/25 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sky-200 text-[13px] mt-2">Scegli un percorso pianificato per avviare la navigazione GPS.</p>
      </div>

      <main className="flex-1 max-w-[900px] w-full mx-auto px-4 py-6">
        <Link
          href="/navigatore/traccia"
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-forest-500 text-white shadow-sm hover:bg-forest-600 transition-colors mb-6"
        >
          <MapPinned className="w-5 h-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Registra un percorso senza pianificazione</p>
            <p className="text-[12px] text-white/80">Traccia solo la tua posizione — la salvi alla fine come nuova escursione.</p>
          </div>
        </Link>

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

      <button
        onClick={() => openMainApp()}
        className="flex items-center justify-center gap-2 py-3.5 text-sky-800 text-sm font-medium bg-white border-t border-stone-200"
      >
        <ExternalLink className="w-4 h-4" /> Diario, statistiche e nuovi percorsi: apri DTrek
      </button>
    </div>
  )
}
