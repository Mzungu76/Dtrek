// Profilo pubblico di un utente — Fase 3 del piano di pubblicazione
// (docs/raccolte-pubblicazione-piano.md): non un quarto documento, l'INDICE di ciò che l'utente ha
// già reso pubblico ai tre livelli esistenti (Raccolta/Diario/Reportage). Stessa architettura
// server-only delle altre pagine pubbliche (app/leggi/d|c|p/[token]) — nessuno stato, nessun
// JavaScript spedito al browser.
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Library, BookMarked, BookOpen, ChevronRight } from 'lucide-react'
import { fetchPublicProfile } from '@/lib/publicProfile'
import { DtrekCallout, SiteFooter } from '@/app/leggi/d/[token]/SiteChrome'
import { DTREK_URL } from '@/lib/publicSite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getProfile = cache(fetchPublicProfile)

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const profile = await getProfile(params.slug)
  if (!profile) return { title: 'Profilo non trovato · DTrek' }

  const total = profile.collections.length + profile.diaries.length + profile.reports.length
  return {
    title: `${profile.displayName} · DTrek`,
    description: `${total} pubblicazion${total === 1 ? 'e' : 'i'} di ${profile.displayName} su DTrek`,
  }
}

export default async function PublicProfilePage({ params }: { params: { slug: string } }) {
  const profile = await getProfile(params.slug)
  if (!profile) notFound()

  const isEmpty = profile.collections.length === 0 && profile.diaries.length === 0 && profile.reports.length === 0

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-30 bg-forest-900/95 backdrop-blur text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-5">
          <div className="flex items-center justify-between h-14">
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="text-forest-300 text-lg leading-none">▲</span>
              <span className="font-display font-bold text-base truncate">DTrek</span>
            </span>
            <a href={DTREK_URL} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold bg-terra-500 hover:bg-terra-400 transition rounded-full px-3.5 py-1.5 shrink-0">
              Prova DTrek
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-6">
        <section className="rounded-3xl overflow-hidden shadow-sm border border-stone-200 p-8 sm:p-10 text-white"
          style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }}>
          <p className="font-barlow font-bold text-[11px] tracking-[0.25em] uppercase text-terra-300 mb-2">
            Profilo pubblico
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight">{profile.displayName}</h1>
        </section>

        {isEmpty && (
          <p className="text-sm text-stone-400 text-center py-10 font-lora italic">
            Nessuna pubblicazione ancora.
          </p>
        )}

        {profile.collections.length > 0 && (
          <ProfileSection icon={Library} title="Raccolte">
            {profile.collections.map(c => (
              <ProfileCard key={c.token} href={`/leggi/c/${c.token}`} coverUrl={c.coverUrl}
                title={c.title} subtitle={c.subtitle} />
            ))}
          </ProfileSection>
        )}

        {profile.diaries.length > 0 && (
          <ProfileSection icon={BookMarked} title="Diari">
            {profile.diaries.map(d => (
              <ProfileCard key={d.token} href={`/leggi/d/${d.token}`} coverUrl={d.coverUrl}
                title={d.title} subtitle={d.subtitle} />
            ))}
          </ProfileSection>
        )}

        {profile.reports.length > 0 && (
          <ProfileSection icon={BookOpen} title="Reportage">
            {profile.reports.map(r => (
              <ProfileCard key={r.token} href={`/leggi/p/${r.token}`} coverUrl={null}
                title={r.title} subtitle="" />
            ))}
          </ProfileSection>
        )}

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}

function ProfileSection({ icon: Icon, title, children }: { icon: typeof Library; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold text-forest-900 px-1">
        <Icon className="w-5 h-5 text-forest-600" /> {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function ProfileCard({ href, coverUrl, title, subtitle }: { href: string; coverUrl: string | null; title: string; subtitle: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="group bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden hover:shadow-md hover:border-stone-300 transition flex items-stretch">
      {coverUrl && (
        <div className="w-16 sm:w-20 shrink-0 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0 p-4 flex flex-col justify-center">
        <h3 className="font-display text-base font-bold text-forest-900 leading-tight group-hover:text-forest-700 transition truncate">
          {title}
        </h3>
        {subtitle && <p className="font-lora italic text-xs text-stone-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center pr-4 text-stone-300 group-hover:text-forest-500 transition">
        <ChevronRight className="w-5 h-5" />
      </div>
    </a>
  )
}
