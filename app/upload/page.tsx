'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import ActivityUploader from '@/components/upload/ActivityUploader'
import GpxUploader from '@/components/upload/GpxUploader'
import ManualImportChoice from '@/components/upload/ManualImportChoice'
import FromActivityUploader from '@/components/upload/FromActivityUploader'
import TrialStatusBanner from '@/components/dtrek/TrialStatusBanner'
import { Mountain, MapPin, PencilLine, History } from 'lucide-react'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  )
}

// Due punti d'ingresso distinti (bottoni "Crea una guida" in Guide, "Importa o Naviga" in
// Resoconti — GuidaHub.tsx/ResocontoHub.tsx e i rispettivi elenco/page.tsx), non più uno
// switcher dentro la pagina: chi arriva da Resoconti non ha motivo di vedere l'opzione "per la
// Guida" e viceversa, erano due percorsi mentali diversi mascherati da un'unica pagina.
function UploadPageInner() {
  const searchParams = useSearchParams()
  const tab: 'activity' | 'gpx' = searchParams.get('tab') === 'gpx' ? 'gpx' : 'activity'
  const [gpxSource, setGpxSource] = useState<'file' | 'manual' | 'from-activity'>('file')

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
            {tab === 'activity' ? 'Carica un resoconto' : 'Crea una guida'}
          </h1>
          <p className="text-stone-500 text-sm">
            {tab === 'activity'
              ? 'Un\'escursione già conclusa, dal tuo GPS o orologio sportivo'
              : 'Un percorso trovato altrove, da trasformare in guida turistica'
            }
          </p>
        </div>

        {tab === 'gpx' && (
          <div className="flex bg-stone-100 rounded-xl p-1 mb-6 text-xs">
            <button
              onClick={() => setGpxSource('file')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all
                ${gpxSource === 'file' ? 'bg-white text-sky-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <MapPin className="w-3.5 h-3.5" /> File traccia
            </button>
            <button
              onClick={() => setGpxSource('manual')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all
                ${gpxSource === 'manual' ? 'bg-white text-sky-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <PencilLine className="w-3.5 h-3.5" /> Manuale
            </button>
            <button
              onClick={() => setGpxSource('from-activity')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all
                ${gpxSource === 'from-activity' ? 'bg-white text-sky-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <History className="w-3.5 h-3.5" /> Da diario esistente
            </button>
          </div>
        )}

        {tab === 'activity' && <ActivityUploader />}
        {tab === 'gpx' && gpxSource === 'file' && <GpxUploader />}
        {tab === 'gpx' && gpxSource === 'manual' && <ManualImportChoice />}
        {tab === 'gpx' && gpxSource === 'from-activity' && <FromActivityUploader />}
      </main>
    </div>
  )
}
