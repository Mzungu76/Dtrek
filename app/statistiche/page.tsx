'use client'
import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { getPersonalRecords, computeStreaks } from '@/lib/stats'
import { exportAllActivitiesToExcel } from '@/utils/exportExcel'
import { exportStatsPdf, exportMapPdf } from '@/utils/pdfExport'
import ExportMenu, { type ExportMenuAction } from '@/components/ExportMenu'
import { Loader2, Mountain, FileSpreadsheet, Share2, FileDown, Map } from 'lucide-react'
import ShareModal from '@/components/ShareModal'
import TabPanoramica  from '@/components/stats/TabPanoramica'
import TabAndamento   from '@/components/stats/TabAndamento'
import TabConfronto   from '@/components/stats/TabConfronto'
import TabTraguardi   from '@/components/stats/TabTraguardi'

type Tab = 'panoramica' | 'andamento' | 'confronta' | 'traguardi'

const TABS: { id: Tab; label: string }[] = [
  { id: 'panoramica', label: 'Panoramica' },
  { id: 'andamento',  label: 'Andamento'  },
  { id: 'confronta',  label: 'Confronto'  },
  { id: 'traguardi',  label: 'Traguardi'  },
]

const TAB_IDS = TABS.map(t => t.id)

export default function StatistichePage() {
  return (
    <Suspense>
      <StatisticheContent />
    </Suspense>
  )
}

function StatisticheContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab: Tab = (tabParam && (TAB_IDS as string[]).includes(tabParam)) ? tabParam as Tab : 'panoramica'
  // Deep-link from the Guida/Resoconto gallery cards' "Confronta" button — combinedId to
  // preselect once TabConfronto mounts (`p:<id>` pianificata, `c:<id>` completata).
  const preselectId = searchParams.get('pre')

  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<Tab>(initialTab)
  const [shareStats, setShareStats] = useState(false)

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])

  useCtsUpdated(() => { getAllActivities().then(setActivities) })

  const stats   = useMemo(() => computeGlobalStats(activities),    [activities])
  const records = useMemo(() => getPersonalRecords(activities),    [activities])
  const streaks = useMemo(() => computeStreaks(activities),         [activities])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-8 fade-up">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6 flex-wrap">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-forest-900">Statistiche</h1>
            <p className="text-stone-400 text-sm mt-1">
              {loading ? 'Caricamento…' : `${stats.totalActivities} escursioni registrate in totale`}
            </p>
          </div>
          {!loading && activities.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <ExportMenu
                label="Esporta"
                actions={[
                  { id: 'share', label: 'Condividi', icon: <Share2 className="w-4 h-4 text-forest-600" />, run: () => setShareStats(true) },
                  { id: 'excel', label: 'Excel', icon: <FileSpreadsheet className="w-4 h-4 text-forest-600" />, run: () => exportAllActivitiesToExcel(activities as any) },
                  { id: 'pdf', label: 'PDF statistiche', icon: <FileDown className="w-4 h-4 text-forest-600" />, run: () => exportStatsPdf(activities) },
                  { id: 'pdf-map', label: 'PDF mappa percorsi', icon: <Map className="w-4 h-4 text-forest-600" />, run: () => exportMapPdf(activities) },
                ] satisfies ExportMenuAction[]}
                className="flex items-center gap-1.5 px-3 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors"
              />
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
            {/* Tab bar — scrollable on mobile */}
            <div className="flex gap-1 bg-stone-100 rounded-xl p-1 mb-6 sm:mb-8 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    tab === t.id ? 'bg-white shadow-sm text-forest-700' : 'text-stone-500 hover:text-stone-700'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'panoramica' && <TabPanoramica  activities={activities} records={records} streaks={streaks} />}
            {tab === 'andamento'  && <TabAndamento   activities={activities} />}
            {tab === 'confronta'  && <TabConfronto   activities={activities} preselectId={preselectId} />}
            {tab === 'traguardi'  && <TabTraguardi   activities={activities} streaks={streaks} />}
          </>
        )}
      </main>

      {shareStats && (
        <ShareModal kind="stats" activities={activities} onClose={() => setShareStats(false)} />
      )}
    </div>
  )
}
