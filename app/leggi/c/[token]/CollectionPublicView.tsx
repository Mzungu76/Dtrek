// Home del sito pubblico della Raccolta — SOLO copertina a piena pagina (titolo, sottotitolo,
// prefazione, numeri) e, se l'autore ha pubblicato più Raccolte, le frecce per scorrere anche
// alle altre. L'elenco dei Diari non vive più qui: apre in una schermata propria, raggiunta dal
// pulsante "Vedi la raccolta" — stessa idea della copertina di un Diario (DiaryPublicView),
// applicata un livello sopra. Componente SERVER: nessuno stato, nessun JavaScript spedito al
// browser.
import type { PublicCollection } from '@/lib/sharePublicCollection'
import { PublicCover } from '@/components/leggi/PublicCover'
import { BottomGalleryStrip, BOTTOM_GALLERY_SPACER_CLASS, BOTTOM_GALLERY_HEIGHT_PX } from '@/components/leggi/BottomGalleryStrip'
import { SiteHeader, DtrekCallout, SiteFooter } from './SiteChrome'

export function CollectionPublicView({ collection, token }: { collection: PublicCollection; token: string }) {
  const { siblings, siblingIndex } = collection
  const prevToken = siblingIndex > 0 ? siblings[siblingIndex - 1].token : null
  const nextToken = siblingIndex < siblings.length - 1 ? siblings[siblingIndex + 1].token : null

  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader token={token} collectionTitle={collection.title} current="home" />

      <PublicCover
        coverUrl={collection.coverUrl}
        eyebrow={`Una Raccolta di ${collection.volumes.length} ${collection.volumes.length === 1 ? 'Diario' : 'Diari'}${collection.dateRangeLabel ? ` · ${collection.dateRangeLabel}` : ''}`}
        title={collection.title}
        subtitle={collection.subtitle}
        preface={collection.preface}
        ownerName={collection.ownerName}
        pills={[
          { value: String(collection.totalEntries), label: collection.totalEntries === 1 ? 'escursione' : 'escursioni' },
          { value: `${collection.totalKm.toFixed(0)} km`, label: 'percorsi' },
          { value: `${Math.round(collection.totalElevationGain).toLocaleString('it')} m`, label: 'dislivello+' },
        ]}
        prevHref={prevToken ? `/leggi/c/${prevToken}` : undefined}
        nextHref={nextToken ? `/leggi/c/${nextToken}` : undefined}
        cta={{ href: `/leggi/c/${token}/v/1`, label: 'Vedi la raccolta' }}
        bottomInset={siblings.length > 1 ? BOTTOM_GALLERY_HEIGHT_PX : 0}
      />

      {siblings.length > 1 && (
        <BottomGalleryStrip items={siblings.map(s => ({
          href: `/leggi/c/${s.token}`,
          title: s.title,
          imageUrl: s.coverUrl,
        }))} />
      )}

      <main className={`max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5 ${siblings.length > 1 ? BOTTOM_GALLERY_SPACER_CLASS : ''}`}>
        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}
