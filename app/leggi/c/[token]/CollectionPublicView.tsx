// Home del sito pubblico della Raccolta — frontespizio, prefazione, indice dei volumi.
// docs/raccolte-pubblicazione-piano.md, Fase 3e. Stessa architettura del Diario
// (app/leggi/d/[token]/DiaryPublicView.tsx): componente SERVER, nessuno stato, nessun JavaScript
// spedito al browser.
//
// A differenza della home del Diario (che elenca le escursioni direttamente, raggruppate per
// anno), qui l'indice è dei VOLUMI: ciascuno apre la propria pagina con le sue escursioni
// (`/v/[vi]`) — una raccolta con molti Diari, ciascuno con molte uscite, diventerebbe altrimenti un
// solo, lunghissimo muro di card.
import { ChevronRight } from 'lucide-react'
import type { PublicCollection } from '@/lib/sharePublicCollection'
import { SiteHeader, DtrekCallout, SiteFooter } from './SiteChrome'

export function CollectionPublicView({ collection, token }: { collection: PublicCollection; token: string }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader token={token} collectionTitle={collection.title} current="home" />

      <main className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5">
        {/* Frontespizio */}
        <section className="relative rounded-3xl overflow-hidden shadow-sm border border-stone-200">
          <div className="relative p-8 sm:p-12 text-white"
            style={{ background: collection.coverUrl ? undefined : 'linear-gradient(158deg,#3a2a1c 0%,#1c4724 55%,#20592b 100%)' }}>
            {collection.coverUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={collection.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(8,24,14,0.74) 0%, rgba(8,24,14,0.5) 60%, rgba(8,24,14,0.62) 100%)' }} />
              </>
            )}
            <div className="relative">
              <p className="font-barlow font-bold text-[11px] tracking-[0.25em] uppercase text-terra-300 mb-3">
                Una collana in {collection.volumes.length} {collection.volumes.length === 1 ? 'volume' : 'volumi'}
                {collection.dateRangeLabel && ` · ${collection.dateRangeLabel}`}
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-bold leading-tight">{collection.title}</h1>
              {collection.subtitle && <p className="mt-2 font-lora italic text-white/70 text-lg">{collection.subtitle}</p>}
              <p className="mt-5 text-sm text-white/60">di {collection.ownerName}</p>
            </div>
          </div>
        </section>

        {/* Numeri complessivi */}
        <section className="grid grid-cols-3 gap-3">
          {[
            { value: String(collection.totalEntries), label: collection.totalEntries === 1 ? 'Escursione' : 'Escursioni' },
            { value: `${collection.totalKm.toFixed(0)} km`, label: 'Percorsi' },
            { value: `${Math.round(collection.totalElevationGain).toLocaleString('it')} m`, label: 'Dislivello +' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-stone-200 px-3 py-4 text-center shadow-sm">
              <div className="font-mono text-xl sm:text-2xl font-bold text-forest-800 leading-tight">{s.value}</div>
              <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mt-1">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Prefazione */}
        {collection.preface && (
          <section className="bg-white rounded-2xl border border-stone-200 shadow-sm px-6 py-6 sm:px-8 sm:py-7">
            <p className="font-lora text-[15px] leading-relaxed text-stone-700 whitespace-pre-line">
              {collection.preface}
            </p>
          </section>
        )}

        {/* Indice dei volumi */}
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-bold text-forest-900 px-1">I volumi</h2>
          <div className="flex flex-col gap-3">
            {collection.volumes.map((v, i) => (
              <a key={v.diaryId} href={`/leggi/c/${token}/v/${i + 1}`}
                className="group bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden hover:shadow-md hover:border-stone-300 transition flex items-stretch">
                <div className="w-20 sm:w-28 shrink-0 relative"
                  style={{ background: v.coverUrl ? undefined : 'linear-gradient(160deg,#1c4724,#0e2118)' }}>
                  {v.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0 p-4 flex flex-col justify-center">
                  <p className="font-barlow font-bold text-[9px] tracking-[0.2em] uppercase text-terra-500">
                    Volume {i + 1}
                  </p>
                  <h3 className="font-display text-lg font-bold text-forest-900 leading-tight mt-0.5 group-hover:text-forest-700 transition truncate">
                    {v.title}
                  </h3>
                  <p className="font-mono text-xs text-stone-500 mt-1.5">
                    {v.entries.length} {v.entries.length === 1 ? 'escursione' : 'escursioni'} · {v.totalKm.toFixed(0)} km
                    {v.dateRangeLabel && ` · ${v.dateRangeLabel}`}
                  </p>
                </div>
                <div className="flex items-center pr-4 text-stone-300 group-hover:text-forest-500 transition">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </a>
            ))}
            {collection.volumes.length === 0 && (
              <p className="text-sm text-stone-400 text-center py-8">Nessun volume ancora pubblicato in questa raccolta.</p>
            )}
          </div>
        </section>

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}
