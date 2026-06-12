'use client'
import { useState, useMemo, useCallback } from 'react'
import { ActivityMeta, StoredActivity, getActivityById } from '@/lib/blobStore'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { formatDuration, msToKmh } from '@/lib/tcxParser'
import { formatPaceMinkm, difficultyIndex, haversineM, computeHRZones, COMPARISON_COLORS } from '@/lib/stats'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import ShareModal from '@/components/ShareModal'
import { Activity, Shuffle, Check, GitCommitHorizontal, Mountain, Loader2, Share2 } from 'lucide-react'
import InfoButton from './InfoButton'

type CompareMode = 'completate' | 'pianificate'

function buildElevProfile(activity: StoredActivity, samples = 60): { pct: number; alt: number }[] {
  const pts = activity.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined && p.altitudeMeters !== undefined)
  if (pts.length < 2) return []
  const cumDist: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineM(pts[i - 1].lat!, pts[i - 1].lon!, pts[i].lat!, pts[i].lon!))
  }
  const total = cumDist[cumDist.length - 1]
  if (total === 0) return []
  return Array.from({ length: samples }, (_, s) => {
    const target = (s / (samples - 1)) * total
    let idx = cumDist.findIndex(d => d >= target)
    if (idx < 0) idx = cumDist.length - 1
    return { pct: Math.round(s / (samples - 1) * 100), alt: Math.round(pts[idx].altitudeMeters!) }
  })
}

interface Props { activities: ActivityMeta[]; onGuideLink: (section: string) => void }

export default function TabConfronto({ activities, onGuideLink }: Props) {
  const [compareMode,        setCompareMode]        = useState<CompareMode>('completate')
  const [selectedIds,        setSelectedIds]        = useState(new Set<string>())
  const [fullData,           setFullData]           = useState(new Map<string, StoredActivity>())
  const [loadingFull,        setLoadingFull]        = useState(false)
  const [plannedMetas,       setPlannedMetas]       = useState<PlannedHikeMeta[]>([])
  const [selectedPlannedIds, setSelectedPlannedIds] = useState(new Set<string>())
  const [loadingPlanned,     setLoadingPlanned]     = useState(false)
  const [showShare,          setShowShare]          = useState(false)

  const loadPlanned = useCallback(() => {
    if (plannedMetas.length > 0) return
    setLoadingPlanned(true)
    getAllPlanned().then(setPlannedMetas).finally(() => setLoadingPlanned(false))
  }, [plannedMetas.length])

  const switchMode = (mode: CompareMode) => {
    setCompareMode(mode)
    setSelectedIds(new Set())
    setSelectedPlannedIds(new Set())
    if (mode === 'pianificate') loadPlanned()
  }

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else if (next.size < 4) next.add(id)
    return next
  })

  const togglePlanned = (id: string) => setSelectedPlannedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else if (next.size < 4) next.add(id)
    return next
  })

  const loadFullData = useCallback(async () => {
    setLoadingFull(true)
    const map = new Map(Array.from(fullData.entries()))
    for (const id of Array.from(selectedIds)) {
      if (!map.has(id)) { const a = await getActivityById(id); if (a) map.set(id, a) }
    }
    setFullData(map)
    setLoadingFull(false)
  }, [selectedIds, fullData])

  const selectedMeta = useMemo(() => activities.filter(a => selectedIds.has(a.id)), [activities, selectedIds])
  const selectedPlanned = useMemo(() => plannedMetas.filter(h => selectedPlannedIds.has(h.id)), [plannedMetas, selectedPlannedIds])

  const radarData = useMemo(() => {
    if (selectedMeta.length < 2) return []
    const metrics = [
      { label: 'Distanza',   get: (a: ActivityMeta) => a.distanceMeters / 1000 },
      { label: 'Dislivello', get: (a: ActivityMeta) => a.elevationGain },
      { label: 'FC Media',   get: (a: ActivityMeta) => a.avgHeartRate },
      { label: 'Velocità',   get: (a: ActivityMeta) => a.avgSpeedMs * 3.6 },
      { label: 'Calorie',    get: (a: ActivityMeta) => a.calories },
      { label: 'Durata',     get: (a: ActivityMeta) => a.totalTimeSeconds / 3600 },
    ]
    return metrics.map(m => {
      const vals = selectedMeta.map(a => m.get(a))
      const mx = Math.max(...vals) || 1
      const row: Record<string, any> = { metric: m.label }
      selectedMeta.forEach((a, i) => { row[`a${i}`] = Math.round(vals[i] / mx * 100) })
      return row
    })
  }, [selectedMeta])

  const elevProfiles = useMemo(() =>
    selectedMeta.map(m => { const full = fullData.get(m.id); return full ? buildElevProfile(full) : [] })
  , [selectedMeta, fullData])

  const elevMerged = useMemo(() => {
    if (elevProfiles.every(p => p.length === 0)) return []
    return Array.from({ length: 60 }, (_, i) => {
      const pct = Math.round(i / 59 * 100)
      const row: Record<string, any> = { pct }
      elevProfiles.forEach((profile, pi) => {
        if (profile.length > 0) {
          const idx = Math.min(Math.round(i * (profile.length - 1) / 59), profile.length - 1)
          row[`a${pi}`] = profile[idx]?.alt
        }
      })
      return row
    })
  }, [elevProfiles])

  const hrZones = useMemo(() =>
    selectedMeta.map(m => {
      const full = fullData.get(m.id)
      if (!full) return []
      return computeHRZones(full.trackPoints, full.maxHeartRate || 190)
    })
  , [selectedMeta, fullData])

  const allFullLoaded = selectedMeta.length >= 2 && selectedMeta.every(m => fullData.has(m.id))

  const plannedRadarData = useMemo(() => {
    if (selectedPlanned.length < 2) return []
    const metrics = [
      { label: 'Distanza',    get: (h: PlannedHikeMeta) => h.distanceMeters / 1000 },
      { label: 'Dislivello',  get: (h: PlannedHikeMeta) => h.elevationGain },
      { label: 'Durata stim.',get: (h: PlannedHikeMeta) => h.estimatedTimeSeconds / 3600 },
      { label: 'Quota max',   get: (h: PlannedHikeMeta) => h.altitudeMax },
      { label: 'D+/km',       get: (h: PlannedHikeMeta) => difficultyIndex(h.elevationGain, h.distanceMeters) },
    ]
    return metrics.map(m => {
      const vals = selectedPlanned.map(h => m.get(h))
      const mx = Math.max(...vals, 1)
      const row: Record<string, any> = { metric: m.label }
      selectedPlanned.forEach((h, i) => { row[`a${i}`] = Math.round(vals[i] / mx * 100) })
      return row
    })
  }, [selectedPlanned])

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex gap-1 bg-stone-100 rounded-xl p-1 w-fit">
        <button onClick={() => switchMode('completate')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${compareMode === 'completate' ? 'bg-white shadow-sm text-forest-700' : 'text-stone-500 hover:text-stone-700'}`}>
          <Activity className="w-3.5 h-3.5" /> Completate
        </button>
        <button onClick={() => switchMode('pianificate')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${compareMode === 'pianificate' ? 'bg-white shadow-sm text-sky-700' : 'text-stone-500 hover:text-stone-700'}`}>
          <Shuffle className="w-3.5 h-3.5" /> Pianificate
        </button>
      </div>

      {/* ── Completate ── */}
      {compareMode === 'completate' && (
        <>
          <div>
            <p className="text-sm text-stone-500 mb-4">Seleziona da 2 a 4 escursioni per confrontarle.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {activities.map(a => {
                const sel = selectedIds.has(a.id)
                const disabled = !sel && selectedIds.size >= 4
                return (
                  <button key={a.id} disabled={disabled} onClick={() => toggleSelect(a.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                      ${sel ? 'border-forest-400 bg-forest-50' : 'border-stone-200 bg-white hover:border-stone-300'}
                      ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-forest-600 border-forest-600' : 'border-stone-300'}`}>
                      {sel && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-700 truncate">{a.title ?? 'Escursione'}</p>
                      <p className="text-xs text-stone-400">{format(new Date(a.startTime), 'dd MMM yy', { locale: it })} · {(a.distanceMeters/1000).toFixed(1)} km · ↑{Math.round(a.elevationGain)} m</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {selectedMeta.length >= 2 && (
            <div className="space-y-6">
              {/* Stats table */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="font-medium text-stone-700">Confronto statistiche</h3>
                  <button onClick={() => setShowShare(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-700 text-white rounded-lg text-xs hover:bg-forest-600 transition-colors">
                    <Share2 className="w-3.5 h-3.5" /> Condividi
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs text-stone-400 uppercase tracking-wide font-medium">Metrica</th>
                        {selectedMeta.map((a, i) => (
                          <th key={a.id} className="px-4 py-3 text-left text-xs font-medium" style={{ color: COMPARISON_COLORS[i] }}>{a.title ?? 'Escursione'}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {[
                        { label: 'Data',           fmt: (a: ActivityMeta) => format(new Date(a.startTime), 'dd/MM/yyyy') },
                        { label: 'Distanza',        fmt: (a: ActivityMeta) => `${(a.distanceMeters/1000).toFixed(2)} km` },
                        { label: 'Durata',          fmt: (a: ActivityMeta) => formatDuration(a.totalTimeSeconds) },
                        { label: 'Passo medio',     fmt: (a: ActivityMeta) => formatPaceMinkm(a.distanceMeters, a.totalTimeSeconds) },
                        { label: 'Dislivello ↑',   fmt: (a: ActivityMeta) => `${Math.round(a.elevationGain)} m` },
                        { label: 'Dislivello ↓',   fmt: (a: ActivityMeta) => `${Math.round(a.elevationLoss)} m` },
                        { label: 'Indice difficoltà', fmt: (a: ActivityMeta) => `${difficultyIndex(a.elevationGain, a.distanceMeters)} m/km` },
                        { label: 'Quota massima',   fmt: (a: ActivityMeta) => `${Math.round(a.altitudeMax)} m` },
                        { label: 'FC media',        fmt: (a: ActivityMeta) => a.avgHeartRate ? `${a.avgHeartRate} bpm` : '—' },
                        { label: 'FC massima',      fmt: (a: ActivityMeta) => a.maxHeartRate ? `${a.maxHeartRate} bpm` : '—' },
                        { label: 'Velocità media',  fmt: (a: ActivityMeta) => `${msToKmh(a.avgSpeedMs)} km/h` },
                        { label: 'Calorie',         fmt: (a: ActivityMeta) => a.calories ? `${a.calories} kcal` : '—' },
                      ].map(({ label, fmt }) => (
                        <tr key={label}>
                          <td className="px-4 py-2.5 text-stone-500 font-medium text-xs">{label}</td>
                          {selectedMeta.map((a, i) => (
                            <td key={a.id} className="px-4 py-2.5 font-mono text-stone-700 text-xs" style={{ borderLeft: `3px solid ${COMPARISON_COLORS[i]}20` }}>{fmt(a)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Radar */}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="font-medium text-stone-700 mb-4">Radar confronto (normalizzato 0-100)</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                      {selectedMeta.map((a, i) => (
                        <Radar key={a.id} name={a.title ?? `Escursione ${i+1}`}
                          dataKey={`a${i}`} stroke={COMPARISON_COLORS[i]}
                          fill={COMPARISON_COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
                      ))}
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Elevation profiles + HR zones */}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-stone-700 flex items-center gap-1.5">
                    Profili altimetrici sovrapposti + Zone FC
                    <InfoButton section="zone-fc" onGuideLink={onGuideLink} />
                  </h3>
                  {!allFullLoaded && (
                    <button onClick={loadFullData} disabled={loadingFull}
                      className="flex items-center gap-2 px-4 py-2 bg-forest-600 text-white rounded-lg text-sm hover:bg-forest-700 transition-colors disabled:opacity-60">
                      {loadingFull ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mountain className="w-3.5 h-3.5" />}
                      Carica dati GPS
                    </button>
                  )}
                </div>
                {!allFullLoaded ? (
                  <p className="text-sm text-stone-400 text-center py-8">Clicca "Carica dati GPS" per visualizzare i profili altimetrici e le zone cardiache.</p>
                ) : (
                  <div className="space-y-6">
                    {elevMerged.length > 0 && (
                      <div className="h-56">
                        <p className="text-xs text-stone-400 mb-2">X: % percorso completato · Y: quota (m slm)</p>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={elevMerged} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                            <XAxis dataKey="pct" unit="%" tick={{ fontSize: 10 }} tickLine={false} />
                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" m" width={52} />
                            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }} />
                            {selectedMeta.map((a, i) => (
                              elevProfiles[i].length > 0 && (
                                <Line key={a.id} type="monotone" dataKey={`a${i}`}
                                  name={a.title ?? `Escursione ${i+1}`}
                                  stroke={COMPARISON_COLORS[i]} strokeWidth={2} dot={false} />
                              )
                            ))}
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {hrZones.some(z => z.length > 0) && (
                      <div>
                        <p className="text-xs font-medium text-stone-500 mb-3 uppercase tracking-wide">Zone frequenza cardiaca (% del tempo)</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {selectedMeta.map((a, i) => (
                            hrZones[i].length > 0 && (
                              <div key={a.id}>
                                <p className="text-xs font-medium mb-2" style={{ color: COMPARISON_COLORS[i] }}>{a.title ?? `Escursione ${i+1}`}</p>
                                <div className="space-y-1.5">
                                  {hrZones[i].map(z => (
                                    <div key={z.name} className="flex items-center gap-2">
                                      <span className="text-xs text-stone-500 w-24 shrink-0">{z.name}</span>
                                      <div className="flex-1 bg-stone-100 rounded-full h-3">
                                        <div className="h-3 rounded-full" style={{ width: `${z.pct}%`, backgroundColor: z.color }} />
                                      </div>
                                      <span className="text-xs text-stone-500 w-8 text-right">{z.pct}%</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedIds.size === 0 && (
            <div className="text-center py-12 text-stone-400">
              <GitCommitHorizontal className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Seleziona almeno 2 escursioni dalla lista per iniziare il confronto.</p>
            </div>
          )}
        </>
      )}

      {/* ── Pianificate ── */}
      {compareMode === 'pianificate' && (
        <>
          {loadingPlanned ? (
            <div className="flex items-center justify-center py-16 gap-3 text-stone-400">
              <Loader2 className="w-5 h-5 animate-spin" /><span>Caricamento escursioni pianificate…</span>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm text-stone-500 mb-4">Seleziona da 2 a 4 escursioni pianificate per confrontarle.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {plannedMetas.map(h => {
                    const sel = selectedPlannedIds.has(h.id)
                    const disabled = !sel && selectedPlannedIds.size >= 4
                    return (
                      <button key={h.id} disabled={disabled} onClick={() => togglePlanned(h.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                          ${sel ? 'border-sky-400 bg-sky-50' : 'border-stone-200 bg-white hover:border-stone-300'}
                          ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-sky-600 border-sky-600' : 'border-stone-300'}`}>
                          {sel && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-stone-700 truncate">{h.title}</p>
                          <p className="text-xs text-stone-400">{(h.distanceMeters/1000).toFixed(1)} km · ↑{Math.round(h.elevationGain)} m</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedPlanned.length >= 2 && (
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-stone-100">
                      <h3 className="font-medium text-stone-700">Confronto — Escursioni pianificate</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-stone-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs text-stone-400 uppercase tracking-wide font-medium">Metrica</th>
                            {selectedPlanned.map((h, i) => (
                              <th key={h.id} className="px-4 py-3 text-left text-xs font-medium" style={{ color: COMPARISON_COLORS[i] }}>{h.title}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {[
                            { label: 'Data pianif.',  fmt: (h: PlannedHikeMeta) => h.plannedDate ? format(new Date(h.plannedDate), 'dd/MM/yyyy') : '—' },
                            { label: 'Distanza',      fmt: (h: PlannedHikeMeta) => `${(h.distanceMeters/1000).toFixed(2)} km` },
                            { label: 'Durata stim.',  fmt: (h: PlannedHikeMeta) => formatDuration(h.estimatedTimeSeconds) },
                            { label: 'Dislivello ↑', fmt: (h: PlannedHikeMeta) => `${Math.round(h.elevationGain)} m` },
                            { label: 'Dislivello ↓', fmt: (h: PlannedHikeMeta) => `${Math.round(h.elevationLoss)} m` },
                            { label: 'Quota max',    fmt: (h: PlannedHikeMeta) => `${Math.round(h.altitudeMax)} m` },
                            { label: 'Indice diff.', fmt: (h: PlannedHikeMeta) => `${difficultyIndex(h.elevationGain, h.distanceMeters)} m/km` },
                            { label: 'Difficoltà',   fmt: (h: PlannedHikeMeta) => h.assessment?.difficulty ?? '—' },
                            { label: 'Adatta a te',  fmt: (h: PlannedHikeMeta) => h.assessment ? `${h.assessment.suitabilityScore}%` : '—' },
                          ].map(({ label, fmt }) => (
                            <tr key={label}>
                              <td className="px-4 py-2.5 text-stone-500 font-medium text-xs">{label}</td>
                              {selectedPlanned.map((h, i) => (
                                <td key={h.id} className="px-4 py-2.5 font-mono text-stone-700 text-xs capitalize" style={{ borderLeft: `3px solid ${COMPARISON_COLORS[i]}20` }}>{fmt(h)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                    <h3 className="font-medium text-stone-700 mb-4">Radar confronto (normalizzato 0-100)</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={plannedRadarData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                          {selectedPlanned.map((h, i) => (
                            <Radar key={h.id} name={h.title}
                              dataKey={`a${i}`} stroke={COMPARISON_COLORS[i]}
                              fill={COMPARISON_COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
                          ))}
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {selectedPlannedIds.size === 0 && plannedMetas.length === 0 && (
                <div className="text-center py-12 text-stone-400">
                  <Mountain className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nessuna escursione pianificata trovata. Carica prima un file GPX.</p>
                </div>
              )}
              {selectedPlannedIds.size === 0 && plannedMetas.length > 0 && (
                <div className="text-center py-12 text-stone-400">
                  <GitCommitHorizontal className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Seleziona almeno 2 escursioni pianificate per il confronto.</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showShare && (
        <ShareModal kind="comparison" activities={selectedMeta} onClose={() => setShowShare(false)} />
      )}
    </div>
  )
}
