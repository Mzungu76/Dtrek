import dynamic from 'next/dynamic'
import { useState, useMemo, useEffect, useRef } from 'react'
import { ChevronRight, Settings2, EyeOff, Eye, Loader2, ArrowRight, BookOpen } from 'lucide-react'
import { SITE_TYPE_CONFIG } from '@/lib/metaTypes'
import {
  groupStopsIntoTappe, spliceLegsForRemovedStops, effectiveVisitMinutesFor,
  bucketStopsByEffectiveTappa, orderStopsNearestNeighbor, summarizeTappa, buildStraightLegs,
  HALF_DAY_BUDGET_MINUTES, DAY_BUDGET_MINUTES, MULTI_DAY_BUDGET_MINUTES,
  type ItineraryTappa, type ItineraryStopCandidate, type BorgoItineraryOverrides,
} from '@/lib/metaSearch/borgoItinerary'
import type { ItineraryStop, ItineraryLeg } from '@/app/api/borgo-itinerary/route'
import { useCreateSiteGuideFromStop } from '@/lib/useCreateSiteGuideFromStop'
import StopSourceSheet, { type StopSourceSheetData } from './StopSourceSheet'

// Leaflet tocca `window` al modulo — mai importato lato server (stesso pattern già usato in
// app/mete/[id]/page.tsx, l'unico altro punto che monta questa mappa).
const ItineraryMap = dynamic(() => import('@/components/mete/ItineraryMap'), { ssr: false })

interface Props {
  /** Elenco COMPLETO e ordinato delle tappe candidate e i relativi tragitti — la stessa coppia
   *  stops/legs alla radice di BorgoItinerary (mai il sottoinsieme già raggruppato di una singola
   *  Tappa): la personalizzazione (piano guide-eccellenza Fase 2) deve poter ridisegnare i confini
   *  tra tappe, non solo il contenuto di una già decisa. */
  stops: ItineraryStop[]
  legs: ItineraryLeg[]
  center: { lat: number; lon: number }
  /** Budget con cui il server ha prodotto `serverTappe` — riusato per un'anteprima locale
   *  identica finché l'utente non tocca nulla (lib/metaSearch/borgoItinerary.ts's
   *  groupStopsIntoTappe, stessa formula). */
  maxStopsPerTappa: number
  maxMinutesPerTappa: number
  /** Tappe già calcolate dal server (app/api/borgo-itinerary/route.ts's computeTappe — eventuali
   *  pin già CONFERMATI risolti in tragitti reali) — la base da cui parte ogni anteprima. */
  serverTappe: ItineraryTappa[]
  color: string
  /** Personalizzazioni già salvate per questa Meta (planned_hikes.borgo_itinerary_overrides) —
   *  undefined la primissima volta che l'itinerario viene mostrato. */
  savedOverrides: BorgoItineraryOverrides | undefined
  /** Budget-giornata scelto esplicitamente per questa Meta (planned_hikes.
   *  borgo_day_budget_minutes) — undefined quando l'utente non ha mai toccato il selettore
   *  "Mezza giornata/Giornata/Più giorni", nel qual caso `maxMinutesPerTappa` sopra (l'automatico
   *  dal contenuto, già calcolato dal server) resta il valore di partenza. */
  savedDayBudgetMinutes: number | undefined
  placeId: string
  hikeId: string
  /** Persistenza "leggera" (slider/spegnimento) — mai bloccante, stesso pattern già usato per
   *  borgoWalkPolyline in GuideReader: aggiorna lo stato locale della Meta e accoda la
   *  sincronizzazione in background, nessun round-trip sincrono con l'utente in attesa. */
  onOverridesSaved: (overrides: BorgoItineraryOverrides) => void
  /** Stessa persistenza leggera del selettore di durata — verifica utente: "mi dicevi che hai
   *  previsto anche la modifica della durata". */
  onDayBudgetSaved: (dayBudgetMinutes: number) => void
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

function overridesHavePins(overrides: BorgoItineraryOverrides): boolean {
  return Object.values(overrides).some(o => o.tappaIndex != null)
}

// Confronto per valore su una mappa sparsa piccola (poche decine di tappe al massimo) — mai
// bisogno di una diff più sofisticata qui.
function overridesEqual(a: BorgoItineraryOverrides, b: BorgoItineraryOverrides): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Raggruppamento ISTANTANEO lato client (piano guide-eccellenza Fase 2) — stessa formula del
 * server quando non c'è nessun pin di tappa in gioco (nessuna approssimazione: groupStopsIntoTappe
 * è deterministico, stesso input stesso risultato), un'ANTEPRIMA a linee d'aria quando invece
 * l'utente ha spostato manualmente almeno un punto e non ha ancora premuto "Conferma" — quel
 * ricalcolo resta sempre reale e lato server (verifica utente).
 */
function computeLocalTappe(
  stops: ItineraryStop[],
  legs: ItineraryLeg[],
  center: { lat: number; lon: number },
  maxStopsPerTappa: number,
  maxMinutesPerTappa: number,
  overrides: BorgoItineraryOverrides,
): ItineraryTappa[] {
  const disabledIds = new Set(stops.filter(s => overrides[s.id]?.disabled).map(s => s.id))
  const { stops: activeStops, legs: activeLegs } = disabledIds.size > 0
    ? spliceLegsForRemovedStops(stops, legs, disabledIds, center)
    : { stops, legs }
  const visitMinutesForStop = (s: ItineraryStopCandidate) => effectiveVisitMinutesFor(s, overrides)
  const autoTappe = groupStopsIntoTappe(center, activeStops, activeLegs, maxStopsPerTappa, maxMinutesPerTappa, visitMinutesForStop)

  if (!overridesHavePins(overrides)) return autoTappe

  const buckets = bucketStopsByEffectiveTappa(autoTappe, overrides)
  const tappe: ItineraryTappa[] = []
  let cursor = center
  for (const bucketStops of buckets) {
    const ordered = orderStopsNearestNeighbor(cursor, bucketStops)
    const waypoints = [cursor, ...ordered.map(s => ({ lat: s.lat, lon: s.lon }))]
    tappe.push(summarizeTappa(ordered, buildStraightLegs(waypoints), cursor, visitMinutesForStop))
    if (ordered.length > 0) cursor = { lat: ordered[ordered.length - 1].lat, lon: ordered[ordered.length - 1].lon }
  }
  return tappe
}

/** Timeline verticale delle tappe di un Borgo/Città, in ordine di visita a piedi dal centro (lib/
 *  guideBorgoDetailStops.ts, /api/borgo-itinerary) — dati strutturati mostrati SOPRA il testo
 *  narrativo di Giulia (stesso pattern di PoiListWidget/NaturaWidget: un widget dati + un corpo
 *  AI nella stessa sezione, mai uno al posto dell'altro).
 *
 *  Piano guide-eccellenza Fase 2 (verifica utente — slider del tempo di visita, "spegnimento" di
 *  un punto, spostamento manuale tra tappe): il raggruppamento in tappe non è più solo quello
 *  ricevuto dal server, ma ricalcolato qui ad ogni personalizzazione — istantaneo per lo slider e
 *  lo spegnimento (computeLocalTappe sopra, stessa formula esatta del server), un'anteprima in
 *  attesa di conferma per uno spostamento manuale (che richiede sempre un vero ricalcolo lato
 *  server prima di diventare definitivo). */
const DAY_BUDGET_OPTIONS = [
  { minutes: HALF_DAY_BUDGET_MINUTES, label: 'Mezza giornata' },
  { minutes: DAY_BUDGET_MINUTES, label: 'Giornata' },
  { minutes: MULTI_DAY_BUDGET_MINUTES, label: 'Più giorni' },
]

export default function BorgoTappeWidget({
  stops, legs, center, maxStopsPerTappa, maxMinutesPerTappa, serverTappe, color,
  savedOverrides, savedDayBudgetMinutes, placeId, hikeId, onOverridesSaved, onDayBudgetSaved,
}: Props) {
  const [openStopId, setOpenStopId] = useState<string | null>(null)
  const [selectedTappaIdx, setSelectedTappaIdx] = useState(0)
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<BorgoItineraryOverrides>(savedOverrides ?? {})
  const [confirmedOverrides, setConfirmedOverrides] = useState<BorgoItineraryOverrides>(savedOverrides ?? {})
  // maxMinutesPerTappa è già il budget effettivo calcolato dal server (automatico dal contenuto,
  // o il precedente override se già salvato) — la base da cui parte finché l'utente non tocca il
  // selettore "Mezza giornata/Giornata/Più giorni" qui sotto.
  const [dayBudgetMinutes, setDayBudgetMinutes] = useState<number>(savedDayBudgetMinutes ?? maxMinutesPerTappa)
  const [confirmedDayBudgetMinutes, setConfirmedDayBudgetMinutes] = useState<number>(savedDayBudgetMinutes ?? maxMinutesPerTappa)
  const [confirmedTappe, setConfirmedTappe] = useState<ItineraryTappa[]>(serverTappe)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Promozione di una tappa a Guida propria, annidata in questa (piano §51.3) — un solo hook
  // condiviso da tutte le righe: solo una tappa alla volta può essere in creazione.
  const { creatingStopId, createError: createGuideError, createAndOpen: createSiteGuide } = useCreateSiteGuideFromStop(hikeId)

  const hasPins = overridesHavePins(overrides)
  const budgetDirty = dayBudgetMinutes !== confirmedDayBudgetMinutes
  const dirty = !overridesEqual(overrides, confirmedOverrides) || budgetDirty

  const localTappe = useMemo(
    () => computeLocalTappe(stops, legs, center, maxStopsPerTappa, dayBudgetMinutes, overrides),
    [stops, legs, center, maxStopsPerTappa, dayBudgetMinutes, overrides],
  )
  // Una volta confermato uno spostamento manuale, il risultato reale (tragitti sulla rete
  // pedonale) resta mostrato finché l'utente non tocca di nuovo qualcosa — mai ricalcolato in
  // un'anteprima approssimata solo perché un altro slider (o il selettore di durata) è stato
  // sfiorato altrove.
  const tappe = (!hasPins || dirty) ? localTappe : confirmedTappe
  const showConfirmBar = hasPins && dirty

  // Slider/spegnimento/durata (nessun pin coinvolto) — persistiti in background, mai un'attesa
  // per l'utente: appena l'algoritmo locale è già la stessa formula esatta del server, non serve
  // aspettare una risposta per fidarsi del risultato mostrato.
  useEffect(() => {
    if (hasPins || !dirty) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      onOverridesSaved(overrides)
      setConfirmedOverrides(overrides)
      if (budgetDirty) {
        onDayBudgetSaved(dayBudgetMinutes)
        setConfirmedDayBudgetMinutes(dayBudgetMinutes)
      }
    }, 500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [overrides, dayBudgetMinutes, hasPins, dirty, budgetDirty, onOverridesSaved, onDayBudgetSaved])

  if (stops.length === 0) return null

  const activeTappa = tappe[Math.min(selectedTappaIdx, Math.max(tappe.length - 1, 0))]
  const disabledStops = stops.filter(s => overrides[s.id]?.disabled)
  const openStop = stops.find(s => s.id === openStopId)
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

  function setStopOverride(stopId: string, patch: Partial<BorgoItineraryOverrides[string]>) {
    setOverrides(prev => {
      const next = { ...prev, [stopId]: { ...prev[stopId], ...patch } }
      // Nessuna voce residua — mai un default duplicato per un punto tornato allo stato di base.
      if (Object.values(next[stopId]).every(v => v === undefined)) delete next[stopId]
      return next
    })
  }

  function handleCancelMove() {
    setOverrides(confirmedOverrides)
    setDayBudgetMinutes(confirmedDayBudgetMinutes)
    setConfirmError(null)
  }

  async function handleConfirm() {
    setConfirming(true)
    setConfirmError(null)
    try {
      const res = await fetch('/api/borgo-itinerary/apply-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId, hikeId, overrides, ...(budgetDirty ? { dayBudgetMinutes } : {}) }),
      })
      if (!res.ok) {
        // Il messaggio del server (es. "Meta pianificata non trovata" per un 404, sincronizzata
        // solo in background — verifica utente) è più utile di un "riprova" generico sempre
        // uguale: aiuta a distinguere un problema transitorio di rete da uno strutturale.
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error)
      }
      const data = await res.json() as { tappe: ItineraryTappa[] }
      setConfirmedTappe(data.tappe)
      setConfirmedOverrides(overrides)
      onOverridesSaved(overrides)
      if (budgetDirty) {
        setConfirmedDayBudgetMinutes(dayBudgetMinutes)
        onDayBudgetSaved(dayBudgetMinutes)
      }
      setSelectedTappaIdx(0)
    } catch (e) {
      const detail = e instanceof Error && e.message ? ` (${e.message})` : ''
      setConfirmError(`Non è stato possibile ricalcolare i tragitti — riprova${detail}.`)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold text-stone-400">Durata visita</span>
        {DAY_BUDGET_OPTIONS.map(opt => (
          <button
            key={opt.minutes}
            type="button"
            onClick={() => setDayBudgetMinutes(opt.minutes)}
            className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold border transition-colors ${
              dayBudgetMinutes === opt.minutes
                ? 'text-white border-transparent'
                : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
            }`}
            style={dayBudgetMinutes === opt.minutes ? { background: color } : undefined}
          >
            {opt.label}
          </button>
        ))}
      </div>
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
      {activeTappa && activeTappa.legs.length > 0 && (
        // Verifica utente: la mappa non si aggiornava al cambio di tappa — ItineraryMap costruisce
        // la propria istanza Leaflet una sola volta al mount (useEffect con deps []), quindi senza
        // una key che cambia con la tappa selezionata React riusa la stessa istanza già montata e i
        // nuovi stops/legs non vengono mai ridisegnati. La key forza uno smontaggio/rimontaggio
        // pulito (ItineraryMap distrugge già la mappa Leaflet nel cleanup dell'effetto) — include
        // anche i punti spenti: un cambio lì deve ridisegnare i marker attenuati.
        <ItineraryMap
          key={`${selectedTappaIdx}-${disabledStops.map(s => s.id).join(',')}`}
          center={activeTappa.startPoint}
          stops={activeTappa.stops}
          legs={activeTappa.legs}
          color={color}
          dimmedStops={disabledStops}
        />
      )}
      {showConfirmBar && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <p className="text-[12.5px] text-amber-800 leading-snug">
            Spostamento in attesa — conferma per ricalcolare i tragitti reali.
            {confirmError && <span className="block text-red-600 mt-0.5">{confirmError}</span>}
          </p>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={handleCancelMove} disabled={confirming} className="text-[12px] font-semibold text-stone-500 hover:text-stone-700 disabled:opacity-50">
              Annulla
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-terra-600 hover:bg-terra-700 rounded-full px-3 py-1.5 disabled:opacity-60"
            >
              {confirming && <Loader2 className="w-3 h-3 animate-spin" />}
              Conferma
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col">
      {(activeTappa?.stops ?? []).map((stop, i) => {
          const desc = stop.description
          const { preview, isTruncated } = desc ? truncateStopDescription(desc) : { preview: '', isTruncated: false }
          const visitMinutes = effectiveVisitMinutesFor(stop, overrides)
          const isLast = i === (activeTappa?.stops.length ?? 0) - 1
          return (
            <div key={stop.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="w-6 h-6 shrink-0 rounded-full bg-terra-600 text-white font-barlow font-bold text-xs flex items-center justify-center">
                  {numberOffset + i + 1}
                </span>
                {!isLast && <span className="w-px flex-1 bg-terra-100 my-1" />}
              </div>
              <div className={`flex-1 min-w-0 ${!isLast ? 'pb-4' : ''}`}>
                <div className="flex gap-2.5 items-start">
                  {stop.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- provenienza esterna (Wikipedia/archivio), non un asset ottimizzabile
                    <img
                      src={stop.thumbnail}
                      alt=""
                      className="w-11 h-11 rounded-lg object-cover shrink-0"
                      // Alcune fonti d'archivio più vecchie hanno link a immagini non più raggiungibili
                      // (server regionale lento/offline, http:// bloccato come contenuto misto su una
                      // pagina https) — mai un'icona di immagine rotta al posto del punto: nascosta,
                      // il resto della riga (nome/descrizione) resta comunque leggibile.
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
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
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {/* Leggi tutto/Fonte convergono nella stessa pagina di lettura in-app
                          (StopSourceSheet) — mostrato anche senza troncamento quando resta comunque
                          una fonte da citare, altrimenti quella tappa non avrebbe alcun modo di
                          raggiungerla. */}
                      {(isTruncated || stop.url) && (
                        <button
                          type="button"
                          onClick={() => setOpenStopId(stop.id)}
                          className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-terra-600 hover:text-terra-700 whitespace-nowrap"
                        >
                          {isTruncated ? 'Leggi tutto' : 'Fonte'} <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedStopId(v => v === stop.id ? null : stop.id)}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-stone-400 hover:text-stone-600 whitespace-nowrap"
                      >
                        <Settings2 className="w-3.5 h-3.5" /> {formatMinutes(visitMinutes)}
                      </button>
                    </div>
                    {expandedStopId === stop.id && (
                      <div className="mt-2.5 rounded-lg border border-stone-200 bg-stone-50 p-3 flex flex-col gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-stone-500">Tempo di visita</span>
                            <span className="text-[11px] font-semibold text-stone-700">{formatMinutes(visitMinutes)}</span>
                          </div>
                          <input
                            type="range"
                            min={15}
                            max={240}
                            step={15}
                            value={visitMinutes}
                            onChange={e => setStopOverride(stop.id, { visitMinutes: Number(e.target.value) })}
                            className="w-full accent-terra-600"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setStopOverride(stop.id, { disabled: true })}
                            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-stone-500 hover:text-red-600"
                          >
                            <EyeOff className="w-3.5 h-3.5" /> Spegni questo punto
                          </button>
                          {/* Solo una tappa 'archivio' ha un dtrek_places.id reale da promuovere
                              (piano §51.3) — una tappa 'wikipedia' non è ancora una riga di
                              catalogo, mai un placeId fabbricato qui. */}
                          {stop.source === 'archivio' && (
                            <button
                              type="button"
                              onClick={() => createSiteGuide(stop)}
                              disabled={creatingStopId === stop.id}
                              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-terra-600 hover:text-terra-700 disabled:opacity-50"
                            >
                              {creatingStopId === stop.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <BookOpen className="w-3.5 h-3.5" />}
                              Crea Guida di questo Sito
                            </button>
                          )}
                        </div>
                        {createGuideError && creatingStopId == null && (
                          <p className="text-[11.5px] text-red-600">{createGuideError}</p>
                        )}
                        {tappe.length > 0 && (
                          <div>
                            <span className="text-[11px] font-semibold text-stone-500 block mb-1.5">Sposta in</span>
                            <div className="flex flex-wrap gap-1.5">
                              {tappe.map((_, ti) => ti !== selectedTappaIdx && (
                                <button
                                  key={ti}
                                  type="button"
                                  onClick={() => setStopOverride(stop.id, { tappaIndex: ti })}
                                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-stone-600 bg-white border border-stone-200 rounded-full px-2.5 py-1 hover:border-terra-300"
                                >
                                  <ArrowRight className="w-3 h-3" /> Tappa {ti + 1}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setStopOverride(stop.id, { tappaIndex: tappe.length })}
                                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-stone-600 bg-white border border-stone-200 rounded-full px-2.5 py-1 hover:border-terra-300"
                              >
                                <ArrowRight className="w-3 h-3" /> Nuova tappa
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
      })}
      </div>
      {disabledStops.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
          <p className="text-[11px] font-semibold text-stone-500 mb-2">Punti spenti — esclusi dall&apos;itinerario, mai rimossi</p>
          <div className="flex flex-col gap-1.5">
            {disabledStops.map(stop => (
              <div key={stop.id} className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-stone-500 truncate">{stop.name}</span>
                <button
                  type="button"
                  onClick={() => setStopOverride(stop.id, { disabled: undefined })}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-terra-600 hover:text-terra-700 shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" /> Riattiva
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {sheetData && <StopSourceSheet data={sheetData} onClose={() => setOpenStopId(null)} />}
    </div>
  )
}
