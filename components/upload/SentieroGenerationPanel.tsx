'use client'
// Pannello "Genera percorso" per la mappa di ricerca unificata (CreaGuidaMapSearch.tsx) — riusa il
// motore "su misura" (lib/routeBuilder/runStepBuild.ts, estratto da components/upload/
// RouteBuilder.tsx) scoped al viewport corrente della mappa invece che a un punto scelto a parte:
// il chiamante calcola centro/raggio dalla vista attuale (stesso calcolo di searchCurrentView()) e
// li passa come `origin`, già gated per zoom (SENTIERO_GEN_MIN_ZOOM in CreaGuidaMapSearch.tsx —
// qui non si ripete il controllo, il pannello si apre già sapendo che lo zoom è sufficiente).
// Banner inferiore richiudibile (stesso pattern/altezze di PersonalizeItineraryPanel.tsx), non più
// un foglio a schermo intero: la mappa sotto — e la rail delle 3 famiglie — devono restare
// raggiungibili senza dover prima chiudere questo pannello, non solo dopo esserne usciti.
import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, X as XIcon, Route as RouteIcon, ChevronUp, ChevronDown } from 'lucide-react'
import { BuiltRouteCard } from '@/components/RouteResultCard'
import TrailPreviewMap from '@/components/TrailPreviewMap'
import { runStepBuild, SENTIERO_BUILD_STAGES, type BuildParamsCommon } from '@/lib/routeBuilder/runStepBuild'
import RouteGenerationProgress from './RouteGenerationProgress'
import { routeTypeLabel, type RouteType } from '@/lib/routeBuilder/loopBuilder'
import type { ScoredCandidate as BuiltCandidate } from '@/lib/routeBuilder/scoreCandidates'
import { saveResultItemToGuide } from '@/lib/routeBuilder/importResultItem'
import { defaultPendingExpiresAt } from './sharedHelpers'

const MIN_KM = 1
const MAX_KM = 15
const ROUTE_TYPES: { id: RouteType; label: string }[] = [
  { id: 'anello', label: 'Anello' },
  { id: 'andata_ritorno', label: 'Andata e ritorno' },
  { id: 'solo_andata', label: 'Solo andata' },
]

type Step = 'params' | 'results' | 'confirm'

interface Props {
  origin: { lat: number; lon: number; radiusKm: number }
  onBack: () => void
  onSaved: (hikeId: string) => void
}

export default function SentieroGenerationPanel({ origin, onBack, onSaved }: Props) {
  const [step, setStep] = useState<Step>('params')
  // Parte chiuso (stesso motivo di PersonalizeItineraryPanel.tsx): la mappa e la rail sopra devono
  // restare visibili appena si entra in questa modalità, non solo dopo averla chiusa — si espande
  // solo quando l'utente tocca il banner per compilare i parametri.
  const [expanded, setExpanded] = useState(false)

  const [routeType, setRouteType] = useState<RouteType>('anello')
  const [distanceKm, setDistanceKm] = useState('')
  const [elevationM, setElevationM] = useState('')
  const [historyIsDecent, setHistoryIsDecent] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(true)

  const [generating, setGenerating] = useState(false)
  const [buildStage, setBuildStage] = useState('')
  const [results, setResults] = useState<BuiltCandidate[]>([])
  const [error, setError] = useState('')
  // true solo dopo un primo tentativo (entro i parametri richiesti) senza risultati — offre di
  // "rompere" il vincolo di lunghezza/dislivello invece di lasciare l'utente bloccato. Mai per un
  // errore di rete/server (lì "riprova con parametri diversi" non ha senso).
  const [offerRelax, setOfferRelax] = useState(false)
  const [relaxedResults, setRelaxedResults] = useState(false)

  const [selected, setSelected] = useState<BuiltCandidate | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Precompila da storico solo se "decente" (lib/hikerContext.ts, DECENT_HISTORY_MIN_COUNT) —
  // sotto quella soglia i campi restano vuoti, obbligatori da riempire prima di poter generare
  // (tranne il dislivello, sempre facoltativo).
  useEffect(() => {
    fetch('/api/route-build')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.historyIsDecent) {
          setHistoryIsDecent(true)
          if (data.suggestedDistanceKm) setDistanceKm(String(Math.min(MAX_KM, Math.max(MIN_KM, data.suggestedDistanceKm))))
          if (data.suggestedElevationM) setElevationM(String(data.suggestedElevationM))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDefaults(false))
  }, [])

  const distanceValue = Number(distanceKm)
  const distanceValid = distanceKm.trim() !== '' && Number.isFinite(distanceValue) && distanceValue >= MIN_KM && distanceValue <= MAX_KM
  const canGenerate = distanceValid && !generating

  async function generate(relaxed = false) {
    if (!relaxed && !canGenerate) return
    setGenerating(true)
    setError('')
    setOfferRelax(false)
    setBuildStage('')
    try {
      const common: BuildParamsCommon = {
        lat: origin.lat, lon: origin.lon,
        targetDistanceKm: distanceValue,
        targetElevationM: elevationM.trim() ? Number(elevationM) : null,
        environmentPrefs: [], desiredPoiTypes: [],
        startMode: 'dintorni',
        destinationLat: null, destinationLon: null,
        radiusKm: origin.radiusKm,
      }
      const { candidates, message, reason } = await runStepBuild(routeType, common, setBuildStage, relaxed)
      if (candidates.length > 0) {
        setResults(candidates)
        setRelaxedResults(relaxed)
        setStep('results')
      } else {
        setError(message ?? 'Nessun percorso trovato con questi vincoli — prova una lunghezza diversa.')
        // Solo se il tentativo era ancora entro i parametri richiesti (non già "relaxed") e il
        // motivo è davvero "nessun candidato trovato" (non un errore di rete/server, dove
        // "avvicinati comunque" non avrebbe senso).
        setOfferRelax(!relaxed && reason === 'no_results')
      }
    } catch {
      setError('Errore di rete, riprova.')
    } finally {
      setGenerating(false)
      setBuildStage('')
    }
  }

  function chooseCandidate(c: BuiltCandidate, i: number) {
    setSelected(c)
    setTitle(`${routeTypeLabel(c.type)} generato ${i + 1}`)
    setDate('')
    setSaveError('')
    setStep('confirm')
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setSaveError('')
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike = await saveResultItemToGuide({ kind: 'built', data: selected }, title, date, pendingExpiresAt)
      onSaved(hike.id)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Errore nel salvataggio, riprova.')
      setSaving(false)
    }
  }

  const stepTitle = step === 'params' ? 'Genera un sentiero qui' : step === 'results' ? 'Percorsi generati' : 'Conferma percorso'
  const stepSubtitle = step === 'params'
    ? `${routeTypeLabel(routeType)}${distanceKm.trim() ? ` · ${distanceKm} km` : ''}`
    : step === 'results'
      ? `${results.length} percors${results.length === 1 ? 'o trovato' : 'i trovati'}`
      : selected ? `${(selected.distanceMeters / 1000).toFixed(1)} km` : ''

  return (
    // Niente sfondo a schermo intero (stesso motivo di PersonalizeItineraryPanel.tsx): la mappa e la
    // rail sopra restano toccabili anche col pannello aperto, solo più in basso quando è espanso.
    <div className="fixed left-0 right-0 bottom-0 z-40 bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,.15)] flex flex-col"
      style={{ maxHeight: expanded ? '70vh' : '104px' }}>
      <div className="relative shrink-0 flex items-center gap-2 px-4 pt-3 pb-2.5 w-full">
        <span className="w-9 h-1 rounded-full bg-stone-200 absolute left-1/2 -translate-x-1/2 top-1.5" />
        {step !== 'params' && (
          <button onClick={() => setStep(step === 'confirm' ? 'results' : 'params')} aria-label="Indietro"
            className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors shrink-0">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => setExpanded(v => !v)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
          <RouteIcon className="w-4 h-4 shrink-0 text-terra-600" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-stone-800 truncate">{stepTitle}</span>
            <span className="block text-[11px] text-stone-400 truncate">
              {stepSubtitle}{stepSubtitle && ' · '}{!expanded ? 'tocca per aprire' : ''}
            </span>
          </span>
          {expanded ? <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" /> : <ChevronUp className="w-4 h-4 text-stone-400 shrink-0" />}
        </button>
        <button onClick={onBack} aria-label="Chiudi" className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors shrink-0">
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
      <div className="flex-1 overflow-y-auto px-4 pb-5">
        {step === 'params' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-stone-600 mb-1.5">Tipo di percorso</p>
              <div className="grid grid-cols-3 gap-1.5">
                {ROUTE_TYPES.map(rt => (
                  <button key={rt.id} type="button" onClick={() => setRouteType(rt.id)}
                    className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${routeType === rt.id ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-stone-600 mb-1.5">
                Distanza (km) {!distanceKm.trim() && <span className="text-terra-600 font-bold">— obbligatoria</span>}
              </p>
              <input type="number" inputMode="decimal" min={MIN_KM} max={MAX_KM} step={0.5}
                value={distanceKm} onChange={e => setDistanceKm(e.target.value)}
                placeholder={loadingDefaults ? 'Carico lo storico…' : `${MIN_KM}-${MAX_KM} km`}
                className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest-400" />
              {!historyIsDecent && !loadingDefaults && (
                <p className="text-[11px] text-stone-400 mt-1">Non abbiamo ancora abbastanza escursioni tue per suggerirla — scegli tu.</p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-stone-600 mb-1.5">Dislivello (m) <span className="text-stone-400 font-normal">— facoltativo</span></p>
              <input type="number" inputMode="numeric" min={0}
                value={elevationM} onChange={e => setElevationM(e.target.value)}
                placeholder="Lascia vuoto se non ti importa"
                className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest-400" />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            {offerRelax && !generating && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2">
                <p className="text-xs text-amber-700">
                  Vuoi che provi ad avvicinarmi il più possibile, anche oltre la distanza/dislivello richiesti?
                </p>
                <button onClick={() => generate(true)}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg py-2 transition-colors">
                  Sì, avvicinati il più possibile
                </button>
              </div>
            )}

            {generating ? (
              <RouteGenerationProgress active={generating} stage={buildStage} stages={SENTIERO_BUILD_STAGES} />
            ) : (
              <button onClick={() => generate(false)} disabled={!canGenerate}
                className="w-full flex items-center justify-center gap-2 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl py-3 transition-colors">
                Genera
              </button>
            )}
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-3">
            {relaxedResults && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                Questi percorsi sono i più vicini possibile a {distanceKm} km, ma non rispettano esattamente la distanza richiesta — nella zona scelta non ne esistono di più vicini.
              </p>
            )}
            {results.map((c, i) => (
              <BuiltRouteCard key={i} data={c} onChoose={() => chooseCandidate(c, i)} />
            ))}
          </div>
        )}

        {step === 'confirm' && selected && (
          <div className="space-y-3">
            <TrailPreviewMap polyline={selected.routePolyline} height="200px" />
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-white rounded-lg border border-stone-200 px-2.5 py-1.5">
                <p className="text-[9px] text-stone-400">Distanza</p>
                <p className="text-xs font-semibold text-stone-800">{(selected.distanceMeters / 1000).toFixed(1)} km</p>
              </div>
              <div className="bg-white rounded-lg border border-stone-200 px-2.5 py-1.5">
                <p className="text-[9px] text-stone-400">Dislivello {!selected.hasElevation && '(stima)'}</p>
                <p className="text-xs font-semibold text-stone-800">+{Math.round(selected.elevationGain)} m</p>
              </div>
              <div className="bg-white rounded-lg border border-stone-200 px-2.5 py-1.5">
                <p className="text-[9px] text-stone-400">Tempo stimato</p>
                <p className="text-xs font-semibold text-stone-800">{Math.round(selected.estimatedTimeSeconds / 60)} min</p>
              </div>
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo"
              className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest-400" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest-400" />
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            <button onClick={handleSave} disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-bold text-sm rounded-xl py-3 transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salva e apri la guida
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
