'use client'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Car, Clock } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

const CAROUSEL_INTERVAL_MS = 5000

interface HeroPhoto { id: string; url: string }

interface Props {
  trackPoints?: TrackPoint[]
  title: string
  categoryBadge: string
  startTime: string
  /** Foto per il carosello di sfondo (copertina scelta/automatica per prima) — quando presenti
   *  sostituiscono la mappa recolorata, a differenza di Guida (percorso non ancora fatto, mai
   *  foto proprie disponibili): un'escursione conclusa ha quasi sempre scatti reali più
   *  significativi della sola traccia GPS. Con più di una foto, l'hero le alterna in dissolvenza. */
  heroPhotos?: HeroPhoto[]
  /** Distanza in auto dall'indirizzo salvato nelle impostazioni fino al trailhead — mostrata
   *  sotto la data, apre le indicazioni Google Maps al tap. */
  driving?: { distanceMeters: number; mapsUrl?: string } | null
  /** Meteo del giorno dell'escursione (vedi lib/openmeteo.ts wmoInfo) — chip discreto accanto
   *  alla data, invece di restare visibile solo nel widget "Dati e punteggi". */
  weatherIcon?: { emoji: string; label: string } | null
  /** Minuti di lettura stimati del racconto (~200 parole/min) — assente finché non esiste ancora
   *  un racconto generato/scritto. */
  readingMinutes?: number
}

/**
 * Hero del resoconto — stessa impaginazione dell'hero di Guida (badge categoria, titolo,
 * data, chip distanza in auto), ma con carosello di foto reali dell'escursione quando disponibili
 * invece della sola mappa ricolorata (usata comunque come sfondo di riserva quando non c'è ancora
 * nessuna foto).
 */
export default function ReportHero({ trackPoints, title, categoryBadge, startTime, heroPhotos, driving, weatherIcon, readingMinutes }: Props) {
  const points = useMemo(
    () => (trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined),
    [trackPoints],
  )
  const hasGps = points.length > 1
  const photos = heroPhotos ?? []

  const [activePhoto, setActivePhoto] = useState(0)
  useEffect(() => {
    setActivePhoto(0)
    if (photos.length <= 1) return
    const id = setInterval(() => setActivePhoto(i => (i + 1) % photos.length), CAROUSEL_INTERVAL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map(p => p.id).join(',')])

  return (
    <div
      className="relative w-full overflow-hidden [--hero-h:clamp(200px,50vw,300px)] md:[--hero-h:clamp(240px,32vw,380px)] lg:[--hero-h:clamp(280px,26vw,460px)]"
      style={{ height: 'var(--hero-h)' }}
    >
      {photos.length > 0 ? (
        photos.map((ph, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- foto propria dell'utente (Supabase Storage), non ottimizzabile da next/image senza un loader remoto dedicato
          <img
            key={ph.id}
            src={ph.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            style={{ filter: 'saturate(1.1) contrast(1.03)', opacity: i === activePhoto ? 1 : 0 }}
          />
        ))
      ) : hasGps ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ filter: 'sepia(0.4) saturate(1.7) hue-rotate(-8deg) brightness(1.12) contrast(0.9)' }}
        >
          <MapView
            trackPoints={points}
            height="100%"
            interactive={false}
            bare
            showEndpointMarkers={false}
            routeColor="#193b20"
            routeWeight={2.5}
            routeOpacity={0.7}
          />
        </div>
      ) : (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #dcf0de 0%, #f9e8d0 100%)' }} />
      )}

      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to top, rgba(15,26,17,0.88) 0%, rgba(15,26,17,0.4) 42%, rgba(15,26,17,0.08) 78%, transparent 100%)',
      }} />

      {photos.length > 1 && (
        <div className="absolute top-3 sm:top-4 right-3 sm:right-4 flex items-center gap-1.5 z-10">
          {photos.map((ph, i) => (
            <button
              key={ph.id}
              onClick={() => setActivePhoto(i)}
              aria-label={`Foto ${i + 1}`}
              className="w-1.5 h-1.5 rounded-full transition-all"
              style={{ background: i === activePhoto ? 'white' : 'rgba(255,255,255,0.4)', transform: i === activePhoto ? 'scale(1.4)' : undefined }}
            />
          ))}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 px-5 sm:px-8 md:px-10 pb-5 md:pb-7">
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className="inline-block bg-forest-600 text-white text-[8px] font-bold tracking-[2.5px] px-2.5 py-1 rounded-sm uppercase">
            {categoryBadge}
          </span>
          {weatherIcon && (
            <span className="inline-flex items-center gap-1 bg-black/35 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-1 rounded-sm" title={weatherIcon.label}>
              <span className="text-[13px] leading-none">{weatherIcon.emoji}</span> {weatherIcon.label}
            </span>
          )}
          {readingMinutes != null && (
            <span className="inline-flex items-center gap-1 text-white/70 text-[11px] font-medium">
              <Clock className="w-3 h-3" /> {readingMinutes} min di lettura
            </span>
          )}
        </div>
        <h1 className="font-display text-xl sm:text-3xl md:text-4xl font-black text-white leading-tight mb-1 max-w-2xl uppercase tracking-tight"
          style={{ textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}
        >
          {title}
        </h1>
        <p className="text-[12px] italic text-white/70">
          {format(new Date(startTime), 'EEEE d MMMM yyyy', { locale: it })}
        </p>
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
      </div>
    </div>
  )
}
