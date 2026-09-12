// Route Next.js per l'indice di UN volume della Raccolta — il markup vero vive in VolumeView.tsx
// (componente separato: Next.js rifiuta in build un file `page.tsx` con export diversi da quelli
// che riconosce, come `default`/`generateMetadata`/`dynamic`).
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicCollection } from '@/lib/sharePublicCollection'
import { VolumeView } from './VolumeView'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getCollection = cache(fetchPublicCollection)

/** `vi` è 1-based nell'URL, come `n` nelle pagine di escursione — coerenza con
 *  app/leggi/d/[token]/e/[n]/page.tsx. */
function parseIndex(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n - 1 : null
}

export async function generateMetadata(
  { params }: { params: { token: string; vi: string } },
): Promise<Metadata> {
  const idx = parseIndex(params.vi)
  const collection = idx === null ? null : await getCollection(params.token)
  const volume = collection && idx !== null ? collection.volumes[idx] : undefined
  if (!volume) return { title: 'Volume non trovato · DTrek' }

  return {
    title: `${volume.title} · ${collection!.title} · DTrek`,
    description: `${volume.entries.length} escursioni · ${volume.totalKm.toFixed(0)} km — dalla raccolta ${collection!.title}`,
  }
}

export default async function VolumePage({ params }: { params: { token: string; vi: string } }) {
  const idx = parseIndex(params.vi)
  if (idx === null) notFound()
  const collection = await getCollection(params.token)
  if (!collection) notFound()
  const volume = collection.volumes[idx]
  if (!volume) notFound()

  return <VolumeView collection={collection} volume={volume} idx={idx} token={params.token} />
}
