'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { ActivityMeta, StoredActivity, getActivityById } from '@/lib/blobStore'
import { getAllPlanned, getPlannedById, type PlannedHike, type PlannedHikeMeta } from '@/lib/plannedStore'
import type { TrackPoint } from '@/lib/tcxParser'
import { formatDuration, msToKmh } from '@/lib/tcxParser'
import { formatPaceMinkm, difficultyIndex, haversineM, computeHRZones, COMPARISON_COLORS } from '@/lib/stats'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import ShareModal from '@/components/ShareModal'
import { Check, GitCommitHorizontal, Mountain, Loader2, Share2, Shuffle, Sparkles, Trophy } from 'lucide-react'
import InfoButton from './InfoButton'

interface CompareRanking { id: string; title: string; type: 'completata' | 'pianificata'; position: number; reason: string }
interface CompareAiResult { narrative: string; ranking: CompareRanking[] }

// ── Unified compare entry: works for both registered & planned hikes ──────────

interface CompareEntry {
  combinedId: string
  id: string
  type: 'completata' | 'pianificata'
  title: string
  date?: string
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  durationSeconds: number
  avgHeartRate?: number
  maxHeartRate?: number
  avgSpeedMs?: number
  calories?: number
}

function fromActivity(a: ActivityMeta): CompareEntry {
  return {
    combinedId: `c:${a.id}`, id: a.id, type: 'completata',
    title: a.title ?? 'Escursione', date: a.startTime,
    distanceMeters: a.distanceMeters, elevationGain: a.elevationGain, elevationLoss: a.elevationLoss,
    altitudeMax: a.altitudeMax, durationSeconds: a.totalTimeSeconds,
    avgHeartRate: a.avgHeartRate || undefined, maxHeartRate: a.maxHeartRate || undefined,
    avgSpeedMs: a.avgSpeedMs, calories: a.calories || undefined,
  }
}

function fromPlanned(h: PlannedHikeMeta): CompareEntry {
  return {
    combinedId: `p:${h.id}`, id: h.id, type: 'pianificata',
    title: h.title, date: h.plannedDate,
    distanceMeters: h.distanceMeters, elevationGain: h.elevationGain, elevationLoss: h.elevationLoss,
    altitudeMax: h.altitudeMax, durationSeconds: h.estimatedTimeSeconds,
  }
}

function buildElevProfile(trackPoints: TrackPoint[] | undefined, samples = 60): { pct: number; alt: number }[] {
  const pts = (trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined && p.altitudeMeters !== undefined)
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

interface Props { activities: ActivityMeta[]; preselectId?: string | null }

export default function TabConfronto({ activities, preselectId }: Props) {
  const [selectedIds,     setSelectedIds]     = useState(new Set<string>())
  const [plannedMetas,    setPlannedMetas]    = useState<PlannedHikeMeta[]>([])
  const [loadingPlanned,  setLoadingPlanned]  = useState(false)
  const [plannedLoaded,   setPlannedLoaded]   = useState(false)
  const [fullActivities,  setFullActivities]  = useState(new Map<string, StoredActivity>())
  const [fullPlanned,     setFullPlanned]     = useState(new Map<string, PlannedHike>())
  const [loadingFull,     setLoadingFull]     = useState(false)
  const [showShare,       setShowShare]       = useState(false)
  const [aiResult,        setAiResult]        = useState<CompareAiResult | null>(null)
  const [aiLoading,       setAiLoading]       = useState(false)
  const [aiError,         setAiError]         = useState<string | null>(null)

  const loadPlanned = useCallback(() => {
    if (plannedLoaded) return
    setLoadingPlanned(true)
    getAllPlanned().then(metas => { setPlannedMetas(metas); setPlannedLoaded(true) }).finally(() => setLoadingPlanned(false))
  }, [plannedLoaded])

  // Deep-link dalla scheda percorso in Guida/Resoconto (pulsante "Confronta") — preseleziona il
  // percorso da cui si è partiti; se è una escursione pianificata serve anche caricare
  // plannedMetas, che qui non è attivo di default (a differenza delle attività completate).
  useEffect(() => {
    if (!preselectId) return
    setSelectedIds(prev => prev.has(preselectId) ? prev : new Set(prev).add(preselectId))
    if (preselectId.startsWith('p:')) loadPlanned()
  }, [preselectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (combinedId: string) => {
    setAiResult(null); setAiError(null)
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(combinedId)) next.delete(combinedId)
      else if (next.size < 4) next.add(combinedId)
      return next
    })
  }

  const allEntries = useMemo(() => [
    ...activities.map(fromActivity),
    ...plannedMetas.map(fromPlanned),
  ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), [activities, plannedMetas])

  const selected = useMemo(
    () => allEntries.filter(e => selectedIds.has(e.combinedId)),
    [allEntries, selectedIds],
  )

  const loadFullData = useCallback(async () => {
    setLoadingFull(true)
    const actMap = new Map(fullActivities)
    const planMap = new Map(fullPlanned)
    await Promise.all(selected.map(async e => {
      if (e.type === 'completata' && !actMap.has(e.id)) {
        const a = await getActivityById(e.id); if (a) actMap.set(e.id, a)
      } else if (e.type === 'pianificata' && !planMap.has(e.id)) {
        const h = await getPlannedById(e.id); if (h) planMap.set(e.id, h)
      }
    }))
    setFullActivities(actMap)
    setFullPlanned(planMap)
    setLoadingFull(false)
  }, [selected, fullActivities, fullPlanned])

  // Il confronto AI valuta fino a 3 percorsi alla volta (oltre diventa poco leggibile e più
  // costoso) — il confronto numerico/grafico sopra resta comunque libero fino a 4.
  const canAiCompare = selected.length >= 2 && selected.length <= 3
  const runAiCompare = useCallback(async () => {
    setAiLoading(true); setAiError(null); setAiResult(null)
    try {
      const res = await fetch('/api/route-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: selected.map(e => ({ id: e.id, type: e.type })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Errore durante il confronto AI')
      setAiResult(data as CompareAiResult)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Errore durante il confronto AI')
    } finally {
      setAiLoading(false)
    }
  }, [selected])

  const allFullLoaded = selected.length >= 2 && selected.every(e =>
    e.type === 'completata' ? fullActivities.has(e.id) : fullPlanned.has(e.id),
  )

  const radarData = useMemo(() => {
    if (selected.length < 2) return []
    const metrics = [
      { label: 'Distanza',   get: (e: CompareEntry) => e.distanceMeters / 1000 },
      { label: 'Dislivello', get: (e: CompareEntry) => e.elevationGain },
      { label: 'Durata',     get: (e: CompareEntry) => e.durationSeconds / 3600 },
      { label: 'D+/km',      get: (e: CompareEntry) => difficultyIndex(e.elevationGain, e.distanceMeters) },
    ]
    return metrics.map(m => {
      const vals = selected.map(m.get)
      const mx = Math.max(...vals) || 1
      const row: Record<string, any> = { metric: m.label }
      selected.forEach((e, i) => { row[`a${i}`] = Math.round(vals[i] / mx * 100) })
      return row
    })
  }, [selected])

  const elevProfiles = useMemo(() =>
    selected.map(e => {
      const tp = e.type === 'completata' ? fullActivities.get(e.id)?.trackPoints : fullPlanned.get(e.id)?.trackPoints
      return buildElevProfile(tp)
    })
  , [selected, fullActivities, fullPlanned])

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
    selected.map(e => {
      if (e.type !== 'completata') return []
      const full = fullActivities.get(e.id)
      if (!full) return []
      return computeHRZones(full.trackPoints, full.maxHeartRate || 190)
    })
  , [selected, fullActivities])

  const shareActivities = useMemo(
    () => selected.filter(e => e.type === 'completata').map(e => activities.find(a => a.id === e.id)).filter((a): a is ActivityMeta => !!a),
    [selected, activities],
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-stone-500 mb-1">Seleziona da 2 a 4 escursioni — registrate o pianificate — per confrontarle.</p>
        <button onClick={loadPlanned} disabled={plannedLoaded || loadingPlanned}
          className="text-xs text-sky-600 hover:text-sky-700 disabled:opacity-0 disabled:pointer-events-none mb-3 flex items-center gap-1.5">
          {loadingPlanned ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shuffle className="w-3 h-3" />}
          Carica anche le escursioni pianificate
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
          {allEntries.map(e => {
            const sel = selectedIds.has(e.combinedId)
            const disabled = !sel && selectedIds.size >= 4
            const selBorderBg = e.type === 'completata' ? 'border-forest-400 bg-forest-50' : 'border-sky-400 bg-sky-50'
            const selCheckbox = e.type === 'completata' ? 'bg-forest-600 border-forest-600' : 'bg-sky-600 border-sky-600'
            return (
              <button key={e.combinedId} disabled={disabled} onClick={() => toggleSelect(e.combinedId)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                  ${sel ? selBorderBg : 'border-stone-200 bg-white hover:border-stone-300'}
                  ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${sel ? selCheckbox : 'border-stone-300'}`}>
                  {sel && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-stone-700 truncate">{e.title}</p>
                    <span className={`shrink-0 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full ${e.type === 'completata' ? 'bg-forest-100 text-forest-700' : 'bg-sky-100 text-sky-700'}`}>
                      {e.type === 'completata' ? 'Registrata' : 'Pianificata'}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400">
                    {e.date && `${format(new Date(e.date), 'dd MMM yy', { locale: it })} · `}
                    {(e.distanceMeters/1000).toFixed(1)} km · ↑{Math.round(e.elevationGain)} m
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {selected.length >= 2 && (
        <div className="space-y-6">
          {/* Resoconto AI */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
            {!aiResult && !aiLoading && (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-terra-100 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-terra-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-stone-700">Resoconto AI</h3>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {canAiCompare
                        ? 'Giulia confronta questi percorsi e li ordina in base al tuo profilo e al tuo storico.'
                        : 'Seleziona al massimo 3 percorsi per chiedere un resoconto AI.'}
                    </p>
                  </div>
                </div>
                <button onClick={runAiCompare} disabled={!canAiCompare}
                  className="flex items-center gap-1.5 px-4 py-2 bg-terra-600 text-white rounded-lg text-sm hover:bg-terra-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                  <Sparkles className="w-4 h-4" /> Chiedi un resoconto AI
                </button>
              </div>
            )}

            {aiLoading && (
              <div className="flex items-center gap-3 py-4 justify-center text-stone-500">
                <Loader2 className="w-5 h-5 animate-spin text-terra-500" />
                <p className="text-sm">Giulia sta confrontando i percorsi…</p>
              </div>
            )}

            {aiError && !aiLoading && (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-red-600">{aiError}</p>
                <button onClick={runAiCompare} className="text-xs text-terra-600 hover:text-terra-700 font-medium shrink-0">Riprova</button>
              </div>
            )}

            {aiResult && !aiLoading && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-stone-700 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-terra-600" /> Resoconto AI
                  </h3>
                  <button onClick={runAiCompare} className="text-xs text-terra-600 hover:text-terra-700 font-medium shrink-0">Rigenera</button>
                </div>
                <p className="text-sm text-stone-600 leading-relaxed">{aiResult.narrative}</p>
                <div className="space-y-2">
                  {aiResult.ranking.map(r => (
                    <div key={r.id} className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-100">
                      <div className="w-7 h-7 rounded-full bg-terra-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {r.position === 1 ? <Trophy className="w-3.5 h-3.5" /> : r.position}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-700 truncate">{r.title}</p>
                        {r.reason && <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{r.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stats table */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="font-medium text-stone-700">Confronto statistiche</h3>
              {shareActivities.length >= 2 && (
                <button onClick={() => setShowShare(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-700 text-white rounded-lg text-xs hover:bg-forest-600 transition-colors">
                  <Share2 className="w-3.5 h-3.5" /> Condividi
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs text-stone-400 uppercase tracking-wide font-medium">Metrica</th>
                    {selected.map((e, i) => (
                      <th key={e.combinedId} className="px-4 py-3 text-left text-xs font-medium" style={{ color: COMPARISON_COLORS[i] }}>
                        {e.title}
                        <span className="block text-[9px] uppercase tracking-wide text-stone-400 font-normal mt-0.5">
                          {e.type === 'completata' ? 'Registrata' : 'Pianificata'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {[
                    { label: 'Data',              fmt: (e: CompareEntry) => e.date ? format(new Date(e.date), 'dd/MM/yyyy') : '—' },
                    { label: 'Distanza',          fmt: (e: CompareEntry) => `${(e.distanceMeters/1000).toFixed(2)} km` },
                    { label: 'Durata',             fmt: (e: CompareEntry) => `${formatDuration(e.durationSeconds)}${e.type === 'pianificata' ? ' (stim.)' : ''}` },
                    { label: 'Passo medio',       fmt: (e: CompareEntry) => e.type === 'completata' ? formatPaceMinkm(e.distanceMeters, e.durationSeconds) : '—' },
                    { label: 'Dislivello ↑',      fmt: (e: CompareEntry) => `${Math.round(e.elevationGain)} m` },
                    { label: 'Dislivello ↓',      fmt: (e: CompareEntry) => `${Math.round(e.elevationLoss)} m` },
                    { label: 'Indice difficoltà', fmt: (e: CompareEntry) => `${difficultyIndex(e.elevationGain, e.distanceMeters)} m/km` },
                    { label: 'Quota massima',     fmt: (e: CompareEntry) => `${Math.round(e.altitudeMax)} m` },
                    { label: 'FC media',          fmt: (e: CompareEntry) => e.avgHeartRate ? `${e.avgHeartRate} bpm` : '—' },
                    { label: 'FC massima',        fmt: (e: CompareEntry) => e.maxHeartRate ? `${e.maxHeartRate} bpm` : '—' },
                    { label: 'Velocità media',    fmt: (e: CompareEntry) => e.avgSpeedMs ? `${msToKmh(e.avgSpeedMs)} km/h` : '—' },
                    { label: 'Calorie',           fmt: (e: CompareEntry) => e.calories ? `${e.calories} kcal` : '—' },
                  ].map(({ label, fmt }) => (
                    <tr key={label}>
                      <td className="px-4 py-2.5 text-stone-500 font-medium text-xs">{label}</td>
                      {selected.map((e, i) => (
                        <td key={e.combinedId} className="px-4 py-2.5 font-mono text-stone-700 text-xs" style={{ borderLeft: `3px solid ${COMPARISON_COLORS[i]}20` }}>{fmt(e)}</td>
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
                  {selected.map((e, i) => (
                    <Radar key={e.combinedId} name={e.title}
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
              <h3 className="font-medium text-stone-700 flex items-center gap-1.5 flex-wrap">
                Profili altimetrici sovrapposti + Zone FC
                <InfoButton section="zone-fc" />
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
              <p className="text-sm text-stone-400 text-center py-8">Clicca &quot;Carica dati GPS&quot; per visualizzare i profili altimetrici e le zone cardiache.</p>
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
                        {selected.map((e, i) => (
                          elevProfiles[i].length > 0 && (
                            <Line key={e.combinedId} type="monotone" dataKey={`a${i}`}
                              name={e.title}
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
                      {selected.map((e, i) => (
                        hrZones[i].length > 0 && (
                          <div key={e.combinedId}>
                            <p className="text-xs font-medium mb-2" style={{ color: COMPARISON_COLORS[i] }}>{e.title}</p>
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

      {showShare && (
        <ShareModal kind="comparison" activities={shareActivities} onClose={() => setShowShare(false)} />
      )}
    </div>
  )
}
