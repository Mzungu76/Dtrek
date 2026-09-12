// Indice delle escursioni di UN volume della Raccolta — stessa struttura a griglia, raggruppata
// per anno, della home del Diario (app/leggi/d/[token]/DiaryPublicView.tsx), qui filtrata a un
// solo volume invece di essere la home stessa. docs/raccolte-pubblicazione-piano.md, Fase 3e.
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchPublicCollection } from '@/lib/sharePublicCollection'
import { hasNarrative } from '@/lib/sharePublicDiary'
import { formatDuration } from '@/lib/tcxParser'
import { SiteHeader, DtrekCallout, SiteFooter } from '../../SiteChrome'

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

  const show = volume.show

  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader token={params.token} collectionTitle={collection.title} current="volume" />

      <main className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5">
        <a href={`/leggi/c/${params.token}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-forest-700 transition">
          <ChevronLeft className="w-3.5 h-3.5" /> {collection.title}
        </a>

        <div>
          <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-terra-500">
            Volume {idx + 1} di {collection.volumes.length}
          </p>
          <h1 className="font-display text-3xl font-bold text-forest-900 mt-1">{volume.title}</h1>
          {volume.subtitle && <p className="font-lora italic text-stone-500 mt-1">{volume.subtitle}</p>}
        </div>

        {Array.from(
          volume.entries.reduce((m, e, i) => {
            const y = new Date(e.startTime).getFullYear()
            const list = m.get(y) ?? []
            list.push({ e, i })
            return m.set(y, list)
          }, new Map<number, { e: typeof volume.entries[number]; i: number }[]>()),
        ).sort((a, b) => b[0] - a[0]).map(([year, items]) => (
        <section key={year} className="space-y-3">
          <h2 className="flex items-baseline gap-3 px-1">
            <span className="font-display text-2xl font-bold text-forest-900">{year}</span>
            <span className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-stone-400">
              {items.length} {items.length === 1 ? 'escursione' : 'escursioni'} ·{' '}
              {(items.reduce((s, x) => s + x.e.distanceMeters, 0) / 1000).toFixed(0)} km
            </span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {items.map(({ e, i }) => {
              const cover = show.foto ? e.photos[0] : undefined
              return (
                <a key={e.id} href={`/leggi/c/${params.token}/v/${idx + 1}/e/${i + 1}`}
                  className="group bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden hover:shadow-md hover:border-stone-300 transition flex flex-col">
                  {cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={cover.url} alt="" loading="lazy" decoding="async"
                        className="w-full aspect-[16/9] object-cover bg-stone-100" />
                    : <div className="w-full aspect-[16/9] bg-gradient-to-br from-forest-800 to-forest-950" />}
                  <div className="p-4 flex-1 flex flex-col">
                    <p className="font-barlow font-bold text-[9px] tracking-[0.2em] uppercase text-terra-500">
                      #{String(i + 1).padStart(2, '0')} · {format(new Date(e.startTime), 'MMMM yyyy', { locale: it })}
                    </p>
                    <h3 className="font-display text-lg font-bold text-forest-900 leading-tight mt-1 group-hover:text-forest-700 transition">
                      {e.title}
                    </h3>
                    <p className="font-mono text-xs text-stone-500 mt-2">
                      {(e.distanceMeters / 1000).toFixed(1)} km · {Math.round(e.elevationGain)} m D+
                      {e.totalTimeSeconds > 0 && ` · ${formatDuration(e.totalTimeSeconds)}`}
                    </p>
                    <p className="mt-auto pt-3 flex items-center gap-1 text-xs font-semibold text-forest-700">
                      {hasNarrative(e.content) && show.racconto ? 'Leggi il racconto' : 'Vedi l’escursione'}
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </p>
                  </div>
                </a>
              )
            })}
          </div>
        </section>
        ))}
        {volume.entries.length === 0 && (
          <p className="text-sm text-stone-400 text-center py-8">Nessuna escursione pubblicata in questo volume.</p>
        )}

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}
