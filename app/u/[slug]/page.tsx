// Il sito personale di un utente — Fase 3 del piano di pubblicazione
// (docs/raccolte-pubblicazione-piano.md): non un quarto documento, l'INDICE di ciò che l'utente ha
// già reso pubblico ai tre livelli esistenti (Raccolta/Diario/Reportage). Stessa architettura
// server-only delle altre pagine pubbliche (app/leggi/d|c|p/[token]) — nessuno stato, nessun
// JavaScript spedito al browser.
//
// Fase 3h (restyling della home): prima mostrava solo un elenco piatto, tutto allo stesso livello
// visivo — nessun punto d'ingresso, nessun contesto su chi fosse l'autore. Quattro cambi, in
// ordine di comparsa sulla pagina: (1) `bio` sotto il nome nella copertina; (2) l'ultima
// pubblicazione aggiornata in evidenza, non sepolta in mezzo alla griglia; (3) una mappa
// d'insieme di tutti i percorsi pubblicati, prima ancora della griglia; (4) i Diari ordinati per
// aggiornamento invece che per titolo (risolto a monte, in lib/publicProfile.ts).
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Library, BookMarked, BookOpen, Sparkles, ArrowRight } from 'lucide-react'
import { fetchPublicProfile } from '@/lib/publicProfile'
import { PublicCover } from '@/components/leggi/PublicCover'
import { ReportageCard } from '@/components/leggi/ReportageCard'
import { AllRoutesMap, AllRoutesLegend } from '@/app/leggi/d/[token]/AllRoutesMap'
import { SiteHeader, DtrekCallout, SiteFooter } from '@/app/leggi/d/[token]/SiteChrome'
import SafeImg from '@/components/ui/SafeImg'

const LATEST_REPORTAGE_COUNT = 3

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getProfile = cache(fetchPublicProfile)

// Stesso pattern di app/leggi/d/[token]/page.tsx e app/leggi/c/[token]/page.tsx — senza
// metadataBase, i link relativi generati per l'immagine OG risolverebbero contro l'host che ha
// servito la richiesta, che dietro un proxy/CDN può non essere l'URL pubblico canonico.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const profile = await getProfile(params.slug)
  if (!profile) return { title: 'Sito non trovato · DTrek' }

  const total = profile.collections.length + profile.diaries.length + profile.reports.length
  const desc = `${total} pubblicazion${total === 1 ? 'e' : 'i'} di ${profile.displayName} su DTrek`

  return {
    metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
    title: `${profile.displayName} · DTrek`,
    description: desc,
    // Prima di questo fix il sito personale (il link più condiviso, essendo l'indice di tutto
    // ciò che l'utente ha pubblicato) era l'unica pagina pubblica senza openGraph/twitter — su
    // WhatsApp/social appariva come testo nudo mentre Diario/Raccolta/Reportage mostravano già
    // una card con foto.
    openGraph: { title: profile.displayName, description: desc, type: 'profile' },
    twitter: { card: 'summary_large_image', title: profile.displayName, description: desc },
  }
}

interface FeaturedItem {
  key: string
  href: string
  title: string
  subtitle: string
  coverUrl: string | null
  updatedAt: string
}

/** L'ultima pubblicazione toccata dall'autore, tra Raccolte/Diari/Reportage insieme — non "il
 *  primo della lista", il più recente per davvero, a prescindere dal tipo. Su un sito che si
 *  presenta come "cosa ha fatto/pubblicato di recente questo escursionista", seppellire l'ultima
 *  uscita in mezzo a una griglia indistinta era la lacuna più visibile. */
function pickFeatured(profile: Awaited<ReturnType<typeof fetchPublicProfile>>): FeaturedItem | null {
  if (!profile) return null
  const candidates: FeaturedItem[] = [
    ...profile.collections.map(c => ({ key: `c-${c.token}`, href: `/leggi/c/${c.token}`, title: c.title, subtitle: c.subtitle, coverUrl: c.coverUrl, updatedAt: c.updatedAt })),
    ...profile.diaries.map(d => ({ key: `d-${d.token}`, href: `/leggi/d/${d.token}`, title: d.title, subtitle: d.subtitle, coverUrl: d.coverUrl, updatedAt: d.updatedAt })),
    ...profile.reports.map(r => ({ key: `r-${r.token}`, href: `/leggi/p/${r.token}`, title: r.title, subtitle: '', coverUrl: null, updatedAt: r.createdAt })),
  ]
  if (candidates.length === 0) return null
  return candidates.reduce((best, c) => new Date(c.updatedAt).getTime() > new Date(best.updatedAt).getTime() ? c : best)
}

export default async function PublicProfilePage({ params }: { params: { slug: string } }) {
  const profile = await getProfile(params.slug)
  if (!profile) notFound()

  const isEmpty = profile.collections.length === 0 && profile.diaries.length === 0 && profile.reports.length === 0
  const coverUrl = profile.collections.find(c => c.coverUrl)?.coverUrl
    ?? profile.diaries.find(d => d.coverUrl)?.coverUrl
    ?? null

  const pills = [
    profile.collections.length > 0 ? { value: String(profile.collections.length), label: profile.collections.length === 1 ? 'raccolta' : 'raccolte' } : null,
    profile.diaries.length > 0 ? { value: String(profile.diaries.length), label: profile.diaries.length === 1 ? 'diario' : 'diari' } : null,
    profile.reportage.length > 0 ? { value: String(profile.reportage.length), label: 'reportage' } : null,
  ].filter((p): p is { value: string; label: string } => p !== null)

  const featured = pickFeatured(profile)
  const collections = profile.collections.filter(c => `c-${c.token}` !== featured?.key)
  const diaries = profile.diaries.filter(d => `d-${d.token}` !== featured?.key)
  // Il Reportage in evidenza (se è uno di questi) non va ripetuto anche qui sotto — confrontato
  // per href, l'unico campo comune a un'escursione dentro un Diario (ancora `#p-N`) e a un
  // Reportage indipendente (pagina propria).
  const latestReportage = profile.reportage
    .filter(r => r.href !== featured?.href)
    .slice(0, LATEST_REPORTAGE_COUNT)

  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader homeHref={`/u/${params.slug}`} homeLabel="Sito" title={profile.displayName} current="home" />

      <PublicCover
        coverUrl={coverUrl}
        eyebrow="Sito personale"
        title={profile.displayName}
        preface={profile.bio || null}
        pills={pills}
      />

      <main className="max-w-4xl lg:max-w-6xl xl:max-w-[1600px] mx-auto px-4 sm:px-5 lg:px-10 xl:px-14 py-6 sm:py-8 lg:py-10 space-y-8 lg:space-y-10">
        {isEmpty && (
          <p className="text-sm text-stone-400 text-center py-10 font-lora italic">
            Nessuna pubblicazione ancora.
          </p>
        )}

        {featured && (
          <section>
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-forest-900 px-1 mb-3">
              <Sparkles className="w-5 h-5 text-terra-500" /> In evidenza
            </h2>
            <a href={featured.href} target="_blank" rel="noopener noreferrer"
              className="group relative block aspect-[16/10] sm:aspect-[21/9] rounded-3xl overflow-hidden shadow-md border border-stone-200">
              {featured.coverUrl ? (
                <SafeImg variant="cover" src={featured.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="absolute inset-0" style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
                <h3 className="font-display text-xl sm:text-2xl font-bold text-white leading-tight" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
                  {featured.title}
                </h3>
                {featured.subtitle && (
                  <p className="font-lora italic text-sm text-white/80 mt-1 truncate">{featured.subtitle}</p>
                )}
              </div>
            </a>
          </section>
        )}

        {profile.routes.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold text-forest-900 px-1 mb-3">Tutti i percorsi</h2>
            <AllRoutesMap routes={profile.routes} />
            <AllRoutesLegend routes={profile.routes} />
          </section>
        )}

        {collections.length > 0 && (
          <ProfileSection icon={Library} title="Raccolte">
            {collections.map(c => (
              <GalleryCard key={c.token} href={`/leggi/c/${c.token}`} coverUrl={c.coverUrl}
                title={c.title} subtitle={c.subtitle} />
            ))}
          </ProfileSection>
        )}

        {diaries.length > 0 && (
          <ProfileSection icon={BookMarked} title="Diari">
            {diaries.map(d => (
              <GalleryCard key={d.token} href={`/leggi/d/${d.token}`} coverUrl={d.coverUrl}
                title={d.title} subtitle={d.subtitle} />
            ))}
          </ProfileSection>
        )}

        {latestReportage.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-forest-900">
                <BookOpen className="w-5 h-5 text-forest-600" /> Ultimi reportage
              </h2>
              <a href={`/u/${params.slug}/reportage`}
                className="flex items-center gap-1 text-xs font-semibold text-forest-700 hover:text-forest-800 transition shrink-0">
                Vedi tutti <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="flex flex-col gap-2">
              {latestReportage.map(r => (
                <ReportageCard key={r.id} item={r} hideExactDates={profile.hideExactDates} />
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

function ProfileSection({ icon: Icon, title, children }: { icon: typeof Library; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 lg:space-y-4">
      <h2 className="flex items-center gap-2 font-display text-xl lg:text-2xl font-bold text-forest-900 px-1">
        <Icon className="w-5 h-5 lg:w-6 lg:h-6 text-forest-600" /> {title}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">{children}</div>
    </section>
  )
}

/** Card a immagine piena, stesso linguaggio visivo della BottomGalleryStrip (components/leggi/
 *  BottomGalleryStrip.tsx) ma più grande — qui non è una barra di navigazione fissa, è la griglia
 *  principale della pagina. Nessuna copertina disponibile → stesso sfondo verde a gradiente della
 *  copertina in testa (PublicCover), mai un riquadro bianco piatto. */
function GalleryCard({ href, coverUrl, title, subtitle }: { href: string; coverUrl: string | null; title: string; subtitle: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
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
      </div>
    </a>
  )
}
