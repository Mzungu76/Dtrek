import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicCollection } from '@/lib/sharePublicCollection'
import { CollectionPublicView } from './CollectionPublicView'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Dedup della lettura DB tra generateMetadata e il render della pagina — stesso accorgimento di
// app/leggi/d/[token]/page.tsx.
const getCollection = cache(fetchPublicCollection)

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const collection = await getCollection(params.token)
  if (!collection) return { title: 'Raccolta non trovata · DTrek' }

  const title = `${collection.title} · DTrek`
  const desc = collection.totalEntries > 0
    ? `${collection.volumes.length} volumi · ${collection.totalEntries} escursioni · ${collection.totalKm.toFixed(0)} km · di ${collection.ownerName}`
    : `Una raccolta di Diari di ${collection.ownerName}`

  return {
    metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
    title,
    description: desc,
    openGraph: { title: collection.title, description: desc, type: 'article' },
    twitter:    { card: 'summary_large_image', title: collection.title, description: desc },
  }
}

export default async function CollectionPublicPage({ params }: { params: { token: string } }) {
  const collection = await getCollection(params.token)
  if (!collection) notFound()

  return <CollectionPublicView collection={collection} token={params.token} />
}
