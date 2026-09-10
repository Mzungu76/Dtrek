// Pagina di una singola escursione sul sito pubblico del Diario.
//
// Il link condiviso non è più un unico scorrimento infinito: ogni escursione ha il suo indirizzo,
// quindi si può mandare a qualcuno la singola uscita, si apre in fretta anche con cento foto
// nell'archivio, e i motori di ricerca la vedono come un documento a sé.

import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchPublicDiary, hasNarrative } from '@/lib/sharePublicDiary'
import { SiteHeader, SiteFooter, DtrekCallout } from '../../SiteChrome'
import { EntryArticle, EntryCard } from '../../EntryArticle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getDiary = cache(fetchPublicDiary)

/** `n` è 1-based nell'URL: `/e/1` è la prima escursione, non la seconda. */
function parseIndex(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n - 1 : null
}

export async function generateMetadata(
  { params }: { params: { token: string; n: string } },
): Promise<Metadata> {
  const idx = parseIndex(params.n)
  const diary = idx === null ? null : await getDiary(params.token)
  const entry = diary && idx !== null ? diary.entries[idx] : undefined
  if (!entry) return { title: 'Escursione non trovata · DTrek' }

  const desc = `${(entry.distanceMeters / 1000).toFixed(1)} km · ${Math.round(entry.elevationGain)} m di dislivello · dal diario di ${diary!.ownerName}`
  return {
    title: `${entry.title} · ${diary!.config.title}`,
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

export default async function EscursionePage({ params }: { params: { token: string; n: string } }) {
  const idx = parseIndex(params.n)
  if (idx === null) notFound()
  const diary = await getDiary(params.token)
  if (!diary) notFound()

  const entry = diary.entries[idx]
  if (!entry) notFound()

  const prev = idx > 0 ? idx : null
  const next = idx < diary.entries.length - 1 ? idx + 2 : null
  const show = diary.config.publicSections

  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader token={params.token} diaryTitle={diary.config.title} current="escursione" />

      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-6 space-y-5">
        <a href={`/leggi/d/${params.token}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-forest-700 transition">
          <ChevronLeft className="w-3.5 h-3.5" /> Tutte le escursioni
        </a>

        {hasNarrative(entry.content) && show.racconto
          ? <EntryArticle entry={entry} n={idx + 1} show={show} />
          : <EntryCard entry={entry} n={idx + 1} />}

        {/* Navigazione fra escursioni: è ciò che rende il diario un percorso da sfogliare invece
            di una raccolta di pagine slegate. */}
        <nav className="flex items-stretch gap-3">
          {prev !== null ? (
            <a href={`/leggi/d/${params.token}/e/${prev}`}
              className="flex-1 min-w-0 bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 hover:border-stone-300 transition group">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                <ChevronLeft className="w-3 h-3" /> Precedente
              </p>
              <p className="text-sm font-display font-bold text-forest-900 truncate mt-0.5 group-hover:text-forest-700 transition">
                {diary.entries[prev - 1].title}
              </p>
            </a>
          ) : <div className="flex-1" />}
          {next !== null ? (
            <a href={`/leggi/d/${params.token}/e/${next}`}
              className="flex-1 min-w-0 bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 text-right hover:border-stone-300 transition group">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center justify-end gap-1">
                Successiva <ChevronRight className="w-3 h-3" />
              </p>
              <p className="text-sm font-display font-bold text-forest-900 truncate mt-0.5 group-hover:text-forest-700 transition">
                {diary.entries[next - 1].title}
              </p>
            </a>
          ) : <div className="flex-1" />}
        </nav>

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}
