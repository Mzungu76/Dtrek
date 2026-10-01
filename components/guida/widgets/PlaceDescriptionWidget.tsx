import { Link2 } from 'lucide-react'
import type { DescriptionCredit } from '@/lib/placeSources'

interface Props {
  text: string
  /** Fonte della descrizione automatica (archivio o Wikipedia — lib/placeSources.ts): mostrata sotto
   *  il testo, con link quando c'è. Mai passata per un testo scritto dall'utente o dall'AI. */
  credit?: DescriptionCredit | null
}

/**
 * Riassunto già disponibile (archivio dtrek_places o, in sua assenza, l'estratto Wikipedia già
 * scaricato per la copertina/descrizione — app/api/places/[id]/route.ts) per "Il borgo"/"Il
 * museo"/... — verifica post-piano guide-eccellenza ("quando vengono create le schede di Borghi/
 * Siti, la scheda dovrebbe essere già popolata con le info descrittive"). Mostrato SOLO finché
 * Giulia non ha ancora scritto la narrazione per questa sezione (il chiamante passa `body` a
 * renderWidget e decide): un riassunto enciclopedico e la narrazione editoriale di Giulia insieme
 * sarebbero ridondanti, non complementari come widget dati + testo altrove nella guida. Nessun
 * avviso "non ancora generato" qui: SectionCard lo mostra già da sé nel footer sotto il widget
 * quando manca il testo, ripeterlo qui sarebbe ridondante.
 */
export default function PlaceDescriptionWidget({ text, credit }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] leading-7 text-stone-600">{text}</p>
      {credit && (
        credit.url ? (
          <a
            href={credit.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-stone-100 hover:bg-stone-200 transition-colors text-[11px] text-stone-500"
          >
            <Link2 className="w-3 h-3 shrink-0 text-stone-400" /> Fonte: {credit.label}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-stone-100 text-[11px] text-stone-500">
            Fonte: {credit.label}
          </span>
        )
      )}
    </div>
  )
}
