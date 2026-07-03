'use client'
import { useRef, useState } from 'react'
import { X, Camera, Loader2, Leaf } from 'lucide-react'
import { identifySpeciesFromPhoto, type SpeciesIdentification } from '@/lib/inatIdentify'

interface Props {
  position: { lat: number; lon: number } | null
  onClose: () => void
}

const ICONIC_LABELS: Record<string, string> = {
  Plantae: 'Pianta', Aves: 'Uccello', Mammalia: 'Mammifero', Insecta: 'Insetto',
  Reptilia: 'Rettile', Amphibia: 'Anfibio', Fungi: 'Fungo', Mollusca: 'Mollusco', Arachnida: 'Aracnide',
}

/**
 * Online-only flora/fauna photo recognition (see app/api/flora-fauna-identify/route.ts for
 * the iNaturalist Computer Vision proxy and its known auth-requirement caveat). Modal capture
 * form, same shape as CivicReportSheet — a deliberate opt-in action, not a passive notification.
 */
export default function SpeciesIdentifySheet({ position, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SpeciesIdentification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    setResults(null)
    setError(null)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const url = e.target?.result as string
      setDataUrl(url)
      setLoading(true)
      try {
        const found = await identifySpeciesFromPhoto(url, position?.lat, position?.lon)
        setResults(found)
        if (found.length === 0) setError('Nessun risultato: prova con una foto più nitida o più ravvicinata.')
      } catch {
        setError('Servizio di riconoscimento non disponibile al momento (richiede connessione).')
      } finally {
        setLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 z-[1300] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#fdfcfa] rounded-t-2xl shadow-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-stone-800 flex items-center gap-1.5"><Leaf className="w-4 h-4 text-forest-600" /> Cos'è questo?</h3>
          <button onClick={onClose} className="p-1.5 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200" aria-label="Chiudi">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-stone-500 mb-3">
          Scatta una foto a una pianta o un animale per provare a riconoscerlo. Richiede connessione.
        </p>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-stone-200 rounded-xl h-32 flex items-center justify-center mb-3 cursor-pointer overflow-hidden"
        >
          {dataUrl ? <img src={dataUrl} alt="" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-stone-400" />}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />

        {loading && (
          <div className="flex items-center justify-center gap-2 py-3 text-stone-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Riconoscimento in corso…
          </div>
        )}

        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

        {results && results.length > 0 && (
          <ul className="space-y-1.5">
            {results.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 bg-stone-50 rounded-xl border border-stone-100">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-800 truncate">{r.commonName ?? r.scientificName}</p>
                  <p className="text-xs text-stone-400 italic truncate">{r.scientificName}{r.iconicTaxon ? ` · ${ICONIC_LABELS[r.iconicTaxon] ?? r.iconicTaxon}` : ''}</p>
                </div>
                <span className="text-xs font-mono text-forest-600 shrink-0">{Math.round(r.score * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
