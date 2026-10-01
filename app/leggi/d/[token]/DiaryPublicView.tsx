// Home del sito pubblico del Diario — copertina a piena pagina SEGUITA, nella stessa pagina, dal
// libro intero (Sommario + una pagina per escursione, components/leggi/DiaryBook.tsx): non più un
// frontespizio separato dal contenuto dietro un pulsante "Vedi Reportage" — un solo scroll
// verticale dalla copertina fino all'ultima escursione, come richiesto esplicitamente dall'autore
// del prodotto dopo aver visto la versione a due pagine.
//
// `compactSummary` sul DiaryBook evita che il proprio Sommario ripeta titolo/sottotitolo/autore e
// i tre numeri (escursioni/km/dislivello) appena mostrati da PublicCover qui sopra — stessa card
// due volte nella stessa pagina, altrimenti.
//
// Resta un componente SERVER: nessuno stato, nessun JavaScript spedito al browser.
import { entryCounts, entryHeadlineStats } from '@/lib/reportFacts'
import { type PublicDiary } from '@/lib/sharePublicDiary'
import { PublicCover } from '@/components/leggi/PublicCover'
import { DiaryBook } from '@/components/leggi/DiaryBook'
import { SiteHeader, DtrekCallout, SiteFooter } from './SiteChrome'

export function DiaryPublicView({ diary, token }: { diary: PublicDiary; token: string }) {
  const show = diary.config.publicSections

  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader homeHref={`/leggi/d/${token}`} title={diary.config.title} current="home" />

      <PublicCover
        coverUrl={diary.config.coverUrl}
        eyebrow={diary.dateRangeLabel}
        title={diary.config.title}
        subtitle={diary.config.subtitle}
        ownerName={diary.ownerName}
        pills={show.statistiche ? entryHeadlineStats(entryCounts(diary.entries), diary.totalKm, diary.totalElevationGain) : undefined}
      />

      <DiaryBook
        entries={diary.entries}
        show={show}
        title={diary.config.title}
        subtitle={diary.config.subtitle}
        ownerName={diary.ownerName}
        dateRangeLabel={diary.dateRangeLabel}
        totalKm={diary.totalKm}
        totalElevationGain={diary.totalElevationGain}
        pdfUrl={diary.pdfUrl}
        hideExactDates={diary.hideExactDates}
        compactSummary
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5">
        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}
