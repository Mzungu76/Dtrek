'use client'
import { ActivityMeta } from '@/lib/blobStore'
import Kicker from '@/components/ui/Kicker'
import TabGrafici from './TabGrafici'
import TabForma from './TabForma'
import TabFisico from './TabFisico'

interface Props { activities: ActivityMeta[]; onGuideLink: (section: string) => void }

const SUBSECTIONS = [
  { id: 'andamento-volume', label: 'Volume e distanza' },
  { id: 'andamento-carico', label: 'Frequenza cardiaca e carico' },
  { id: 'andamento-fisico', label: 'Composizione fisica' },
]

/**
 * Fonde i tab Grafici, Forma e Fisico — che mostravano tutti trend
 * temporali simili (volume, FC, carico allenamento, fitness) senza
 * confini chiari — in un'unica tab con sotto-sezioni ancorate.
 * Piano di ristrutturazione, Parte 2.6. I tre componenti figli non
 * sono stati riscritti: restano invariati, solo raggruppati.
 */
export default function TabAndamento({ activities, onGuideLink }: Props) {
  return (
    <div className="space-y-10">
      <div className="flex gap-4 flex-wrap text-xs font-barlow font-bold uppercase tracking-wide text-stone-400">
        {SUBSECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`} className="hover:text-forest-600 transition-colors">{s.label}</a>
        ))}
      </div>

      <section id="andamento-volume" className="scroll-mt-32 space-y-6">
        <Kicker>Volume e distanza</Kicker>
        <TabGrafici activities={activities} onGuideLink={onGuideLink} />
      </section>

      <section id="andamento-carico" className="scroll-mt-32 space-y-6 pt-6 border-t border-stone-200">
        <Kicker>Frequenza cardiaca e carico</Kicker>
        <TabForma activities={activities} onGuideLink={onGuideLink} />
      </section>

      <section id="andamento-fisico" className="scroll-mt-32 space-y-6 pt-6 border-t border-stone-200">
        <Kicker>Composizione fisica</Kicker>
        <TabFisico activities={activities} onGuideLink={onGuideLink} />
      </section>
    </div>
  )
}
