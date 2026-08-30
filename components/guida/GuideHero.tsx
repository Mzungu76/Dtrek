'use client'
import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Car, SquareParking, Milestone, MapPinned } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'
import type { StartPointInfo } from '@/lib/routeBuilder/startPointInfo'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

const START_POINT_ICON = {
  parcheggio: SquareParking,
  poi_vicino_parcheggio: MapPinned,
  strada: Milestone,
} as const

interface Props {
  trackPoints?: TrackPoint[]
  routePolyline?: [number, number][]
  title: string
  categoryBadge: string
  plannedDate?: string
  /** Distanza in auto dall'indirizzo salvato nelle impostazioni fino al trailhead — mostrata
   *  sotto la data, apre le indicazioni Google Maps al tap. */
  driving?: { distanceMeters: number; mapsUrl?: string } | null
  /** Classificazione del punto di partenza (parcheggio/strada/POI nei pressi di un parcheggio) —
   *  vedi lib/routeBuilder/startPointInfo.ts. Assente/null finché non arriva o se non determinabile
   *  ⇒ nessun badge, invariato. */
  startPoint?: StartPointInfo | null
}

/**
 * Hero della guida — rielaborazione visiva della mappa Leaflet del percorso (non interattiva,
 * ricolorata via filtro CSS su toni pastello terra/forest/stone), con il tracciato indicato
 * sopra in modo tenue. Sostituisce l'ex hero a foto Wikimedia/gradiente: è sempre la mappa del
 * TUO percorso, non una foto generica trovata online, e non dipende dalla disponibilità di foto.
 * Le foto Wikimedia restano usate più sotto (mosaico e foto per-sezione), solo non più qui.
 */
export default function GuideHero({ trackPoints, routePolyline, title, categoryBadge, plannedDate, driving, startPoint }: Props) {
  const points = useMemo(() => {
    const fromTrack = (trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined)
    if (fromTrack.length > 1) return fromTrack
    return (routePolyline ?? []).map(([lat, lon]) => ({ lat, lon } as TrackPoint))
  }, [trackPoints, routePolyline])

  const hasGps = points.length > 1

  return (
    <div
      className="relative w-full overflow-hidden [--hero-h:clamp(200px,50vw,300px)] md:[--hero-h:clamp(240px,32vw,380px)] lg:[--hero-h:clamp(280px,26vw,460px)]"
      style={{ height: 'var(--hero-h)' }}
    >
      {hasGps ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            // Rielabora i tile OSM/CartoDB (già chiari) verso i toni ocra/verde pastello della
            // palette app invece di introdurre una tile provider/immagine statica separata.
            filter: 'sepia(0.4) saturate(1.7) hue-rotate(-8deg) brightness(1.12) contrast(0.9)',
          }}
        >
          <MapView
            trackPoints={points}
            height="100%"
            interactive={false}
            bare
            showEndpointMarkers={false}
            routeColor="#6E301E"
            routeWeight={2.5}
            routeOpacity={0.7}
          />
        </div>
      ) : (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #F6E2CE 0%, #E9EEE3 100%)' }} />
      )}

      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to top, rgba(46,42,34,0.88) 0%, rgba(46,42,34,0.4) 42%, rgba(46,42,34,0.08) 78%, transparent 100%)',
      }} />

      <div className="absolute bottom-0 left-0 right-0 px-5 sm:px-8 md:px-10 pb-5 md:pb-7">
        <span className="inline-block bg-terra-500 text-white text-[8px] font-bold tracking-[2.5px] px-2.5 py-1 rounded-sm mb-2.5 uppercase">
          {categoryBadge}
        </span>
        <h1 className="font-display text-xl sm:text-3xl md:text-4xl font-black text-white leading-tight mb-1 max-w-2xl uppercase tracking-tight"
          style={{ textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}
        >
          {title}
        </h1>
        {plannedDate && (
          <p className="text-[12px] italic text-white/70">
            {format(new Date(plannedDate + 'T12:00'), 'EEEE d MMMM yyyy', { locale: it })}
          </p>
        )}
        {driving && (
          driving.mapsUrl ? (
            <a
              href={driving.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] font-semibold text-white/90 hover:text-white underline decoration-white/40 hover:decoration-white/80 underline-offset-2 transition-colors"
            >
              <Car className="w-3.5 h-3.5" />
              {Math.round(driving.distanceMeters / 1000)} km dal tuo punto di partenza
            </a>
          ) : (
            <p className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] font-semibold text-white/90">
              <Car className="w-3.5 h-3.5" />
              {Math.round(driving.distanceMeters / 1000)} km dal tuo punto di partenza
            </p>
          )
        )}
        {startPoint && (() => {
          const Icon = START_POINT_ICON[startPoint.kind]
          return (
            <p className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] font-semibold text-white/90">
              <Icon className="w-3.5 h-3.5" />
              {startPoint.label}{startPoint.name ? ` — ${startPoint.name}` : ''}
            </p>
          )
        })()}
      </div>
    </div>
  )
}
