'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration, msToKmh } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Mountain, Upload, Heart, Route, Clock, ChevronRight, Flame, Loader2 } from 'lucide-react'

export default function HomePage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllActivities()
      .then(setActivities)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />

      {/* Hero */}
      <div className="bg-gradient-to-br from-forest-800 to-forest-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-4xl font-semibold leading-tight">
                Il mio diario<br />
                <span className="text-forest-300">di trekking</span>
              </h1>
              <p className="text-forest-400 text-sm mt-2">
                {loading
                  ? 'Caricamento…'
                  : activities.length > 0
                    ? `${activities.length} escursion${activities.length === 1 ? 'e' : 'i'} registrat${activities.length === 1 ? 'a' : 'e'}`
                    : 'Nessuna escursione ancora'}
              </p>
            </div>
            <Link
              href="/upload"
              className="flex items-center gap-2 px-5 py-2.5 bg-terra-500 hover:bg-terra-400 text-white rounded-xl font-medium text-sm transition-colors shadow-lg"
            >
              <Upload className="w-4 h-4" /> Carica TCX
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Caricamento escursioni…</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center mb-6">
              <Mountain className="w-10 h-10 text-forest-400" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">
              Inizia il tuo diario
            </h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6">
              Carica il tuo primo file TCX per vedere il tracciato, i grafici e tutti i dati della tua escursione.
            </p>
            <Link
              href="/upload"
              className="flex items-center gap-2 px-6 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" /> Carica il tuo primo TCX
            </Link>
          </div>
        ) : (
          <div className="space-y-3 fade-up">
            {activities.map((a, i) => (
              <Link
                key={a.id}
                href={`/escursione/${encodeURIComponent(a.id)}`}
                className="card-lift block bg-white rounded-2xl border border-stone-200 p-5 shadow-sm hover:border-forest-300 transition-all"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs font-mono text-stone-400">
                        {format(new Date(a.startTime), 'dd MMM yy', { locale: it })}
                      </span>
                      {a.tags?.map(tag => (
                        <span key={tag} className="text-xs bg-forest-50 text-forest-700 border border-forest-200 rounded-full px-2 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h2 className="font-display text-lg font-semibold text-stone-800 truncate">
                      {a.title ?? 'Escursione'}
                    </h2>
                    {a.userNotes && (
                      <p className="text-stone-400 text-sm mt-0.5 line-clamp-1">{a.userNotes}</p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-stone-300 shrink-0 mt-1" />
                </div>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <span className="flex items-center gap-1 text-sm text-forest-700 font-medium">
                    <Route className="w-3.5 h-3.5" />{(a.distanceMeters / 1000).toFixed(2)} km
                  </span>
                  <span className="flex items-center gap-1 text-sm text-stone-500">
                    <Clock className="w-3.5 h-3.5" />{formatDuration(a.totalTimeSeconds)}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-red-500">
                    <Heart className="w-3.5 h-3.5" />{a.avgHeartRate} bpm
                  </span>
                  <span className="flex items-center gap-1 text-sm text-terra-600">
                    <Flame className="w-3.5 h-3.5" />{a.calories} kcal
                  </span>
                  <span className="flex items-center gap-1 text-sm text-forest-600">
                    <Mountain className="w-3.5 h-3.5" />↑ {a.elevationGain.toFixed(0)} m
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
