'use client'
// Pannello di controllo per l'itinerario Borgo/Città personalizzato — la selezione delle tappe
// (tap sui pin, evidenziati/attenuati) resta nella mappa (CreaGuidaMapSearch.tsx, stato
// `personalize`); questo pannello si occupa solo di urbano/misto, distanza/dislivello,
// generazione (app/api/route-build/multi-stop) e salvataggio. Mai un ripiego a linea d'aria: un
// fallimento (lib/routeBuilder/multiStopRoute.ts) è riportato per nome delle tappe coinvolte,
// mai nascosto.
import { useEffect, useState } from 'react'
import { Loader2, X as XIcon, Route as RouteIcon, ChevronUp, ChevronDown } from 'lucide-react'
import TrailPreviewMap from '@/components/TrailPreviewMap'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'
import { saveResultItemToGuide } from '@/lib/routeBuilder/importResultItem'
import { defaultPendingExpiresAt } from './sharedHelpers'

export interface PersonalizeStop { id: string; lat: number; lon: number; name: string; source: 'meta' | 'itinerary' }

const MIN_KM = 1
const MAX_KM = 15

interface MultiStopResponse {
  ok: true
  routePolyline: [number, number][]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
  trackPoints?: FoundRouteItem['track']['trackPoints']
  pois?: FoundRouteItem['pois']
}
interface MultiStopFailure {
  ok: false
  failedLegs: { fromStopIdx: number; toStopIdx: number; reason: 'too_far_from_network' | 'no_path' }[]
  message: string
}

interface Props {
  anchor: { id: string; lat: number; lon: number; name: string }
  stops: PersonalizeStop[]
  color: string
  onRemoveStop: (id: string) => void
  onClose: () => void
  onSaved: (hikeId: string) => void
}

export default function PersonalizeItineraryPanel({ anchor, stops, color, onRemoveStop, onClose, onSaved }: Props) {
  // Richiudibile a barra (stesso pattern del foglio risultati normale, sheetExpanded in
  // CreaGuidaMapSearch.tsx) — a differenza di un vero modale, qui la mappa deve restare
  // raggiungibile per toccare i pin: iniziare già espanso a piena altezza (come prima di questa
  // correzione) lasciava visibile solo una striscia di mappa, troppo piccola per scegliere le
  // tappe. Parte chiuso: si espande solo quando l'utente vuole toccare modalità/distanza/genera.
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<'urbano' | 'misto'>('misto')
  const [distanceKm, setDistanceKm] = useState('')
  const [elevationM, setElevationM] = useState('')
  const [historyIsDecent, setHistoryIsDecent] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(true)

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<MultiStopResponse | null>(null)
  const [failure, setFailure] = useState<MultiStopFailure | null>(null)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

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

  const allPoints = [anchor, ...stops]
  const distanceValue = Number(distanceKm)
  const distanceValid = distanceKm.trim() !== '' && Number.isFinite(distanceValue) && distanceValue >= MIN_KM && distanceValue <= MAX_KM
  const canGenerate = distanceValid && stops.length >= 1 && !generating

  async function generate() {
    if (!canGenerate) return
    setGenerating(true)
    setError('')
    setResult(null)
    setFailure(null)
    try {
      const res = await fetch('/api/route-build/multi-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: allPoints.map(p => ({ lat: p.lat, lon: p.lon })),
          mode,
          targetDistanceKm: distanceValue,
          targetElevationM: elevationM.trim() ? Number(elevationM) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.message || data?.error || 'Generazione non riuscita, riprova.'); return }
      if (data.ok === false) { setFailure(data as MultiStopFailure); return }
      setResult(data as MultiStopResponse)
      setTitle(`${anchor.name} — itinerario personalizzato`)
    } catch {
      setError('Errore di rete, riprova.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    setSaveError('')
    try {
      const found: FoundRouteItem = {
        name: title.trim() || `${anchor.name} — itinerario personalizzato`,
        description: allPoints.map(p => p.name).join(' → '),
        track: {
          trackPoints: result.trackPoints ?? [],
          routePolyline: result.routePolyline,
          distanceMeters: result.distanceMeters,
          elevationGain: result.elevationGain,
          elevationLoss: result.elevationLoss,
          altitudeMax: result.altitudeMax,
          altitudeMin: result.altitudeMin,
          estimatedTimeSeconds: result.estimatedTimeSeconds,
          hasElevation: result.hasElevation,
        },
        pois: result.pois,
      }
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike = await saveResultItemToGuide({ kind: 'found', data: found }, found.name, '', pendingExpiresAt)
      onSaved(hike.id)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Errore nel salvataggio, riprova.')
      setSaving(false)
    }
  }

  return (
    // Niente sfondo a schermo intero: a differenza di "Altri modi" (un vero foglio modale), qui la
    // mappa sotto deve restare toccabile — un tap fuori dal pannello seleziona/deseleziona una
    // tappa, non chiude nulla. Nessun backdrop ⇒ nessun blocco involontario di pan/zoom/tap sui pin.
    <div className="fixed left-0 right-0 bottom-0 z-40 bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,.15)] flex flex-col"
      style={{ maxHeight: expanded ? '66vh' : '104px' }}>
      <div className="relative shrink-0 flex items-center gap-2 px-4 pt-3 pb-2.5 w-full">
        <span className="w-9 h-1 rounded-full bg-stone-200 absolute left-1/2 -translate-x-1/2 top-1.5" />
        <button onClick={() => setExpanded(v => !v)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
          <RouteIcon className="w-4 h-4 shrink-0" style={{ color }} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-stone-800 truncate">Personalizza itinerario — {anchor.name}</span>
            <span className="block text-[11px] text-stone-400">
              {stops.length} tapp{stops.length === 1 ? 'a' : 'e'} scelt{stops.length === 1 ? 'a' : 'e'} · {mode === 'urbano' ? 'urbano' : 'misto'}
              {!expanded && ' · tocca per aprire'}
            </span>
          </span>
          {expanded ? <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" /> : <ChevronUp className="w-4 h-4 text-stone-400 shrink-0" />}
        </button>
        <button onClick={onClose} aria-label="Chiudi personalizzazione"
          className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors shrink-0">
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
      <div className="flex-1 overflow-y-auto px-4 pb-5">
        {!result && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-stone-600 mb-1.5">
                Tappe scelte ({stops.length}) — tocca un pin sulla mappa per aggiungerne o toglierne
              </p>
              {stops.length === 0 ? (
                <p className="text-xs text-stone-400">Nessuna tappa selezionata oltre a {anchor.name}.</p>
              ) : (
                <ol className="flex flex-col gap-1">
                  {stops.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: color }}>{i + 1}</span>
                      <span className="text-xs text-stone-700 truncate flex-1">{s.name}</span>
                      <button onClick={() => onRemoveStop(s.id)} className="text-[11px] text-stone-400 hover:text-red-600 shrink-0">Rimuovi</button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-stone-600 mb-1.5">Modalità</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => setMode('urbano')}
                  className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${mode === 'urbano' ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                  Trekking urbano
                </button>
                <button type="button" onClick={() => setMode('misto')}
                  className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${mode === 'misto' ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                  Trekking misto
                </button>
              </div>
              <p className="text-[11px] text-stone-400 mt-1">
                {mode === 'urbano' ? 'Solo vie di paese/città — nessun sentiero.' : 'Può includere anche sentieri, non solo strade.'}
              </p>
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
            {failure && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <p className="text-xs text-amber-700 font-medium mb-1">{failure.message}</p>
                <ul className="text-[11px] text-amber-600 space-y-0.5">
                  {failure.failedLegs.map((l, i) => (
                    <li key={i}>
                      {allPoints[l.fromStopIdx]?.name ?? '?'} → {allPoints[l.toStopIdx]?.name ?? '?'}: {l.reason === 'too_far_from_network' ? 'troppo lontano da vie percorribili' : 'nessun cammino trovato'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={generate} disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl py-3 transition-colors">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {generating ? 'Genero…' : 'Genera il percorso'}
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <TrailPreviewMap polyline={result.routePolyline} height="200px" />
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-stone-50 rounded-lg border border-stone-100 px-2.5 py-1.5">
                <p className="text-[9px] text-stone-400">Distanza</p>
                <p className="text-xs font-semibold text-stone-800">{(result.distanceMeters / 1000).toFixed(1)} km</p>
              </div>
              <div className="bg-stone-50 rounded-lg border border-stone-100 px-2.5 py-1.5">
                <p className="text-[9px] text-stone-400">Dislivello {!result.hasElevation && '(stima)'}</p>
                <p className="text-xs font-semibold text-stone-800">+{Math.round(result.elevationGain)} m</p>
              </div>
              <div className="bg-stone-50 rounded-lg border border-stone-100 px-2.5 py-1.5">
                <p className="text-[9px] text-stone-400">Tempo stimato</p>
                <p className="text-xs font-semibold text-stone-800">{Math.round(result.estimatedTimeSeconds / 60)} min</p>
              </div>
            </div>
            <ol className="flex flex-col gap-1">
              {allPoints.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: i === 0 ? '#44403c' : color }}>{i === 0 ? 'B' : i}</span>
                  <span className="text-xs text-stone-700 truncate">{p.name}</span>
                </li>
              ))}
            </ol>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo"
              className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest-400" />
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setResult(null)} className="text-xs text-stone-400 hover:text-stone-600 px-3">Rigenera</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-bold text-sm rounded-xl py-3 transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salva e apri la guida
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
