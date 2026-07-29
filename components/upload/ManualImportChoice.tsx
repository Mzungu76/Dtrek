'use client'
import { useState } from 'react'
import Link from 'next/link'
import { PencilLine, ChevronRight, Link2, Route, FolderSearch } from 'lucide-react'
import ManualPlanUploader from './ManualPlanUploader'
import UrlImportUploader from './UrlImportUploader'
import RouteBuilder from './RouteBuilder'

type Mode = 'choice' | 'manual' | 'url' | 'build'

/**
 * Schermata di scelta davanti al tab "Manuale" — affianca il wizard "Costruisci un percorso"
 * (che include anche la ricerca AI di un percorso già documentato, vedi RouteBuilder.tsx e
 * GiuliaSearchPanel.tsx — le due ricerche prima erano card separate, ora fuse in un solo ingresso),
 * l'import da link e il form manuale esistente (invariato, ManualPlanUploader). La ricerca diretta
 * su OpenStreetMap senza AI (ex "Cerca senza AI", PlainSearchUploader) è stata rimossa: chi conosce
 * già il percorso ha "Importa da un link" o "Inserisci a mano" per arrivarci senza l'AI.
 */
export default function ManualImportChoice() {
  const [mode, setMode] = useState<Mode>('choice')

  if (mode === 'manual') return <ManualPlanUploader />
  if (mode === 'url') return <UrlImportUploader onBack={() => setMode('choice')} />
  if (mode === 'build') return <RouteBuilder onBack={() => setMode('choice')} />

  return (
    <div className="space-y-3">
      <Link
        href="/profilo/ricerche-salvate"
        className="w-full text-left rounded-2xl border border-terra-200 bg-gradient-to-br from-terra-50 to-white p-5 flex items-center gap-3 hover:border-terra-300 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-terra-500 text-white flex items-center justify-center shrink-0">
          <FolderSearch className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-semibold text-stone-800">Le mie ricerche salvate</h3>
          <p className="text-sm text-stone-500">Riapri una ricerca fatta in precedenza — stessi risultati, senza ricalcolare nulla.</p>
        </div>
        <ChevronRight className="w-4.5 h-4.5 text-terra-400 shrink-0" />
      </Link>

      <button
        onClick={() => setMode('build')}
        className="w-full text-left rounded-2xl border border-forest-200 bg-gradient-to-br from-forest-50 to-white p-5 flex flex-col gap-2 hover:border-forest-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-forest-500 text-white flex items-center justify-center shrink-0">
            <Route className="w-4.5 h-4.5" />
          </div>
          <h3 className="font-display text-base font-semibold text-stone-800">Costruisci o trova un percorso</h3>
        </div>
        <p className="text-sm text-stone-500">
          Scegli un punto di partenza, la lunghezza e il dislivello — generiamo un percorso reale sui
          sentieri della zona. Oppure descrivi a Giulia un percorso che già conosci — se lo trova
          documentato altrove, te lo propone insieme a quelli costruiti.
        </p>
        <span className="mt-1 inline-flex items-center gap-1 self-start px-3.5 py-1.5 rounded-full bg-forest-500 text-white text-xs font-semibold uppercase tracking-wide">
          Inizia <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </button>

      <button
        onClick={() => setMode('url')}
        className="w-full text-left rounded-2xl border border-sky-200 bg-white p-5 flex flex-col gap-2 hover:border-sky-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Link2 className="w-4.5 h-4.5" />
          </div>
          <h3 className="font-display text-base font-semibold text-stone-800">Importa da un link</h3>
        </div>
        <p className="text-sm text-stone-500">
          Hai già trovato il percorso altrove? Incolla l&apos;indirizzo della pagina — proviamo a scaricarne la traccia reale.
        </p>
        <span className="mt-1 inline-flex items-center gap-1 self-start px-3.5 py-1.5 rounded-full bg-sky-600 text-white text-xs font-semibold uppercase tracking-wide">
          Incolla il link <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </button>

      <button
        onClick={() => setMode('manual')}
        className="w-full text-left rounded-2xl border border-stone-200 bg-white p-5 flex flex-col gap-2 hover:border-stone-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
            <PencilLine className="w-4.5 h-4.5" />
          </div>
          <h3 className="font-display text-base font-semibold text-stone-800">Inserisci a mano</h3>
        </div>
        <p className="text-sm text-stone-500">
          Hai già tutti i dati? Compila tu nome, distanza e dislivello a mano, senza cercare nulla.
        </p>
        <span className="mt-1 inline-flex items-center gap-1 self-start px-3.5 py-1.5 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold uppercase tracking-wide">
          Apri il modulo <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </button>
    </div>
  )
}
