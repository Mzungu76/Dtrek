'use client'
// Pannello di controllo per l'itinerario Borgo/Città personalizzato — la selezione delle tappe
// (tap sui pin, evidenziati/attenuati) resta nella mappa (CreaGuidaMapSearch.tsx, stato
// `personalize`); questo pannello si occupa solo di urbano/misto, distanza, generazione
// (app/api/route-build/multi-stop) e salvataggio. Nessun campo dislivello: qui il percorso è un
// cammino fra tappe fisse, l'algoritmo non ha alcuna leva per orientarlo verso un dislivello
// target (a differenza della distanza, dove una tratta più corta del minimo può comunque essere
// "allungata" cercando un'alternativa — vedi seekCloserToTarget in multiStopRoute.ts) — un campo
// che non può mai influenzare il risultato sarebbe solo un'opzione fittizia. Il dislivello STIMATO
// del percorso generato resta comunque visibile fra le statistiche del risultato, è solo l'input
// a non avere senso. La generazione dà SEMPRE un risultato (lib/routeBuilder/multiStopRoute.ts non
// fallisce più del tutto): un tratto non collegabile ripiega su una linea d'aria solo per quella
// tratta, segnalata qui esplicitamente, mai nascosta dietro un esito che sembra completo.
import { useEffect, useState } from 'react'
import { Loader2, X as XIcon, Route as RouteIcon, ChevronUp, ChevronDown } from 'lucide-react'
import TrailPreviewMap from '@/components/TrailPreviewMap'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'
import { saveResultItemToGuide } from '@/lib/routeBuilder/importResultItem'
import { defaultPendingExpiresAt } from './sharedHelpers'
import type { MetaType } from '@/lib/metaTypes'

// `metaType`: presente solo per una tappa che coincide con un pin di metaResults (source:'meta',
// vedi CreaGuidaMapSearch.tsx) — 'borgo_citta' abilita il toggle "includi i punti di interesse"
// qui sotto (findBorgoPoi, app/api/route-build/multi-stop/route.ts), le altre tappe non hanno
// punti di interesse "propri" da offrire.
export interface PersonalizeStop { id: string; lat: number; lon: number; name: string; source: 'meta' | 'itinerary'; metaType?: MetaType }

const MIN_KM = 1
const MAX_KM = 15

const MODE_LABEL: Record<'urbano' | 'misto' | 'naturalistico', string> = {
  urbano: 'urbano', misto: 'misto', naturalistico: 'naturalistico',
}

interface MultiStopLegResponse {
  fromStopIdx: number
  toStopIdx: number
  distanceM: number
  real: boolean
  fallbackReason?: 'too_far_from_network' | 'no_path'
}
/** La tappa scelta a mano, o un punto di interesse del Borgo/Città inserito da `includePoi` — non
 *  distinguibili qui: la sequenza intera è quella che `legs[].fromStopIdx/toStopIdx` indicizza,
 *  non le sole tappe inviate nella richiesta (vedi app/api/route-build/multi-stop/route.ts). */
interface MultiStopFullStop { id: string; name: string; lat: number; lon: number }
interface MultiStopResponse {
  ok: true
  stops: MultiStopFullStop[]
  legs: MultiStopLegResponse[]
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

interface Props {
  stops: PersonalizeStop[]
  color: string
  onRemoveStop: (id: string) => void
  onClose: () => void
  onSaved: (hikeId: string) => void
}

export default function PersonalizeItineraryPanel({ stops, color, onRemoveStop, onClose, onSaved }: Props) {
  // Richiudibile a barra (stesso pattern del foglio risultati normale, sheetExpanded in
  // CreaGuidaMapSearch.tsx) — a differenza di un vero modale, qui la mappa deve restare
  // raggiungibile per toccare i pin: iniziare già espanso a piena altezza (come prima di questa
  // correzione) lasciava visibile solo una striscia di mappa, troppo piccola per scegliere le
  // tappe. Parte chiuso: si espande solo quando l'utente vuole toccare modalità/distanza/genera.
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<'urbano' | 'misto' | 'naturalistico'>('misto')
  // Opt-in per tappa (id di PersonalizeStop) — "includi i punti di interesse di {Borgo}" (solo per
  // tappe metaType:'borgo_citta', vedi PersonalizeStop sopra): mai automatico, un itinerario fra
  // Borghi lontani non deve allungarsi di punti che l'utente non ha chiesto di visitare.
  const [includePoiIds, setIncludePoiIds] = useState<Set<string>>(new Set())
  const [distanceKm, setDistanceKm] = useState('')
  const [historyIsDecent, setHistoryIsDecent] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(true)

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<MultiStopResponse | null>(null)
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
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDefaults(false))
  }, [])

  const distanceValue = Number(distanceKm)
  const distanceValid = distanceKm.trim() !== '' && Number.isFinite(distanceValue) && distanceValue >= MIN_KM && distanceValue <= MAX_KM
  const canGenerate = distanceValid && stops.length >= 2 && !generating

  // Qui non c'è scelta fra candidati come nella generazione "su misura" (Modalità A) — il percorso
  // è un unico cammino minimo forzato dalle tappe scelte, la distanza richiesta non può cambiarlo:
  // se si discosta molto, l'unico modo onesto di "rispettare" il limite è dichiararlo, non fingere
  // un rispetto che l'algoritmo non può garantire con tappe fisse.
  const DISTANCE_MISMATCH_THRESHOLD = 0.3
  const distanceMismatch = result && distanceValid
    ? Math.abs(result.distanceMeters / 1000 - distanceValue) / distanceValue > DISTANCE_MISMATCH_THRESHOLD
    : false

  const fakeLegs = result?.legs.filter(l => !l.real) ?? []
  const allLegsFake = result != null && result.legs.length > 0 && fakeLegs.length === result.legs.length

  // `modeOverride`: usato dal suggerimento "prova anche con i sentieri" dopo un risultato con
  // tratti in ripiego in modalità urbano — un modo concreto di "rompere" quel vincolo invece di
  // accontentarsi di una linea d'aria, senza aspettare il re-render dello stato `mode` prima di
  // richiamare la generazione.
  async function generate(modeOverride?: 'urbano' | 'misto' | 'naturalistico') {
    if (!canGenerate) return
    const effectiveMode = modeOverride ?? mode
    setGenerating(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/route-build/multi-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: stops.map(p => ({
            id: p.id, name: p.name, lat: p.lat, lon: p.lon,
            placeId: p.metaType === 'borgo_citta' ? p.id : undefined,
            includePoi: p.metaType === 'borgo_citta' && includePoiIds.has(p.id),
          })),
          mode: effectiveMode,
          targetDistanceKm: distanceValue,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.message || data?.error || 'Generazione non riuscita, riprova.'); return }
      if (modeOverride) setMode(modeOverride)
      setResult(data as MultiStopResponse)
      setTitle(`${stops[0]?.name ?? 'Itinerario'} — itinerario personalizzato`)
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
        name: title.trim() || `${stops[0]?.name ?? 'Itinerario'} — itinerario personalizzato`,
        description: result.stops.map(p => p.name).join(' → '),
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
            <span className="block text-sm font-bold text-stone-800 truncate">
              Personalizza itinerario{stops[0] ? ` — ${stops[0].name}` : ''}
            </span>
            <span className="block text-[11px] text-stone-400">
              {stops.length} tapp{stops.length === 1 ? 'a' : 'e'} scelt{stops.length === 1 ? 'a' : 'e'} · {MODE_LABEL[mode]}
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
                <p className="text-xs text-stone-400">Nessuna tappa selezionata — tocca almeno due pin sulla mappa.</p>
              ) : (
                <ol className="flex flex-col gap-1">
                  {stops.map((s, i) => (
                    <li key={s.id} className="flex flex-col gap-1 py-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: color }}>{i + 1}</span>
                        <span className="text-xs text-stone-700 truncate flex-1">{s.name}</span>
                        <button onClick={() => onRemoveStop(s.id)} className="text-[11px] text-stone-400 hover:text-red-600 shrink-0">Rimuovi</button>
                      </div>
                      {s.metaType === 'borgo_citta' && (
                        <label className="flex items-center gap-1.5 pl-7 text-[11px] text-stone-500">
                          <input type="checkbox" checked={includePoiIds.has(s.id)}
                            onChange={e => setIncludePoiIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(s.id); else next.delete(s.id)
                              return next
                            })}
                            className="w-3.5 h-3.5 accent-forest-600" />
                          Includi i punti di interesse di {s.name}
                        </label>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {stops.length === 1 && (
                <p className="text-[11px] text-terra-600 font-medium mt-1">Serve almeno una seconda tappa per generare un percorso.</p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-stone-600 mb-1.5">Modalità</p>
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => setMode('urbano')}
                  className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${mode === 'urbano' ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                  Trekking urbano
                </button>
                <button type="button" onClick={() => setMode('misto')}
                  className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${mode === 'misto' ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                  Trekking misto
                </button>
                <button type="button" onClick={() => setMode('naturalistico')}
                  className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${mode === 'naturalistico' ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                  Naturalistico
                </button>
              </div>
              <p className="text-[11px] text-stone-400 mt-1">
                {mode === 'urbano' && 'Solo vie di paese/città — nessun sentiero.'}
                {mode === 'misto' && 'Preferisce strade bianche e secondarie, poi sentieri, solo per ultime le strade urbane/provinciali.'}
                {mode === 'naturalistico' && 'Preferisce i sentieri a qualunque altra via, quando possibile.'}
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

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button onClick={() => generate()} disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl py-3 transition-colors">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {generating ? 'Genero…' : 'Genera il percorso'}
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            {fakeLegs.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2">
                <p className="text-xs text-amber-700 font-medium">
                  {allLegsFake
                    ? 'Nessun tratto segue vie reali — solo linee dirette fra le tappe, la rete pedonale disponibile qui non offre un collegamento.'
                    : `${fakeLegs.length} tratt${fakeLegs.length === 1 ? 'o è una linea diretta' : 'i sono linee dirette'} (nessun cammino trovato), il resto segue vie reali.`}
                </p>
                <ul className="text-[11px] text-amber-600 space-y-0.5">
                  {fakeLegs.map((l, i) => (
                    <li key={i}>
                      {result.stops[l.fromStopIdx]?.name ?? '?'} → {result.stops[l.toStopIdx]?.name ?? '?'}: {l.fallbackReason === 'too_far_from_network' ? 'troppo lontano da vie percorribili' : 'nessun cammino trovato nella rete pedonale disponibile'}
                    </li>
                  ))}
                </ul>
                {mode === 'urbano' && (
                  <button onClick={() => generate('misto')} disabled={generating}
                    className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold text-xs rounded-lg py-2 transition-colors">
                    {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {generating ? 'Provo…' : 'Prova includendo anche i sentieri (misto)'}
                  </button>
                )}
              </div>
            )}
            {distanceMismatch && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                Il percorso generato è di {(result.distanceMeters / 1000).toFixed(1)} km — {result.distanceMeters / 1000 > distanceValue ? 'più lungo' : 'più corto'} dei {distanceValue} km richiesti: le tappe scelte non permettono di avvicinarsi di più mantenendo un cammino reale che le tocchi tutte.
              </p>
            )}
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
              {result.stops.map((p, i) => (
                <li key={`${p.id}-${i}`} className="flex items-center gap-2">
                  <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: color }}>{i + 1}</span>
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
