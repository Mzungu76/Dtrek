'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ChevronRight, Loader2, TrendingUp, CheckCircle, Search as SearchIcon, RefreshCw, X as XIcon, Sparkles,
} from 'lucide-react'
import LocationPickerMap from '@/components/LocationPickerMap'
import TrailPreviewMap from '@/components/TrailPreviewMap'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { NamedPoiIcon, GroupPoiBadge } from '@/components/PoiIconChip'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { downsamplePolyline } from '@/lib/downsamplePolyline'
import { fetchPoisNearTrack } from '@/lib/poisProxy'
import { fetchWikiForNamedPois, isSpecificName } from '@/lib/wikipedia'
import { computeCtsForHike, computeCtsCore } from '@/lib/computeCtsForHike'
import { computeSafetyForHike, computeSafetyCore } from '@/lib/computeSafetyForHike'
import { computeTrailScoreV2 } from '@/lib/trailScoreV2'
import { HIKER_ENVIRONMENT_PREFS, type HikerEnvironmentPrefKey } from '@/lib/hikerProfile'
import { POI_META, type PoiItem, type PoiType } from '@/lib/overpass'
import { defaultPendingExpiresAt } from './sharedHelpers'
import type { ScoredCandidate as BuiltCandidate } from '@/lib/routeBuilder/scoreCandidates'

type Step = 'start' | 'params' | 'results' | 'confirm'
type RouteType = 'anello' | 'andata_ritorno'

interface GeocodeResult { lat: string; lon: string; display_name: string }

const MIN_KM = 1
const MAX_KM = 20

// Sottoinsieme curato di PoiType proposto nel wizard come "tipo di luogo desiderato" — non tutti i
// tipi hanno senso come obiettivo di una ricerca (es. 'bridge'/'bench' sono troppo comuni/banali
// per essere un criterio utile).
const DESIRABLE_POI_TYPES: PoiType[] = ['waterfall', 'viewpoint', 'spring', 'cave', 'peak', 'pass', 'ruins', 'castle']

interface CandidateScorePreview {
  total: number | null
  safety: { overall: number; color: string; label: string } | null
  vetoed: boolean
  loading: boolean
}

function PoiPreviewRow({ pois }: { pois: PoiItem[] }) {
  if (pois.length === 0) return null
  const named: PoiItem[] = []
  const groups = new Map<PoiType, PoiItem[]>()
  for (const poi of pois) {
    if (poi.name && isSpecificName(poi.name)) named.push(poi)
    else {
      const arr = groups.get(poi.type)
      if (arr) arr.push(poi)
      else groups.set(poi.type, [poi])
    }
  }
  return (
    <div data-hscroll className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
      {named.map(poi => <NamedPoiIcon key={poi.id} poi={poi} highlighted={false} />)}
      {Array.from(groups.entries()).map(([type, ps]) => <GroupPoiBadge key={type} type={type} pois={ps} />)}
    </div>
  )
}

/**
 * Wizard "Costruisci un percorso": a differenza di AiRouteSearch (che cerca un percorso già
 * documentato), qui il percorso viene generato camminando sulla rete OSM reale attorno a un punto
 * di partenza (vedi lib/routeBuilder/*, app/api/route-build/route.ts) — nessuna chiamata AI, puro
 * calcolo su grafo + arricchimento DTM/POI.
 */
export default function RouteBuilder({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('start')

  const [lat, setLat] = useState<number | null>(null)
  const [lon, setLon] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResult[]>([])
  const [geocoding, setGeocoding] = useState(false)

  const [routeType, setRouteType] = useState<RouteType>('anello')
  const [targetDistanceKm, setTargetDistanceKm] = useState(8)
  const [targetElevationM, setTargetElevationM] = useState('')
  const [environmentPrefs, setEnvironmentPrefs] = useState<HikerEnvironmentPrefKey[]>([])
  const [desiredPoiTypes, setDesiredPoiTypes] = useState<PoiType[]>([])
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  // Terzo livello (AI + ricerca web) della risoluzione di un luogo noto per nome — vedi
  // lib/routeBuilder/resolvePlace.ts. Parte dal default salvato in profilo (Profilo → AI,
  // components/profilo/SectionAiPrivacy.tsx) ma resta modificabile per questa singola ricerca,
  // finché il default non arriva viene assunto acceso (stesso default OFF-to-ON dell'app).
  const [useAi, setUseAi] = useState(true)

  // Destinazione esatta (solo per andata_ritorno) — un luogo noto risolto per nome, usato come
  // destinazione fissa invece di lasciare che l'algoritmo scelga in base a lunghezza/direzione.
  const [destQuery, setDestQuery] = useState('')
  const [destGeocodeResults, setDestGeocodeResults] = useState<GeocodeResult[]>([])
  const [destGeocoding, setDestGeocoding] = useState(false)
  const [destLat, setDestLat] = useState<number | null>(null)
  const [destLon, setDestLon] = useState<number | null>(null)
  const [destDisplayName, setDestDisplayName] = useState('')

  const [generating, setGenerating] = useState(false)
  const [candidates, setCandidates] = useState<BuiltCandidate[]>([])
  const [resultsMessage, setResultsMessage] = useState('')
  const [scores, setScores] = useState<CandidateScorePreview[]>([])

  const [selected, setSelected] = useState<BuiltCandidate | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const [errorMsg, setErrorMsg] = useState('')

  // Precompila lunghezza/dislivello/preferenze/interruttore AI dallo storico e dal profilo
  // dell'utente (stesso segnale usato da Giulia in route-search) — solo un suggerimento, l'utente
  // resta libero di cambiarlo per questa singola ricerca. Caricato subito al mount (non più solo al
  // primo ingresso nello step dei parametri) perché l'interruttore AI serve già nello step "start",
  // dove si cerca il punto di partenza per nome.
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

  // Calcola Trail Score + Sicurezza per ogni candidato non appena arrivano i risultati — stessa
  // pipeline usata per un percorso già salvato (computeCtsCore/computeSafetyCore, vedi
  // lib/computeCtsForHike.ts e lib/computeSafetyForHike.ts), qui su candidati non ancora salvati.
  useEffect(() => {
    if (candidates.length === 0) { setScores([]); return }
    setScores(candidates.map(() => ({ total: null, safety: null, vetoed: false, loading: true })))
    candidates.forEach((c, i) => {
      Promise.all([
        computeCtsCore(c).catch(() => null),
        computeSafetyCore(c).catch(() => null),
      ]).then(([cts, safety]) => {
        const v2 = computeTrailScoreV2({ cts: cts?.ts ?? null, safety: safety?.overall ?? null })
        setScores(prev => {
          if (prev.length !== candidates.length) return prev
          const next = [...prev]
          next[i] = {
            total: v2?.score ?? null,
            safety: safety ? { overall: safety.overall, color: safety.color, label: safety.label } : null,
            vetoed: v2?.breakdown.vetoed ?? false,
            loading: false,
          }
          return next
        })
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates])

  async function resolveQuery(q: string): Promise<GeocodeResult[]> {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    const results: GeocodeResult[] = Array.isArray(data) ? data.slice(0, 5) : []
    if (results.length > 0) return results

    // Nominatim non ha trovato nulla — prova la risoluzione dedicata (utile per feature naturali
    // locali poco note, es. "Cascata del Picchio, Blera", vedi lib/routeBuilder/resolvePlace.ts).
    // useAi qui riflette lo stato corrente dell'interruttore (default di profilo, sovrascrivibile
    // per questa ricerca) — il server prova comunque prima Nominatim/Overpass per nome, l'AI entra
    // solo come terzo livello quando anche questi falliscono.
    try {
      const fallbackRes = await fetch(`/api/route-build/resolve-place?q=${encodeURIComponent(q)}&useAi=${useAi}`)
      const fallbackData = await fallbackRes.json()
      if (fallbackData?.place) {
        return [{ lat: String(fallbackData.place.lat), lon: String(fallbackData.place.lon), display_name: fallbackData.place.displayName }]
      }
    } catch {}
    return []
  }

  async function runGeocode() {
    if (!query.trim() || geocoding) return
    setGeocoding(true)
    setGeocodeResults([])
    try {
      setGeocodeResults(await resolveQuery(query.trim()))
    } catch {}
    setGeocoding(false)
  }

  async function runDestGeocode() {
    if (!destQuery.trim() || destGeocoding) return
    setDestGeocoding(true)
    setDestGeocodeResults([])
    try {
      setDestGeocodeResults(await resolveQuery(destQuery.trim()))
    } catch {}
    setDestGeocoding(false)
  }

  function toggleEnvironmentPref(key: HikerEnvironmentPrefKey) {
    setEnvironmentPrefs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function toggleDesiredPoiType(type: PoiType) {
    setDesiredPoiTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }

  async function generate() {
    if (lat == null || lon == null || generating) return
    setGenerating(true)
    setErrorMsg('')
    setResultsMessage('')
    try {
      const res = await fetch('/api/route-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat, lon, routeType, targetDistanceKm,
          targetElevationM: targetElevationM.trim() ? Number(targetElevationM) : null,
          environmentPrefs,
          desiredPoiTypes,
          destinationLat: routeType === 'andata_ritorno' ? destLat : null,
          destinationLon: routeType === 'andata_ritorno' ? destLon : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.message || data.error || 'Generazione non riuscita, riprova.')
        return
      }
      setCandidates(data.candidates ?? [])
      setResultsMessage(data.message ?? '')
      setStep('results')
    } catch {
      setErrorMsg('Errore di rete, riprova.')
    } finally {
      setGenerating(false)
    }
  }

  function chooseCandidate(c: BuiltCandidate, i: number) {
    setSelected(c)
    setTitle(`${routeType === 'anello' ? 'Anello' : 'Andata e ritorno'} costruito ${i + 1}`)
    setDate('')
    setErrorMsg('')
    setStep('confirm')
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike: PlannedHike = {
        id: 'routebuild_' + Date.now().toString(36),
        title: title.trim() || 'Percorso costruito',
        plannedDate: date || undefined,
        createdAt: new Date().toISOString(),
        distanceMeters: selected.distanceMeters,
        elevationGain: selected.elevationGain,
        elevationLoss: selected.elevationLoss,
        altitudeMax: selected.altitudeMax,
        altitudeMin: selected.altitudeMin,
        estimatedTimeSeconds: selected.estimatedTimeSeconds,
        trackPoints: selected.trackPoints,
        routePolyline: downsamplePolyline(selected.trackPoints),
        pendingExpiresAt,
      }

      const gps = hike.trackPoints?.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number]) ?? []
      if (gps.length >= 2) {
        try {
          const deadline = new Promise<null>(r => setTimeout(() => r(null), 7000))
          const pois = await Promise.race([fetchPoisNearTrack(gps, 300), deadline])
          if (pois?.length) {
            hike.cachedPois = pois
            const poiWiki = await Promise.race([fetchWikiForNamedPois(pois), deadline])
            if (poiWiki?.length) hike.cachedPoiWiki = poiWiki
          }
        } catch {}
      }

      await savePlanned(hike)
      computeCtsForHike(hike).catch(() => {})
      computeSafetyForHike(hike).catch(() => {})
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  // ── Punto di partenza ───────────────────────────────────────────────────────

  if (step === 'start') return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:text-stone-700 transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="text-sm font-semibold text-stone-800">Costruisci un percorso</p>
          <p className="text-xs text-stone-400">Scegli il punto di partenza</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runGeocode() }}
            placeholder="Comune, o un luogo noto (es. Gole del Biedano, Blera)"
            className="flex-1 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white"
          />
          <button onClick={runGeocode} disabled={geocoding || !query.trim()}
            className="w-10 h-10 rounded-xl bg-stone-100 hover:bg-stone-200 disabled:opacity-40 text-stone-600 flex items-center justify-center shrink-0 transition-colors">
            {geocoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setUseAi(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            useAi ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-500'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Prova con l&apos;AI se non trovo il luogo
        </button>

        {geocodeResults.length > 0 && (
          <div className="space-y-1.5">
            {geocodeResults.map((r, i) => (
              <button
                key={i}
                onClick={() => { setLat(parseFloat(r.lat)); setLon(parseFloat(r.lon)); setGeocodeResults([]); setQuery(r.display_name) }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs text-stone-600 bg-stone-50 hover:bg-stone-100 transition-colors"
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}

        <LocationPickerMap lat={lat ?? undefined} lon={lon ?? undefined} onPick={(pLat, pLon) => { setLat(pLat); setLon(pLon) }} />
        <p className="text-xs text-stone-400">Tocca la mappa per scegliere il punto di partenza esatto, o trascina il marker.</p>
      </div>

      {errorMsg && <p className="text-red-500 text-xs">{errorMsg}</p>}

      <button onClick={() => setStep('params')} disabled={lat == null || lon == null}
        className="w-full flex items-center justify-center gap-2 py-3 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
        Continua <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )

  // ── Tipo e obiettivi ────────────────────────────────────────────────────────

  if (step === 'params') return (
    <div className="space-y-3">
      <button onClick={() => setStep('start')} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Cambia punto di partenza
      </button>

      <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-2">Tipo di percorso</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setRouteType('anello')}
              className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${routeType === 'anello' ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
              Anello
            </button>
            <button onClick={() => setRouteType('andata_ritorno')}
              className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${routeType === 'andata_ritorno' ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
              Andata e ritorno
            </button>
          </div>
        </div>

        {routeType === 'andata_ritorno' && (
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              Destinazione <span className="font-normal text-stone-400">(opzionale — es. Cascata del Picchio, Blera)</span>
            </label>
            {destLat != null ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-forest-50 border border-forest-200">
                <span className="text-xs text-forest-800 truncate">{destDisplayName}</span>
                <button onClick={() => { setDestLat(null); setDestLon(null); setDestDisplayName(''); setDestQuery('') }}
                  className="shrink-0 text-forest-600 hover:text-forest-800">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    value={destQuery}
                    onChange={e => setDestQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') runDestGeocode() }}
                    placeholder="Nome del luogo di arrivo"
                    className="flex-1 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white"
                  />
                  <button onClick={runDestGeocode} disabled={destGeocoding || !destQuery.trim()}
                    className="w-10 h-10 rounded-xl bg-stone-100 hover:bg-stone-200 disabled:opacity-40 text-stone-600 flex items-center justify-center shrink-0 transition-colors">
                    {destGeocoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setUseAi(v => !v)}
                  className={`mt-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    useAi ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-500'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Prova con l&apos;AI se non trovo il luogo
                </button>
                {destGeocodeResults.length > 0 && (
                  <div className="space-y-1.5 mt-1.5">
                    {destGeocodeResults.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => { setDestLat(parseFloat(r.lat)); setDestLon(parseFloat(r.lon)); setDestDisplayName(r.display_name); setDestGeocodeResults([]) }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-stone-600 bg-stone-50 hover:bg-stone-100 transition-colors"
                      >
                        {r.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-stone-600">Lunghezza target</label>
            {destLat == null && <span className="text-sm font-semibold text-stone-800">{targetDistanceKm.toFixed(1)} km</span>}
          </div>
          {destLat != null ? (
            <p className="text-xs text-stone-400">La lunghezza sarà quella del percorso reale verso la destinazione scelta.</p>
          ) : (
            <input type="range" min={MIN_KM} max={MAX_KM} step={0.5} value={targetDistanceKm}
              onChange={e => setTargetDistanceKm(Number(e.target.value))}
              className="w-full accent-terra-500" />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">
            Dislivello target <span className="font-normal text-stone-400">(opzionale, in metri)</span>
          </label>
          <input type="number" min={0} value={targetElevationM} onChange={e => setTargetElevationM(e.target.value)}
            placeholder="es. 300"
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-600 mb-2">Preferenze ambientali</label>
          <div className="flex flex-wrap gap-2">
            {HIKER_ENVIRONMENT_PREFS.map(p => (
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

      {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

      <button onClick={generate} disabled={generating}
        className="w-full flex items-center justify-center gap-2 py-3 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
        {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
        {generating ? 'Genero i percorsi…' : 'Genera percorsi'}
      </button>
    </div>
  )

  // ── Risultati ───────────────────────────────────────────────────────────────

  if (step === 'results') return (
    <div className="space-y-3">
      <button onClick={() => setStep('params')} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Cambia obiettivi
      </button>

      {candidates.length === 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 text-sm text-stone-600">
          {resultsMessage || 'Nessun percorso trovato con questi vincoli — prova una lunghezza diversa o un altro punto di partenza.'}
        </div>
      )}

      {candidates.map((c, i) => {
        const scorePreview = scores[i]
        return (
          <div key={i} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <TrailPreviewMap polyline={c.routePolyline} height="180px" />
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="font-semibold text-stone-800">{(c.distanceMeters / 1000).toFixed(1)} km</span>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">Distanza</p>
                  </div>
                  <div>
                    <span className="font-semibold text-stone-800 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{Math.round(c.elevationGain)} m</span>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">Dislivello</p>
                  </div>
                  <div>
                    <span className="font-semibold text-stone-800">{c.type === 'anello' ? 'Anello' : 'Andata e ritorno'}</span>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">Tipo</p>
                  </div>
                </div>
                <div className="shrink-0 bg-stone-800 rounded-xl p-1.5">
                  <TrailScoreGaugeBadge
                    total={scorePreview?.total ?? null}
                    safety={scorePreview?.safety ?? null}
                    loading={scorePreview?.loading ?? true}
                    vetoed={scorePreview?.vetoed}
                    size={52}
                    showLabel={false}
                  />
                </div>
              </div>

              <PoiPreviewRow pois={c.pois ?? []} />

              {c.matchNote && <p className="text-sm text-stone-600 leading-relaxed">{c.matchNote}</p>}

              {c.hasSteepSections && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Presenta tratti ripidi</p>
              )}

              <button onClick={() => chooseCandidate(c, i)}
                className="w-full py-2.5 rounded-full bg-terra-500 hover:bg-terra-600 text-white text-xs font-semibold uppercase tracking-wide transition-colors">
                Scegli questo percorso
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )

  // ── Conferma ────────────────────────────────────────────────────────────────

  if (step === 'confirm' && selected) return (
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

        <TrailPreviewMap polyline={selected.routePolyline} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Distanza', val: `${(selected.distanceMeters / 1000).toFixed(1)} km` },
            { label: 'Dislivello +', val: `${Math.round(selected.elevationGain)} m` },
            { label: 'Quota max', val: `${Math.round(selected.altitudeMax)} m` },
            { label: 'Tipo', val: selected.type === 'anello' ? 'Anello' : 'Andata e ritorno' },
          ].map(s => (
            <div key={s.label} className="bg-stone-50 rounded-xl border border-stone-150 p-3">
              <p className="text-[10px] text-stone-400">{s.label}</p>
              <p className="text-sm font-semibold text-stone-800">{s.val}</p>
            </div>
          ))}
        </div>

        <PoiPreviewRow pois={selected.pois ?? []} />

        {selected.matchNote && <p className="text-sm text-stone-600 leading-relaxed">{selected.matchNote}</p>}
      </div>

      {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

      <button onClick={handleSave} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
        Salva e apri la guida
      </button>
    </div>
  )

  return null
}
