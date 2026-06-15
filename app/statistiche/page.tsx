'use client'
import { useEffect, useState, useMemo } from 'react'
import Navbar from '@/components/Navbar'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { getPersonalRecords, computeStreaks } from '@/lib/stats'
import { exportAllActivitiesToExcel } from '@/utils/exportExcel'
import PdfExportButton from '@/components/PdfExportButton'
import { Loader2, Mountain, FileSpreadsheet, Share2 } from 'lucide-react'
import ShareModal from '@/components/ShareModal'
import TabPanoramica  from '@/components/stats/TabPanoramica'
import TabGrafici     from '@/components/stats/TabGrafici'
import TabConfronto   from '@/components/stats/TabConfronto'
import TabForma       from '@/components/stats/TabForma'
import TabTraguardi   from '@/components/stats/TabTraguardi'
import TabFisico      from '@/components/stats/TabFisico'
import TabTerritorio  from '@/components/stats/TabTerritorio'

type Tab = 'riepilogo' | 'andamento' | 'forma' | 'territorio'

const TABS: { id: Tab; label: string }[] = [
  { id: 'riepilogo',  label: 'Riepilogo'  },
  { id: 'andamento',  label: 'Andamento'  },
  { id: 'forma',      label: 'Forma'      },
  { id: 'territorio', label: 'Territorio' },
]

const noop = () => {}

export default function StatistichePage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<Tab>('riepilogo')
  const [shareStats, setShareStats] = useState(false)

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])

  const stats   = useMemo(() => computeGlobalStats(activities),  [activities])
  const records = useMemo(() => getPersonalRecords(activities),  [activities])
  const streaks = useMemo(() => computeStreaks(activities),       [activities])

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-8 fade-up">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6 flex-wrap">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-stone-800">Statistiche</h1>
            <p className="text-stone-500 text-sm mt-1">
              {loading ? 'Caricamento…' : `${stats.totalActivities} escursioni registrate`}
            </p>
          </div>
          {!loading && activities.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setShareStats(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors">
                <Share2 className="w-4 h-4" /> <span className="hidden sm:inline">Condividi</span>
              </button>
              <button onClick={() => exportAllActivitiesToExcel(activities as any)}
                className="flex items-center gap-1.5 px-3 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors">
                <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">Excel</span>
              </button>
              <PdfExportButton variant="stats" data={activities as any} label="PDF"
                className="flex items-center gap-1.5 px-3 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors" />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento dati…</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <Mountain className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nessuna escursione ancora</p>
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="flex gap-1 bg-stone-100 rounded-xl p-1 mb-6 sm:mb-8">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    tab === t.id ? 'bg-white shadow-sm text-forest-700' : 'text-stone-500 hover:text-stone-700'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'riepilogo' && (
              <div className="space-y-12">
                <TabPanoramica activities={activities} records={records} streaks={streaks} onGuideLink={noop} />
                <div className="border-t border-stone-200 pt-8">
                  <h2 className="font-display text-xl font-semibold text-stone-800 mb-6">Traguardi</h2>
                  <TabTraguardi activities={activities} streaks={streaks} onGuideLink={noop} />
                </div>
              </div>
            )}

            {tab === 'andamento' && (
              <div className="space-y-12">
                <TabGrafici activities={activities} onGuideLink={noop} />
                <div className="border-t border-stone-200 pt-8">
                  <h2 className="font-display text-xl font-semibold text-stone-800 mb-6">Confronto</h2>
                  <TabConfronto activities={activities} onGuideLink={noop} />
                </div>
              </div>
            )}

            {tab === 'forma' && (
              <div className="space-y-12">
                <TabForma activities={activities} onGuideLink={noop} />
                <div className="border-t border-stone-200 pt-8">
                  <h2 className="font-display text-xl font-semibold text-stone-800 mb-6">Fisico</h2>
                  <TabFisico activities={activities} onGuideLink={noop} />
                </div>
              </div>
            )}

            {tab === 'territorio' && <TabTerritorio activities={activities} />}
          </>
        )}
      </main>

      {shareStats && (
        <ShareModal kind="stats" activities={activities} onClose={() => setShareStats(false)} />
      )}
    </div>
  )
}
