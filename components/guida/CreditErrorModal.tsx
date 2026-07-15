'use client'
import { CreditCard, X, ExternalLink, Settings } from 'lucide-react'
import Link from 'next/link'

/**
 * Popup dedicato per l'errore "credito Anthropic esaurito" (lib/anthropicErrors.ts,
 * lib/guideAiError.ts) — prima di questo componente l'unico segnale per l'utente era un generico
 * "errore durante la generazione" indistinguibile da un blackout di rete, che non spiegava né la
 * causa né cosa fare. Un modale invece di un banner in fondo alla pagina: richiede un'azione
 * dell'utente (ricaricare credito o cambiare modello), non va perso di vista.
 */
export default function CreditErrorModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-terra-100 flex items-center justify-center shrink-0">
              <CreditCard className="w-4.5 h-4.5 text-terra-600" />
            </div>
            <h2 className="font-display font-bold text-stone-800">Credito Claude esaurito</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-stone-600 leading-relaxed">
            {message} Niente panico: il tuo percorso, i tuoi dati e le guide già generate restano
            tutti al loro posto — serve solo ricaricare il credito sulla tua chiave API per
            continuare a far scrivere a Giulia.
          </p>
          <p className="text-sm text-stone-600 leading-relaxed">
            Se vuoi risparmiare, puoi anche provare un modello più economico (es. Claude Haiku) dalle
            impostazioni del profilo.
          </p>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-2">
          <a
            href="https://console.anthropic.com/settings/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 bg-terra-600 hover:bg-terra-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Ricarica credito su Anthropic Console
          </a>
          <Link
            href="/profilo/ai"
            onClick={onClose}
            className="flex items-center justify-center gap-2 py-2.5 border border-stone-200 hover:border-stone-300 text-stone-600 rounded-xl text-sm font-medium transition-colors"
          >
            <Settings className="w-4 h-4" /> Vai alle impostazioni del modello
          </Link>
          <button
            onClick={onClose}
            className="py-2 text-xs font-medium text-stone-400 hover:text-stone-600 transition-colors"
          >
            Ho capito, chiudi
          </button>
        </div>
      </div>
    </div>
  )
}
