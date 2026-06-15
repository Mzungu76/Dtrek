'use client'
import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { getAllActivities, getActivityById, type ActivityMeta } from '@/lib/blobStore'
import { fetchPoisNearTrack } from '@/lib/poisProxy'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Loader2, Mountain, Trophy, RefreshCw, Map, Info, Share2, ExternalLink,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'

const AllRoutesMap = dynamic(() => import('@/components/AllRoutesMap'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface Peak {
  id: number
  name: string
  ele: number
  lat: number
  lon: number
  activityId: string
  activityTitle: string
  activityDate: string
}

interface PeaksCache {
  activityIds: string[]
  peaks: Peak[]
  timestamp: number
}

const CACHE_KEY = 'dtrek_vette_cache'
const CACHE_TTL = 86_400_000 // 24 h

function loadCache(): PeaksCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c: PeaksCache = JSON.parse(raw)
    if (Date.now() - c.timestamp > CACHE_TTL) return null
    return c
  } catch { return null }
}

function saveCache(peaks: Peak[], activityIds: string[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ peaks, activityIds, timestamp: Date.now() }))
  } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  activities: ActivityMeta[]
}

export default function TabTerritorio({ activities }: Props) {
  const [peaks,        setPeaks]        = useState<Peak[]>([])
  const [peaksLoading, setPeaksLoading] = useState(false)
  const [progress,     setProgress]     = useState('')
  const [cacheHit,     setCacheHit]     = useState(false)
  const [sortBy,       setSortBy]       = useState<'ele' | 'date'>('ele')
  const [showShare,    setShowShare]    = useState(false)
  const [started,      setStarted]      = useState(false)

  // Build map routes from activities
  const routesWithPolyline = activities.filter(a => a.routePolyline && a.routePolyline.length > 1)
  const routesWithoutPolyline = activities.length - routesWithPolyline.length
  const mapRoutes = routesWithPolyline.map(a => ({
    id: a.id,
    title: a.title ?? 'Escursione',
    startTime: a.startTime,
    polyline: a.routePolyline as [number, number][],
  }))

  const scanPeaks = async (metas: ActivityMeta[], force = false) => {
    setPeaksLoading(true)
    const allIds = metas.map(m => m.id)

    const cache = force ? null : loadCache()
    const cachedIds = new Set(cache?.activityIds ?? [])
    const isFullyCached = cache && cache.activityIds.length === allIds.length
      && allIds.every(id => cachedIds.has(id))

    if (isFullyCached) {
      setPeaks(cache.peaks)
      setCacheHit(true)
      setPeaksLoading(false)
      return
    }

    const seen = new Set<number>((cache?.peaks ?? []).map(p => p.id))
    const allPeaks: Peak[] = [...(cache?.peaks ?? [])]
    if (allPeaks.length > 0) setPeaks([...allPeaks])

    const toProcess = metas.filter(m => !cachedIds.has(m.id))

    for (let i = 0; i < toProcess.length; i++) {
      const meta = toProcess[i]
      setProgress(`Analisi ${i + 1}/${toProcess.length}: ${meta.title ?? 'Escursione'}…`)
      try {
        const full = await getActivityById(meta.id)
        if (!full) continue
        const gps = full.trackPoints
          .filter(p => p.lat !== undefined && p.lon !== undefined)
          .map(p => [p.lat!, p.lon!] as [number, number])
        if (gps.length < 2) continue

        const pois = await fetchPoisNearTrack(gps, 300)
        for (const p of pois) {
          if (p.type !== 'peak' || !p.name || seen.has(p.id)) continue
          seen.add(p.id)
          allPeaks.push({
            id:            p.id,
            name:          p.name,
            ele:           p.ele ?? 0,
            lat:           p.lat,
            lon:           p.lon,
            activityId:    meta.id,
            activityTitle: meta.title ?? 'Escursione',
            activityDate:  meta.startTime,
          })
        }
        setPeaks([...allPeaks])
      } catch { }
    }

    saveCache(allPeaks, allIds)
    setCacheHit(false)
    setPeaksLoading(false)
    setProgress('')
  }

  useEffect(() => {
    if (activities.length > 0 && !started) {
      setStarted(true)
      scanPeaks(activities)
    }
  }, [activities]) // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    if (sortBy === 'ele') return [...peaks].sort((a, b) => b.ele - a.ele)
    return [...peaks].sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime())
  }, [peaks, sortBy])

  const highest = peaks.length > 0 ? peaks.reduce((m, p) => p.ele > m.ele ? p : m, peaks[0]) : null

  return (
    <div className="space-y-10">

      {/* ── Mappa ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-forest-100 flex items-center justify-center">
              <Map className="w-4 h-4 text-forest-700" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-stone-800">Mappa generale</h2>
              <p className="text-stone-500 text-xs">
                {routesWithPolyline.length > 0
                  ? `${routesWithPolyline.length} percors${routesWithPolyline.length === 1 ? 'o' : 'i'} con GPS`
                  : 'Nessun percorso GPS disponibile'}
              </p>
            </div>
          </div>
          {activities.length > 0 && (
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Share2 className="w-4 h-4" /> Condividi
            </button>
          )}
        </div>

        <AllRoutesMap routes={mapRoutes} height="420px" />

        {routesWithoutPolyline > 0 && (
          <div className="mt-3 flex items-start gap-2 text-sm text-stone-500 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span>
              {routesWithoutPolyline === 1
                ? '1 escursione non ha'
                : `${routesWithoutPolyline} escursioni non hanno`}{' '}
              il percorso GPS salvato.
            </span>
          </div>
        )}
      </section>

      {/* ── Vette conquistate ── */}
      <section className="border-t border-stone-200 pt-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-stone-800 flex items-center gap-2">
              <Mountain className="w-5 h-5 text-forest-600" /> Vette conquistate
            </h2>
            <p className="text-stone-500 text-sm mt-0.5">
              {peaksLoading
                ? progress || 'Analisi in corso…'
                : `${peaks.length} cime raggiunte${cacheHit ? ' (dalla cache)' : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!peaksLoading && peaks.length > 0 && (
              <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
                {(['ele', 'date'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${sortBy === s ? 'bg-white shadow-sm text-forest-700' : 'text-stone-500 hover:text-stone-700'}`}>
                    {s === 'ele' ? 'Per quota' : 'Per data'}
                  </button>
                ))}
              </div>
            )}
            {!peaksLoading && (
              <button
                onClick={() => scanPeaks(activities, true)}
                title="Rianalizza tutte le escursioni"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-500 hover:border-forest-300 hover:text-forest-700 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Rianalizza
              </button>
            )}
          </div>
        </div>

        {peaksLoading && peaks.length === 0 ? (
          <div className="flex items-center justify-center py-16 gap-3 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>{progress || 'Analisi escursioni in corso…'}</span>
          </div>
        ) : peaks.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Mountain className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-base font-medium">Nessuna cima trovata</p>
            <p className="text-sm mt-1">Le cime vengono rilevate automaticamente dai tracciati GPS.</p>
          </div>
        ) : (
          <>
            {peaksLoading && (
              <div className="flex items-center gap-2 text-xs text-stone-400 mb-4 bg-white border border-stone-100 rounded-xl px-3 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{progress}</span>
              </div>
            )}

            {highest && (
              <div className="bg-gradient-to-r from-forest-700 to-forest-900 text-white rounded-2xl p-5 mb-5 flex items-center gap-4">
                <Trophy className="w-10 h-10 text-yellow-400 shrink-0" />
                <div>
                  <p className="text-forest-200 text-xs font-semibold uppercase tracking-wide">Cima più alta raggiunta</p>
                  <p className="font-display text-2xl font-bold">{highest.name}</p>
                  <p className="text-forest-300 text-sm">⛰ {highest.ele} m slm · {format(new Date(highest.activityDate), 'd MMM yyyy', { locale: it })}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {sorted.map((peak, idx) => (
                <Link
                  key={peak.id}
                  href={`/escursione/${encodeURIComponent(peak.activityId)}`}
                  className="flex items-center gap-4 bg-white rounded-xl border border-stone-200 px-4 py-3 hover:border-forest-300 hover:bg-forest-50 transition-all group"
                >
                  <span className="text-stone-300 font-mono text-xs w-5 text-right shrink-0">
                    {sortBy === 'ele' ? idx + 1 : ''}
                  </span>
                  <span className="text-2xl shrink-0">⛰</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-800 group-hover:text-forest-700 transition-colors">{peak.name}</p>
                    <p className="text-xs text-stone-400 truncate">
                      {format(new Date(peak.activityDate), 'dd MMM yyyy', { locale: it })} · {peak.activityTitle}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-forest-700">{peak.ele > 0 ? `${peak.ele} m` : '—'}</p>
                    <p className="text-xs text-stone-400">slm</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {showShare && (
        <ShareModal kind="map" activities={activities} onClose={() => setShowShare(false)} />
      )}
    </div>
  )
}
