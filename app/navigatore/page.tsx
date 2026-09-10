'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Menu, Compass, Navigation2, Upload, ExternalLink, TriangleAlert, Locate } from 'lucide-react'
import FreeTrackMap, { type FreeTrackMapHandle } from '@/components/navigation/FreeTrackMap'
import NavigatorMenu from '@/components/navigation/NavigatorMenu'
import { LocationSource, type LocationSourceError } from '@/lib/native/locationSource'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { openMainApp } from '@/lib/native/mainAppLinks'
import { useEntitlement } from '@/lib/useEntitlement'

/**
 * Entry screen of the standalone DTrek Navigator app (separate Android/iOS install from the main
 * DTrek app — see docs/navigation-engine-analysis.md "Architettura a due app"). Map-first: shows
 * live position immediately, ready to navigate, instead of a list to scroll through first (that
 * moved to app/navigatore/percorsi — one option among several behind the menu button here). No
 * recording/stats here, just "where am I, what's ready to navigate" — position tracking is a
 * lightweight raw GeoFix feed (LocationSource), not the full PositionEngine/FreeTrackSession
 * pipeline that's overkill for a screen that isn't accumulating a track.
 *
 * Confine Navigator/Dtrek (docs/navigator-dtrek-boundary.md): due icone distinte e complementari
 * — questa schermata è SEMPRE quello che apre l'icona di Navigator, attivato o no. L'unica cosa
 * che cambia con l'attivazione è l'icona "Apri Dtrek" nella barra in alto, che porta al browser
 * di sistema — mai una navigazione dentro questa stessa WebView.
 */
export default function NavigatorePage() {
  const { dtrekActivated } = useEntitlement()
  const [menuOpen, setMenuOpen] = useState(false)
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [bearing, setBearing] = useState<number | null>(null)
  const [accuracyM, setAccuracyM] = useState<number | null>(null)
  const [gpsWarning, setGpsWarning] = useState<string | null>(null)
  const [readyHike, setReadyHike] = useState<PlannedHikeMeta | null | undefined>(undefined) // undefined = still loading
  const [followMode, setFollowMode] = useState(true)
  const sourceRef = useRef<LocationSource | null>(null)
  const mapHandleRef = useRef<FreeTrackMapHandle | null>(null)

  useEffect(() => {
    const source = new LocationSource(
      (fix) => {
        setPosition({ lat: fix.lat, lon: fix.lon })
        setBearing(fix.bearingDeg ?? null)
        setAccuracyM(fix.accuracyM ?? null)
        setGpsWarning(null)
      },
      (err: LocationSourceError) => {
        setGpsWarning(err.code === 1 ? 'Permesso di localizzazione negato — attivalo nelle impostazioni del telefono.' : 'Segnale GPS assente.')
      },
    )
    sourceRef.current = source
    source.start('trekking').catch(() => setGpsWarning('Impossibile avviare il GPS.'))
    return () => { source.stop() }
  }, [])

  useEffect(() => {
    getAllPlanned().then((list) => {
      const active = list
        .filter((h) => !h.archivedAt && h.routePolyline && h.routePolyline.length > 1)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setReadyHike(active[0] ?? null)
    }).catch(() => setReadyHike(null))
  }, [])

  return (
    <div className="fixed inset-0 bg-stone-900">
      <FreeTrackMap ref={mapHandleRef} path={[]} position={position} bearingDeg={bearing} accuracyM={accuracyM} onFollowModeChange={setFollowMode} />

      <button
        onClick={() => mapHandleRef.current?.recenter()}
        aria-label="Centra sulla mia posizione"
        className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full shadow-lg flex items-center justify-center ${
          followMode ? 'bg-terra-500 text-white' : 'bg-white text-stone-700'
        }`}
      >
        <Locate className="w-5 h-5" />
      </button>

      <div className="absolute top-0 inset-x-0 z-20 bg-gradient-to-b from-black/55 to-transparent px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-8 flex items-center justify-between pointer-events-none">
        <button
          onClick={() => setMenuOpen(true)}
          className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="pointer-events-none flex items-center gap-2 text-white drop-shadow">
          <Compass className="w-5 h-5" />
          <span className="font-display text-base font-bold">DTrek Navigator</span>
        </div>
        {dtrekActivated ? (
          <button
            onClick={() => openMainApp()}
            aria-label="Apri Dtrek"
            title="Apri Dtrek"
            className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
          >
            <ExternalLink className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-10" /> // balances the menu button so the title stays centered
        )}
      </div>

      {gpsWarning && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-sm shadow-lg max-w-[calc(100%-2rem)]">
          <TriangleAlert className="w-4 h-4 shrink-0" /> {gpsWarning}
        </div>
      )}

      <div className="absolute bottom-0 inset-x-0 z-20 bg-white rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        {readyHike === undefined ? (
          <div className="h-[76px]" /> // avoids a layout jump while the planned list loads
        ) : readyHike ? (
          <Link
            href={`/guida/${encodeURIComponent(readyHike.id)}/naviga`}
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-forest-500 text-white shadow-sm hover:bg-forest-600 transition-colors"
          >
            <Navigation2 className="w-5 h-5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white/80 uppercase tracking-wide font-semibold">Pronto per la navigazione</p>
              <p className="font-semibold text-sm truncate">{readyHike.title}</p>
            </div>
          </Link>
        ) : (
          <div className="flex flex-col items-center text-center gap-2 py-1">
            <p className="text-stone-500 text-sm">Nessun percorso pronto per la navigazione.</p>
            <Link
              href="/navigatore/importa"
              className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium text-sm transition-colors"
            >
              <Upload className="w-4 h-4" /> Importa un percorso
            </Link>
          </div>
        )}
      </div>

      <NavigatorMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
