'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import ActivityUploader from '@/components/upload/ActivityUploader'
import GpxUploader from '@/components/upload/GpxUploader'
import ManualImportChoice from '@/components/upload/ManualImportChoice'
import FromActivityUploader from '@/components/upload/FromActivityUploader'
import TrialStatusBanner from '@/components/dtrek/TrialStatusBanner'
import { tryOpenNavigatorApp } from '@/lib/navigatorHandoff'
import { Mountain, MapPin, PencilLine, History, Compass } from 'lucide-react'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  )
}

// Due punti d'ingresso distinti (bottoni "Crea un percorso" in Percorsi, "Importa o Naviga" in
// Resoconti — GuidaHub.tsx/ResocontoHub.tsx e i rispettivi elenco/page.tsx), non più uno
// switcher dentro la pagina: chi arriva da Resoconti non ha motivo di vedere l'opzione "per i
// Percorsi" e viceversa, erano due percorsi mentali diversi mascherati da un'unica pagina.
function UploadPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab: 'activity' | 'gpx' = searchParams.get('tab') === 'gpx' ? 'gpx' : 'activity'
  const [gpxSource, setGpxSource] = useState<'file' | 'manual' | 'from-activity'>('file')

  // "Naviga adesso" prova prima l'app nativa (se il device può averla), altrimenti ricade sul
  // navigatore libero via web già esistente (app/navigatore/traccia) — vedi lib/navigatorHandoff.ts.
  const handleStartUnplannedNavigation = () => {
    tryOpenNavigatorApp(router, '/navigatore/traccia')
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
            {tab === 'activity' ? 'Crea un Resoconto' : 'Crea un percorso'}
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
              <p className="font-semibold text-sm text-stone-800">Traccia libera</p>
              <p className="text-xs text-stone-500">Traccia GPS libera, senza pianificazione — invece di caricare un file già pronto</p>
            </div>
          </button>
        )}

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

        {/* UX-AUDIT.md P-M3 — tre modi di creare lo stesso tipo di oggetto (un percorso
            pianificato), nessun consiglio su quale scegliere finché non se ne apre uno. Una riga
            sola, per l'opzione attiva, invece di tre sottotitoli fissi che affollerebbero i tab
            compatti a tre colonne. */}
        {tab === 'gpx' && (
          <p className="text-stone-400 text-xs -mt-4 mb-6 px-1">
            {gpxSource === 'file' && 'Hai già una traccia (GPX/KML/KMZ/GeoJSON) di un percorso trovato altrove — la carichi e basta.'}
            {gpxSource === 'manual' && 'Non hai un file pronto: cerca un percorso già documentato, costruiscine uno nuovo sui sentieri della zona, o inserisci i dati a mano.'}
            {gpxSource === 'from-activity' && 'Vuoi ripianificare un’escursione che hai già fatto — riusa la traccia di un’attività registrata in precedenza.'}
          </p>
        )}

        {tab === 'activity' && <ActivityUploader />}
        {tab === 'gpx' && gpxSource === 'file' && <GpxUploader />}
        {tab === 'gpx' && gpxSource === 'manual' && <ManualImportChoice />}
        {tab === 'gpx' && gpxSource === 'from-activity' && <FromActivityUploader />}
      </main>
    </div>
  )
}
