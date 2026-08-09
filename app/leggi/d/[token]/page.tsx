import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicDiary } from '@/lib/sharePublicDiary'
import { DiaryPublicView } from './DiaryPublicView'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Dedup della lettura DB tra generateMetadata e il render della pagina — stesso accorgimento di
// app/s/[token]/page.tsx.
const getDiary = cache(fetchPublicDiary)

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const diary = await getDiary(params.token)
  if (!diary) return { title: 'Diario non trovato · DTrek' }

  const title = `${diary.config.title} · DTrek`
  const desc = diary.entries.length > 0
    ? `${diary.entries.length} escursioni · ${diary.totalKm.toFixed(0)} km · di ${diary.ownerName}`
    : `Diario di viaggio di ${diary.ownerName}`

  return {
    metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
    title,
    description: desc,
    openGraph: { title: diary.config.title, description: desc, type: 'article' },
    twitter:    { card: 'summary_large_image', title: diary.config.title, description: desc },
  }
}

export default async function DiarioPublicPage({ params }: { params: { token: string } }) {
  const diary = await getDiary(params.token)
  if (!diary) notFound()

  return <DiaryPublicView diary={diary} token={params.token} />
}
