import dynamic from 'next/dynamic'
import { SITE_TYPE_CONFIG, type SiteType } from '@/lib/metaTypes'
import type { ItineraryLeg } from '@/app/api/borgo-itinerary/route'

// Leaflet tocca `window` al modulo — mai importato lato server (stesso pattern già usato in
// app/mete/[id]/page.tsx, l'unico altro punto che monta questa mappa).
const ItineraryMap = dynamic(() => import('@/components/mete/ItineraryMap'), { ssr: false })

export interface BorgoTappeStop {
  id: string
  name: string
  lat: number
  lon: number
  description?: string
  thumbnail?: string
  url?: string
  siteType?: SiteType
  /** Presente solo per passare la tappa a ItineraryMap così com'è (ItineraryStop) — mai letto qui. */
  source: 'archivio' | 'wikipedia'
}

interface Props {
  stops: BorgoTappeStop[]
  /** Centro del Borgo (piano guide-eccellenza, verifica post-piano) — assente insieme a `legs`
   *  quando manca hike.latitude/longitude: la timeline resta comunque utile da sola, mai bloccata
   *  in attesa della mappa. */
  center?: { lat: number; lon: number }
  legs?: ItineraryLeg[]
  color: string
}

/** Timeline verticale delle tappe di un Borgo/Città, in ordine di visita a piedi dal centro (lib/
 *  guideBorgoDetailStops.ts, /api/borgo-itinerary) — dati strutturati mostrati SOPRA il testo
 *  narrativo di Giulia (stesso pattern di PoiListWidget/NaturaWidget: un widget dati + un corpo
 *  AI nella stessa sezione, mai uno al posto dell'altro). Nessuna riga "prosegui verso" qui: quella
 *  narrazione vive nel testo AI (vedi BORGO_LUOGHI_BRIEF in lib/guideProfiles.ts), che la scrive
 *  seguendo questo stesso ordine — qui solo l'ancora visiva (numero, foto, nome) a cui il testo si
 *  aggancia. La mappa sopra la timeline (stessa ItineraryMap già usata dalla scheda di ricerca,
 *  app/mete/[id]/page.tsx — mai duplicata) mostra le stesse tappe con lo stesso numero, più
 *  l'itinerario a piedi reale già calcolato da /api/borgo-itinerary (legs) e prima mai mostrato
 *  qui: un tratto pieno è un cammino reale sulla rete pedonale OSM, tratteggiato è una linea
 *  d'aria di ripiego quando quella tappa risulta isolata dalla rete. */
export default function BorgoTappeWidget({ stops, center, legs, color }: Props) {
  if (stops.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {center && legs && legs.length > 0 && (
        <ItineraryMap center={center} stops={stops} legs={legs} color={color} />
      )}
      <div className="flex flex-col">
      {stops.map((stop, i) => (
        <div key={stop.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="w-6 h-6 shrink-0 rounded-full bg-terra-600 text-white font-barlow font-bold text-xs flex items-center justify-center">
              {i + 1}
            </span>
            {i < stops.length - 1 && <span className="w-px flex-1 bg-terra-100 my-1" />}
          </div>
          <div className={`flex-1 min-w-0 ${i < stops.length - 1 ? 'pb-4' : ''}`}>
            <a
              href={stop.url}
              target={stop.url ? '_blank' : undefined}
              rel={stop.url ? 'noopener noreferrer' : undefined}
              className={`flex gap-2.5 items-start ${stop.url ? 'group' : ''}`}
            >
              {stop.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element -- provenienza esterna (Wikipedia/archivio), non un asset ottimizzabile
                <img src={stop.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-[13.5px] text-stone-800 leading-tight group-hover:text-terra-700 transition-colors">
                  {stop.name}
                  {stop.siteType && (
                    <span className="ml-1.5 font-normal text-[10.5px] text-stone-400">
                      · {SITE_TYPE_CONFIG[stop.siteType]?.label ?? stop.siteType}
                    </span>
                  )}
                </p>
                {stop.description && (
                  <p className="text-[12px] text-stone-500 leading-snug mt-0.5 line-clamp-2">{stop.description}</p>
                )}
              </div>
            </a>
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}
