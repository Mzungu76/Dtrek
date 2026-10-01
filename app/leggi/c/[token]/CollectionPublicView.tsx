// Home del sito pubblico della Raccolta — copertina (titolo, sottotitolo, prefazione, numeri)
// più, subito sotto, l'elenco di tutti i Diari della Raccolta: non più un pulsante "Vedi la
// raccolta" da premere per scoprire quanti Diari ci sono e quali. Ogni card apre direttamente il
// libro del Diario (Sommario + pagine), senza passare da una copertina-carosello intermedia.
// Componente SERVER: nessuno stato, nessun JavaScript spedito al browser.
import { entryCounts, entryCountsLabel, entryHeadlineStats } from '@/lib/reportFacts'
import { Library } from 'lucide-react'
import type { PublicCollection } from '@/lib/sharePublicCollection'
import { PublicCover } from '@/components/leggi/PublicCover'
import { SiteHeader, DtrekCallout, SiteFooter } from './SiteChrome'
import SafeImg from '@/components/ui/SafeImg'

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
        pills={entryHeadlineStats(entryCounts(collection.volumes.flatMap(v => v.entries)), collection.totalKm, collection.totalElevationGain)}
        prevHref={prevToken ? `/leggi/c/${prevToken}` : undefined}
        nextHref={nextToken ? `/leggi/c/${nextToken}` : undefined}
      />

      <main className="max-w-4xl lg:max-w-6xl xl:max-w-[1600px] mx-auto px-4 sm:px-5 lg:px-10 xl:px-14 py-6 sm:py-8 lg:py-10 space-y-8 lg:space-y-10">
        {collection.volumes.length > 0 && (
          <section className="space-y-3 lg:space-y-4">
            <h2 className="flex items-center gap-2 font-display text-xl lg:text-2xl font-bold text-forest-900 px-1">
              <Library className="w-5 h-5 lg:w-6 lg:h-6 text-forest-600" /> Diari
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
              {collection.volumes.map((v, i) => (
                <VolumeCard key={v.diaryId} href={`/leggi/c/${token}/v/${i + 1}/libro`}
                  coverUrl={v.coverUrl} title={v.title} subtitle={v.subtitle}
                  counts={entryCounts(v.entries)} km={v.totalKm} />
              ))}
            </div>
          </section>
        )}

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}

/** Card a immagine piena, stesso linguaggio visivo della galleria del sito personale
 *  (app/u/[slug]/page.tsx GalleryCard) — nessuna copertina disponibile → sfondo verde a
 *  gradiente, mai un riquadro bianco piatto. */
function VolumeCard({ href, coverUrl, title, subtitle, counts, km }: {
  href: string; coverUrl: string | null; title: string; subtitle: string; counts: { hikes: number; visits: number }; km: number
}) {
  return (
    <a href={href}
      className="group relative aspect-[4/5] rounded-2xl overflow-hidden shadow-sm border border-stone-200 hover:shadow-md transition">
      {coverUrl ? (
        <SafeImg variant="cover" src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <h3 className="font-display text-sm sm:text-base font-bold text-white leading-tight" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
          {title}
        </h3>
        {subtitle && <p className="font-lora italic text-[11px] text-white/75 mt-0.5 truncate">{subtitle}</p>}
        <p className="text-[10.5px] text-white/70 mt-1">
          {entryCountsLabel(counts)}{km > 0 && ` · ${km.toFixed(0)} km`}
        </p>
      </div>
    </a>
  )
}
