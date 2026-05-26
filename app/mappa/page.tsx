'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { Map, ExternalLink, Loader2, Info, Share2 } from 'lucide-react'
import ShareModal from '@/components/ShareModal'

const AllRoutesMap = dynamic(() => import('@/components/AllRoutesMap'), { ssr: false })

export default function MappaPage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading]       = useState(true)
  const [showShare, setShowShare]   = useState(false)

  useEffect(() => {
    getAllActivities()
      .then(setActivities)
      .finally(() => setLoading(false))
  }, [])

  const routesWithPolyline = activities.filter(
    a => a.routePolyline && a.routePolyline.length > 1
  )
  const routesWithoutPolyline = activities.length - routesWithPolyline.length

  const mapRoutes = routesWithPolyline.map(a => ({
    id: a.id,
    title: a.title ?? 'Escursione',
    startTime: a.startTime,
    polyline: a.routePolyline as [number, number][],
  }))

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-8 fade-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-forest-100 flex items-center justify-center">
              <Map className="w-5 h-5 text-forest-700" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-stone-800">
                Mappa generale
              </h1>
              <p className="text-stone-500 text-sm mt-0.5">
                {loading
                  ? 'Caricamento…'
                  : routesWithPolyline.length > 0
                    ? `${routesWithPolyline.length} percors${routesWithPolyline.length === 1 ? 'o' : 'i'} con GPS`
                    : 'Nessun percorso GPS disponibile'}
              </p>
            </div>
          </div>
          {!loading && activities.length > 0 && (
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-2 px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Share2 className="w-4 h-4" /> Condividi mappa
            </button>
          )}
        </div>

        {/* Mappa */}
        {loading ? (
          <div
            className="flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200 text-stone-400 gap-3"
            style={{ height: '500px' }}
          >
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Caricamento percorsi…</span>
          </div>
        ) : (
          <AllRoutesMap routes={mapRoutes} height="500px" />
        )}

        {/* Nota attività senza GPS */}
        {!loading && routesWithoutPolyline > 0 && (
          <div className="mt-4 flex items-start gap-2 text-sm text-stone-500 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span>
              {routesWithoutPolyline === 1
                ? '1 escursione non ha'
                : `${routesWithoutPolyline} escursioni non hanno`}{' '}
              il percorso GPS salvato — probabilmente caricate prima dell&apos;aggiornamento che supporta le polyline.
            </span>
          </div>
        )}

        {/* Sezione pianifica */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-stone-800 mb-1">
            Pianifica una nuova escursione
          </h2>
          <p className="text-stone-500 text-sm mb-5">
            Scopri nuovi percorsi con le app più popolari per il trekking.
          </p>

          {/* Box descrittivo */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 mb-5 shadow-sm">
            <p className="text-stone-600 text-sm leading-relaxed">
              Komoot e AllTrails non offrono API pubbliche gratuite per l&apos;integrazione
              diretta. Puoi esplorare zone di trekking aprendo queste app nella zona
              dell&apos;ultima escursione, o esportare i tuoi percorsi in formato GPX per
              importarli.
            </p>
          </div>

          {/* Bottoni */}
          <div className="flex flex-wrap gap-3 mb-5">
            <a
              href="https://www.komoot.com/discover"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Esplora su Komoot
            </a>
            <a
              href="https://www.alltrails.com/explore"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 hover:border-stone-300 rounded-xl font-medium text-sm transition-colors shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Cerca su AllTrails
            </a>
          </div>

          {/* Nota GPX */}
          <div className="flex items-start gap-2 text-sm text-stone-500 bg-stone-100 border border-stone-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />
            <span>
              Per esportare in GPX vai nella pagina di ogni escursione (funzione già disponibile).
            </span>
          </div>
        </section>
      </main>

      {showShare && (
        <ShareModal kind="map" activities={activities} onClose={() => setShowShare(false)} />
      )}
    </div>
  )
}
