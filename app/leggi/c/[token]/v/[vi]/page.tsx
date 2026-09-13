// Copertina a piena pagina di UN Diario dentro la Raccolta — stessa idea della copertina del
// Diario standalone (DiaryPublicView), con in più le frecce per scorrere agli altri Diari della
// stessa Raccolta (sempre leggibili: chi ha il link della Raccolta ha già accesso a tutti i suoi
// Diari) e la galleria in fondo che li elenca tutti. Il contenuto vero (Sommario + escursioni) è
// il libro, raggiunto da "Vedi Reportage" — app/leggi/c/[token]/v/[vi]/libro.
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicCollection } from '@/lib/sharePublicCollection'
import { PublicCover } from '@/components/leggi/PublicCover'
import { BottomGalleryStrip, BOTTOM_GALLERY_SPACER_CLASS, BOTTOM_GALLERY_HEIGHT_PX } from '@/components/leggi/BottomGalleryStrip'
import { SiteHeader, DtrekCallout, SiteFooter } from '../../SiteChrome'

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

      <PublicCover
        coverUrl={volume.coverUrl}
        eyebrow={`Diario ${idx + 1} di ${collection.volumes.length}${volume.dateRangeLabel ? ` · ${volume.dateRangeLabel}` : ''}`}
        title={volume.title}
        subtitle={volume.subtitle}
        ownerName={collection.ownerName}
        pills={[
          { value: String(volume.entries.length), label: volume.entries.length === 1 ? 'escursione' : 'escursioni' },
          { value: `${volume.totalKm.toFixed(0)} km`, label: 'percorsi' },
          { value: `${Math.round(volume.totalElevationGain).toLocaleString('it')} m`, label: 'dislivello+' },
        ]}
        prevHref={idx > 0 ? `/leggi/c/${params.token}/v/${idx}` : undefined}
        nextHref={idx < collection.volumes.length - 1 ? `/leggi/c/${params.token}/v/${idx + 2}` : undefined}
        cta={{ href: `/leggi/c/${params.token}/v/${idx + 1}/libro`, label: 'Vedi Reportage' }}
        bottomInset={collection.volumes.length > 1 ? BOTTOM_GALLERY_HEIGHT_PX : 0}
      />

      {collection.volumes.length > 1 && (
        <BottomGalleryStrip items={collection.volumes.map((v, i) => ({
          href: `/leggi/c/${params.token}/v/${i + 1}`,
          title: v.title,
          imageUrl: v.coverUrl,
          badge: `${v.entries.length} rep.`,
        }))} />
      )}

      <main className={`max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5 ${collection.volumes.length > 1 ? BOTTOM_GALLERY_SPACER_CLASS : ''}`}>
        <a href={`/leggi/c/${params.token}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-forest-700 transition">
          ← {collection.title}
        </a>
        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}
