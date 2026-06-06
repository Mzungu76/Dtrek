'use client'
import { useEffect, useRef, useState } from 'react'
import Navbar from '@/components/Navbar'
import { getProfile, saveProfile } from '@/lib/userProfile'
import { getAllPlanned, getPlannedById, updatePlannedMeta } from '@/lib/plannedStore'
import { getAllActivities, getActivityById, updateActivityMeta } from '@/lib/blobStore'
import { computeTrailScore, getCtsFallback, type CtsConfidence } from '@/lib/trailScore'
import { computeBeautyScore, slidersToWeights, type BeautyScore } from '@/lib/beautyScore'
import { fetchTerrainContext, type PoiItem, type TerrainContext } from '@/lib/overpass'
import { fetchWikiForNamedPois } from '@/lib/wikipedia'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import {
  User, Camera, Check, Trash2, Key, Eye, EyeOff,
  Loader2, ShieldCheck, Sparkles, Lock, PersonStanding, Gauge, RefreshCw,
} from 'lucide-react'

const EMPTY_TERRAIN: TerrainContext = {
  hasForest: false, hasRiver: false, hasStream: false, hasLake: false,
  hasPond: false, hasGlacier: false, hasCoast: false, isProtected: false,
  isNationalPark: false, openTerrain: false, surfaces: [],
}

// ── Claude API key section ─────────────────────────────────────────────────

function ClaudeKeySection() {
  const [hasKey,   setHasKey]   = useState(false)
  const [keyHint,  setKeyHint]  = useState<string | null>(null)
  const [input,    setInput]    = useState('')
  const [showKey,  setShowKey]  = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [status,   setStatus]   = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => { setHasKey(d.hasKey); setKeyHint(d.keyHint) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!input.trim()) return
    setSaving(true); setStatus(null)
    const res  = await fetch('/api/user-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: input.trim() }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      setHasKey(true); setKeyHint(data.keyHint); setInput('')
      setStatus({ ok: true, msg: 'Chiave salvata correttamente.' })
    } else {
      setStatus({ ok: false, msg: data.error ?? 'Errore durante il salvataggio.' })
    }
  }

  async function handleDelete() {
    setDeleting(true); setStatus(null)
    const res = await fetch('/api/user-settings', { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) { setHasKey(false); setKeyHint(null); setStatus({ ok: true, msg: 'Chiave rimossa.' }) }
    else setStatus({ ok: false, msg: 'Errore durante la rimozione.' })
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <Key className="w-5 h-5 text-forest-600 shrink-0" />
        <h2 className="text-sm font-semibold text-stone-800">Chiave API Claude</h2>
      </div>
      <p className="text-xs text-stone-500 mb-4 ml-7 leading-relaxed">
        Inserisci la tua chiave personale di{' '}
        <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer"
           className="underline text-forest-600 hover:text-forest-700">
          Anthropic Console
        </a>{' '}
        per generare guide turistiche AI sui tuoi percorsi pianificati.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs ml-7">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : hasKey ? (
        /* Key already saved */
        <div className="ml-7 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-forest-50 border border-forest-200">
            <ShieldCheck className="w-4 h-4 text-forest-600 shrink-0" />
            <span className="text-xs font-mono text-forest-800 flex-1">{keyHint}</span>
            <span className="text-[10px] font-medium text-forest-600 bg-forest-100 px-1.5 py-0.5 rounded-full">attiva</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setHasKey(false); setKeyHint(null) }}
              className="text-xs text-forest-600 hover:text-forest-700 font-medium"
            >
              Sostituisci
            </button>
            <span className="text-stone-300">·</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Rimuovi
            </button>
          </div>
        </div>
      ) : (
        /* Input for new key */
        <div className="ml-7 space-y-2">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={input}
              onChange={e => { setInput(e.target.value); setStatus(null) }}
              placeholder="sk-ant-api03-…"
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 pr-10 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !input.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salva chiave
          </button>
        </div>
      )}

      {status && (
        <p className={`mt-3 ml-7 text-xs font-medium ${status.ok ? 'text-forest-600' : 'text-red-600'}`}>
          {status.ok ? '✓ ' : '✗ '}{status.msg}
        </p>
      )}
    </div>
  )
}

// ── Comfort TrailScore settings ───────────────────────────────────────────────

async function batchUpdate<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  chunkSize = 5,
  delayMs = 200,
): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    await Promise.allSettled(chunk.map(async item => {
      try { await fn(item); ok++ }
      catch { failed++ }
    }))
    if (i + chunkSize < items.length) await new Promise(r => setTimeout(r, delayMs))
  }
  return { ok, failed }
}

async function fetchPoisForGps(gps: [number, number][]): Promise<PoiItem[]> {
  if (gps.length < 2) return []
  const bbox = computeBbox(gps)
  try {
    const res = await fetch(`/api/pois?bbox=${bbox}`)
    if (!res.ok) return []
    const all: PoiItem[] = await res.json()
    return all.filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
  } catch { return [] }
}

function ComfortTrailScoreSection() {
  const [naturaCultura, setNaturaCultura] = useState(50) // 0=solo natura, 100=solo cultura
  const [naturaType,    setNaturaType]    = useState(50) // 0=panoramica, 100=selvaggia
  const [culturaType,   setCulturaType]   = useState(50) // 0=castelli, 100=rovine
  const [hrRest,           setHrRest]           = useState(55)
  const [hrMax,            setHrMax]            = useState<number | null>(null)
  const [prefSforzo,       setPrefSforzo]       = useState(50)
  const [prefDurata,       setPrefDurata]       = useState(270)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [status,         setStatus]         = useState<{ ok: boolean; msg: string } | null>(null)
  const [batchRunning,       setBatchRunning]       = useState(false)
  const [batchProgress,      setBatchProgress]      = useState('')
  const [fullRecalcRunning,  setFullRecalcRunning]  = useState(false)
  const [fullRecalcProgress, setFullRecalcProgress] = useState('')

  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
        if (d.beautyNaturaCultura != null) setNaturaCultura(d.beautyNaturaCultura)
        if (d.beautyNaturaType    != null) setNaturaType(d.beautyNaturaType)
        if (d.beautyCulturaType   != null) setCulturaType(d.beautyCulturaType)
        if (d.hrRest  != null) setHrRest(d.hrRest)
        if (d.hrMax   != null) setHrMax(d.hrMax)
        if (d.prefSforzo != null) setPrefSforzo(d.prefSforzo)
        if (d.prefDurata != null) setPrefDurata(d.prefDurata)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true); setStatus(null)
    const res = await fetch('/api/user-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beautyNaturaCultura: naturaCultura,
        beautyNaturaType:    naturaType,
        beautyCulturaType:   culturaType,
        hrRest,
        hrMax: hrMax ?? null,
        prefSforzo,
        prefDurata,
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setSaving(false)
      setStatus({ ok: false, msg: json?.error ?? 'Errore durante il salvataggio.' })
      return
    }

    // Lightweight recalculation — reuse cached BeautyScore, just recalculate CTS with new weights
    let updated = 0
    try {
      const prefs = await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
      const rawW = slidersToWeights({
        naturaCultura: prefs.beautyNaturaCultura ?? naturaCultura,
        naturaType:    prefs.beautyNaturaType    ?? naturaType,
        culturaType:   prefs.beautyCulturaType   ?? culturaType,
      })
      const [hikes, activities] = await Promise.all([getAllPlanned(), getAllActivities()])

      await Promise.all([
        ...hikes
          .filter(h => (h as { cachedBeautyScore?: BeautyScore }).cachedBeautyScore?.categories?.length)
          .map(h => {
            const bs = (h as { cachedBeautyScore: BeautyScore }).cachedBeautyScore
            const { ts, confidence } = computeTrailScore(bs, {
              distanceMeters: h.distanceMeters,
              elevationGain:  h.elevationGain,
              elevationLoss:  h.elevationLoss,
              altitudeMax:    h.altitudeMax,
              prefSforzo:     prefs.prefSforzo ?? prefSforzo,
              prefDurata:     prefs.prefDurata ?? prefDurata,
              hrRest:         prefs.hrRest ?? hrRest,
              hrMax:          prefs.hrMax ?? hrMax ?? undefined,
            })
            updated++
            return updatePlannedMeta(h.id, { cachedTrailScore: ts, cachedTrailScoreConfidence: confidence })
          }),
        ...activities
          .filter(a => (a as { linkedBeautyScore?: BeautyScore }).linkedBeautyScore?.categories?.length)
          .map(a => {
            const bs = (a as { linkedBeautyScore: BeautyScore }).linkedBeautyScore
            const { ts, confidence } = computeTrailScore(bs, {
              distanceMeters: a.distanceMeters,
              elevationGain:  a.elevationGain,
              elevationLoss:  a.elevationLoss ?? 0,
              altitudeMax:    a.altitudeMax,
              avgHeartRate:   a.avgHeartRate,
              prefSforzo:     prefs.prefSforzo ?? prefSforzo,
              prefDurata:     prefs.prefDurata ?? prefDurata,
              hrRest:         prefs.hrRest ?? hrRest,
              hrMax:          prefs.hrMax ?? hrMax ?? undefined,
            })
            updated++
            return updateActivityMeta(a.id, { trailScore: ts, trailScoreConfidence: confidence })
          }),
      ])
    } catch {}

    setSaving(false)
    setStatus({ ok: true, msg: updated > 0 ? `Salvato · ${updated} CTS aggiornati.` : 'Salvato.' })
  }

  async function handleBatchComputeCts() {
    setBatchRunning(true)
    setBatchProgress('Recupero escursioni…')
    let computed = 0
    try {
      const prefs = await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
      const rawW = slidersToWeights({
        naturaCultura: prefs.beautyNaturaCultura ?? naturaCultura,
        naturaType:    prefs.beautyNaturaType    ?? naturaType,
        culturaType:   prefs.beautyCulturaType   ?? culturaType,
      })

      const activities = await getAllActivities()
      const missing = activities.filter(
        a => !(a as { linkedBeautyScore?: BeautyScore }).linkedBeautyScore?.categories?.length
      )
      if (missing.length === 0) {
        setBatchProgress('Tutte le escursioni hanno già il CTS.')
        setTimeout(() => { setBatchRunning(false); setBatchProgress('') }, 2500)
        return
      }

      let i = 0
      await batchUpdate(missing, async meta => {
        setBatchProgress(`${++i}/${missing.length} — ${meta.title ?? 'Escursione'}`)
        const full = await getActivityById(meta.id)
        if (!full) return
        const gps = (full.trackPoints ?? [])
          .filter(p => p.lat && p.lon)
          .map(p => [p.lat!, p.lon!] as [number, number])

        const deadline = new Promise<null>(r => setTimeout(() => r(null), 12000))
        const [pois, terrain] = await Promise.all([
          Promise.race([fetchPoisForGps(gps), deadline]).then(r => r ?? []) as Promise<PoiItem[]>,
          Promise.race([fetchTerrainContext(gps), deadline]).then(r => r ?? EMPTY_TERRAIN) as Promise<TerrainContext>,
        ])
        const rawWiki = pois.length
          ? await Promise.race([fetchWikiForNamedPois(pois), deadline]).then(r => r ?? [])
          : []
        const wiki = (rawWiki as { wiki: import('@/lib/wikipedia').WikiPage }[]).map(e => e.wiki)
        const bs = computeBeautyScore(pois, wiki, terrain, full.elevationGain, full.altitudeMax, full.distanceMeters, rawW)

        let confidence: CtsConfidence = 'high'
        let finalTs: number
        if (pois.length === 0) {
          confidence = 'default'
          finalTs = getCtsFallback(activities)
        } else {
          if (pois.length < 3 || bs.overall < 2) confidence = 'estimated'
          const { ts } = computeTrailScore(bs, {
            distanceMeters: full.distanceMeters,
            elevationGain:  full.elevationGain,
            elevationLoss:  full.elevationLoss ?? 0,
            altitudeMax:    full.altitudeMax,
            avgHeartRate:   full.avgHeartRate,
            prefSforzo:     prefs.prefSforzo ?? prefSforzo,
            prefDurata:     prefs.prefDurata ?? prefDurata,
            hrRest:         prefs.hrRest ?? hrRest,
            hrMax:          prefs.hrMax ?? hrMax ?? undefined,
          })
          finalTs = confidence === 'estimated' ? Math.round(ts * 0.9) : ts
        }
        await updateActivityMeta(full.id, { linkedBeautyScore: bs, trailScore: finalTs, trailScoreConfidence: confidence })
        computed++
      })
    } catch {}
    setBatchRunning(false)
    setBatchProgress(computed > 0 ? `Completato · ${computed} CTS calcolati.` : 'Nessun CTS calcolato.')
    setTimeout(() => setBatchProgress(''), 4000)
  }

  async function handleFullRecalcCts() {
    setFullRecalcRunning(true)
    setFullRecalcProgress('Recupero preferenze…')
    let computed = 0
    try {
      const prefs = await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
      const rawW = slidersToWeights({
        naturaCultura: prefs.beautyNaturaCultura ?? naturaCultura,
        naturaType:    prefs.beautyNaturaType    ?? naturaType,
        culturaType:   prefs.beautyCulturaType   ?? culturaType,
      })

      const [activities, hikes] = await Promise.all([getAllActivities(), getAllPlanned()])
      const total = activities.length + hikes.length

      let idx = 0
      await batchUpdate(activities, async meta => {
        setFullRecalcProgress(`${++idx}/${total} — ${meta.title ?? 'Escursione'}`)
        const full = await getActivityById(meta.id)
        if (!full) return
        const gps = (full.trackPoints ?? [])
          .filter(p => p.lat && p.lon)
          .map(p => [p.lat!, p.lon!] as [number, number])

        const deadline = new Promise<null>(r => setTimeout(() => r(null), 12000))
        const [pois, terrain] = await Promise.all([
          Promise.race([fetchPoisForGps(gps), deadline]).then(r => r ?? []) as Promise<PoiItem[]>,
          Promise.race([fetchTerrainContext(gps), deadline]).then(r => r ?? EMPTY_TERRAIN) as Promise<TerrainContext>,
        ])
        const rawWiki = pois.length
          ? await Promise.race([fetchWikiForNamedPois(pois), deadline]).then(r => r ?? [])
          : []
        const wiki = (rawWiki as { wiki: import('@/lib/wikipedia').WikiPage }[]).map(e => e.wiki)
        const bs = computeBeautyScore(pois, wiki, terrain, full.elevationGain, full.altitudeMax, full.distanceMeters, rawW)

        let confidence: CtsConfidence = 'high'
        let finalTs: number
        if (pois.length === 0) {
          confidence = 'default'
          finalTs = getCtsFallback(activities)
        } else {
          if (pois.length < 3 || bs.overall < 2) confidence = 'estimated'
          const { ts } = computeTrailScore(bs, {
            distanceMeters: full.distanceMeters,
            elevationGain:  full.elevationGain,
            elevationLoss:  full.elevationLoss ?? 0,
            altitudeMax:    full.altitudeMax,
            avgHeartRate:   full.avgHeartRate,
            prefSforzo:     prefs.prefSforzo ?? prefSforzo,
            prefDurata:     prefs.prefDurata ?? prefDurata,
            hrRest:         prefs.hrRest ?? hrRest,
            hrMax:          prefs.hrMax ?? hrMax ?? undefined,
          })
          finalTs = confidence === 'estimated' ? Math.round(ts * 0.9) : ts
        }
        await updateActivityMeta(full.id, { linkedBeautyScore: bs, trailScore: finalTs, trailScoreConfidence: confidence })
        computed++
      })

      await batchUpdate(hikes, async meta => {
        setFullRecalcProgress(`${++idx}/${total} — ${meta.title ?? 'Pianificata'}`)
        const full = await getPlannedById(meta.id)
        if (!full) return
        const gps = (full.trackPoints ?? [])
          .filter(p => p.lat && p.lon)
          .map(p => [p.lat!, p.lon!] as [number, number])

        const deadline = new Promise<null>(r => setTimeout(() => r(null), 12000))
        const [pois, terrain] = await Promise.all([
          Promise.race([fetchPoisForGps(gps), deadline]).then(r => r ?? []) as Promise<PoiItem[]>,
          Promise.race([fetchTerrainContext(gps), deadline]).then(r => r ?? EMPTY_TERRAIN) as Promise<TerrainContext>,
        ])
        const rawWiki = pois.length
          ? await Promise.race([fetchWikiForNamedPois(pois), deadline]).then(r => r ?? [])
          : []
        const wiki = (rawWiki as { wiki: import('@/lib/wikipedia').WikiPage }[]).map(e => e.wiki)
        const bs = computeBeautyScore(pois, wiki, terrain, full.elevationGain, full.altitudeMax, full.distanceMeters, rawW)

        let confidence: CtsConfidence = 'high'
        let finalTs: number
        if (pois.length === 0) {
          confidence = 'default'
          finalTs = getCtsFallback(activities)
        } else {
          if (pois.length < 3 || bs.overall < 2) confidence = 'estimated'
          const { ts } = computeTrailScore(bs, {
            distanceMeters: full.distanceMeters,
            elevationGain:  full.elevationGain,
            elevationLoss:  full.elevationLoss,
            altitudeMax:    full.altitudeMax,
            prefSforzo:     prefs.prefSforzo ?? prefSforzo,
            prefDurata:     prefs.prefDurata ?? prefDurata,
            hrRest:         prefs.hrRest ?? hrRest,
            hrMax:          prefs.hrMax ?? hrMax ?? undefined,
          })
          finalTs = confidence === 'estimated' ? Math.round(ts * 0.9) : ts
        }
        await updatePlannedMeta(full.id, { cachedBeautyScore: bs, cachedTrailScore: finalTs, cachedTrailScoreConfidence: confidence })
        computed++
      })
    } catch {}
    setFullRecalcRunning(false)
    setFullRecalcProgress(computed > 0 ? `Completato · ${computed} CTS ricalcolati.` : 'Nessun CTS ricalcolato.')
    setTimeout(() => setFullRecalcProgress(''), 4000)
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <Gauge className="w-5 h-5 text-forest-600 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Comfort TrailScore — preferenze</h2>
          <p className="text-xs text-stone-400">Personalizza come viene calcolato il tuo CTS</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : (
        <div className="space-y-5">

          {/* Pesi per la Bellezza — 3 sliders a scelta obbligata */}
          <div className="space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Cosa cerchi in un percorso?</p>

            {/* Slider 1: Natura vs Cultura */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-medium text-stone-600">🌿 Natura</span>
                <span className="text-xs font-medium text-stone-600">🏛 Cultura</span>
              </div>
              <input type="range" min={0} max={100} value={naturaCultura}
                onChange={e => setNaturaCultura(Number(e.target.value))}
                className="w-full accent-forest-600" />
              <p className="text-[10px] text-stone-400 mt-0.5 text-center">
                {naturaCultura < 30 ? 'Preferisci natura selvaggia' : naturaCultura > 70 ? 'Preferisci siti storici e culturali' : 'Bilanciato'}
              </p>
            </div>

            {/* Slider 2: Selvaggia vs Panoramica (within natura) */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-medium text-stone-600">🏔 Selvaggia</span>
                <span className="text-xs font-medium text-stone-600">🌄 Panoramica</span>
              </div>
              <input type="range" min={0} max={100} value={100 - naturaType}
                onChange={e => setNaturaType(100 - Number(e.target.value))}
                className="w-full accent-forest-600" />
              <p className="text-[10px] text-stone-400 mt-0.5 text-center">
                {naturaType > 70 ? 'Vette, grotte, cascate' : naturaType < 30 ? 'Panorami, belvedere, laghi' : 'Bilanciato'}
              </p>
            </div>

            {/* Slider 3: Rovine vs Castelli (within cultura) */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-medium text-stone-600">🏺 Rovine</span>
                <span className="text-xs font-medium text-stone-600">⛪ Castelli</span>
              </div>
              <input type="range" min={0} max={100} value={100 - culturaType}
                onChange={e => setCulturaType(100 - Number(e.target.value))}
                className="w-full accent-forest-600" />
              <p className="text-[10px] text-stone-400 mt-0.5 text-center">
                {culturaType > 70 ? 'Siti archeologici, necropoli' : culturaType < 30 ? 'Castelli, chiese, borghi' : 'Bilanciato'}
              </p>
            </div>
          </div>

          {/* HR settings */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Frequenza cardiaca (Karvonen)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wider">FC riposo</p>
                <div className="relative">
                  <input
                    type="number" min={30} max={100} value={hrRest}
                    onChange={e => setHrRest(parseInt(e.target.value) || 55)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">bpm</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wider">FC max (opz.)</p>
                <div className="relative">
                  <input
                    type="number" min={100} max={250} value={hrMax ?? ''}
                    onChange={e => setHrMax(parseInt(e.target.value) || null)}
                    placeholder="Tanaka"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">bpm</span>
                </div>
              </div>
            </div>
          </div>

          {/* Preferenza sforzo */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-stone-600">Preferenza sforzo</label>
              <span className="text-xs font-mono text-stone-500">{prefSforzo}/100</span>
            </div>
            <input type="range" min={0} max={100} value={prefSforzo}
              onChange={e => setPrefSforzo(Number(e.target.value))}
              className="w-full accent-forest-600" />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>Passeggiata</span><span>Moderato</span><span>Sfida</span>
            </div>
          </div>

          {/* Preferenza durata */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-stone-600">Durata ideale</label>
              <span className="text-xs font-mono text-stone-500">
                {prefDurata >= 60 ? `${Math.floor(prefDurata / 60)}h${prefDurata % 60 > 0 ? ` ${prefDurata % 60}min` : ''}` : `${prefDurata} min`}
              </span>
            </div>
            <input type="range" min={60} max={480} step={30} value={prefDurata}
              onChange={e => setPrefDurata(Number(e.target.value))}
              className="w-full accent-forest-600" />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>1h</span><span>4h30</span><span>8h</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleSave}
              disabled={saving || batchRunning || fullRecalcRunning}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Aggiornamento CTS…' : 'Salva e ricalcola CTS'}
            </button>
            <button
              onClick={handleBatchComputeCts}
              disabled={saving || batchRunning || fullRecalcRunning}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-sm font-medium border border-stone-200 transition"
            >
              {batchRunning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {batchProgress || 'Calcolo in corso…'}</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Calcola CTS su escursioni senza punteggio</>
              }
            </button>
            {!batchRunning && batchProgress && (
              <p className="text-xs text-forest-600 font-medium">✓ {batchProgress}</p>
            )}
            <button
              onClick={handleFullRecalcCts}
              disabled={saving || batchRunning || fullRecalcRunning}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-sm font-medium border border-red-200 transition"
            >
              {fullRecalcRunning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {fullRecalcProgress || 'Ricalcolo in corso…'}</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Ricalcola tutti i CTS da zero</>
              }
            </button>
            {!fullRecalcRunning && fullRecalcProgress && (
              <p className="text-xs text-forest-600 font-medium">✓ {fullRecalcProgress}</p>
            )}
          </div>
        </div>
      )}

      {status && (
        <p className={`text-xs font-medium ${status.ok ? 'text-forest-600' : 'text-red-600'}`}>
          {status.ok ? '✓ ' : '✗ '}{status.msg}
        </p>
      )}
    </div>
  )
}

// ── Subscription teaser ────────────────────────────────────────────────────

function SubscriptionTeaser() {
  return (
    <div className="relative bg-gradient-to-br from-forest-800 to-forest-950 rounded-2xl p-6 overflow-hidden">
      {/* decorative glow */}
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-forest-400/20 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">DTrek AI</h2>
            <span className="text-[10px] font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
              Prossimamente
            </span>
          </div>
          <p className="text-xs text-forest-300 mt-0.5">Guide AI senza bisogno di una chiave personale</p>
        </div>
      </div>

      <ul className="space-y-1.5 mb-4 ml-12">
        {[
          'Accesso alle guide turistiche AI incluso',
          'Analisi avanzata dei percorsi',
          'Sincronizzazione multi-dispositivo illimitata',
        ].map(item => (
          <li key={item} className="flex items-center gap-2 text-xs text-forest-200">
            <Check className="w-3.5 h-3.5 text-forest-400 shrink-0" />
            {item}
          </li>
        ))}
      </ul>

      <button
        disabled
        className="ml-12 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white/50 text-xs font-medium cursor-not-allowed border border-white/10"
      >
        <Lock className="w-3.5 h-3.5" />
        Disponibile prossimamente
      </button>
    </div>
  )
}

// ── Biometric settings ────────────────────────────────────────────────────────

function BiometricSettingsSection() {
  const [age,     setAge]     = useState(0)
  const [weight,  setWeight]  = useState(0)
  const [height,  setHeight]  = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState<{ ok: boolean; msg: string } | null>(null)

  // Derived FCmax via Tanaka: 211 − 0.64 × age
  const derivedFCmax = age >= 10 && age <= 90 ? Math.round(211 - 0.64 * age) : 0

  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
        if (d.userAge)      setAge(d.userAge)
        if (d.userWeightKg) setWeight(d.userWeightKg)
        if (d.userHeightCm) setHeight(d.userHeightCm)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true); setStatus(null)
    const body: Record<string, number> = {}
    if (age > 0)    body.userAge      = age
    if (weight > 0) body.userWeightKg = weight
    if (height > 0) body.userHeightCm = height
    const res = await fetch('/api/user-settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setStatus({ ok: false, msg: json?.error ?? 'Errore durante il salvataggio.' })
    } else {
      setStatus({ ok: true, msg: 'Dati salvati correttamente.' })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <PersonStanding className="w-5 h-5 text-forest-600 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Dati biometrici</h2>
          <p className="text-xs text-stone-400">Parametri fisiologici usati per la valutazione AI dei percorsi</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wider">Età</p>
              <div className="relative">
                <input
                  type="number" min={10} max={90}
                  value={age || ''}
                  onChange={e => { setAge(parseInt(e.target.value) || 0); setStatus(null) }}
                  placeholder="40"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">anni</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wider">Peso</p>
              <div className="relative">
                <input
                  type="number" min={30} max={250}
                  value={weight || ''}
                  onChange={e => { setWeight(parseInt(e.target.value) || 0); setStatus(null) }}
                  placeholder="70"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">kg</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wider">Altezza</p>
              <div className="relative">
                <input
                  type="number" min={100} max={250}
                  value={height || ''}
                  onChange={e => { setHeight(parseInt(e.target.value) || 0); setStatus(null) }}
                  placeholder="170"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">cm</span>
              </div>
            </div>
          </div>
          {derivedFCmax > 0 && (
            <p className="text-xs text-forest-700 bg-forest-50 rounded-lg px-3 py-1.5">
              FC max derivata (formula Tanaka): <span className="font-bold">{derivedFCmax} bpm</span>
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salva impostazioni
          </button>
        </>
      )}

      {status && (
        <p className={`text-xs font-medium ${status.ok ? 'text-forest-600' : 'text-red-600'}`}>
          {status.ok ? '✓ ' : '✗ '}{status.msg}
        </p>
      )}
    </div>
  )
}

// ── Profile page ───────────────────────────────────────────────────────────

export default function ProfiloPage() {
  const [faceUrl,    setFaceUrl]    = useState<string | null>(null)
  const [name,       setName]       = useState('')
  const [saved,      setSaved]      = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Fast local read first
    const p = getProfile()
    if (p.hikerFaceDataUrl) setFaceUrl(p.hikerFaceDataUrl)
    if (p.displayName)      setName(p.displayName)
    // Then sync from Supabase (cross-device)
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
        if (d.hikerFaceDataUrl) { setFaceUrl(d.hikerFaceDataUrl); saveProfile({ hikerFaceDataUrl: d.hikerFaceDataUrl }) }
        if (d.displayName)      { setName(d.displayName);         saveProfile({ displayName: d.displayName }) }
      })
      .catch(() => {})
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        const size   = Math.min(img.width, img.height)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 256
        const ctx    = canvas.getContext('2d')!
        ctx.beginPath()
        ctx.arc(128, 128, 128, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 256, 256)
        setFaceUrl(canvas.toDataURL('image/jpeg', 0.85))
        setSaved(false)
      }
      img.src = url
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/user-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hikerFaceDataUrl: faceUrl ?? null, displayName: name.trim() || null }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Errore ${res.status}`)
      }
      // Mirror to localStorage so Navbar / RouteMap3D update immediately in this session
      saveProfile({ hikerFaceDataUrl: faceUrl ?? undefined, displayName: name.trim() || undefined })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Errore durante il salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-10 space-y-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-stone-900 mb-1">Profilo e impostazioni</h1>
          <p className="text-stone-400 text-sm">Personalizza il tuo account DTrek.</p>
        </div>

        {/* Face upload */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
          <p className="text-sm font-semibold text-stone-700 mb-4">Foto del volto (avatar escursionista)</p>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-amber-100 bg-stone-100 flex items-center justify-center">
                {faceUrl
                  ? <img src={faceUrl} alt="Volto" className="w-full h-full object-cover" />
                  : <User className="w-10 h-10 text-stone-300" />
                }
              </div>
              <button
                onClick={() => inputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 flex items-center justify-center text-white shadow-md transition-colors"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
            <div className="flex-1">
              <p className="text-sm text-stone-600 leading-relaxed">
                Carica una foto frontale. Verrà ritagliata circolare e applicata sull'escursionista nei video 3D.
              </p>
              {faceUrl && (
                <button
                  onClick={() => { setFaceUrl(null); setSaved(false) }}
                  className="mt-3 flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Rimuovi foto
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Display name */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
          <label className="block text-sm font-semibold text-stone-700 mb-3">
            Nome da visualizzare nei video
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setSaved(false) }}
            placeholder="es. Marco 🏔️"
            className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-stone-800"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${
            saved ? 'bg-green-500 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md'
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4" /> Salvato!</> : 'Salva profilo'}
        </button>
        {saveError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{saveError}</p>
        )}

        {/* Biometric settings */}
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Dati biometrici</p>
          <BiometricSettingsSection />
        </div>

        {/* CTS settings */}
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Comfort TrailScore</p>
          <ComfortTrailScoreSection />
        </div>

        {/* AI settings */}
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Intelligenza artificiale</p>
          <div className="space-y-3">
            <ClaudeKeySection />
            <SubscriptionTeaser />
          </div>
        </div>
      </div>
    </div>
  )
}
