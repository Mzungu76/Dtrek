'use client'
import dynamic from 'next/dynamic'
import { useMemo, type ReactNode } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Car, SquareParking, Milestone, MapPinned, MapPin } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'
import type { StartPointInfo } from '@/lib/routeBuilder/startPointInfo'
import FallbackImage from '@/components/ui/FallbackImage'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

/** Ripiego per coverMode='photo' senza foto — sia quando non ce n'è mai stata una (photoUrl
 *  assente) sia quando c'era ma il caricamento è fallito davvero (FallbackImage sotto). Estratto
 *  per non duplicare lo stesso markup nei due punti in cui serve. */
function CoverFallback({ color, icon }: { color?: string; icon?: ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${color ?? '#813619'}, #2E3A26)` }}
    >
      <span className="[&>svg]:w-16 [&>svg]:h-16 text-white/25">{icon}</span>
    </div>
  )
}

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
  /** 'map' (default, invariato) per un Sentiero o un Borgo/Città "trekking misto" — la mappa
   *  ricolorata del tracciato. 'photo' per un Borgo/Città "cammino urbano" o un Sito: una foto
   *  reale del luogo (lib/placePhotoCache.ts), o un gradiente + icona di categoria quando non ce
   *  n'è una (mai una traccia GPS disegnata per una Meta che non ne ha, piano §48.9). */
  coverMode?: 'map' | 'photo'
  photoUrl?: string | null
  /** Attribuzione Wikimedia Commons (licenza CC BY-SA) — mostrata in un angolo della copertina
   *  quando presente. Vedi app/fonti-e-crediti. */
  photoCredit?: string | null
  /** Icona + colore di categoria per il fallback senza foto (coverMode='photo' con photoUrl
   *  assente) — vedi lib/metaTypes.ts's META_TYPE_CONFIG/SITE_TYPE_CONFIG. */
  fallbackIcon?: ReactNode
  fallbackColor?: string
  /** Icona mostrata dentro il badge di categoria (es. l'icona del siteType) — solo coverMode='photo'
   *  (mai per un Sentiero, badge invariato). */
  badgeIcon?: ReactNode
  /** Comune/Provincia/Regione — riga sotto il titolo con icona di posizione, come nella scheda di
   *  ricerca (app/mete/[id]/page.tsx). Solo coverMode='photo': un Sentiero mostra già la distanza in
   *  auto/il punto di partenza al posto suo (driving/startPoint sotto). */
  locationLabel?: string
}

/**
 * Hero della guida — rielaborazione visiva della mappa Leaflet del percorso (non interattiva,
 * ricolorata via filtro CSS su toni pastello terra/forest/stone), con il tracciato indicato
 * sopra in modo tenue. Sostituisce l'ex hero a foto Wikimedia/gradiente: è sempre la mappa del
 * TUO percorso, non una foto generica trovata online, e non dipende dalla disponibilità di foto.
 * Le foto Wikimedia restano usate più sotto (mosaico e foto per-sezione), solo non più qui.
 */
export default function GuideHero({
  trackPoints, routePolyline, title, categoryBadge, plannedDate, driving, startPoint,
  coverMode = 'map', photoUrl, photoCredit, fallbackIcon, fallbackColor, badgeIcon, locationLabel,
}: Props) {
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
      {coverMode === 'photo' ? (
        photoUrl ? (
          // Copertina esterna (Wikidata/Wikipedia/Commons) — next/image la ottimizza comunque
          // (next.config.js's remotePatterns copre già wikimedia.org/wikipedia.org, stesso pattern
          // di components/guida/widgets/PoiListWidget.tsx): ridimensionamento su misura del device
          // e conversione AVIF/WebP invece di scaricare per intero qualunque risoluzione la fonte
          // restituisca. `priority` perché è l'immagine sopra la piega della pagina (candidata LCP),
          // a differenza dei thumbnail più sotto nello scroll che restano lazy di default.
          // FallbackImage ricade sullo stesso gradiente+icona di "nessuna foto" quando l'URL non si
          // carica per davvero (link morto, hotlink protection...) — verificato dal vivo su Viterbo.
          <FallbackImage src={photoUrl} alt="" fill priority sizes="100vw" className="object-cover"
            fallback={<CoverFallback color={fallbackColor} icon={fallbackIcon} />}
          >
            {/* Attribuzione richiesta dalla licenza CC BY-SA di Wikimedia Commons — solo sopra la
                foto vera (children di FallbackImage), mai sopra il ripiego: non c'è nulla da
                attribuire quando la foto non si è caricata. Vedi app/fonti-e-crediti. */}
            {photoCredit && (
              <span className="absolute top-2.5 right-2.5 bg-black/40 text-white/80 text-[9px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                {photoCredit}
              </span>
            )}
          </FallbackImage>
        ) : (
          <CoverFallback color={fallbackColor} icon={fallbackIcon} />
        )
      ) : hasGps ? (
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
            routeColor="#813619"
            routeWeight={2.5}
            routeOpacity={0.7}
          />
        </div>
      ) : (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #f9e8d0 0%, #dcf0de 100%)' }} />
      )}

      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to top, rgba(31,22,15,0.88) 0%, rgba(31,22,15,0.4) 42%, rgba(31,22,15,0.08) 78%, transparent 100%)',
      }} />

      <div className="absolute bottom-0 left-0 right-0 px-5 sm:px-8 md:px-10 pb-5 md:pb-7">
        <span className="inline-flex items-center gap-1.5 bg-terra-500 text-white text-[8px] font-bold tracking-[2.5px] px-2.5 py-1 rounded-sm mb-2.5 uppercase">
          {badgeIcon && <span className="[&>svg]:w-3 [&>svg]:h-3">{badgeIcon}</span>}
          {categoryBadge}
        </span>
        <h1 className="font-display text-xl sm:text-3xl md:text-4xl font-black text-white leading-tight mb-1 max-w-2xl uppercase tracking-tight"
          style={{ textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}
        >
          {title}
        </h1>
        {locationLabel && (
          <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-white/90">
            <MapPin className="w-3.5 h-3.5" />
            {locationLabel}
          </p>
        )}
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
