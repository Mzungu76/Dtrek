'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Route, Mountain, TrendingUp, Compass, Loader2 } from 'lucide-react'
import TopOverlay from '@/components/routehub/TopOverlay'
import type { StatPill } from '@/components/routehub/types'
import { openRecommendationCard } from '@/lib/routeBuilder/openRecommendationCard'
import type { DashboardData } from './types'

const AllRoutesMap = dynamic(() => import('@/components/AllRoutesMap'), { ssr: false })
const GuideResocontiMap = dynamic(() => import('@/components/dashboard/GuideResocontiMap'), { ssr: false })

// Zoom "regionale" e centro di default quando non c'è ancora nessuna coordinata dell'utente da
// inquadrare (nessuna attività, nessuna Meta, nessun suggerimento) — a differenza di una cover-map
// puntuale su un singolo percorso, una mappa di base può comunque esistere qui: centro dell'Italia,
// un contesto ragionevole per un pubblico italofono come quello dell'app.
const REGIONAL_FALLBACK = { center: [42.5, 12.5] as [number, number], zoom: 6 }

type MapMode = 'routes' | 'guides'

function fmtKm(km: number): string {
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`
}

/** Sfondo a piena pagina dell'hero Dashboard (Direzione E, docs/mockup-dashboard-hero/): la mappa
 *  di tutti i percorsi o le posizioni di Guide e Resoconti, con lo stesso titolo/pillole/HubNavBar
 *  già usati da Guida/Resoconto/Diario (TopOverlay) — non una nuova ambientazione a parte, la
 *  stessa identità hero del resto dell'app applicata anche qui. */
export default function DashboardHero({ data }: { data: DashboardData }) {
  const router = useRouter()
  const [mode, setMode] = useState<MapMode>('routes')
  const [opening, setOpening] = useState(false)

  const hasAnyData = data.activities.length > 0 || data.plannedHikes.length > 0
  const suggested = !hasAnyData ? data.percorsiPerTe.firstCard : null

  const resocontoPins = useMemo(() => data.activities
    .filter(a => a.routePolyline && a.routePolyline.length > 0)
    .map(a => ({ id: a.id, title: a.title, lat: a.routePolyline![0][0], lon: a.routePolyline![0][1], kind: 'resoconto' as const })),
    [data.activities])
  const guidePins = useMemo(() => data.plannedHikes
    .filter(h => h.latitude != null && h.longitude != null)
    .map(h => ({ id: h.id, title: h.title, lat: h.latitude as number, lon: h.longitude as number, kind: 'guide' as const })),
    [data.plannedHikes])

  const routeEntries = useMemo(() => data.activities
    .filter(a => a.routePolyline && a.routePolyline.length > 1)
    .map(a => ({ id: a.id, title: a.title, startTime: a.startTime, polyline: a.routePolyline! })),
    [data.activities])

  async function handleOpenSuggested() {
    if (opening || !data.percorsiPerTe.firstCardRaw) return
    setOpening(true)
    try {
      const id = await openRecommendationCard(data.percorsiPerTe.firstCardRaw)
      router.push(`/guida/${encodeURIComponent(id)}`)
    } catch {
      setOpening(false)
    }
  }

  // ── Stato "utente nuovo con un suggerimento" ──────────────────────────────────────────────
  if (suggested) {
    const pills: StatPill[] = [
      { icon: Route, label: fmtKm(suggested.distanceMeters / 1000) },
      { icon: TrendingUp, label: `+${Math.round(suggested.elevationGain)} m` },
    ]
    return (
      <>
        <AllRoutesMap
          routes={[{ id: 'suggerito', title: suggested.title, startTime: new Date().toISOString(), polyline: suggested.polyline }]}
          height="100%" interactive={false} emptyFallback={REGIONAL_FALLBACK} className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />
        <TopOverlay
          itemKey="suggerito" title="Il tuo primo percorso" subtitle={suggested.title}
          statPills={pills} variant="magazine"
          contextBadge={
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold px-3 py-1.5 rounded-full">
              <Compass className="w-3 h-3" /> Percorso consigliato per te
            </span>
          }
        />
        <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
          <button
            onClick={handleOpenSuggested}
            disabled={opening}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-forest-600 hover:bg-forest-700 text-white font-semibold text-sm shadow-lg disabled:opacity-70 transition-colors"
          >
            {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
            {opening ? 'Preparazione…' : 'Scopri il percorso'}
          </button>
        </div>
      </>
    )
  }

  // ── Stato "utente nuovo senza nulla" ──────────────────────────────────────────────────────
  if (!hasAnyData) {
    return (
      <>
        <AllRoutesMap routes={[]} height="100%" interactive={false} emptyFallback={REGIONAL_FALLBACK} className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />
        <TopOverlay
          itemKey="vuoto" title="Nessuna uscita ancora"
          subtitle="Le tue tracce, le tue Guide e i tuoi Resoconti compariranno su questa mappa."
          statPills={[]} variant="magazine"
        />
      </>
    )
  }

  // ── Stato "popolato": 2 mappe intercambiabili ─────────────────────────────────────────────
  const pills: StatPill[] = [
    { icon: Route, label: `${data.globalStats.totalActivities} percorsi` },
    { icon: Mountain, label: fmtKm(data.globalStats.totalDistanceKm) },
    { icon: TrendingUp, label: `+${Math.round(data.globalStats.totalElevationGain)} m D+` },
  ]

  return (
    <>
      {mode === 'routes' ? (
        <AllRoutesMap key="routes" routes={routeEntries} height="100%" interactive={false} emptyFallback={REGIONAL_FALLBACK} className="absolute inset-0" />
      ) : (
        <GuideResocontiMap key="guides" pins={[...guidePins, ...resocontoPins]} height="100%" emptyFallback={REGIONAL_FALLBACK} className="absolute inset-0" />
      )}
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />
      <TopOverlay
        itemKey={mode}
        title={mode === 'routes' ? 'I tuoi percorsi' : 'Dove sei stato'}
        subtitle={mode === 'routes'
          ? 'Ogni traccia che hai mai camminato, in un unico sguardo.'
          : 'Ogni Guida consultata e ogni Resoconto scritto, sulla mappa.'}
        statPills={mode === 'routes' ? pills : [
          { icon: Compass, label: `${guidePins.length} Guide` },
          { icon: Route, label: `${resocontoPins.length} Resoconti` },
        ]}
        variant="magazine"
        contextBadge={
          <div className="inline-flex items-center gap-0.5 bg-white/15 backdrop-blur-md border border-white/25 rounded-full p-0.5">
            <button
              onClick={() => setMode('routes')}
              className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-bold transition-colors ${mode === 'routes' ? 'bg-white text-forest-800' : 'text-white/75'}`}
            >
              Tutti i percorsi
            </button>
            <button
              onClick={() => setMode('guides')}
              className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-bold transition-colors ${mode === 'guides' ? 'bg-white text-forest-800' : 'text-white/75'}`}
            >
              Guide e Resoconti
            </button>
          </div>
        }
      />
    </>
  )
}
