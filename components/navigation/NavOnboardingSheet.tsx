'use client'
import { AlertOctagon, Signpost, Radio, Route, MapPin } from 'lucide-react'
import Sheet from '@/components/ui/Sheet'

interface Props {
  open: boolean
  onClose: () => void
}

const ITEMS = [
  {
    icon: AlertOctagon, iconClass: 'bg-red-600 text-white', title: 'Emergenza',
    text: 'Il pulsante rosso in basso: chiamata rapida al 112, SMS, o le tue coordinate a schermo se non hai rete.',
  },
  {
    icon: Signpost, iconClass: 'bg-white text-stone-700 border border-stone-200', title: 'Vie d\'uscita',
    text: 'Sempre a un tocco, anche se sei ancora regolarmente sul percorso: alternative per tornare in sicurezza da dove ti trovi.',
  },
  {
    icon: Radio, iconClass: 'bg-white text-stone-700 border border-stone-200', title: 'Condividi la posizione',
    text: 'Chi segui condivide la tua posizione live può vederla mentre cammini, senza che tu debba fare nulla.',
  },
  {
    icon: Route, iconClass: 'bg-stone-900/80 text-white', title: 'Layer sulla mappa',
    text: 'La rotaia a sinistra: sentieri vicini, punti di interesse, pendenze colorate — attiva solo quello che ti serve.',
  },
] as const

/**
 * DTREK-AUDIT.md P2 #26 — mostrato una sola volta (lib/navigation/navOnboardingPref.ts) all'avvio
 * della prima navigazione attiva, PRIMA che possa servire davvero — non un tutorial passo-passo
 * sovrapposto ai controlli reali (troppo fragile da mantenere sincronizzato col resto della UI),
 * solo un riepilogo compatto con le stesse icone/colori dei controlli veri, così sono già
 * riconoscibili quando li si incontra sul sentiero. Riapribile in ogni momento (vedi il pulsante
 * "?" nella rotaia azioni di ActiveNavigationView.tsx).
 */
export default function NavOnboardingSheet({ open, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Prima di partire">
      <div className="space-y-3">
        <p className="text-sm text-stone-500">
          Alcuni controlli utili durante il cammino, per non scoprirli per la prima volta quando servono davvero.
        </p>
        {ITEMS.map(({ icon: Icon, iconClass, title, text }) => (
          <div key={title} className="flex items-start gap-3">
            <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}>
              <Icon className="w-4 h-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-stone-800">{title}</p>
              <p className="text-xs text-stone-500 leading-relaxed">{text}</p>
            </div>
          </div>
        ))}
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-white text-stone-700 border border-stone-200">
            <MapPin className="w-4 h-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-stone-800">Colori dei punti di interesse</p>
            <p className="text-xs text-stone-500 leading-relaxed">
              Ogni tipo di punto (rifugio, acqua, belvedere...) ha un colore e un&apos;icona propri sulla mappa — si spiegano da soli quando li tocchi.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-2 h-11 rounded-full bg-forest-600 text-white font-semibold text-sm"
        >
          Ho capito, si parte
        </button>
      </div>
    </Sheet>
  )
}
