// Il Diario come libro — Sommario più una pagina per escursione, sfogliate in orizzontale
// (components/leggi/DiaryBook.tsx). Sostituisce le vecchie pagine singole `/e/[n]`: un Diario
// pubblicato da solo è un libro a sé, non ha altri Diari tra cui scegliere (a differenza di un
// volume dentro una Raccolta, che vive in app/leggi/c/[token]/v/[vi]/libro).
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicDiary } from '@/lib/sharePublicDiary'
import { DiaryBook } from '@/components/leggi/DiaryBook'
import { SiteHeader } from '../SiteChrome'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getDiary = cache(fetchPublicDiary)

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const diary = await getDiary(params.token)
  if (!diary) return { title: 'Diario non trovato · DTrek' }
  return { title: `${diary.config.title} · DTrek` }
}

export default async function DiarioLibroPage({ params }: { params: { token: string } }) {
  const diary = await getDiary(params.token)
  if (!diary) notFound()

  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader homeHref={`/leggi/d/${params.token}`} title={diary.config.title} />
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
        backHref={`/leggi/d/${params.token}`}
        backLabel="Torna al Diario"
      />
    </div>
  )
}
