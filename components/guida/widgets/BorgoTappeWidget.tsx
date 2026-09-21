import { SITE_TYPE_CONFIG, type SiteType } from '@/lib/metaTypes'

export interface BorgoTappeStop {
  id: string
  name: string
  description?: string
  thumbnail?: string
  url?: string
  siteType?: SiteType
}

interface Props {
  stops: BorgoTappeStop[]
}

/** Timeline verticale delle tappe di un Borgo/Città, in ordine di visita a piedi dal centro (lib/
 *  guideBorgoDetailStops.ts, /api/borgo-itinerary) — dati strutturati mostrati SOPRA il testo
 *  narrativo di Giulia (stesso pattern di PoiListWidget/NaturaWidget: un widget dati + un corpo
 *  AI nella stessa sezione, mai uno al posto dell'altro). Nessuna riga "prosegui verso" qui: quella
 *  narrazione vive nel testo AI (vedi BORGO_LUOGHI_BRIEF in lib/guideProfiles.ts), che la scrive
 *  seguendo questo stesso ordine — qui solo l'ancora visiva (numero, foto, nome) a cui il testo si
 *  aggancia. */
export default function BorgoTappeWidget({ stops }: Props) {
  if (stops.length === 0) return null

  return (
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
  )
}
