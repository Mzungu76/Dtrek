import { Link2 } from 'lucide-react'

interface Props {
  text: string
  /** Presente SOLO quando `text` viene dall'estratto Wikipedia (app/api/places/[id]/route.ts —
   *  wikipedia.extract, usato solo quando manca una description propria sostanziale), mai per un
   *  testo già proprio della Meta: l'attribuzione va data solo alla fonte davvero usata. */
  wikipediaUrl?: string
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
export default function PlaceDescriptionWidget({ text, wikipediaUrl }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] leading-7 text-stone-600">{text}</p>
      {wikipediaUrl && (
        <a
          href={wikipediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-stone-100 hover:bg-stone-200 transition-colors text-[11px] text-stone-500"
        >
          <Link2 className="w-3 h-3 shrink-0 text-stone-400" /> Da Wikipedia
        </a>
      )}
    </div>
  )
}
