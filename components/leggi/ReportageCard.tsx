// Riga di elenco per una singola escursione nella lista "Reportage" del sito (home, ultimi 3, e
// /u/[slug]/reportage, l'elenco completo) — stesso pattern a riga di SommarioThumb/Indice dentro
// il libro di un Diario (components/leggi/DiaryBook.tsx), qui senza miniatura: questa lista può
// mescolare escursioni di Diari diversi, una foto per riga renderebbe la pagina pesante da
// scaricare per un beneficio visivo minimo.
import { formatPublicDate } from '@/lib/privacy/formatPublicDate'
import type { PublicProfileReportage } from '@/lib/publicProfile'
import { META_TYPE_CONFIG, SITE_TYPE_CONFIG } from '@/lib/metaTypes'

export function ReportageCard({ item, hideExactDates }: { item: PublicProfileReportage; hideExactDates: boolean }) {
  // Un Sentiero non ha etichetta (è il caso di sempre); Borgo/Città e Sito dicono cosa sono.
  const typeLabel = !item.metaType || item.metaType === 'sentiero'
    ? null
    : item.metaType === 'sito' && item.siteType ? SITE_TYPE_CONFIG[item.siteType].label : META_TYPE_CONFIG[item.metaType].label
  return (
    <a href={item.href} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 bg-white rounded-xl border border-stone-200 px-4 py-3 hover:border-stone-300 hover:shadow-sm transition">
      <div className="min-w-0">
        <span className="font-display font-bold text-forest-900 truncate block">{item.title}</span>
        <p className="text-[11px] text-stone-400 mt-0.5">
          {typeLabel && <span className="font-semibold uppercase tracking-wide text-amber-700">{typeLabel} · </span>}
          {formatPublicDate(item.date, hideExactDates)}
        </p>
      </div>
      {item.diary && (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-forest-700 bg-forest-50 border border-forest-200 rounded-full px-2.5 py-1">
          {item.diary.title}
        </span>
      )}
    </a>
  )
}
