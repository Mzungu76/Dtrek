import dynamic from 'next/dynamic'
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { SITE_TYPE_CONFIG } from '@/lib/metaTypes'
import type { ItineraryTappa } from '@/lib/metaSearch/borgoItinerary'
import StopSourceSheet, { type StopSourceSheetData } from './StopSourceSheet'

// Leaflet tocca `window` al modulo — mai importato lato server (stesso pattern già usato in
// app/mete/[id]/page.tsx, l'unico altro punto che monta questa mappa).
const ItineraryMap = dynamic(() => import('@/components/mete/ItineraryMap'), { ssr: false })

interface Props {
  /** Già raggruppate in tappe percorribili dal server (app/api/borgo-itinerary/route.ts's
   *  computeTappe — tempo di visita per tipo + storico reale/preferenza dell'utente), mai
   *  ricalcolate qui: la personalizzazione ha bisogno di dati solo lato server (lib/hikerHistory.ts).
   *  Sempre almeno una tappa quando ci sono punti da mostrare — mai vuoto insieme a stops non vuoti. */
  tappe: ItineraryTappa[]
  color: string
}

// Verifica utente: le descrizioni delle tappe sono ora più lunghe (testo esteso Wikipedia via
// lib/guideBorgoDetailStops.ts's enrichStopDescriptions, non più il breve estratto della
// geosearch) — un muro di testo sempre aperto sarebbe eccessivo per una timeline pensata per essere
// scorsa rapidamente, quindi resta troncata di default con un "Leggi tutto" che apre la lettura
// completa in StopSourceSheet, mai un line-clamp fisso senza via d'uscita.
const PREVIEW_CHARS = 160

function truncateStopDescription(text: string): { preview: string; isTruncated: boolean } {
  if (text.length <= PREVIEW_CHARS) return { preview: text, isTruncated: false }
  const cut = text.slice(0, PREVIEW_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return { preview: `${cut.slice(0, lastSpace > 0 ? lastSpace : PREVIEW_CHARS)}…`, isTruncated: true }
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Timeline verticale delle tappe di un Borgo/Città, in ordine di visita a piedi dal centro (lib/
 *  guideBorgoDetailStops.ts, /api/borgo-itinerary) — dati strutturati mostrati SOPRA il testo
 *  narrativo di Giulia (stesso pattern di PoiListWidget/NaturaWidget: un widget dati + un corpo
 *  AI nella stessa sezione, mai uno al posto dell'altro). Nessuna riga "prosegui verso" qui: quella
 *  narrazione vive nel testo AI (vedi BORGO_LUOGHI_BRIEF in lib/guideProfiles.ts), che la scrive
 *  seguendo questo stesso ordine — qui solo l'ancora visiva (numero, foto, nome) a cui il testo si
 *  aggancia.
 *
 *  Verifica utente — una città grande può restituire molte più tappe di quante ne stia bene
 *  visitare in un'unica camminata: l'elenco ordinato viene diviso in "Tappe" percorribili lato
 *  server (max 6 punti o un budget di TEMPO — cammino + visita, personalizzato sullo storico reale
 *  o sulla preferenza dell'utente — quale dei due si esaurisce prima), ciascuna con la propria
 *  mappa e la propria mini-timeline; un selettore a chip appare solo quando ce n'è più di una — per
 *  un borgo piccolo (il caso comune) resta un'unica tappa, nessun cambiamento visibile. Le stesse
 *  fondamenta (una "Tappa" con punti/tragitto/tempo propri) serviranno anche per i futuri cammini
 *  multi-giorno (Francigena e simili), lì con tappe scandite da un percorso predefinito invece che
 *  da questo clustering algoritmico. */
export default function BorgoTappeWidget({ tappe, color }: Props) {
  const [openStopId, setOpenStopId] = useState<string | null>(null)
  const [selectedTappaIdx, setSelectedTappaIdx] = useState(0)

  if (tappe.length === 0) return null

  const activeTappa = tappe[Math.min(selectedTappaIdx, tappe.length - 1)]
  const allStops = tappe.flatMap(t => t.stops)
  const openStop = allStops.find(s => s.id === openStopId)
  const sheetData: StopSourceSheetData | null = openStop ? {
    name: openStop.name,
    description: openStop.description,
    thumbnail: openStop.thumbnail,
    url: openStop.url,
    sourceLabel: openStop.source === 'wikipedia' ? 'su Wikipedia' : 'la fonte',
  } : null

  // Numerazione GLOBALE (continua tra le tappe, non riparte da 1 ad ogni tappa) — quanti punti
  // precedono la tappa selezionata nell'ordine di visita complessivo.
  const numberOffset = tappe.slice(0, selectedTappaIdx).reduce((n, t) => n + t.stops.length, 0)

  return (
    <div className="flex flex-col gap-4">
      {tappe.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {tappe.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedTappaIdx(i)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
                i === selectedTappaIdx
                  ? 'text-white border-transparent'
                  : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
              }`}
              style={i === selectedTappaIdx ? { background: color } : undefined}
            >
              Tappa {i + 1} <span className="font-normal opacity-80">· {t.stops.length} {t.stops.length === 1 ? 'punto' : 'punti'} · {formatMinutes(t.totalMinutes)}</span>
            </button>
          ))}
        </div>
      )}
      {activeTappa.legs.length > 0 && (
        // Verifica utente: la mappa non si aggiornava al cambio di tappa — ItineraryMap costruisce
        // la propria istanza Leaflet una sola volta al mount (useEffect con deps []), quindi senza
        // una key che cambia con la tappa selezionata React riusa la stessa istanza già montata e i
        // nuovi stops/legs non vengono mai ridisegnati. La key forza uno smontaggio/rimontaggio
        // pulito (ItineraryMap distrugge già la mappa Leaflet nel cleanup dell'effetto).
        <ItineraryMap key={selectedTappaIdx} center={activeTappa.startPoint} stops={activeTappa.stops} legs={activeTappa.legs} color={color} />
      )}
      <div className="flex flex-col">
      {activeTappa.stops.map((stop, i) => {
          const desc = stop.description
          const { preview, isTruncated } = desc ? truncateStopDescription(desc) : { preview: '', isTruncated: false }
          return (
            <div key={stop.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="w-6 h-6 shrink-0 rounded-full bg-terra-600 text-white font-barlow font-bold text-xs flex items-center justify-center">
                  {numberOffset + i + 1}
                </span>
                {i < activeTappa.stops.length - 1 && <span className="w-px flex-1 bg-terra-100 my-1" />}
              </div>
              <div className={`flex-1 min-w-0 ${i < activeTappa.stops.length - 1 ? 'pb-4' : ''}`}>
                <div className="flex gap-2.5 items-start">
                  {stop.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- provenienza esterna (Wikipedia/archivio), non un asset ottimizzabile
                    <img src={stop.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[13.5px] text-stone-800 leading-tight">
                      {stop.name}
                      {stop.siteType && (
                        <span className="ml-1.5 font-normal text-[10.5px] text-stone-400">
                          · {SITE_TYPE_CONFIG[stop.siteType]?.label ?? stop.siteType}
                        </span>
                      )}
                    </p>
                    {desc && (
                      <p className="text-[12px] text-stone-500 leading-snug mt-0.5">{preview}</p>
                    )}
                    {/* Leggi tutto/Fonte convergono nella stessa pagina di lettura in-app
                        (StopSourceSheet) — mostrato anche senza troncamento quando resta comunque
                        una fonte da citare, altrimenti quella tappa non avrebbe alcun modo di
                        raggiungerla. */}
                    {(isTruncated || stop.url) && (
                      <button
                        type="button"
                        onClick={() => setOpenStopId(stop.id)}
                        className="mt-0.5 inline-flex items-center gap-0.5 text-[12px] font-semibold text-terra-600 hover:text-terra-700 whitespace-nowrap"
                      >
                        {isTruncated ? 'Leggi tutto' : 'Fonte'} <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
      })}
      </div>
      {sheetData && <StopSourceSheet data={sheetData} onClose={() => setOpenStopId(null)} />}
    </div>
  )
}
