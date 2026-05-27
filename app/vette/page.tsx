'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { getAllActivities, getActivityById, type ActivityMeta, type StoredActivity } from '@/lib/blobStore'
import { fetchPoisNearTrack, type PoiItem } from '@/lib/overpass'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ArrowLeft, Mountain, Loader2, Trophy } from 'lucide-react'

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

export default function VettePage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [peaks,      setPeaks]      = useState<Peak[]>([])
  const [loading,    setLoading]    = useState(true)
  const [progress,   setProgress]   = useState('')
  const [sortBy,     setSortBy]     = useState<'ele' | 'date'>('ele')

  useEffect(() => {
    getAllActivities().then(async metas => {
      setActivities(metas)
      const allPeaks: Peak[] = []
      const seen = new Set<number>()  // deduplicate by OSM id

      for (let i = 0; i < metas.length; i++) {
        const meta = metas[i]
        setProgress(`Analisi escursione ${i + 1}/${metas.length}…`)
        try {
          const full = await getActivityById(meta.id)
          if (!full) continue
          const gps = full.trackPoints
            .filter(p => p.lat !== undefined && p.lon !== undefined)
            .map(p => [p.lat!, p.lon!] as [number, number])
          if (gps.length < 2) continue

          const pois = await fetchPoisNearTrack(gps, 300)
          for (const p of pois) {
            if (p.type !== 'peak') continue
            if (!p.name)          continue  // unnamed peaks not interesting
            if (seen.has(p.id))   continue
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
        } catch {
          // skip failed activities silently
        }
      }

      setPeaks(allPeaks)
      setLoading(false)
      setProgress('')
    })
  }, [])

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
              {loading ? progress || 'Caricamento…' : `${peaks.length} cime raggiunte`}
            </p>
          </div>

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
        </div>

        {loading ? (
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
            {/* Summit badge */}
            {highest && (
              <div className="bg-gradient-to-r from-forest-700 to-forest-900 text-white rounded-2xl p-5 mb-6 flex items-center gap-4">
                <Trophy className="w-10 h-10 text-yellow-400 shrink-0" />
                <div>
                  <p className="text-forest-200 text-xs font-semibold uppercase tracking-wide">Cima più alta raggiunta</p>
                  <p className="font-display text-2xl font-bold">{highest.name}</p>
                  <p className="text-forest-300 text-sm">⛰ {highest.ele} m slm</p>
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
