// Il Diario (volume di una Raccolta) come libro — stessa struttura di app/leggi/d/[token]/libro,
// solo che "torna ai Diari" riporta alla copertina di questo volume dentro la Raccolta invece che
// a un Diario standalone.
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicCollection } from '@/lib/sharePublicCollection'
import { DiaryBook } from '@/components/leggi/DiaryBook'
import { SiteHeader } from '../../../SiteChrome'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getCollection = cache(fetchPublicCollection)

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
  if (!volume) return { title: 'Diario non trovato · DTrek' }
  return { title: `${volume.title} · ${collection!.title} · DTrek` }
}

export default async function VolumeLibroPage({ params }: { params: { token: string; vi: string } }) {
  const idx = parseIndex(params.vi)
  if (idx === null) notFound()
  const collection = await getCollection(params.token)
  if (!collection) notFound()
  const volume = collection.volumes[idx]
  if (!volume) notFound()

  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader token={params.token} collectionTitle={collection.title} current="volume" />
      <DiaryBook
        entries={volume.entries}
        show={volume.show}
        title={volume.title}
        subtitle={volume.subtitle}
        ownerName={collection.ownerName}
        dateRangeLabel={volume.dateRangeLabel}
        totalKm={volume.totalKm}
        totalElevationGain={volume.totalElevationGain}
        backHref={`/leggi/c/${params.token}/v/${idx + 1}`}
        backLabel="Torna ai Diari"
      />
    </div>
  )
}
