import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchLiveSession } from '@/lib/liveSharePublic'
import LiveShareViewer from '@/components/navigation/LiveShareViewer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Dedupe la lettura tra generateMetadata e il render della pagina.
const getLiveSession = cache(fetchLiveSession)

// Deliberatamente diverso da app/s/[token]/page.tsx (condivisione di un'attività conclusa):
// nessuna opengraph-image, non indicizzabile — un link di posizione live è pensato per un
// singolo contatto di fiducia, non per un'anteprima social né per un crawler di prefetch.
// Vedi docs/navigator-orizzonti-roadmap.md, Fase 1.
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const session = await getLiveSession(params.token)
  return {
    title: session ? `Posizione live · DTrek` : 'Link non valido · DTrek',
    robots: { index: false, follow: false },
  }
}

export default async function LiveSharePage({ params }: { params: { token: string } }) {
  const session = await getLiveSession(params.token)
  if (!session) notFound()

  return <LiveShareViewer token={params.token} initial={session} />
}
