// Home del sito pubblico del Diario — SOLO copertina a piena pagina. Il contenuto (numeri,
// grafico, mappa d'insieme, indice) si è spostato sulla prima pagina del libro (Sommario,
// components/leggi/DiaryBook.tsx), raggiunto dal pulsante "Vedi Reportage": la copertina è un
// frontespizio, non un indice.
//
// Resta un componente SERVER: nessuno stato, nessun JavaScript spedito al browser.
import { type PublicDiary } from '@/lib/sharePublicDiary'
import { PublicCover } from '@/components/leggi/PublicCover'
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
        pills={show.statistiche ? [
          { value: String(diary.entries.length), label: diary.entries.length === 1 ? 'escursione' : 'escursioni' },
          { value: `${diary.totalKm.toFixed(0)} km`, label: 'percorsi' },
          { value: `${Math.round(diary.totalElevationGain).toLocaleString('it')} m`, label: 'dislivello+' },
        ] : undefined}
        cta={{ href: `/leggi/d/${token}/libro`, label: 'Vedi Reportage' }}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5">
        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}
