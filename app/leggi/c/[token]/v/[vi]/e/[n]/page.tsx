// Pagina di una singola escursione, dentro un volume della Raccolta — stessa struttura di
// app/leggi/d/[token]/e/[n]/page.tsx, con la navigazione precedente/successiva vincolata al
// volume (non all'intera raccolta: un lettore dentro "Estate 2026" non deve saltare in un altro
// Diario senza accorgersene). docs/raccolte-pubblicazione-piano.md, Fase 3e.
//
// Direzione Taccuino Botanico (docs/siti-pubblici-taccuino-piano.md, Fase 5): EntryArticle è già
// in stile taccuino (riusata identica da app/leggi/d/[token]) — mancava solo il telaio intorno.
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchPublicCollection } from '@/lib/sharePublicCollection'
import { hasNarrative } from '@/lib/sharePublicDiary'
import { SiteHeader, SiteFooter, DtrekCallout, taccuinoPaperBackgroundStyle, TaccuinoSpineShadow } from '../../../../SiteChrome'
import { EntryArticle, EntryCard } from '@/app/leggi/d/[token]/EntryArticle'
import { PageProgressPill } from '@/components/leggi/PageProgressPill'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getCollection = cache(fetchPublicCollection)

function parseIndex(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n - 1 : null
}

export async function generateMetadata(
  { params }: { params: { token: string; vi: string; n: string } },
): Promise<Metadata> {
  const vIdx = parseIndex(params.vi)
  const eIdx = parseIndex(params.n)
  const collection = vIdx === null || eIdx === null ? null : await getCollection(params.token)
  const volume = collection && vIdx !== null ? collection.volumes[vIdx] : undefined
  const entry = volume && eIdx !== null ? volume.entries[eIdx] : undefined
  if (!entry || !volume) return { title: 'Escursione non trovata · DTrek' }

  const desc = `${(entry.distanceMeters / 1000).toFixed(1)} km · ${Math.round(entry.elevationGain)} m di dislivello · da ${volume.title}`
  return {
    title: `${entry.title} · ${volume.title}`,
    description: desc,
    openGraph: {
      title: entry.title,
      description: desc,
      type: 'article',
      images: entry.photos[0] ? [entry.photos[0].url] : undefined,
    },
    twitter: { card: 'summary_large_image', title: entry.title, description: desc },
  }
}

export default async function CollectionEntryPage({ params }: { params: { token: string; vi: string; n: string } }) {
  const vIdx = parseIndex(params.vi)
  const eIdx = parseIndex(params.n)
  if (vIdx === null || eIdx === null) notFound()
  const collection = await getCollection(params.token)
  if (!collection) notFound()
  const volume = collection.volumes[vIdx]
  if (!volume) notFound()
  const entry = volume.entries[eIdx]
  if (!entry) notFound()

  const volumeBase = `/leggi/c/${params.token}/v/${vIdx + 1}`
  const prev = eIdx > 0 ? eIdx : null
  const next = eIdx < volume.entries.length - 1 ? eIdx + 2 : null

  return (
    <div className="min-h-screen relative" style={taccuinoPaperBackgroundStyle()}>
      <TaccuinoSpineShadow />
      <SiteHeader token={params.token} collectionTitle={collection.title} current="escursione" />

      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-6 pl-[calc(1rem+34px)] sm:pl-[calc(1.25rem+34px)] pb-24 space-y-5">
        <a href={volumeBase}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#7A6F52] hover:text-[#193b20] transition">
          <ChevronLeft className="w-3.5 h-3.5" /> {volume.title}
        </a>

        {hasNarrative(entry.content) && volume.show.racconto
          ? <EntryArticle entry={entry} n={eIdx + 1} show={volume.show} />
          : <EntryCard entry={entry} n={eIdx + 1} />}

        <nav className="flex items-stretch gap-3">
          {prev !== null ? (
            <a href={`${volumeBase}/e/${prev}`}
              className="flex-1 min-w-0 bg-[#EBE0C8] rounded-2xl border border-[#D9C9A8] shadow-sm px-4 py-3 hover:border-[#C0603D]/50 transition group">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#95886A] flex items-center gap-1">
                <ChevronLeft className="w-3 h-3" /> Precedente
              </p>
              <p className="text-sm font-display font-bold text-[#193b20] truncate mt-0.5 group-hover:text-[#20592b] transition">
                {volume.entries[prev - 1].title}
              </p>
            </a>
          ) : <div className="flex-1" />}
          {next !== null ? (
            <a href={`${volumeBase}/e/${next}`}
              className="flex-1 min-w-0 bg-[#EBE0C8] rounded-2xl border border-[#D9C9A8] shadow-sm px-4 py-3 text-right hover:border-[#C0603D]/50 transition group">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#95886A] flex items-center justify-end gap-1">
                Successiva <ChevronRight className="w-3 h-3" />
              </p>
              <p className="text-sm font-display font-bold text-[#193b20] truncate mt-0.5 group-hover:text-[#20592b] transition">
                {volume.entries[next - 1].title}
              </p>
            </a>
          ) : <div className="flex-1" />}
        </nav>

        <DtrekCallout />
        <SiteFooter />
      </main>

      <PageProgressPill label={entry.title} current={eIdx + 1} total={volume.entries.length} />
    </div>
  )
}
