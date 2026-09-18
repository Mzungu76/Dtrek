'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import ActivityUploader from '@/components/upload/ActivityUploader'
import GpxUploader from '@/components/upload/GpxUploader'
import ManualPlanUploader from '@/components/upload/ManualPlanUploader'
import UrlImportUploader from '@/components/upload/UrlImportUploader'
import FromActivityUploader from '@/components/upload/FromActivityUploader'
import CreaGuidaMapSearch, { type OtherWayToAdd } from '@/components/upload/CreaGuidaMapSearch'
import TrialStatusBanner from '@/components/dtrek/TrialStatusBanner'
import { tryOpenNavigatorApp } from '@/lib/navigatorHandoff'
import { Mountain, Compass, ArrowLeft } from 'lucide-react'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  )
}

type GpxSource = 'cerca' | OtherWayToAdd

// Due punti d'ingresso distinti (bottoni "Crea una guida" in Guide, "Importa o Naviga" in
// Resoconti — GuidaHub.tsx/ResocontoHub.tsx e i rispettivi elenco/page.tsx), non più uno
// switcher dentro la pagina: chi arriva da Resoconti non ha motivo di vedere l'opzione "per la
// Guida" e viceversa, erano due percorsi mentali diversi mascherati da un'unica pagina.
function UploadPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab: 'activity' | 'gpx' = searchParams.get('tab') === 'gpx' ? 'gpx' : 'activity'
  // 'cerca' (la mappa unificata di CreaGuidaMapSearch.tsx) è l'ingresso di default per "Crea una
  // guida" — il bottone "Crea una guida" (GuidaHub.tsx) porta qui direttamente, a schermo intero,
  // senza più uno switcher intermedio. Le altre vie (file GPX, da un'attività del diario, link,
  // inserimento manuale) restano raggiungibili da dentro la mappa stessa (pulsante "Altri modi",
  // vedi onOtherWays sotto), non più come card alla pari sulla stessa schermata.
  const [gpxSource, setGpxSource] = useState<GpxSource>('cerca')

  // "Naviga adesso" prova prima l'app nativa (se il device può averla), altrimenti ricade sul
  // navigatore libero via web già esistente (app/navigatore/traccia) — vedi lib/navigatorHandoff.ts.
  const handleStartUnplannedNavigation = () => {
    tryOpenNavigatorApp(router, '/navigatore/traccia')
  }

  // La mappa è un overlay a schermo intero (createPortal, come RouteBuilder.tsx): la renderizziamo
  // da sola, senza il resto della chrome della pagina sotto (comunque nascosta dall'overlay).
  if (tab === 'gpx' && gpxSource === 'cerca') {
    return <CreaGuidaMapSearch onBack={() => router.back()} onOtherWays={mode => setGpxSource(mode)} />
  }

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <TrialStatusBanner />
      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12 fade-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-forest-50 border border-forest-200 mb-4">
            <Mountain className="w-8 h-8 text-forest-600" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-stone-800 mb-2">
            {tab === 'activity' ? 'Crea un Reportage' : 'Crea una guida'}
          </h1>
          <p className="text-stone-500 text-sm">
            {tab === 'activity'
              ? 'Un\'escursione già conclusa, dal tuo GPS o orologio sportivo'
              : 'Un percorso trovato altrove, da trasformare in guida turistica'
            }
          </p>
        </div>

        {tab === 'activity' && (
          <button
            onClick={handleStartUnplannedNavigation}
            className="mb-6 w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-sky-50 border border-sky-200 hover:bg-sky-100 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
              <Compass className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-stone-800">Avvia navigazione ora</p>
              <p className="text-xs text-stone-500">Traccia GPS libera, senza pianificazione — invece di caricare un file già pronto</p>
            </div>
          </button>
        )}

        {/* UrlImportUploader ha già il proprio "Indietro" (onBack sotto) — un secondo link qui
            sopra sarebbe ridondante, solo gli altri tre ne sono privi (vedi il loro import). */}
        {tab === 'gpx' && gpxSource !== 'cerca' && gpxSource !== 'url' && (
          <button onClick={() => setGpxSource('cerca')}
            className="mb-4 flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Torna alla ricerca su mappa
          </button>
        )}

        {tab === 'activity' && <ActivityUploader />}
        {tab === 'gpx' && gpxSource === 'file' && <GpxUploader />}
        {tab === 'gpx' && gpxSource === 'manual' && <ManualPlanUploader />}
        {tab === 'gpx' && gpxSource === 'url' && <UrlImportUploader onBack={() => setGpxSource('cerca')} />}
        {tab === 'gpx' && gpxSource === 'from-activity' && <FromActivityUploader />}
      </main>
    </div>
  )
}
