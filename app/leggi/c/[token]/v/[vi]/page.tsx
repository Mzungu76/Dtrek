// Il Diario (volume di una Raccolta) — direttamente il libro (Sommario + pagine delle
// escursioni), non più un frontespizio con il pulsante "Vedi Reportage" da premere prima di
// arrivare al contenuto. L'elenco degli altri Diari della Raccolta vive nella pagina della
// Raccolta (/leggi/c/[token]), che ora li mostra tutti direttamente — non serve più ripeterlo
// qui con una copertina-carosello. /leggi/c/[token]/v/[vi]/libro resta raggiungibile con lo
// stesso contenuto per chi ha già quel link salvato.
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicCollection } from '@/lib/sharePublicCollection'
import { DiaryBook } from '@/components/leggi/DiaryBook'
import { SiteHeader } from '../../SiteChrome'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getCollection = cache(fetchPublicCollection)

/** `vi` è 1-based nell'URL, come `n` nelle pagine di escursione. */
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

  return {
    title: `${volume.title} · ${collection!.title} · DTrek`,
    description: `${volume.entries.length} escursioni · ${volume.totalKm.toFixed(0)} km — dalla raccolta ${collection!.title}`,
  }
}

export default async function VolumeCoverPage({ params }: { params: { token: string; vi: string } }) {
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
        backHref={`/leggi/c/${params.token}`}
        backLabel="Torna ai Diari"
        hideExactDates={volume.hideExactDates}
      />
    </div>
  )
}
