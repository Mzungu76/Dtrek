'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import PlacePinMap from '@/components/mete/PlacePinMap'
import PlaceQA from '@/components/mete/PlaceQA'
import type { PlaceDetail } from '@/app/api/places/[id]/route'
import type { BorgoItinerary } from '@/app/api/borgo-itinerary/route'
import { META_TYPE_CONFIG, SITE_TYPE_CONFIG, type SiteType } from '@/lib/metaTypes'
import { ArrowLeft, Building2, Clock, Footprints, Globe, Landmark, Loader2, MapPin, Tag } from 'lucide-react'
import Link from 'next/link'

// Leaflet tocca `window` al modulo — mai importato lato server (stesso pattern già usato per
// MeteSearchMap in app/test-ricerca-mete/page.tsx).
const ItineraryMap = dynamic(() => import('@/components/mete/ItineraryMap'), { ssr: false })

/**
 * Scheda di dettaglio per un Borgo/Città o Sito trovato in ricerca — stessa idea strutturale della
 * scheda di un percorso (copertina piena larghezza con titolo in overlay, riga di pillole
 * informative, sezioni sotto), ma un componente nuovo e leggero, non RouteHub (components/routehub/
 * RouteHub.tsx): quel componente è un hub a carosello con gesture di apertura/chiusura pensato per
 * i percorsi (polyline, DTM, meteo…), non ha senso riadattarlo per un punto statico. Pagina di solo
 * test — dati reali dall'archivio via /api/places/:id, nessuna metrica escursionistica (piano
 * §48.9: mai per una tipologia non-sentiero).
 */
export default function MetaDettaglioPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [place, setPlace] = useState<PlaceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [itinerary, setItinerary] = useState<BorgoItinerary | null>(null)
  const [itLoading, setItLoading] = useState(false)
  const [itError, setItError] = useState<string | null>(null)

  async function generateItinerary() {
    if (!place) return
    setItLoading(true)
    setItError(null)
    try {
      const res = await fetch('/api/borgo-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: place.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
      setItinerary(data as BorgoItinerary)
    } catch (e) {
      setItError(e instanceof Error ? e.message : 'Impossibile generare l\'itinerario')
    } finally {
      setItLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/places/${encodeURIComponent(params.id)}`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
        if (!cancelled) setPlace(data as PlaceDetail)
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Impossibile caricare la scheda') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [params.id])

  if (loading) {
    return (
      <div className={`min-h-screen bg-stone-50 flex items-center justify-center gap-3 text-stone-400 ${MOBILE_TOPBAR_SPACER}`}>
        <Navbar />
        <Loader2 className="w-6 h-6 animate-spin" /><span>Carico…</span>
      </div>
    )
  }

  if (error || !place) {
    return (
      <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
        <Navbar />
        <main className="max-w-[720px] mx-auto px-4 py-8">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 mb-4">
            <ArrowLeft className="w-4 h-4" /> Indietro
          </button>
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error ?? 'Meta non trovata'}</p>
        </main>
      </div>
    )
  }

  const config = META_TYPE_CONFIG[place.metaType]
  const TypeIcon = place.metaType === 'sito' ? Landmark : Building2
  const siteLabel = place.siteType ? SITE_TYPE_CONFIG[place.siteType as SiteType].label : null
  const location = [place.municipality, place.province, place.region].filter(Boolean).join(', ')

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />

      {/* Copertina — stessa idea della hero-header di /guida (foto piena larghezza, titolo in
          overlay in basso), altezza fissa invece del carosello a schermo intero di RouteHub. */}
      <div className="relative h-[42vh] min-h-[240px] max-h-[380px] overflow-hidden">
        {place.imageUrl ? (
          <img src={place.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${config.color}, #2E3A26)` }}>
            <TypeIcon className="w-16 h-16 text-white/25" />
          </div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.15), rgba(0,0,0,.75))' }} />

        <button
          onClick={() => router.back()}
          className="absolute left-4 top-4 flex items-center gap-1.5 bg-black/30 hover:bg-black/45 text-white text-sm font-medium px-3 py-1.5 rounded-full backdrop-blur-sm transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Indietro
        </button>

        <div className="absolute left-5 right-5 bottom-5 sm:left-8 sm:right-8 sm:bottom-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/80 mb-1.5">
            <TypeIcon className="w-3.5 h-3.5" /> {siteLabel ?? config.label}
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">{place.name}</h1>
          {location && (
            <p className="flex items-center gap-1 text-white/80 text-sm mt-1">
              <MapPin className="w-3.5 h-3.5" /> {location}
            </p>
          )}
        </div>
      </div>

      <main className="max-w-[720px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {/* Pillole informative — stesso linguaggio della riga statPills di una scheda percorso
            (icona + etichetta), qui senza nessuna metrica escursionistica. */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="inline-flex items-center gap-1.5 bg-white border border-stone-200 rounded-full px-3 py-1.5 text-xs font-medium text-stone-600">
            <Tag className="w-3.5 h-3.5 text-stone-400" /> {siteLabel ?? config.label}
          </span>
          {place.region && (
            <span className="inline-flex items-center gap-1.5 bg-white border border-stone-200 rounded-full px-3 py-1.5 text-xs font-medium text-stone-600">
              <MapPin className="w-3.5 h-3.5 text-stone-400" /> {place.region}
            </span>
          )}
        </div>

        {place.metaType === 'borgo_citta' && (
          <section className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 mb-4">
            <h2 className="font-display text-base font-semibold text-stone-800 mb-1 flex items-center gap-2">
              <Footprints className="w-4 h-4 text-stone-400" /> Itinerario a piedi
            </h2>
            <p className="text-xs text-stone-400 mb-3">
              Le tappe principali da toccare a piedi, in ordine di visita — dall&apos;archivio e da Wikipedia,
              con il cammino reale sulle vie del centro dove disponibile.
            </p>

            {!itinerary && !itLoading && (
              <button
                onClick={generateItinerary}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-stone-800 text-white"
              >
                <Footprints className="w-4 h-4" /> Genera itinerario
              </button>
            )}

            {itLoading && (
              <div className="flex items-center gap-2 text-sm text-stone-400 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Cerco le tappe e il cammino migliore…
              </div>
            )}

            {itError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-2">{itError}</p>
            )}

            {itinerary && itinerary.stops.length === 0 && (
              <p className="text-sm text-stone-400 py-2">Nessuna tappa trovata nei dintorni — solo l&apos;archivio e Wikipedia, non un elenco esaustivo.</p>
            )}

            {itinerary && itinerary.stops.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-stone-500 mb-3">
                  {itinerary.stops.length} tappe · {(itinerary.totalDistanceM / 1000).toFixed(1)} km ·
                  {' '}~{Math.round(itinerary.estimatedTimeSeconds / 60)} min a piedi
                  {itinerary.legs.some(l => !l.real) && ' · alcuni tratti sono indicativi (linea d\'aria, nessuna via trovata)'}
                </p>
                <ItineraryMap
                  center={{ lat: place.latitude, lon: place.longitude }}
                  stops={itinerary.stops}
                  legs={itinerary.legs}
                  color={config.color}
                />
                <ol className="flex flex-col gap-2 mt-3">
                  {itinerary.stops.map((stop, i) => (
                    <li key={stop.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-stone-50">
                      <span
                        className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: config.color }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-stone-800">{stop.name}</p>
                        {stop.description && (
                          <p className="text-xs text-stone-500 line-clamp-2 mt-0.5">{stop.description}</p>
                        )}
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          {stop.source === 'wikipedia' ? 'da Wikipedia' : 'dall\'archivio'}
                          {stop.url && (
                            <> · <a href={stop.url} target="_blank" rel="noopener noreferrer" className="text-forest-700 hover:underline">apri →</a></>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <button
                  onClick={generateItinerary}
                  disabled={itLoading}
                  className="text-xs text-stone-400 hover:text-stone-600 mt-3"
                >
                  Rigenera itinerario
                </button>
              </div>
            )}
          </section>
        )}

        {(place.description || place.wikipedia) && (
          <section className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 mb-4">
            <h2 className="font-display text-base font-semibold text-stone-800 mb-2">Descrizione</h2>
            {place.description && (
              <p className="text-sm text-stone-600 leading-relaxed">{place.description}</p>
            )}
            {!place.description && place.wikipedia && (
              <>
                <p className="text-sm text-stone-600 leading-relaxed">{place.wikipedia.extract}</p>
                <a href={place.wikipedia.url} target="_blank" rel="noopener noreferrer" className="text-xs text-forest-700 hover:underline mt-2 inline-block">
                  Leggi su Wikipedia →
                </a>
              </>
            )}
          </section>
        )}

        <section className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 mb-4">
          <h2 className="font-display text-base font-semibold text-stone-800 mb-1">Posizione</h2>
          {place.coordinatesApproximate && (
            <p className="text-xs text-amber-600 mb-2">Posizione approssimativa — centro del Comune, non il punto esatto.</p>
          )}
          <PlacePinMap lat={place.latitude} lon={place.longitude} color={config.color} />
        </section>

        {(place.address || place.website || place.officialUrl || place.openingHours != null) && (
          <section className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 mb-4">
            <h2 className="font-display text-base font-semibold text-stone-800 mb-3">Informazioni</h2>
            <div className="flex flex-col gap-2.5 text-sm">
              {place.address && (
                <p className="flex items-start gap-2 text-stone-600"><MapPin className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" /> {place.address}</p>
              )}
              {(place.website || place.officialUrl) && (
                <a href={place.website ?? place.officialUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 text-forest-700 hover:underline">
                  <Globe className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" /> {place.website ?? place.officialUrl}
                </a>
              )}
              {typeof place.openingHours === 'string' && place.openingHours && (
                <p className="flex items-start gap-2 text-stone-600"><Clock className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" /> {place.openingHours}</p>
              )}
            </div>
          </section>
        )}

        <section className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 mb-4">
          <h2 className="font-display text-base font-semibold text-stone-800 mb-2">Fonti</h2>
          <p className="text-xs text-stone-400">
            Dato aggregato da {place.sourceCount} {place.sourceCount === 1 ? 'fonte' : 'fonti'} · confidenza {place.confidence.toFixed(2)}
          </p>
          <Link href="/fonti-e-crediti" className="text-xs text-forest-700 hover:underline mt-1 inline-block">Fonti e crediti →</Link>
        </section>

        <PlaceQA
          placeId={place.id}
          placeFallback={{
            name: place.name,
            metaType: place.metaType,
            siteType: place.siteType,
            description: place.description,
            region: place.region,
            province: place.province,
            municipality: place.municipality,
            address: place.address,
          }}
        />
      </main>
    </div>
  )
}
