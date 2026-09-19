'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ArrowLeft, Loader2, CheckCircle, Search as SearchIcon, RefreshCw, X as XIcon,
  Sparkles, MapPin, Locate, CircleDot, Ruler, Flag, ListFilter, LocateFixed, Map as MapIcon,
} from 'lucide-react'
import LocationPickerMap from '@/components/LocationPickerMap'
import TrailPreviewMap from '@/components/TrailPreviewMap'
import { BuiltRouteCard, PoiPreviewRow, ScorePendingBadge, Map3DChip } from '@/components/RouteResultCard'
import GiuliaSearchPanel from './GiuliaSearchPanel'
import SearchWaitingCard from './SearchWaitingCard'
import * as bgSearch from '@/lib/routeBuilder/backgroundSearchStore'
import type { PlannedHike } from '@/lib/plannedStore'
import { saveResultItemToGuide, resultItemToMap3DProps, defaultTitleForResultItem } from '@/lib/routeBuilder/importResultItem'
import { HIKER_ENVIRONMENT_PREFS, type HikerEnvironmentPrefKey } from '@/lib/hikerProfile'
import { POI_META, type PoiType } from '@/lib/overpass'
import { defaultPendingExpiresAt } from './sharedHelpers'
import type { ScoredCandidate as BuiltCandidate } from '@/lib/routeBuilder/scoreCandidates'
import { routeTypeLabel, type RouteType } from '@/lib/routeBuilder/loopBuilder'
import { resolvePlaceClientFirst } from '@/lib/routeBuilder/resolvePlaceClient'
import type { SearchResultCandidate } from '@/app/api/route-search/route'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'
import { runStepBuild, type BuildParamsCommon } from '@/lib/routeBuilder/runStepBuild'

// Vista 3D dei risultati generati (chip "3D" su BuiltRouteCard, vedi show3D più sotto) —
// dynamic/ssr:false come ogni altro chiamante di RouteMap3D (usa MapLibre GL, client-only), stesso
// pattern di app/guida/GuidaHub.tsx.
const RouteMap3D = dynamic(() => import('@/components/RouteMap3D'), { ssr: false })

type Step = 'start' | 'results' | 'confirm'

const MIN_KM = 1
// Deve coincidere con MAX_TARGET_DISTANCE_KM di app/api/route-build/route.ts — uno slider che
// arriva più in alto di quanto il server accetti produce una richiesta di costruzione respinta
// (400) ogni volta che l'utente sposta la lunghezza oltre questo limite.
const MAX_KM = 15
// Tagli del filtro "raggio di ricerca" — tetto di sicurezza per la generazione, visibile in mappa
// come cerchio attorno al punto cercato. Deve coincidere con ALLOWED_RADIUS_KM di
// app/api/route-build/route.ts.
const RADIUS_OPTIONS_KM = [5, 10, 20, 50, 100] as const
// Cap sui candidati "trovati" dalla chat di Giulia (Livello 2) da tentare di risolvere con una
// traccia reale prima di mostrarli — stesso principio del cap lato server per i livelli 0/1 (vedi
// app/api/route-build/search/route.ts), qui applicato lato client perché la chat è conversazionale.
const MAX_GIULIA_RESOLVE = 3

// Sottoinsieme curato di PoiType proposto nel wizard come "tipo di luogo desiderato" — non tutti i
// tipi hanno senso come obiettivo di una ricerca (es. 'bridge'/'bench' sono troppo comuni/banali
// per essere un criterio utile).
const DESIRABLE_POI_TYPES: PoiType[] = ['waterfall', 'viewpoint', 'spring', 'cave', 'peak', 'pass', 'ruins', 'castle']

// Sottoinsieme di HIKER_ENVIRONMENT_PREFS mostrato QUI (nel wizard "Su misura"): solo 'acqua' ha
// un effetto reale sul punteggio dei percorsi generati (vedi lib/routeBuilder/scoreCandidates.ts's
// environmentScore) — 'ombra'/'poca_folla' non hanno nessuna fonte dati affidabile per stimarle
// (vedi commento in scoreCandidates.ts), 'cani'/'bambini' non sono ancora usate da nessun segnale
// di punteggio. Mostrarle qui suggerirebbe un effetto che non c'è — restano invece selezionabili
// nel profilo (Profilo → Escursionista) come preferenze generali dell'account, solo non azionabili
// da questo algoritmo per ora.
const WIZARD_ENVIRONMENT_PREFS = HIKER_ENVIRONMENT_PREFS.filter(p => p.key === 'acqua')

// Un percorso "costruito" (algoritmo, cammina la rete OSM reale, l'unico prodotto da questo
// componente) o "trovato" (da cache OSM, prodotto dalla ricerca su mappa unificata — vedi
// components/upload/CreaGuidaMapSearch.tsx) — entrambi hanno sempre una traccia reale su mappa.
// Esportato: CreaGuidaMapSearch.tsx importa questo tipo per costruire un candidato "found" da
// salvare con saveResultItemToGuide (lib/routeBuilder/importResultItem.ts), senza duplicarlo.
export type ResultItem =
  | { kind: 'built'; data: BuiltCandidate }
  | { kind: 'found'; data: FoundRouteItem }

/**
 * Wizard "Costruisci un percorso su misura": cammina la rete OSM reale attorno a un punto di
 * partenza (toccato sulla mappa, o risolto per nome) per generare un percorso NUOVO su misura di
 * lunghezza/dislivello/preferenze (lib/routeBuilder/*, app/api/route-build/route.ts) — nessuna
 * chiamata AI per generare, puro calcolo su grafo + arricchimento DTM/POI. Il solo uso dell'AI qui
 * (interruttore useAi) è per risolvere un luogo/POI digitato troppo raro per la risoluzione
 * economica (chat di Giulia, vedi handleFound) — mai per trovare un percorso già documentato
 * altrove: quella ricerca vive ora nella mappa unificata (components/upload/CreaGuidaMapSearch.tsx),
 * questo componente resta raggiungibile solo dal suo FAB "Costruisci su misura". Ogni risultato
 * mostrato ha sempre una traccia reale su mappa, mai solo statistiche testuali.
 */
export default function RouteBuilder({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('start')

  const [lat, setLat] = useState<number | null>(null)
  const [lon, setLon] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  // Un invio (tastiera o pulsante) sul testo appena digitato/modificato centra SOLO la mappa sul
  // luogo risolto, senza avviare la generazione vera — questo stato distingue i due casi: false
  // finché il testo corrente non è stato ancora "confermato" sulla mappa (ogni modifica del testo
  // lo resetta), true una volta risolto e la mappa centrata, così il prossimo invio avvia la
  // generazione vera invece di ripetere solo il centraggio. Vedi confirmQueryOnMap/handlePrimaryAction.
  const [queryMapConfirmed, setQueryMapConfirmed] = useState(false)
  const [searching, setSearching] = useState(false)
  // Il luogo/POI digitato è il punto di partenza esatto, o solo un centro d'interesse nei cui
  // dintorni cercare il miglior aggancio alla rete percorribile (utile per un luogo generico come
  // una città, o un POI senza sentieri esattamente addosso, es. "Cascata del Picchio") — vedi
  // startMode in app/api/route-build/route.ts.
  const [startMode, setStartMode] = useState<'esatto' | 'dintorni'>('esatto')
  // Rivelato automaticamente solo quando la risoluzione economica del luogo digitato non trova
  // nulla — mai un'apertura manuale che implicherebbe di dover scegliere a priori se "cercare con
  // l'AI".
  const [showGiulia, setShowGiulia] = useState(false)
  const [giuliaSeed, setGiuliaSeed] = useState('')
  // Incrementato a ogni nuova escalation (vedi runSuMisura) e usato come `key` di
  // GiuliaSearchPanel: senza, riaprire la chat per una query diversa mentre il pannello precedente
  // era già montato non lo faceva ripartire da zero — restava la stessa istanza React con la
  // vecchia conversazione, e la nuova `initialQuery` non veniva mai inviata (l'effetto che invia il
  // messaggio iniziale gira solo al mount). Forzare un remount è l'unico modo per garantire una
  // chat pulita per ogni escalation.
  const [giuliaSessionId, setGiuliaSessionId] = useState(0)
  // Ogni parametro (ancoraggio, raggio, tipo, lunghezza, destinazione, preferenze) vive come un
  // chip discreto sopra la mappa — vedi lo step "start" sotto — invece che dentro un'unica sezione
  // "Ricerca avanzata" da aprire tutta insieme (bocciata: troppo lunga, copriva la mappa). Un solo
  // foglio alla volta, dismissibile toccando fuori o "Fatto", per tornare subito alla mappa.
  const [openSheet, setOpenSheet] = useState<'ancoraggio' | 'raggio' | 'tipo' | 'lunghezza' | 'destinazione' | 'preferenze' | null>(null)
  // Raggio di ricerca — tetto aggiuntivo per la generazione, mai per allargare oltre il limite di
  // sicurezza esistente (vedi app/api/route-build/route.ts). Mostrato anche come cerchio sulla mappa.
  const [searchRadiusKm, setSearchRadiusKm] = useState<number>(20)
  // Incrementato dal chip "Inquadra tutto" — l'unico modo di inquadrare esplicitamente la mappa
  // (cerchio del raggio o entrambi i punti) oltre a quando arriva un luogo da una ricerca: un
  // tocco/trascinamento diretto dell'utente sulla mappa non sposta più la vista da solo (vedi
  // LocationPickerMap.tsx's suppressNextAutoFitRef), era il comportamento scomodo segnalato.
  const [fitTick, setFitTick] = useState(0)

  // Selezione multipla, non esclusiva: l'utente può cercare/costruire più tipi di percorso insieme
  // (es. sia Anello che Andata e ritorno), risultati mescolati nella stessa lista — vedi
  // toggleRouteType e runBuildForTypes. Sempre almeno un tipo selezionato.
  const [routeTypes, setRouteTypes] = useState<RouteType[]>(['anello'])
  const [targetDistanceKm, setTargetDistanceKm] = useState(8)
  const [targetElevationM, setTargetElevationM] = useState('')
  // Percorso tra 2 punti specifici (partenza + destinazione esatta) — si applica solo ad Andata e
  // ritorno/Solo andata (un anello torna comunque al punto di partenza, una destinazione non ha
  // senso): quando impostata, targetDistanceKm smette di essere un vincolo e diventa un risultato
  // (la lunghezza reale del percorso trovato verso quel punto) — vedi hasDestination lato server
  // (lib/routeBuilder/buildSteps.ts's prepareNetworkStep).
  const [destQuery, setDestQuery] = useState('')
  const [destLat, setDestLat] = useState<number | null>(null)
  const [destLon, setDestLon] = useState<number | null>(null)
  // Quale punto riceve il prossimo tocco sulla mappa — 'partenza' di default, passa a
  // 'destinazione' solo quando l'utente lo sceglie esplicitamente (vedi il pulsante dedicato
  // accanto al campo "Destinazione"), altrimenti un tocco impostato per sbaglio sulla destinazione
  // sposterebbe il punto di partenza senza che l'utente l'abbia scelto.
  const [mapTapTarget, setMapTapTarget] = useState<'partenza' | 'destinazione'>('partenza')
  const [environmentPrefs, setEnvironmentPrefs] = useState<HikerEnvironmentPrefKey[]>([])
  const [desiredPoiTypes, setDesiredPoiTypes] = useState<PoiType[]>([])
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  // Interruttore AI — governa solo l'ultima risorsa per risolvere un luogo/POI digitato troppo
  // raro per la risoluzione economica (chat di Giulia con ricerca web, vedi handleFound/
  // confirmQueryOnMap/runSuMisura): se OFF, quel livello non parte proprio, solo un messaggio
  // d'errore. Parte dal default salvato in profilo (Profilo → AI, components/profilo/
  // SectionAiPrivacy.tsx) ma resta modificabile per questa singola ricerca, finché il default non
  // arriva viene assunto acceso.
  const [useAi, setUseAi] = useState(true)

  const [generating, setGenerating] = useState(false)
  // Avanzamento della pipeline "Su misura" a step (vedi runStepBuild) — sostituisce un unico
  // spinner statico con un feedback reale di cosa sta succedendo, dato che ora sono 2-4 chiamate
  // HTTP in sequenza invece di una sola. Con più tipi di percorso selezionati le chiamate girano in
  // parallelo: l'ultimo stage scritto "vince", non è un contatore preciso per tipo, solo un'indicazione.
  const [buildStage, setBuildStage] = useState('')
  // Candidati "costruiti" dalla generazione — sempre con una traccia reale.
  const [results, setResults] = useState<ResultItem[]>([])
  const [resultsMessage, setResultsMessage] = useState('')

  const [selected, setSelected] = useState<ResultItem | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  // Import in blocco (vedi handleBulkImport): alternativa alla scelta singola (selected/title/date
  // sopra), attivabile solo dallo step "Risultati" — le chiavi sono `${kind}-${indice in results}`.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  const [errorMsg, setErrorMsg] = useState('')
  // Percorso aperto nella vista 3D (chip "3D" sulle card risultati/conferma) — funziona con la sola
  // traccia GPS, senza richiedere un hike già salvato (vedi resultMap3DProps sotto).
  const [show3D, setShow3D] = useState<ResultItem | null>(null)

  // Silenzia la pillola globale (GlobalSearchStatusPill) mentre questo wizard è montato E mostra già
  // il proprio indicatore locale (SearchWaitingCard) per la stessa ricerca — senza questo, l'utente
  // vedrebbe due indicatori ridondanti dello stesso stato. Appena il wizard si smonta (l'utente
  // naviga altrove mentre la ricerca prosegue in background) o la ricerca finisce, il cleanup toglie
  // il silenziamento e la pillola torna a poter comparire.
  useEffect(() => {
    bgSearch.setSuppressed(searching || generating)
    return () => bgSearch.setSuppressed(false)
  }, [searching, generating])

  // Precompila lunghezza/dislivello/preferenze/interruttore AI dallo storico e dal profilo
  // dell'utente (stesso segnale usato da Giulia in route-search) — solo un suggerimento, l'utente
  // resta libero di cambiarlo per questa singola ricerca. Caricato subito al mount (non più solo al
  // primo ingresso nello step dei parametri) perché l'interruttore AI serve già nello step "start".
  useEffect(() => {
    if (defaultsLoaded) return
    setDefaultsLoaded(true)
    fetch('/api/route-build')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.suggestedDistanceKm) setTargetDistanceKm(Math.min(MAX_KM, Math.max(MIN_KM, data.suggestedDistanceKm)))
        if (data?.suggestedElevationM) setTargetElevationM(String(data.suggestedElevationM))
        if (Array.isArray(data?.environmentPrefs)) setEnvironmentPrefs(data.environmentPrefs)
        if (typeof data?.routeBuildAiPlaceSearch === 'boolean') setUseAi(data.routeBuildAiPlaceSearch)
      })
      .catch(() => {})
  }, [defaultsLoaded])

  // Anteprima immediata (con debounce) del luogo digitato: aggiorna solo lat/lon (mai il testo, per
  // non correggere quello che l'utente sta ancora scrivendo) così la mappa e il cerchio del raggio
  // di ricerca si spostano subito, prima ancora di premere il pulsante — sempre senza AI
  // (risoluzione economica, chiamata a ogni pausa nella digitazione: usare qui il livello AI
  // sarebbe uno spreco). La risoluzione "ufficiale" (che rispetta l'interruttore AI e aggiorna
  // anche il testo con il nome risolto) resta quella di runSuMisura, eseguita solo alla conferma.
  useEffect(() => {
    if (!query.trim()) return
    const handle = setTimeout(async () => {
      const place = await resolvePlaceClientFirst(query.trim(), false)
      if (place) { setLat(place.lat); setLon(place.lon) }
    }, 600)
    return () => clearTimeout(handle)
  }, [query])

  // Stessa anteprima immediata, per il campo destinazione (percorso tra 2 punti) — vuoto ⇒
  // nessuna destinazione impostata (destLat/destLon restano null, il percorso resta senza vincolo
  // di punto d'arrivo) — usata come vincolo di generazione.
  useEffect(() => {
    if (!destQuery.trim()) { setDestLat(null); setDestLon(null); return }
    const handle = setTimeout(async () => {
      const place = await resolvePlaceClientFirst(destQuery.trim(), false)
      if (place) { setDestLat(place.lat); setDestLon(place.lon) }
    }, 600)
    return () => clearTimeout(handle)
  }, [destQuery])

  // Il pulsante "tocca la mappa per la destinazione" resta attivo solo finché il campo destinazione
  // ha senso — altrimenti un tocco continuerebbe a muovere il punto sbagliato in una schermata dove
  // il controllo non è nemmeno più visibile.
  useEffect(() => {
    if (!(routeTypes.includes('andata_ritorno') || routeTypes.includes('solo_andata'))) {
      setMapTapTarget('partenza')
    }
  }, [routeTypes])

  // Il chip "Destinazione" è sempre visibile in "Su misura" (non più nascosto dietro la scelta del
  // tipo di percorso, il problema segnalato dall'utente: "non vedo dove poter inserire il secondo
  // punto") — quindi appena una destinazione viene impostata (per nome o col tocco), qui si
  // garantisce che almeno un tipo compatibile sia selezionato, invece di lasciarla silenziosamente
  // senza effetto se l'utente ha lasciato "Anello" (che la ignora per costruzione).
  useEffect(() => {
    if (destLat != null && !(routeTypes.includes('andata_ritorno') || routeTypes.includes('solo_andata'))) {
      setRouteTypes(prev => [...prev, 'andata_ritorno'])
    }
  }, [destLat, routeTypes])

  // Selezione multipla dei tipi di percorso — sempre almeno un tipo attivo, non si può deselezionare
  // l'ultimo rimasto.
  function toggleRouteType(t: RouteType) {
    setRouteTypes(prev => {
      if (prev.includes(t)) return prev.length > 1 ? prev.filter(x => x !== t) : prev
      return [...prev, t]
    })
  }

  function toggleEnvironmentPref(key: HikerEnvironmentPrefKey) {
    setEnvironmentPrefs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function toggleDesiredPoiType(type: PoiType) {
    setDesiredPoiTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }

  // Popolato dalla chat di Giulia quando la risoluzione economica del luogo digitato (query→
  // coordinate) non basta per un nome/POI raro: qui lo scopo è SOLO trovare un punto di partenza
  // utilizzabile, mai cercare un percorso già documentato (quella ricerca vive nella mappa
  // unificata, components/upload/CreaGuidaMapSearch.tsx) — appena un candidato dà un luogo
  // risolvibile (cap MAX_GIULIA_RESOLVE), si chiude la chat e si prosegue subito con la
  // costruzione invece di restare sulla chat.
  async function handleFound(found: SearchResultCandidate[]) {
    let startPoint: { lat: number; lon: number; displayName: string } | null = null
    for (const c of found.slice(0, MAX_GIULIA_RESOLVE)) {
      const q = [c.searchName, c.searchArea].filter(Boolean).join(', ')
      if (!q.trim()) continue
      startPoint = await resolvePlaceClientFirst(q, false)
      if (startPoint) break
    }

    if (startPoint) {
      setShowGiulia(false)
      setLat(startPoint.lat)
      setLon(startPoint.lon)
      setQuery(startPoint.displayName)
      await generate({ lat: startPoint.lat, lon: startPoint.lon })
    } else {
      // Giulia ha risposto ma nessuno dei candidati ha prodotto un luogo risolvibile (es. un punto
      // d'interesse troppo minuto anche per lei) — senza questo ramo la richiesta finiva nel nulla:
      // chat aperta, nessuna card, nessun messaggio, nessun modo di capire cosa fare (bug osservato
      // con "cascata del picchio").
      setErrorMsg('Giulia non è riuscita a individuare un punto di partenza preciso per questo luogo — prova a scrivere diversamente, o tocca la mappa per scegliere il punto di partenza.')
    }
  }

  /** Nucleo condiviso della costruzione algoritmica. Un tipo di percorso selezionato è una
   *  richiesta indipendente (l'algoritmo di generazione è strutturalmente diverso per
   *  anello/andata-ritorno/solo andata) — con più tipi selezionati, gira una pipeline a step per
   *  tipo in parallelo e i risultati si fondono in un'unica lista, ciascuno già etichettato col
   *  proprio tipo (vedi ScoredCandidate.type). Non tocca `errorMsg` direttamente — ritorna il
   *  numero totale di percorsi ottenuti e un eventuale messaggio, lasciando al chiamante decidere
   *  se mostrarlo. */
  async function runBuildForTypes(types: RouteType[], common: BuildParamsCommon): Promise<{ count: number; message: string | null }> {
    setGenerating(true)
    setResultsMessage('')
    setBuildStage('')
    bgSearch.start()
    // Riporta l'avanzamento sia allo stato locale (SearchWaitingCard, mentre il wizard è montato)
    // sia alla pillola globale (visibile anche se l'utente naviga altrove nel frattempo).
    const reportStage = (s: string) => { setBuildStage(s); bgSearch.setStage(s) }
    try {
      const outcomes = await Promise.all(types.map(routeType => runStepBuild(routeType, common, reportStage)))
      const allBuilt = outcomes.flatMap(o => o.candidates)
      const builtItems: ResultItem[] = allBuilt.map(d => ({ kind: 'built' as const, data: d }))
      setResults(prev => [...prev.filter(r => r.kind !== 'built'), ...builtItems])
      const firstEmptyMessage = outcomes.find(o => o.candidates.length === 0)?.message ?? null
      setResultsMessage(allBuilt.length === 0 ? (firstEmptyMessage ?? '') : '')
      if (builtItems.length > 0) bgSearch.finish(allBuilt.length)
      else bgSearch.finishEmpty()
      return { count: allBuilt.length, message: allBuilt.length === 0 ? firstEmptyMessage : null }
    } catch (e) {
      bgSearch.fail('Errore di rete, riprova.')
      throw e
    } finally {
      setGenerating(false)
      setBuildStage('')
    }
  }

  // Accetta un lat/lon esplicito (usato da runSuMisura subito dopo aver risolto un luogo digitato
  // — leggere lo stato lat/lon appena impostato darebbe un valore ancora vecchio, aggiornamenti
  // asincroni) — senza argomento usa lo stato corrente, come chiamato dal pulsante "Genera".
  async function generate(overrideLatLon?: { lat: number; lon: number }) {
    const buildLat = overrideLatLon?.lat ?? lat
    const buildLon = overrideLatLon?.lon ?? lon
    if (buildLat == null || buildLon == null || generating) return
    setErrorMsg('')
    const { count, message } = await runBuildForTypes(routeTypes, {
      lat: buildLat, lon: buildLon, targetDistanceKm,
      targetElevationM: targetElevationM.trim() ? Number(targetElevationM) : null,
      environmentPrefs,
      desiredPoiTypes,
      startMode,
      destinationLat: destLat,
      destinationLon: destLon,
      radiusKm: searchRadiusKm,
    })
    if (count > 0) setStep('results')
    else if (message) setErrorMsg(message)
  }

  // Primo "invio" (tastiera o pulsante) su un testo non ancora confermato — SOLO risolve il luogo e
  // centra la mappa, senza generare nulla: dà all'utente il tempo di verificare di aver trovato il
  // punto giusto prima di avviare la generazione vera (vedi handlePrimaryAction, che intercetta
  // questo caso PRIMA di runSuMisura). Stessa risoluzione economica già usata altrove
  // (resolvePlaceClientFirst).
  async function confirmQueryOnMap() {
    if (searching || generating || !query.trim()) return
    setErrorMsg('')
    setSearching(true)
    try {
      const place = await resolvePlaceClientFirst(query.trim(), useAi)
      if (place) {
        setLat(place.lat)
        setLon(place.lon)
        setQuery(place.displayName)
        setQueryMapConfirmed(true)
        return
      }
      if (useAi) {
        setGiuliaSeed(query.trim())
        setGiuliaSessionId(id => id + 1)
        setShowGiulia(true)
        setOpenSheet(null)
      } else {
        setErrorMsg('Luogo non trovato — prova a scrivere diversamente, tocca la mappa, o attiva l\'AI (chip in basso).')
      }
    } catch {
      setErrorMsg('Errore di rete, riprova.')
    } finally {
      setSearching(false)
    }
  }

  // Azione primaria dello step "Partenza": se c'è un testo, lo risolve come luogo di partenza
  // (stesso motore di risoluzione nome→coordinata già usato altrove), poi genera sempre con
  // l'algoritmo — mai una ricerca di percorsi già documentati.
  async function runSuMisura() {
    if (searching || generating) return
    setErrorMsg('')
    if (!query.trim() || queryMapConfirmed) {
      // Testo assente, o già risolto e la mappa già centrata da confirmQueryOnMap (chiamata prima
      // da handlePrimaryAction quando c'è testo non confermato) — lat/lon sono già quelli giusti,
      // non serve ri-risolvere lo stesso testo una seconda volta.
      await generate()
      return
    }
    // Ramo di sicurezza — con handlePrimaryAction che intercetta sempre il primo invio su un testo
    // non confermato, questo non dovrebbe più accadere, ma resta come fallback robusto (es. una
    // chiamata diretta a runSuMisura da un punto che non passa da handlePrimaryAction).
    setSearching(true)
    try {
      const place = await resolvePlaceClientFirst(query.trim(), useAi)
      if (place) {
        setLat(place.lat)
        setLon(place.lon)
        setQuery(place.displayName)
        await generate({ lat: place.lat, lon: place.lon })
        return
      }
      // Il testo non si è risolto, ma se lat/lon sono già validi (es. tap sulla mappa, o testo
      // rimasto da una ricerca precedente mentre l'utente ha poi scelto un punto sulla mappa) si
      // procede comunque con quelle coordinate invece di bloccare la generazione: il testo nel
      // campo può essere "sporco" senza che il punto scelto sulla mappa lo sia.
      if (lat != null && lon != null) {
        await generate({ lat, lon })
        return
      }
      if (useAi) {
        // Anche il tentativo AI di resolve-place (un'unica chiamata, senza dialogo) non ha
        // trovato nulla — per un luogo/POI davvero raro (una piccola cascata, un toponimo
        // locale) può servire una ricerca web più approfondita e, se serve, una domanda di
        // chiarimento all'utente: la chat completa di Giulia, qui usata solo per individuare il
        // punto di partenza (vedi handleFound).
        setGiuliaSeed(query.trim())
        setGiuliaSessionId(id => id + 1)
        setShowGiulia(true)
        setOpenSheet(null)
      } else {
        setErrorMsg('Luogo non trovato — prova a scrivere diversamente, tocca la mappa, o attiva l\'AI (chip in basso).')
      }
    } catch {
      setErrorMsg('Errore di rete, riprova.')
    } finally {
      setSearching(false)
    }
  }

  // Azione primaria dello step "Partenza": un primo invio su un testo appena digitato/modificato
  // solo centra la mappa (vedi confirmQueryOnMap); un secondo invio, col testo ormai confermato (o
  // campo vuoto), avvia la generazione vera.
  async function handlePrimaryAction() {
    if (query.trim() && !queryMapConfirmed) {
      await confirmQueryOnMap()
      return
    }
    await runSuMisura()
  }

  const defaultTitleFor = defaultTitleForResultItem

  function resultKey(item: ResultItem, i: number): string {
    return `${item.kind}-${i}`
  }

  const resultMap3DProps = resultItemToMap3DProps

  function chooseCandidate(item: ResultItem, i: number) {
    setSelected(item)
    setErrorMsg('')
    setDate('')
    setTitle(defaultTitleFor(item, i))
    setStep('confirm')
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike = await saveResultItemToGuide(selected, title, date, pendingExpiresAt)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  function toggleResultSelect(key: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Import in blocco — a differenza di handleSave (uno alla volta, nome/data scelti dall'utente
  // nello step "Conferma"), qui si salvano più percorsi in sequenza con i valori di default:
  // sequenziale, non in parallelo, perché ciascun salvataggio arricchisce già con DTM/POI (vedi
  // saveResultItemToGuide) — N richieste pesanti insieme sovraccaricherebbero inutilmente le stesse API
  // esterne. Al termine porta all'elenco dei percorsi in attesa (non a una singola guida: con più
  // percorsi importati insieme non ce n'è uno "principale" verso cui navigare).
  async function handleBulkImport() {
    const items = results
      .map((item, i) => ({ item, i }))
      .filter(({ item, i }) => selectedIds.has(resultKey(item, i)))
    if (items.length === 0) return
    setBulkSaving(true)
    setBulkProgress({ done: 0, total: items.length })
    setErrorMsg('')
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      let done = 0
      for (const { item, i } of items) {
        await saveResultItemToGuide(item, defaultTitleFor(item, i), '', pendingExpiresAt)
        done += 1
        setBulkProgress({ done, total: items.length })
      }
      setSelectedIds(new Set())
      setSelectMode(false)
      router.push('/guida/elenco')
    } catch (e) {
      setErrorMsg(`Errore nell'importazione: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBulkSaving(false)
      setBulkProgress(null)
    }
  }

  // Vista 3D di un risultato (results) o del percorso scelto (confirm) — aggiunta alla fine dei
  // rispettivi return sotto, un unico nodo condiviso invece di duplicarne la logica in entrambi.
  const map3DOverlay = show3D && (
    <RouteMap3D {...resultMap3DProps(show3D)} onClose={() => setShow3D(null)} />
  )

  // ── Punto di partenza — la mappa è il fulcro, sempre a pieno schermo e sempre visibile ─────────
  // Layout "a chip" (Concept A del mockup approvato): barra di ricerca + tab modalità flottanti in
  // alto, una fila di chip in basso (uno per parametro, valore sempre leggibile senza aprire nulla),
  // ciascuno apre un foglio breve e mono-tematico invece dell'unica sezione "Ricerca avanzata" di
  // prima (bocciata: copriva fino al 75% della mappa). createPortal su document.body: altrimenti
  // l'elemento "fixed" resterebbe intrappolato dentro il contenitore della pagina, che ha una
  // propria animazione con transform e diventerebbe il suo contenitore di posizionamento,
  // vanificando l'effetto a pieno schermo.
  if (step === 'start') {
    const canGo = !searching && !generating && (query.trim() !== '' || (lat != null && lon != null))
    // Il prossimo invio/tap sul pulsante centrerà solo la mappa (vedi confirmQueryOnMap) invece di
    // avviare la generazione vera — riflesso nell'icona del pulsante stesso, così l'utente capisce
    // cosa sta per succedere senza doverlo scoprire dopo averlo premuto.
    const pendingMapConfirm = query.trim() !== '' && !queryMapConfirmed

    // Solo per il badge sul pulsante Genera — quanti parametri sono stati toccati rispetto al
    // default, cioè quanto c'è "dentro" alla generazione senza dover aprire nessun foglio per saperlo.
    const activeFilterCount = [
      startMode === 'dintorni',
      searchRadiusKm !== 20,
      routeTypes.length > 1 || routeTypes[0] !== 'anello',
      targetDistanceKm !== 8 || targetElevationM.trim() !== '',
      destLat != null,
      environmentPrefs.length > 0 || desiredPoiTypes.length > 0,
    ].filter(Boolean).length

    const sheetTitle: Record<NonNullable<typeof openSheet>, string> = {
      ancoraggio: 'Punto di partenza',
      raggio: 'Raggio di ricerca',
      tipo: 'Tipo di percorso',
      lunghezza: 'Lunghezza e dislivello',
      destinazione: 'Destinazione',
      preferenze: 'Preferenze',
    }

    return createPortal(
      <div className="fixed inset-0 z-[60] bg-stone-100">
        {/* isolate: contiene lo stacking context interno di Leaflet (zoom/attribuzione arrivano a
            z-index 1000 nel proprio CSS) dentro questo div, invece di farlo competere con i
            fratelli sottostanti (barra di ricerca, chip, FAB — tutti a z-10/20/30/40): senza
            questo, in certe condizioni i controlli di Leaflet finivano sopra tutto il resto,
            facendoli sembrare spariti (bug segnalato posizionando il secondo pin). Stesso fix già
            usato in RouteMapSection.tsx per lo stesso problema con MapLibre. */}
        <div className="absolute inset-0 isolate">
          <LocationPickerMap
            lat={lat ?? undefined} lon={lon ?? undefined}
            onPick={(pLat, pLon) => { setLat(pLat); setLon(pLon) }}
            height="100%" rounded={false}
            radiusKm={lat != null && lon != null ? searchRadiusKm : undefined}
            secondaryLat={destLat ?? undefined}
            secondaryLon={destLon ?? undefined}
            onPickSecondary={(pLat, pLon) => { setDestLat(pLat); setDestLon(pLon) }}
            activeTarget={mapTapTarget === 'destinazione' ? 'secondary' : 'primary'}
            fitSignal={fitTick}
          />
        </div>

        {/* ── Inquadra tutto — sostituisce lo zoom-fit automatico ad ogni tocco (scomodo, segnalato
            dall'utente): ora la vista si sposta solo su richiesta esplicita, stesso pattern del
            chip "Inquadra tutto il percorso" di RouteMapSection.tsx. */}
        {lat != null && lon != null && (
          <button onClick={() => setFitTick(t => t + 1)} title="Inquadra tutto"
            className="absolute right-4 z-10 w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-md flex items-center justify-center text-stone-600 hover:text-stone-800 transition-colors"
            style={{ bottom: '172px' }}>
            <LocateFixed className="w-4 h-4" />
          </button>
        )}

        {/* ── Chrome superiore: indietro + barra di ricerca — tutto flottante, la mappa resta
            sempre visibile sotto. */}
        <div className="absolute top-0 left-0 right-0 z-10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <button onClick={onBack}
              className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-md flex items-center justify-center text-stone-600 hover:text-stone-800 transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-white/95 backdrop-blur rounded-2xl shadow-md px-3.5 py-2.5 min-w-0">
              <SearchIcon className="w-4 h-4 text-stone-400 shrink-0" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setQueryMapConfirmed(false) }}
                onKeyDown={e => { if (e.key === 'Enter') handlePrimaryAction() }}
                placeholder="Luogo di partenza (o tocca la mappa)"
                className="flex-1 min-w-0 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
              />
            </div>
          </div>
          {mapTapTarget === 'destinazione' && (
            <p className="text-center text-[11px] font-medium text-terra-700 bg-terra-50 border border-terra-200 rounded-full py-1.5 px-3 mx-auto w-fit shadow-sm">
              Tocca la mappa per la destinazione
            </p>
          )}
        </div>

        {/* ── Fila di chip + banner d'errore: un unico contenitore verticale (flex-col-reverse, non
            due elementi "absolute" indipendenti con un bottom in px fisso) così l'uno non copre mai
            l'altro qualunque sia l'altezza del messaggio d'errore — con due "absolute" separati un
            errore lungo (3 righe) finiva per coprire fisicamente la fila di chip sottostante,
            rendendola invisibile E non cliccabile (bug segnalato: "non riesco a modificare i
            parametri" dopo un errore). */}
        <div className="absolute left-0 right-0 bottom-24 z-10 px-3 flex flex-col-reverse gap-2">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button onClick={() => setOpenSheet('ancoraggio')}
            className="shrink-0 flex items-center gap-1.5 bg-white/95 backdrop-blur shadow-md rounded-full pl-2.5 pr-3 py-2 text-xs font-semibold text-stone-700 whitespace-nowrap">
            <Locate className="w-3.5 h-3.5 text-forest-600" />
            {startMode === 'esatto' ? 'Punto esatto' : 'Dintorni'}
          </button>
          <button onClick={() => setOpenSheet('raggio')}
            className="shrink-0 flex items-center gap-1.5 bg-white/95 backdrop-blur shadow-md rounded-full pl-2.5 pr-3 py-2 text-xs font-semibold text-stone-700 whitespace-nowrap">
            <CircleDot className="w-3.5 h-3.5 text-forest-600" />
            {searchRadiusKm} km
          </button>
          <button onClick={() => setOpenSheet('tipo')}
            className="shrink-0 flex items-center gap-1.5 bg-white/95 backdrop-blur shadow-md rounded-full pl-2.5 pr-3 py-2 text-xs font-semibold text-stone-700 whitespace-nowrap">
            <RefreshCw className="w-3.5 h-3.5 text-forest-600" />
            {routeTypes.length === 1 ? routeTypeLabel(routeTypes[0]) : `${routeTypes.length} tipi`}
          </button>
          <button onClick={() => setOpenSheet('lunghezza')}
            className="shrink-0 flex items-center gap-1.5 bg-white/95 backdrop-blur shadow-md rounded-full pl-2.5 pr-3 py-2 text-xs font-semibold text-stone-700 whitespace-nowrap">
            <Ruler className="w-3.5 h-3.5 text-forest-600" />
            {destLat != null ? 'via destinazione' : `${targetDistanceKm.toFixed(1)} km${targetElevationM.trim() ? ` · +${targetElevationM} m` : ''}`}
          </button>
          <button onClick={() => setOpenSheet('destinazione')}
            className={`shrink-0 flex items-center gap-1.5 backdrop-blur shadow-md rounded-full pl-2.5 pr-3 py-2 text-xs font-semibold whitespace-nowrap ${
              destLat != null ? 'bg-terra-500 text-white' : 'bg-white/95 text-terra-700'
            }`}>
            <Flag className="w-3.5 h-3.5" />
            {destLat != null ? (destQuery.trim() || 'Destinazione impostata') : 'Destinazione'}
          </button>
          <button onClick={() => setOpenSheet('preferenze')}
            className="shrink-0 flex items-center gap-1.5 bg-white/95 backdrop-blur shadow-md rounded-full pl-2.5 pr-3 py-2 text-xs font-semibold text-stone-700 whitespace-nowrap">
            <ListFilter className="w-3.5 h-3.5 text-forest-600" />
            {environmentPrefs.length + desiredPoiTypes.length > 0 ? `${environmentPrefs.length + desiredPoiTypes.length} preferenze` : 'Preferenze'}
          </button>
          {/* AI in coda alla fila, discreto (nessuna etichetta lunga, nessun colore acceso quando
              spento) — resta un ripiego disponibile, non più la prima cosa che si nota. */}
          <button onClick={() => setUseAi(v => !v)}
            className={`shrink-0 flex items-center gap-1.5 backdrop-blur shadow-md rounded-full pl-2.5 pr-3 py-2 text-xs font-medium whitespace-nowrap ${
              useAi ? 'bg-forest-500 text-white' : 'bg-white/70 text-stone-400'
            }`}>
            <Sparkles className="w-3.5 h-3.5" /> AI
          </button>
        </div>

        {errorMsg && (
          <div className="backdrop-blur rounded-xl px-3 py-2 shadow-md text-center bg-red-500/95">
            <p className="text-xs text-white">{errorMsg}</p>
          </div>
        )}
        </div>

        {/* ── Pulsante Genera — sempre raggiungibile, mostra quanti parametri sono attivi. */}
        <button onClick={handlePrimaryAction} disabled={!canGo}
          className="absolute right-4 bottom-5 z-20 w-16 h-16 rounded-full bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white shadow-lg flex items-center justify-center transition-colors">
          {activeFilterCount > 0 && !searching && !generating && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-forest-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-stone-100">
              {activeFilterCount}
            </span>
          )}
          {(searching || generating)
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : pendingMapConfirm ? <MapIcon className="w-5 h-5" />
            : <RefreshCw className="w-5 h-5" />}
        </button>
        {!searching && !generating && pendingMapConfirm && (
          <p className="absolute right-3 top-[124px] z-20 text-[11px] font-medium text-forest-700 bg-white/95 backdrop-blur rounded-full px-3 py-1.5 shadow-md whitespace-nowrap">
            Tocca per centrare la mappa qui
          </p>
        )}
        {(searching || generating) && (
          <SearchWaitingCard stageLabel={searching
            ? (pendingMapConfirm ? 'Centro la mappa…' : 'Risolvo il luogo…')
            : (buildStage || 'Genero il percorso…')} />
        )}

        {/* ── Foglio impostazioni: un solo parametro alla volta, si chiude toccando fuori o "Fatto"
            — mai più di una sezione insieme a coprire la mappa. */}
        {openSheet && (
          <>
            <div className="fixed inset-0 z-30 bg-stone-900/20" onClick={() => setOpenSheet(null)} />
            <div className="fixed left-0 right-0 bottom-0 z-40 bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,0.15)] p-4 pb-6 max-h-[65vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3.5">
                <p className="text-sm font-semibold text-stone-800">{sheetTitle[openSheet]}</p>
                <button onClick={() => setOpenSheet(null)} aria-label="Fatto"
                  className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              {openSheet === 'ancoraggio' && (
                <div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => setStartMode('esatto')}
                      className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                        startMode === 'esatto' ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                      }`}>
                      Il punto di partenza
                    </button>
                    <button type="button" onClick={() => setStartMode('dintorni')}
                      className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                        startMode === 'dintorni' ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                      }`}>
                      Un centro d&apos;interesse nei dintorni
                    </button>
                  </div>
                  <p className="text-xs text-stone-400 mt-2">
                    {startMode === 'dintorni'
                      ? 'Percorsi liberi nella zona: non partono necessariamente da questo punto esatto, ma esplorano l’area entro il raggio scelto — utile per un luogo generico (es. una città) o un punto d’interesse senza sentieri esattamente addosso (es. una cascata).'
                      : 'Il percorso parte esattamente da qui — il raggio scelto resta solo un tetto di sicurezza, non allarga la ricerca.'}
                  </p>
                </div>
              )}

              {openSheet === 'raggio' && (
                <div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {RADIUS_OPTIONS_KM.map(km => (
                      <button key={km} type="button" onClick={() => setSearchRadiusKm(km)}
                        className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          searchRadiusKm === km ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                        }`}>
                        {km} km
                      </button>
                    ))}
                  </div>
                  {startMode === 'esatto' && (
                    <p className="text-xs text-stone-400 mt-2">
                      Con &quot;Il punto di partenza&quot; il raggio è solo un tetto di sicurezza — passa a &quot;Dintorni&quot; per usarlo davvero.
                    </p>
                  )}
                </div>
              )}

              {openSheet === 'tipo' && (
                <div>
                  <p className="text-xs text-stone-400 mb-2">Puoi selezionarne più di uno insieme.</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => toggleRouteType('anello')}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${routeTypes.includes('anello') ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                      Anello
                    </button>
                    <button onClick={() => toggleRouteType('andata_ritorno')}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${routeTypes.includes('andata_ritorno') ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                      Andata e ritorno
                    </button>
                    <button onClick={() => toggleRouteType('solo_andata')}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${routeTypes.includes('solo_andata') ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                      Solo andata
                    </button>
                  </div>
                </div>
              )}

              {openSheet === 'lunghezza' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-stone-600">Lunghezza target</label>
                      <span className="text-sm font-semibold text-stone-800">{targetDistanceKm.toFixed(1)} km</span>
                    </div>
                    <input type="range" min={MIN_KM} max={MAX_KM} step={0.5} value={targetDistanceKm}
                      disabled={destLat != null}
                      onChange={e => setTargetDistanceKm(Number(e.target.value))}
                      className="w-full accent-terra-500 disabled:opacity-40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1">
                      Dislivello target <span className="font-normal text-stone-400">(opzionale, in metri)</span>
                    </label>
                    <input type="number" min={0} value={targetElevationM} onChange={e => setTargetElevationM(e.target.value)}
                      placeholder="es. 300"
                      className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
                  </div>
                  {destLat != null && (
                    <p className="text-xs text-stone-400">
                      Con una destinazione impostata, la lunghezza non è più un vincolo: il percorso segue la via reale verso quel punto.
                    </p>
                  )}
                </div>
              )}

              {openSheet === 'destinazione' && (
                <div>
                  <p className="text-xs text-stone-400 mb-2">Opzionale — percorso tra 2 punti (Andata e ritorno/Solo andata).</p>
                  <div className="flex gap-2">
                    <input value={destQuery} onChange={e => setDestQuery(e.target.value)}
                      placeholder="Es. Rifugio Città di Fano"
                      className="flex-1 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
                    <button type="button" onClick={() => { setMapTapTarget(t => t === 'destinazione' ? 'partenza' : 'destinazione'); setOpenSheet(null) }}
                      title="Tocca la mappa per impostare la destinazione"
                      className="shrink-0 w-10 h-10 rounded-xl border border-stone-300 bg-white text-stone-500 flex items-center justify-center transition-colors">
                      <MapPin className="w-4 h-4" />
                    </button>
                  </div>
                  {destLat != null && (
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-stone-400">Destinazione impostata.</p>
                      <button type="button" onClick={() => { setDestQuery(''); setDestLat(null); setDestLon(null); setMapTapTarget('partenza') }}
                        className="shrink-0 ml-2 text-xs text-stone-400 hover:text-stone-600 underline">
                        Rimuovi
                      </button>
                    </div>
                  )}
                  {destLat == null && destQuery.trim() && (
                    <p className="text-xs text-stone-400 mt-2">Risoluzione del luogo in corso…</p>
                  )}
                </div>
              )}

              {openSheet === 'preferenze' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-2">Preferenze ambientali</label>
                    <div className="flex flex-wrap gap-2">
                      {WIZARD_ENVIRONMENT_PREFS.map(p => (
                        <button key={p.key} onClick={() => toggleEnvironmentPref(p.key)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            environmentPrefs.includes(p.key) ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                          }`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-2">
                      Vorrei incontrare <span className="font-normal text-stone-400">(opzionale)</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {DESIRABLE_POI_TYPES.map(type => (
                        <button key={type} onClick={() => toggleDesiredPoiType(type)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            desiredPoiTypes.includes(type) ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                          }`}>
                          {POI_META[type].emoji} {POI_META[type].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Chat di Giulia (escalation AI) — un foglio a parte, più grande, non condivide lo
            spazio con le impostazioni sopra (si chiudono a vicenda). */}
        {showGiulia && useAi && (
          <>
            <div className="fixed inset-0 z-30 bg-stone-900/20" onClick={() => setShowGiulia(false)} />
            <div className="fixed left-0 right-0 bottom-0 z-40 bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,0.15)] p-4 pb-6 max-h-[75vh] overflow-y-auto space-y-2">
              <div className="flex items-start justify-between gap-2 bg-terra-50 border border-terra-200 rounded-xl px-3 py-2">
                <p className="text-xs text-terra-700">
                  ✨ Luogo raro — provo a individuarlo con Giulia (può farti qualche domanda).
                </p>
                <button type="button" onClick={() => setShowGiulia(false)} aria-label="Chiudi"
                  className="shrink-0 text-terra-400 hover:text-terra-700 transition-colors">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <GiuliaSearchPanel key={giuliaSessionId} onFound={handleFound} initialQuery={giuliaSeed} />
            </div>
          </>
        )}
      </div>,
      document.body,
    )
  }

  // ── Risultati ───────────────────────────────────────────────────────────────

  if (step === 'results') {
    // La generazione produce solo candidati "built" — il filtro/narrowing qui è solo per il tipo
    // (ResultItem resta un'unione perché condivisa con CreaGuidaMapSearch.tsx, che invece salva
    // anche candidati "found" da cache OSM).
    const entries = results
      .map((item, i) => ({ item, i }))
      .filter((e): e is { item: Extract<ResultItem, { kind: 'built' }>; i: number } => e.item.kind === 'built')

    return (
      <>
      <div className={`space-y-3 ${selectMode ? 'pb-20' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => { setStep('start'); setSelectMode(false); setSelectedIds(new Set()) }}
            className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Cambia parametri
          </button>
          {results.length > 1 && (
            <button onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()) }}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${selectMode ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
              {selectMode ? 'Annulla selezione' : 'Seleziona più percorsi'}
            </button>
          )}
        </div>

        {entries.length === 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 text-sm text-stone-600">
            {resultsMessage || 'Nessun percorso generato per questi criteri — prova una lunghezza diversa o un altro punto di partenza.'}
          </div>
        )}

        {entries.map(({ item, i }) => {
          const key = resultKey(item, i)
          const selectable = selectMode ? { selected: selectedIds.has(key), onToggle: () => toggleResultSelect(key) } : undefined
          return <BuiltRouteCard key={key} data={item.data} onChoose={() => chooseCandidate(item, i)} selectable={selectable} onOpen3D={() => setShow3D(item)} />
        })}

        {selectMode && (
          <div className="fixed left-0 right-0 bottom-0 z-40 bg-white border-t border-stone-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-stone-600">
              {selectedIds.size === 0 ? 'Tocca "Seleziona" sulle card che vuoi importare' : `${selectedIds.size} selezionat${selectedIds.size === 1 ? 'o' : 'i'}`}
            </p>
            <button onClick={handleBulkImport} disabled={selectedIds.size === 0 || bulkSaving}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
              {bulkSaving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : 'Importo…'}</>
                : <><CheckCircle className="w-4 h-4" /> {selectedIds.size > 0 ? `Importa ${selectedIds.size}` : 'Importa'}</>}
            </button>
          </div>
        )}

        {errorMsg && selectMode && <p className="text-red-500 text-sm">{errorMsg}</p>}
      </div>
      {map3DOverlay}
      </>
    )
  }

  // ── Conferma ────────────────────────────────────────────────────────────────

  // La generazione produce solo candidati "built" — `selected` qui non è mai "found" (vedi lo step
  // Risultati sopra).
  if (step === 'confirm' && selected && selected.kind === 'built') {
    const builtData = selected.data

    return (
      <>
      <div className="space-y-4">
        <button onClick={() => setStep('results')} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Torna ai risultati
        </button>

        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Nome del percorso</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Data <span className="font-normal text-stone-400">(opzionale)</span></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
          </div>

          <div className="relative isolate">
            <TrailPreviewMap polyline={builtData.routePolyline} />
            <Map3DChip onOpen3D={() => setShow3D(selected)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
              {[
                { label: 'Distanza', val: `${(builtData.distanceMeters / 1000).toFixed(1)} km` },
                { label: `Dislivello +${builtData.hasElevation ? '' : ' (stima)'}`, val: `${builtData.hasElevation ? '' : '~'}${Math.round(builtData.elevationGain)} m` },
                { label: `Quota max${builtData.hasElevation ? '' : ' (stima)'}`, val: `${builtData.hasElevation ? '' : '~'}${Math.round(builtData.altitudeMax)} m` },
                { label: 'Tipo', val: routeTypeLabel(builtData.type) },
              ].map(s => (
                <div key={s.label} className="bg-stone-50 rounded-xl border border-stone-150 p-3">
                  <p className="text-[10px] text-stone-400">{s.label}</p>
                  <p className="text-sm font-semibold text-stone-800">{s.val}</p>
                </div>
              ))}
            </div>
            <ScorePendingBadge />
          </div>

          <PoiPreviewRow pois={builtData.pois ?? []} />

          {builtData.matchNote && <p className="text-sm text-stone-600 leading-relaxed">{builtData.matchNote}</p>}

          {!builtData.hasElevation && (
            <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-sky-50 border border-sky-100 text-xs text-sky-800">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>Dislivello e punteggio sono stimati — verranno calcolati con precisione al salvataggio.</p>
            </div>
          )}
        </div>

        {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
          Salva e apri la guida
        </button>
      </div>
      {map3DOverlay}
      </>
    )
  }

  return null
}
