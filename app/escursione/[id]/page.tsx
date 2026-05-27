'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import StatCard from '@/components/StatCard'
import HRChart from '@/components/HRChart'
import AltimetryChart from '@/components/AltimetryChart'
import SpeedChart from '@/components/SpeedChart'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import {
  getActivityById, updateActivityMeta, deleteActivity,
  type StoredActivity,
} from '@/lib/blobStore'
import { formatDuration, msToKmh, formatPace } from '@/lib/tcxParser'
import { exportActivityToExcel } from '@/utils/exportExcel'
import { exportActivityToDoc } from '@/utils/exportDoc'
import { exportActivityToGpx } from '@/utils/exportGpx'
import { fetchPoisNearTrack, type PoiItem } from '@/lib/overpass'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft, FileSpreadsheet, FileText, Map,
  Heart, Zap, Mountain, Clock, Route, Flame,
  Pencil, Check, X, Trash2, Loader2, Share2, Layers,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'
import type { ActivityMeta } from '@/lib/blobStore'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

export default function EscursionePage() {
  const params  = useParams()
  const router  = useRouter()
  const id      = decodeURIComponent(params.id as string)

  const [activity,     setActivity]    = useState<StoredActivity | null>(null)
  const [loading,      setLoading]     = useState(true)
  const [saving,       setSaving]      = useState(false)
  const [editTitle,    setEditTitle]   = useState(false)
  const [editNotes,    setEditNotes]   = useState(false)
  const [titleVal,     setTitleVal]    = useState('')
  const [notesVal,     setNotesVal]    = useState('')
  const [tagInput,     setTagInput]    = useState('')
  const [showShare,    setShowShare]   = useState(false)
  const [showGradient, setShowGradient] = useState(false)
  const [pois,         setPois]        = useState<PoiItem[]>([])

  useEffect(() => {
    getActivityById(id)
      .then(a => {
        if (!a) { router.push('/'); return }
        setActivity(a)
        setTitleVal(a.title ?? a.notes ?? '')
        setNotesVal(a.userNotes ?? '')
        // Fetch POIs in background
        const gpsPoints = a.trackPoints
          .filter(p => p.lat !== undefined && p.lon !== undefined)
          .map(p => [p.lat!, p.lon!] as [number, number])
        if (gpsPoints.length > 0) {
          fetchPoisNearTrack(gpsPoints, 300).then(setPois).catch(() => {})
        }
      })
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Navbar />
        <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Caricamento escursione…</span>
        </div>
      </div>
    )
  }
  if (!activity) return null

  const patch = async (data: Parameters<typeof updateActivityMeta>[1]) => {
    setSaving(true)
    try {
      await updateActivityMeta(id, data)
      setActivity(prev => prev ? { ...prev, ...data } : prev)
    } finally {
      setSaving(false)
    }
  }

  const saveTitle = async () => { await patch({ title: titleVal }); setEditTitle(false) }
  const saveNotes = async () => { await patch({ userNotes: notesVal }); setEditNotes(false) }

  const addTag = async () => {
    if (!tagInput.trim()) return
    const tags = [...(activity.tags ?? []), tagInput.trim()]
    await patch({ tags }); setTagInput('')
  }
  const removeTag = async (tag: string) => {
    await patch({ tags: (activity.tags ?? []).filter(t => t !== tag) })
  }

  const handleDelete = async () => {
    if (!confirm('Eliminare questa escursione dal diario?')) return
    setSaving(true)
    await deleteActivity(id)
    router.push('/')
  }

  const dateStr  = format(new Date(activity.startTime), "EEEE d MMMM yyyy", { locale: it })
  const timeStr  = `${format(new Date(activity.startTime), 'HH:mm')} – ${format(new Date(activity.endTime), 'HH:mm')}`
  const dateISO  = format(new Date(activity.startTime), 'yyyy-MM-dd')
  const gpsPoints = activity.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />

      <div className="bg-forest-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-forest-200 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Torna al diario
          </button>

          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              {editTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    value={titleVal}
                    onChange={e => setTitleVal(e.target.value)}
                    className="font-display text-xl sm:text-2xl bg-forest-700 rounded-lg px-3 py-1 text-white outline-none border border-forest-500 w-full max-w-xs"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveTitle()}
                  />
                  <button onClick={saveTitle} disabled={saving}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin text-forest-300" /> : <Check className="w-5 h-5 text-forest-300 hover:text-white" />}
                  </button>
                  <button onClick={() => setEditTitle(false)}><X className="w-5 h-5 text-forest-400 hover:text-white" /></button>
                </div>
              ) : (
                <button onClick={() => setEditTitle(true)} className="group flex items-center gap-2 text-left">
                  <h1 className="font-display text-xl sm:text-2xl font-semibold">
                    {activity.title ?? activity.notes ?? 'Escursione'}
                  </h1>
                  <Pencil className="w-4 h-4 text-forest-400 group-hover:text-forest-200 transition-colors shrink-0" />
                </button>
              )}
              <p className="text-forest-300 text-xs sm:text-sm mt-1 capitalize">{dateStr} · {timeStr}</p>
              {activity.device && <p className="text-forest-400 text-xs mt-0.5">📱 {activity.device}</p>}
            </div>

            {/* Action buttons — icon+label on sm+, icon-only on mobile */}
            <div className="flex gap-1.5 flex-wrap shrink-0">
              <button onClick={() => exportActivityToExcel(activity)}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-forest-700 hover:bg-forest-600 rounded-lg text-sm transition-colors">
                <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">Excel</span>
              </button>
              <button onClick={() => exportActivityToDoc(activity)}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-forest-700 hover:bg-forest-600 rounded-lg text-sm transition-colors">
                <FileText className="w-4 h-4" /> <span className="hidden sm:inline">Word</span>
              </button>
              <button onClick={() => exportActivityToGpx(activity)}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-forest-700 hover:bg-forest-600 rounded-lg text-sm transition-colors">
                <Map className="w-4 h-4" /> <span className="hidden sm:inline">GPX</span>
              </button>
              <button onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-forest-700 hover:bg-forest-600 rounded-lg text-sm transition-colors">
                <Share2 className="w-4 h-4" /> <span className="hidden sm:inline">Condividi</span>
              </button>
              <button onClick={handleDelete} disabled={saving}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-red-800/50 hover:bg-red-700 rounded-lg text-sm transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {(activity.tags ?? []).map(tag => (
              <span key={tag} className="flex items-center gap-1 bg-forest-700 text-forest-200 rounded-full px-3 py-0.5 text-xs">
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="+ tag"
                className="bg-forest-700/50 text-forest-200 placeholder-forest-500 rounded-full px-3 py-0.5 text-xs w-24 outline-none border border-transparent focus:border-forest-500"
              />
            </div>
          </div>
        </div>
      </div>

      {showShare && (() => {
        const polyline = activity.trackPoints
          .filter(p => p.lat !== undefined && p.lon !== undefined)
          .map(p => [p.lat!, p.lon!] as [number, number])
        const step = Math.max(1, Math.ceil(polyline.length / 250))
        const actMeta: ActivityMeta = {
          id: activity.id,
          title: activity.title ?? activity.notes ?? 'Escursione',
          startTime: activity.startTime,
          distanceMeters: activity.distanceMeters,
          totalTimeSeconds: activity.totalTimeSeconds,
          calories: activity.calories,
          avgHeartRate: activity.avgHeartRate,
          maxHeartRate: activity.maxHeartRate,
          elevationGain: activity.elevationGain,
          elevationLoss: activity.elevationLoss,
          altitudeMax: activity.altitudeMax,
          avgSpeedMs: activity.avgSpeedMs,
          maxSpeedMs: activity.maxSpeedMs,
          tags: activity.tags,
          userNotes: activity.userNotes,
          fileName: activity.fileName,
          routePolyline: polyline.filter((_, i) => i % step === 0),
        }
        return <ShareModal kind="activity" activity={actMeta} onClose={() => setShowShare(false)} />
      })()}

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-8 fade-up">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-6 sm:mb-8">
          <StatCard label="Distanza"    value={`${(activity.distanceMeters / 1000).toFixed(2)} km`} color="forest" icon={<Route className="w-3.5 h-3.5" />} />
          <StatCard label="Durata"      value={formatDuration(activity.totalTimeSeconds)} color="terra" icon={<Clock className="w-3.5 h-3.5" />} />
          <StatCard label="FC Media"    value={`${activity.avgHeartRate} bpm`} sub={`Max ${activity.maxHeartRate} bpm`} color="red" icon={<Heart className="w-3.5 h-3.5" />} />
          <StatCard label="Vel. Media"  value={`${msToKmh(activity.avgSpeedMs)} km/h`} sub={`Max ${msToKmh(activity.maxSpeedMs)} km/h`} color="blue" icon={<Zap className="w-3.5 h-3.5" />} />
          <StatCard label="Dislivello ↑" value={`${activity.elevationGain.toFixed(0)} m`} sub={`↓ ${activity.elevationLoss.toFixed(0)} m`} color="forest" icon={<Mountain className="w-3.5 h-3.5" />} />
          <StatCard label="Calorie"     value={`${activity.calories} kcal`} color="terra" icon={<Flame className="w-3.5 h-3.5" />} />
        </div>

        {/* Meteo storico */}
        {hasGps && (
          <section className="mb-6">
            <WeatherWidget mode="historical" lat={centerPt.lat!} lon={centerPt.lon!} date={dateISO} />
          </section>
        )}

        {/* Mappa */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl font-semibold text-stone-700">Tracciato GPS</h2>
            {hasGps && activity.trackPoints.some(p => p.altitudeMeters !== undefined) && (
              <button
                onClick={() => setShowGradient(g => !g)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${showGradient ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mappa pendenza</span>
              </button>
            )}
          </div>
          <MapView
            trackPoints={activity.trackPoints}
            height="280px"
            showGradient={showGradient}
            pois={pois}
          />
          {pois.length > 0 && (
            <p className="text-xs text-stone-400 mt-1.5">{pois.length} punti di interesse trovati lungo il tracciato</p>
          )}
        </section>

        {/* Grafici */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <h3 className="font-medium text-stone-700 mb-4 flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500" /> Frequenza Cardiaca
            </h3>
            <HRChart trackPoints={activity.trackPoints} avgHR={activity.avgHeartRate} maxHR={activity.maxHeartRate} />
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <h3 className="font-medium text-stone-700 mb-4 flex items-center gap-2">
              <Mountain className="w-4 h-4 text-forest-600" /> Profilo Altimetrico
            </h3>
            <AltimetryChart trackPoints={activity.trackPoints} />
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <h3 className="font-medium text-stone-700 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-terra-500" /> Velocità
            </h3>
            <SpeedChart trackPoints={activity.trackPoints} avgSpeedMs={activity.avgSpeedMs} />
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <h3 className="font-medium text-stone-700 mb-4">Dati tecnici completi</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['Passo medio', formatPace(activity.distanceMeters, activity.totalTimeSeconds)],
                ['Quota partenza', `${activity.trackPoints[0]?.altitudeMeters?.toFixed(1) ?? '--'} m`],
                ['Quota minima', `${activity.altitudeMin.toFixed(1)} m`],
                ['Quota massima', `${activity.altitudeMax.toFixed(1)} m`],
                ['Totale trackpoint', activity.trackPoints.length.toLocaleString('it')],
                ['Sport', activity.sport],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-stone-100 py-1">
                  <dt className="text-stone-500">{k}</dt>
                  <dd className="font-mono text-stone-700 text-xs font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Wikipedia nearby */}
        {hasGps && (
          <section className="mb-8">
            <h2 className="font-display text-xl font-semibold text-stone-700 mb-3">Luoghi nelle vicinanze</h2>
            <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} />
          </section>
        )}

        {/* Note */}
        <section className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl font-semibold text-stone-700">Note personali</h2>
            {!editNotes && (
              <button onClick={() => setEditNotes(true)}
                className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors">
                <Pencil className="w-4 h-4" /> Modifica
              </button>
            )}
          </div>
          {editNotes ? (
            <div>
              <textarea
                value={notesVal}
                onChange={e => setNotesVal(e.target.value)}
                rows={5}
                placeholder="Descrivi l'escursione, i luoghi visitati, le sensazioni…"
                className="w-full border border-stone-200 rounded-xl p-3 text-stone-700 text-sm outline-none focus:border-forest-400 resize-none"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button onClick={saveNotes} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-forest-600 text-white rounded-lg text-sm hover:bg-forest-700 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salva
                </button>
                <button onClick={() => setEditNotes(false)}
                  className="px-4 py-1.5 border border-stone-200 text-stone-500 rounded-lg text-sm hover:bg-stone-50 transition-colors">
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <p className={`text-sm leading-relaxed ${activity.userNotes ? 'text-stone-600' : 'text-stone-400 italic'}`}>
              {activity.userNotes || 'Nessuna nota. Clicca "Modifica" per aggiungere appunti.'}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
