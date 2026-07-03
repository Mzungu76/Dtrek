'use client'
import { useEffect, useState } from 'react'
import { getAllPlanned, updatePlannedMeta } from '@/lib/plannedStore'
import { getAllActivities, getActivityById, updateActivityMeta } from '@/lib/blobStore'
import { computeTrailScore, getCtsFallback, type CtsConfidence } from '@/lib/trailScore'
import { type BeautyScore } from '@/lib/beautyScore'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from '@/lib/tei'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import type { TrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'
import { checkProtectedArea } from '@/lib/natura2000/checkProtectedArea'
import { type PoiItem } from '@/lib/overpass'
import { computeBbox } from '@/lib/geoUtils'
import { batchUpdate, fetchPoisForGps } from '@/lib/recalcScores'
import { Loader2, Gauge, RefreshCw } from 'lucide-react'

/**
 * Preferenze personali del Comfort TrailScore (FC, sforzo, durata ideale).
 * Il ricalcolo completo "da zero" di tutti i percorsi è uno strumento di
 * manutenzione, non una preferenza quotidiana: vive in
 * components/profilo/SectionAvanzate.tsx (Piano di ristrutturazione, Parte 2.4).
 */
export default function SectionComfortTrailScore() {
  const [hrRest,           setHrRest]           = useState(55)
  const [hrMax,            setHrMax]            = useState<number | null>(null)
  const [prefSforzo,       setPrefSforzo]       = useState(50)
  const [prefDurata,       setPrefDurata]       = useState(270)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [status,         setStatus]         = useState<{ ok: boolean; msg: string } | null>(null)
  const [batchRunning,       setBatchRunning]       = useState(false)
  const [batchProgress,      setBatchProgress]      = useState('')

  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
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

    // Lightweight recalculation — reuse cached TEI/BeautyScore, just recalculate CTS with new prefs
    let updated = 0
    try {
      const prefs = await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
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

        const deadline = new Promise<null>(r => setTimeout(() => r(null), 25000))
        const bbox = computeBbox(gps)
        const [pois, osmData, dtmProfile, terrainProfile, inProtectedArea] = await Promise.all([
          Promise.race([fetchPoisForGps(gps), deadline]).then(r => r ?? []) as Promise<PoiItem[]>,
          Promise.race([
            fetch(`/api/tei-overpass?bbox=${bbox}`).then(r => r.json()) as Promise<OsmTeiData>,
            deadline,
          ]).then(r => r ?? undefined).catch(() => undefined),
          Promise.race([
            fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()) as Promise<TrailDtmProfile>,
            deadline,
          ]).then(r => r ?? undefined).catch(() => undefined),
          Promise.race([
            fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()) as Promise<TrailTerrainProfile>,
            deadline,
          ]).then(r => r ?? undefined).catch(() => undefined),
          Promise.race([
            checkProtectedArea(gps).then(r => r.inProtectedArea),
            deadline,
          ]).then(r => r ?? undefined).catch(() => undefined),
        ])

        const elevProfile = (full.trackPoints ?? [])
          .filter(p => p.lat && p.lon)
          .map(p => p.altitudeMeters ?? 0)

        const tei = computeTEI({
          track: gps,
          elevGain: full.elevationGain,
          distanceMeters: full.distanceMeters,
          altitudeMax: full.altitudeMax,
          elevProfile,
          pois,
          osmData,
          dtmProfile,
          terrainProfile,
          inProtectedArea,
        })
        const bs = teiToBeautyScore(tei)
        const confidence: CtsConfidence = pois.length === 0 ? 'default' : tei.confidence

        let finalTs: number
        if (pois.length === 0) {
          finalTs = getCtsFallback(activities)
        } else {
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
            avgSlopeDeg:    dtmProfile?.avgSlopeDeg ?? undefined,
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
              disabled={saving || batchRunning}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Aggiornamento CTS…' : 'Salva e ricalcola CTS'}
            </button>
            <button
              onClick={handleBatchComputeCts}
              disabled={saving || batchRunning}
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
