'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Camera, Loader2, Leaf, WifiOff } from 'lucide-react'
import { identifySpeciesFromPhoto, SpeciesIdentifyOfflineError, type SpeciesIdentification } from '@/lib/inatIdentify'
import { useModalBackHandler } from '@/lib/navigation/useModalBackHandler'

interface Props {
  position: { lat: number; lon: number } | null
  onClose: () => void
}

interface PendingRequest {
  url: string
  lat?: number
  lon?: number
}

const ICONIC_LABELS: Record<string, string> = {
  Plantae: 'Pianta', Aves: 'Uccello', Mammalia: 'Mammifero', Insecta: 'Insetto',
  Reptilia: 'Rettile', Amphibia: 'Anfibio', Fungi: 'Fungo', Mollusca: 'Mollusco', Arachnida: 'Aracnide',
}

/**
 * Online-only flora/fauna photo recognition (see app/api/flora-fauna-identify/route.ts for
 * the iNaturalist Computer Vision proxy and its known auth-requirement caveat). Modal capture
 * form, same shape as FieldNoteSheet — a deliberate opt-in action, not a passive notification.
 *
 * Una richiesta fatta senza connessione non fallisce e basta: resta "in coda" (`pending`) e un
 * listener 'online' la rilancia da sola alla prima connessione disponibile, stesso principio di
 * lib/offline/retryFieldNotePhotos.ts per le foto delle note — qui il foglio resta aperto in
 * attesa invece di un retry in background, perché l'utente è lì che aspetta un risultato, non
 * un'azione fire-and-forget. Un fallimento del SERVIZIO (risposta arrivata ma rifiutata — il
 * caso noto di iNaturalist senza OAuth) è un errore vero, non va confuso con "sei offline".
 */
export default function SpeciesIdentifySheet({ position, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SpeciesIdentification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useModalBackHandler(true, onClose)

  const runIdentify = async (req: PendingRequest) => {
    setLoading(true)
    setError(null)
    try {
      const found = await identifySpeciesFromPhoto(req.url, req.lat, req.lon)
      setResults(found)
      setPending(null)
      if (found.length === 0) setError('Nessun risultato: prova con una foto più nitida o più ravvicinata.')
    } catch (err) {
      if (err instanceof SpeciesIdentifyOfflineError) {
        setPending(req)
      } else {
        setPending(null)
        setError('Il servizio di riconoscimento non è disponibile in questo momento. Riprova più tardi.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Rilancia da sola la richiesta in coda alla prima connessione disponibile — nessun tocco
  // dell'utente richiesto, esattamente come chiesto: "in attesa, risolta la prima volta che c'è linea".
  useEffect(() => {
    if (!pending) return
    const onOnline = () => runIdentify(pending)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  function handleFile(file: File) {
    setResults(null)
    setError(null)
    setPending(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      setDataUrl(url)
      runIdentify({ url, lat: position?.lat, lon: position?.lon })
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
          <h3 className="font-display font-bold text-stone-800 flex items-center gap-1.5"><Leaf className="w-4 h-4 text-forest-600" /> Cos&apos;è questo?</h3>
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

        {pending && !loading && (
          <div className="flex items-start gap-2 py-2 px-3 mb-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p>Sei offline: la richiesta resta in attesa e riparte da sola appena torna la connessione.</p>
              {/* Ripiego manuale: fetch() può lanciare per motivi diversi da un vero
                  offline/online (captive portal, proxy instabile) senza che l'evento 'online'
                  scatti mai — questo evita che la richiesta resti bloccata per sempre in quel caso. */}
              <button onClick={() => runIdentify(pending)} className="mt-1 font-semibold underline decoration-amber-400 underline-offset-2">
                Riprova ora
              </button>
            </div>
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
