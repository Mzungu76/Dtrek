'use client'
import { BookOpen, Image as ImageIcon, Pencil, BarChart2, Lock, Eye, Archive, FileDown, Share2 } from 'lucide-react'
import Sheet from '@/components/ui/Sheet'

interface Props {
  open: boolean
  onClose: () => void
}

const ITEMS = [
  { icon: ImageIcon, title: 'Foto copertina', text: 'Cambia l\'immagine di sfondo della copertina.' },
  { icon: Pencil, title: 'Testi copertina', text: 'Titolo, sottotitolo e autore mostrati in copertina.' },
  { icon: BarChart2, title: 'Statistiche', text: 'Quali riepiloghi e dettagli mostrare per ogni escursione.' },
  { icon: Lock, title: 'Blocca/sblocca le mappe', text: 'Le mappe restano ferme mentre scorri il libro, per non spostarle per sbaglio — sbloccale solo quando vuoi navigarle.' },
  { icon: Eye, title: 'Mostra/nascondi bozze', text: 'Le escursioni registrate ma non ancora raccontate.' },
  { icon: Archive, title: 'Escluse', text: 'Le escursioni che hai tolto dal libro — le ritrovi qui per reinserirle.' },
  { icon: FileDown, title: 'Esporta PDF', text: 'Genera il PDF, per intero o di un solo anno.' },
  { icon: Share2, title: 'Condividi', text: 'Crea un link pubblico del diario, leggibile da chiunque senza scaricare nulla.' },
] as const

/**
 * UX-AUDIT.md P-L1/P-L2 — mostrato una sola volta (lib/diario/diarioOnboardingPref.ts), alla
 * primissima apertura del Diario, PRIMA di incontrare le icone solo-icona delle due rotaie
 * laterali: (a) il Diario è un libro da scorrere verticalmente, non una galleria da scorrere in
 * orizzontale come Bacheca/Guide/Resoconti — cambio di paradigma da segnalare la prima volta; (b)
 * un riepilogo compatto di cosa fa ciascuna icona, stesse icone/nomi dei controlli veri (stesso
 * principio di NavOnboardingSheet.tsx in Navigator), così sono già riconoscibili quando le si
 * incontra. Riapribile in ogni momento dal bottone "?" nella rotaia destra (app/diario/page.tsx).
 */
export default function DiarioOnboardingSheet({ open, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Il tuo libro di escursioni">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-forest-50 text-forest-700 border border-forest-200">
            <BookOpen className="w-4 h-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-stone-800">Si scorre come un libro</p>
            <p className="text-xs text-stone-500 leading-relaxed">
              A differenza di Bacheca, Guide e Resoconti (si scorre lateralmente), qui si scorre
              verticalmente, pagina dopo pagina.
            </p>
          </div>
        </div>
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-white text-stone-700 border border-stone-200">
              <Icon className="w-4 h-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-stone-800">{title}</p>
              <p className="text-xs text-stone-500 leading-relaxed">{text}</p>
            </div>
          </div>
        ))}

        <button
          onClick={onClose}
          className="w-full mt-2 h-11 rounded-full bg-forest-600 text-white font-semibold text-sm"
        >
          Ho capito
        </button>
      </div>
    </Sheet>
  )
}
