'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { getAllActivities, getActivityById, type ActivityMeta } from '@/lib/blobStore'
import { fetchHikingPoisFromWikidata } from '@/lib/wikidataPois'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ArrowLeft, Mountain, Loader2, Trophy, RefreshCw } from 'lucide-react'

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

export default function VettePage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [peaks,      setPeaks]      = useState<Peak[]>([])
  const [loading,    setLoading]    = useState(true)
  const [progress,   setProgress]   = useState('')
  const [sortBy,     setSortBy]     = useState<'ele' | 'date'>('ele')
  const [cacheHit,   setCacheHit]   = useState(false)

  const scanPeaks = async (metas: ActivityMeta[], force = false) => {
    setLoading(true)
    const allIds = metas.map(m => m.id)

    const cache = force ? null : loadCache()
    const cachedIds = new Set(cache?.activityIds ?? [])
    const isFullyCached = cache && cache.activityIds.length === allIds.length
      && allIds.every(id => cachedIds.has(id))

    if (isFullyCached) {
      setPeaks(cache.peaks)
      setCacheHit(true)
      setLoading(false)
      return
    }

    // Seed from cache for already-processed activities
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

        const pois = await fetchHikingPoisFromWikidata(gps, 300)
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
    setLoading(false)
    setProgress('')
  }

  useEffect(() => {
    getAllActivities().then(metas => {
      setActivities(metas)
      scanPeaks(metas)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    if (sortBy === 'ele') return [...peaks].sort((a, b) => b.ele - a.ele)
    return [...peaks].sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime())
  }, [peaks, sortBy])

  const highest = peaks.length > 0 ? peaks.reduce((m, p) => p.ele > m.ele ? p : m, peaks[0]) : null

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />
      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-5 sm:py-8 fade-up">

        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div>
            <Link href="/statistiche" className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Statistiche
            </Link>
            <h1 className="font-display text-3xl font-semibold text-stone-800 flex items-center gap-2">
              <Mountain className="w-7 h-7 text-forest-600" /> Vette Conquistate
            </h1>
            <p className="text-stone-500 text-sm mt-1">
              {loading
                ? progress || 'Analisi in corso…'
                : `${peaks.length} cime raggiunte${cacheHit ? ' (dalla cache)' : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!loading && peaks.length > 0 && (
              <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
                {(['ele', 'date'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${sortBy === s ? 'bg-white shadow-sm text-forest-700' : 'text-stone-500 hover:text-stone-700'}`}>
                    {s === 'ele' ? 'Per quota' : 'Per data'}
                  </button>
                ))}
              </div>
            )}
            {!loading && (
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

        {loading && peaks.length === 0 ? (
          <div className="flex items-center justify-center py-24 gap-3 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>{progress || 'Analisi escursioni in corso…'}</span>
          </div>
        ) : peaks.length === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <Mountain className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nessuna cima trovata</p>
            <p className="text-sm mt-1">Le cime vengono rilevate automaticamente dai tracciati GPS.</p>
          </div>
        ) : (
          <>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-stone-400 mb-4 bg-white border border-stone-100 rounded-xl px-3 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{progress}</span>
              </div>
            )}

            {/* Summit badge */}
            {highest && (
              <div className="bg-gradient-to-r from-forest-700 to-forest-900 text-white rounded-2xl p-5 mb-6 flex items-center gap-4">
                <Trophy className="w-10 h-10 text-yellow-400 shrink-0" />
                <div>
                  <p className="text-forest-200 text-xs font-semibold uppercase tracking-wide">Cima più alta raggiunta</p>
                  <p className="font-display text-2xl font-bold">{highest.name}</p>
                  <p className="text-forest-300 text-sm">⛰ {highest.ele} m slm · {format(new Date(highest.activityDate), 'd MMM yyyy', { locale: it })}</p>
                </div>
              </div>
            )}

            {/* Peaks list */}
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
      </main>
    </div>
  )
}
