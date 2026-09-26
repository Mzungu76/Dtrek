import { ChevronRight, Landmark, Sparkles } from 'lucide-react'
import { SITE_TYPE_CONFIG } from '@/lib/metaTypes'
import type { PlannedHikeMeta } from '@/lib/plannedStore'

interface Props {
  /** Guide già caricate dal chiamante (GuideReader, un solo fetch per parentMetaId=hike.id,
   *  condiviso con BorgoTappeWidget) — mai un fetch proprio qui, evita la doppia richiesta. */
  guides: PlannedHikeMeta[]
  /** Apre la Guida nell'overlay (piano §51.4, opzione B) — mai una navigazione: la Guida di
   *  questo Borgo resta montata sotto per tutto il tempo. */
  onOpen: (siteId: string) => void
}

/**
 * Elenco EVIDENTE delle Guide di Sito nate da questa Guida di Borgo/Città (tappe promosse, piano
 * §51.3) — restano annidate qui, MAI nella lista top-level "Siti" (app/guida/GuidaHub.tsx) né
 * nell'elenco generale (app/guida/elenco/page.tsx): questa sezione è l'UNICO punto da cui
 * raggiungerle (a parte il deep link diretto), quindi deve risaltare, non essere un elenco
 * anonimo in fondo alla pagina — sfondo pieno e bordo d'accento invece del semplice bordo grigio
 * degli altri widget, coerente con l'intento "evidenzia meglio" (verifica utente 2026-09-26).
 * Silenzioso (null) finché non ce n'è nessuna, mai un riquadro vuoto.
 */
export default function NestedSiteGuidesWidget({ guides, onOpen }: Props) {
  if (guides.length === 0) return null

  return (
    <div className="mt-4 rounded-2xl border-2 border-terra-200 bg-terra-50/60 p-4">
      <p className="flex items-center gap-1.5 font-barlow font-bold uppercase tracking-wide text-[11px] text-terra-700 mb-3">
        <Sparkles className="w-3.5 h-3.5" /> Guide dei Siti di questo Borgo
      </p>
      <div className="flex flex-col gap-2">
        {guides.map(guide => {
          const Icon = guide.siteType ? SITE_TYPE_CONFIG[guide.siteType]?.icon ?? Landmark : Landmark
          return (
            <button
              key={guide.id}
              type="button"
              onClick={() => onOpen(guide.id)}
              className="flex items-center gap-2.5 rounded-xl border border-terra-300 bg-white px-3.5 py-2.5 shadow-sm hover:border-terra-500 hover:shadow transition-all text-left"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-terra-100 shrink-0">
                <Icon className="w-4 h-4 text-terra-700" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[13.5px] text-stone-800 truncate">{guide.title}</span>
                {guide.siteType && (
                  <span className="block text-[11px] text-stone-400">{SITE_TYPE_CONFIG[guide.siteType]?.label}</span>
                )}
              </span>
              <ChevronRight className="w-4 h-4 text-terra-400 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
