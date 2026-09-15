// Elenco completo dei Reportage del sito personale — la home (app/u/[slug]/page.tsx) mostra solo
// gli ultimi 3 con un link "Vedi tutti" a questa pagina. Stessa architettura server-only del resto
// del sito pubblico: il filtro per Diario non è uno stato client, è un parametro in querystring
// (`?diario=token` o `?diario=indipendenti`) — un link vero, niente JavaScript spedito al
// browser, coerente con ogni altra pagina di app/leggi/*.
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicProfile } from '@/lib/publicProfile'
import { ReportageCard } from '@/components/leggi/ReportageCard'
import { SiteHeader, DtrekCallout, SiteFooter } from '@/app/leggi/d/[token]/SiteChrome'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getProfile = cache(fetchPublicProfile)

/** Sentinella per il filtro "senza Diario" — mai un token reale (i token sono UUID), quindi non
 *  può collidere con un Diario esistente. */
const INDEPENDENT_FILTER = 'indipendenti'

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const profile = await getProfile(params.slug)
  if (!profile) return { title: 'Sito non trovato · DTrek' }
  return {
    title: `Reportage · ${profile.displayName} · DTrek`,
    robots: { index: false, follow: true }, // pagina di navigazione derivata, non un contenuto a sé da indicizzare
  }
}

export default async function ProfileReportagePage({ params, searchParams }: {
  params: { slug: string }
  searchParams: { diario?: string }
}) {
  const profile = await getProfile(params.slug)
  if (!profile) notFound()

  // Solo i Diari che hanno davvero almeno un Reportage in lista — un Diario pubblicato ma ancora
  // senza escursioni raccontate non merita un filtro che non filtrerebbe mai nulla.
  const diaryTokensInList = new Set(profile.reportage.map(r => r.diary?.token).filter((t): t is string => !!t))
  const diaryFilters = profile.diaries.filter(d => diaryTokensInList.has(d.token))
  const hasIndependent = profile.reportage.some(r => !r.diary)

  const activeFilter = searchParams.diario
  const filtered = !activeFilter
    ? profile.reportage
    : activeFilter === INDEPENDENT_FILTER
      ? profile.reportage.filter(r => !r.diary)
      : profile.reportage.filter(r => r.diary?.token === activeFilter)

  const basePath = `/u/${params.slug}/reportage`

  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader homeHref={`/u/${params.slug}`} homeLabel="Sito" title={profile.displayName} />

      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-forest-900">Reportage</h1>
          <p className="text-sm text-stone-400 mt-1">
            {profile.reportage.length} escursion{profile.reportage.length === 1 ? 'e' : 'i'} di {profile.displayName}
          </p>
        </div>

        {(diaryFilters.length > 0 || hasIndependent) && (
          <div className="flex flex-wrap gap-2">
            <FilterPill href={basePath} label="Tutti" active={!activeFilter} />
            {diaryFilters.map(d => (
              <FilterPill key={d.token} href={`${basePath}?diario=${d.token}`} label={d.title} active={activeFilter === d.token} />
            ))}
            {hasIndependent && (
              <FilterPill href={`${basePath}?diario=${INDEPENDENT_FILTER}`} label="Indipendenti" active={activeFilter === INDEPENDENT_FILTER} />
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {filtered.map(r => (
            <ReportageCard key={r.id} item={r} hideExactDates={profile.hideExactDates} />
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-stone-400 text-center py-10 font-lora italic">
              Nessun reportage {activeFilter ? 'per questo filtro' : 'ancora'}.
            </p>
          )}
        </div>

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}

function FilterPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a href={href}
      className={`text-xs font-semibold px-3.5 py-1.5 rounded-full border transition ${
        active
          ? 'bg-forest-900 border-forest-900 text-white'
          : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
      }`}>
      {label}
    </a>
  )
}
