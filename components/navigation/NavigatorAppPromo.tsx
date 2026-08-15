'use client'
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Download, X, Smartphone } from 'lucide-react'

// Placeholder — nessuna scheda pubblicata ancora sul Play Store. Sostituire con il link reale
// alla pubblicazione (vedi docs/guida-pubblicazione-dtrek-navigator.md).
const NAVIGATOR_STORE_URL = '#'

const SESSION_KEY = 'dtrek-navigator-promo-shown'

/**
 * Montato dentro le pagine di navigazione già raggiungibili via web (app/guida/[id]/naviga,
 * app/navigatore/traccia) — mai dentro l'app nativa Navigator stessa, dove non ha senso
 * promuovere l'app che si sta già usando. Un popup a inizio sessione browser (una volta per
 * sessione, non ad ogni apertura pagina — sessionStorage), poi un'icona di richiamo che resta
 * visibile e riapre lo stesso popup al tocco, invece di sparire del tutto dopo la chiusura.
 */
export default function NavigatorAppPromo() {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    if (sessionStorage.getItem(SESSION_KEY)) {
      setDismissed(true)
    } else {
      setOpen(true)
      sessionStorage.setItem(SESSION_KEY, '1')
    }
  }, [])

  if (Capacitor.isNativePlatform()) return null

  function close() {
    setOpen(false)
    setDismissed(true)
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-3xl shadow-2xl p-6">
            <button onClick={close} aria-label="Chiudi" className="absolute top-4 right-4 text-stone-400 hover:text-stone-600">
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center mb-4">
              <Smartphone className="w-6 h-6 text-sky-600" />
            </div>
            <h2 className="font-display text-lg font-semibold text-stone-800 mb-2">Sul sentiero, l&apos;app fa la differenza</h2>
            <ul className="text-sm text-stone-600 space-y-2 mb-5 list-disc list-inside">
              <li>Continua a registrare la posizione anche a schermo spento o col telefono in tasca — nel browser si ferma appena blocchi lo schermo.</li>
              <li>Consuma meno batteria: usa il GPS ottimizzato dal telefono, non un sito sempre aperto.</li>
              <li>Mappe scaricate in anticipo, utilizzabili anche senza rete lungo il percorso.</li>
            </ul>
            <a
              href={NAVIGATOR_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <Download className="w-4 h-4" /> Scarica Dtrek Navigator
            </a>
            <button onClick={close} className="w-full text-center text-xs text-stone-400 hover:text-stone-600 mt-3">
              Continua nel browser
            </button>
          </div>
        </div>
      )}

      {dismissed && !open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Scarica Dtrek Navigator"
          title="Scarica Dtrek Navigator"
          className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-sky-700 text-white shadow-lg flex items-center justify-center hover:bg-sky-800 transition-colors"
        >
          <Download className="w-5 h-5" />
        </button>
      )}
    </>
  )
}
