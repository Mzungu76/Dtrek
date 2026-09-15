// Home del sito pubblico del Diario — direttamente il libro (Sommario + pagine delle escursioni,
// components/leggi/DiaryBook.tsx): prima c'era solo un frontespizio con un pulsante "Vedi
// Reportage" da premere per arrivare al contenuto vero. Chi apre il link di un Diario condiviso
// vuole leggerlo, non prima trovare e premere un pulsante — /leggi/d/[token]/libro resta
// raggiungibile con lo stesso contenuto per chi ha già quel link salvato.
//
// Resta un componente SERVER: nessuno stato, nessun JavaScript spedito al browser.
import { type PublicDiary } from '@/lib/sharePublicDiary'
import { DiaryBook } from '@/components/leggi/DiaryBook'
import { SiteHeader } from './SiteChrome'

export function DiaryPublicView({ diary, token }: { diary: PublicDiary; token: string }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader homeHref={`/leggi/d/${token}`} title={diary.config.title} />
      <DiaryBook
        entries={diary.entries}
        show={diary.config.publicSections}
        title={diary.config.title}
        subtitle={diary.config.subtitle}
        ownerName={diary.ownerName}
        dateRangeLabel={diary.dateRangeLabel}
        totalKm={diary.totalKm}
        totalElevationGain={diary.totalElevationGain}
        pdfUrl={diary.pdfUrl}
        backHref={`/leggi/d/${token}`}
        backLabel="Diario"
        hideExactDates={diary.hideExactDates}
      />
    </div>
  )
}
