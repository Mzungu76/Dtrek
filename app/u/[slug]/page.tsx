// Profilo pubblico di un utente — Fase 3 del piano di pubblicazione
// (docs/raccolte-pubblicazione-piano.md): non un quarto documento, l'INDICE di ciò che l'utente ha
// già reso pubblico ai tre livelli esistenti (Raccolta/Diario/Reportage). Stessa architettura
// server-only delle altre pagine pubbliche (app/leggi/d|c|p/[token]) — nessuno stato, nessun
// JavaScript spedito al browser.
//
// Fase 4 del piano Taccuino Botanico (docs/siti-pubblici-taccuino-piano.md): il profilo diventa lo
// "scaffale" — la stessa identità scura e immersiva di /diario in app (RouteHub), con il primo
// Diario pubblicato in copertina a piena pagina e gli altri sotto come dorsi. Apre sul Diario, che
// vive nella carta del taccuino (Fase 2) — le due palette restano volutamente diverse, come per la
// mensola e il libro in app: è il costo già accettato della direzione scelta, non un difetto di
// questa pagina. `fetchPublicProfile` non espone km/dislivello/conteggio per Diario (solo
// titolo/sottotitolo/copertina): recuperarli per ognuno richiederebbe una query aggregata nuova,
// fuori dal perimetro sintetico di questa fase — le tessere secondarie mostrano quindi solo il
// titolo, non le statistiche del mockup.
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Library, BookOpen, ChevronRight, ChevronDown } from 'lucide-react'
import { fetchPublicProfile, type PublicProfileDiary } from '@/lib/publicProfile'
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

/** Sfondo topografico + sagoma di montagne della copertina — stesso stile di
 *  components/diario/DiarioCover.tsx e della copertina del sito pubblico del Diario
 *  (app/leggi/d/[token]/DiaryPublicView.tsx), qui riprodotto per la copertina del profilo. */
function CoverBackdrop() {
  return (
    <>
      <svg className="absolute inset-0 w-full h-full opacity-[0.045]" viewBox="0 0 600 500" preserveAspectRatio="xMidYMid slice">
        <path d="M0,400 Q150,360 300,375 Q450,390 600,340" fill="white" opacity="0.6" />
        <path d="M0,340 Q135,300 270,315 Q435,330 600,285" stroke="white" strokeWidth="0.8" fill="none" />
        <path d="M0,280 Q150,250 300,262 Q450,274 600,235" stroke="white" strokeWidth="0.7" fill="none" />
      </svg>
      <svg className="absolute bottom-0 left-0 w-full opacity-[0.09]" viewBox="0 0 600 220" preserveAspectRatio="none">
        <path d="M0,220 L52,145 L98,175 L169,85 L231,120 L291,40 L340,85 L391,48 L450,88 L499,55 L551,80 L600,60 L600,220 Z" fill="white" />
      </svg>
      <div className="absolute top-10 right-4 font-display text-[150px] font-bold leading-none text-white/[0.025] select-none">II</div>
    </>
  )
}

export default async function PublicProfilePage({ params }: { params: { slug: string } }) {
  const profile = await getProfile(params.slug)
  if (!profile) notFound()

  const isEmpty = profile.collections.length === 0 && profile.diaries.length === 0 && profile.reports.length === 0
  const [featured, ...others] = profile.diaries

  return (
    <div className="min-h-screen bg-[#0b1a24]">
      {/* Transizione cross-documento del browser (progressive enhancement, nessun JS): dove
          supportata, aprire un Diario da qui lo mostra "aprirsi" invece di un cambio secco di
          pagina. Dove non è supportata (la maggior parte dei browser oggi), la navigazione resta
          quella normale — questa regola non ha altro effetto. */}
      <style>{'@view-transition { navigation: auto; }'}</style>

      {isEmpty ? (
        <EmptyProfile displayName={profile.displayName} />
      ) : (
        <FeaturedCover diary={featured} displayName={profile.displayName} />
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 space-y-6">
        {others.length > 0 && (
          <section className="space-y-3">
            <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-white/40 px-1">Altri diari</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {others.map(d => <ShelfTile key={d.token} diary={d} />)}
            </div>
          </section>
        )}

        {profile.collections.length > 0 && (
          <section className="space-y-3">
            <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-white/40 px-1">Raccolte</p>
            <div className="flex flex-col gap-2.5">
              {profile.collections.map(c => (
                <a key={c.token} href={`/leggi/c/${c.token}`}
                  className="group flex items-center gap-3.5 rounded-2xl border border-white/12 bg-white/5 hover:bg-white/10 transition p-3.5">
                  <div className="w-11 h-11 rounded-xl shrink-0 overflow-hidden relative bg-white/5 flex items-center justify-center">
                    {c.coverUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      : <Library className="w-5 h-5 text-white/30" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-sm text-white truncate">{c.title}</p>
                    {c.subtitle && <p className="font-lora italic text-xs text-white/50 truncate">{c.subtitle}</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition shrink-0" />
                </a>
              ))}
            </div>
          </section>
        )}

        {profile.reports.length > 0 && (
          <p className="text-center text-xs text-white/35">
            <BookOpen className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            + {profile.reports.length} reportage pubblicat{profile.reports.length === 1 ? 'o' : 'i'} singolarmente —{' '}
            {profile.reports.map((r, i) => (
              <span key={r.token}>
                <a href={`/leggi/p/${r.token}`} className="underline hover:text-white/60 transition">{r.title}</a>
                {i < profile.reports.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        )}

        <p className="text-center text-[11px] text-white/25 pb-6">
          Pubblicato con <a href={DTREK_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-white/40 hover:text-white/60 transition">DTrek</a>
        </p>
      </div>
    </div>
  )
}

function EmptyProfile({ displayName }: { displayName: string }) {
  return (
    <header className="px-4 sm:px-5 py-10 max-w-3xl mx-auto">
      <p className="font-barlow font-bold text-[11px] tracking-[0.25em] uppercase text-white/40 mb-2">Profilo pubblico</p>
      <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight text-white mb-6">{displayName}</h1>
      <p className="text-sm text-white/40 font-lora italic">Nessuna pubblicazione ancora.</p>
    </header>
  )
}

/** Copertina a piena pagina del primo Diario pubblicato — la stessa identità della testata di
 *  /diario in app (RouteHub, sfondo #0b1a24), qui a schermo intero come punto d'ingresso pubblico. */
function FeaturedCover({ diary, displayName }: { diary: PublicProfileDiary; displayName: string }) {
  return (
    <a href={`/leggi/d/${diary.token}`}
      className="group relative block overflow-hidden"
      style={{ viewTransitionName: 'diario-cover' }}
    >
      <div className="relative h-[70vh] min-h-[420px] max-h-[600px]"
        style={{ background: diary.coverUrl ? undefined : 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }}>
        {diary.coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={diary.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,26,36,0) 0%, rgba(11,26,36,.15) 55%, rgba(11,26,36,.95) 100%)' }} />
          </>
        ) : (
          <>
            <CoverBackdrop />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,26,36,0) 0%, rgba(11,26,36,.15) 55%, rgba(11,26,36,.95) 100%)' }} />
          </>
        )}

        <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#e08d3c]" />
        <div className="absolute top-4 left-4 right-4 sm:top-5 sm:left-5 sm:right-5 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="text-[#e08d3c] text-sm leading-none">▲</span>
            <span className="font-barlow font-bold text-[11px] tracking-[0.25em] uppercase text-white/60">DTrek</span>
          </span>
          <span className="text-xs font-semibold bg-[#e08d3c] hover:bg-[#e9ab64] transition rounded-full px-3.5 py-1.5 text-[#193b20]">
            Prova DTrek
          </span>
        </div>

        <div className="absolute left-4 right-8 sm:left-6 sm:right-14 bottom-24 sm:bottom-28">
          <p className="font-barlow font-bold text-[11px] tracking-[0.25em] uppercase text-[#e9ab64] mb-2">
            Profilo pubblico di {displayName}
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-bold leading-tight text-white">{diary.title}</h1>
          {diary.subtitle && <p className="mt-2 font-lora italic text-white/60 text-lg">{diary.subtitle}</p>}
        </div>

        <div className="absolute left-0 right-0 bottom-6 flex flex-col items-center gap-1 text-white/50 group-hover:text-white/75 transition">
          <ChevronDown className="w-4 h-4" />
          <span className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase">Apri il taccuino</span>
        </div>
      </div>
    </a>
  )
}

function ShelfTile({ diary }: { diary: PublicProfileDiary }) {
  return (
    <a href={`/leggi/d/${diary.token}`}
      className="group relative block rounded-xl overflow-hidden aspect-[4/3]"
      style={{ background: diary.coverUrl ? undefined : 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }}>
      {diary.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={diary.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.6) 100%)' }} />
      <div className="absolute left-2.5 right-2.5 bottom-2 sm:left-3 sm:right-3 sm:bottom-2.5">
        <p className="font-display text-sm sm:text-base font-bold text-white leading-tight line-clamp-2 group-hover:text-[#e9ab64] transition">
          {diary.title}
        </p>
      </div>
    </a>
  )
}
