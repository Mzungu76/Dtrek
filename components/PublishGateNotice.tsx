import Link from 'next/link'
import { Globe } from 'lucide-react'

/** Messaggio mostrato al posto del pulsante "Pubblica" quando l'utente non ha ancora un sito
 *  pubblico attivo (/u/[slug]) — un solo link possibile, quindi pubblicare qualcosa richiede prima
 *  di avere un indirizzo dove farlo comparire. Stesso testo ovunque compaia un pannello di
 *  pubblicazione (Diario/Reportage/Raccolta). */
export function PublishGateNotice() {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
      <Globe className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-800 leading-relaxed">
        Attiva prima il tuo sito per poter pubblicare qualcosa —{' '}
        <Link href="/raccolte/pubblica" className="font-semibold underline hover:no-underline">scegli il tuo indirizzo</Link>.
      </p>
    </div>
  )
}
