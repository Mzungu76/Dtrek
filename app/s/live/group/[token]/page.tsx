import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicGroup } from '@/lib/groupSharePublic'
import GroupShareViewer from '@/components/navigation/GroupShareViewer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getGroup = cache(fetchPublicGroup)

// Stessa scelta della Fase 1 (app/s/live/[token]/page.tsx): non indicizzabile, nessuna
// opengraph-image — un link di gruppo è per i partecipanti, non per un'anteprima social.
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const group = await getGroup(params.token)
  return {
    title: group ? `${group.groupName} · DTrek` : 'Link non valido · DTrek',
    robots: { index: false, follow: false },
  }
}

export default async function GroupSharePage({ params }: { params: { token: string } }) {
  const group = await getGroup(params.token)
  if (!group) notFound()
  return <GroupShareViewer token={params.token} initial={group} />
}
