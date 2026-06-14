import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { fetchPublicDiary, profileToSvgPath } from '@/lib/sharePublic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getDiary = cache(fetchPublicDiary)

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
  return h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}min`
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const d = await getDiary(params.token)
  if (!d) return { title: 'Diario non trovato · DTrek' }

  const title = `Il diario di ${d.ownerName} · DTrek`
  const desc  = `${d.reports.length} escursion${d.reports.length === 1 ? 'e' : 'i'} · Diario escursionistico`

  return {
    metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
    title,
    description: desc,
    openGraph: { title, description: desc, type: 'profile' },
    twitter:   { card: 'summary_large_image', title, description: desc },
  }
}

// ── Section types ──────────────────────────────────────────────────────────────

interface Section { title: string; body: string }

function parseSections(md: string): Section[] {
  return md.split(/\n(?=## )/)
    .map(part => {
      const nl = part.indexOf('\n')
      if (!part.startsWith('## ') || nl === -1) return null
      return { title: part.slice(3, nl).trim(), body: part.slice(nl + 1).trim() }
    })
    .filter((s): s is Section => s !== null)
}

function RenderBody({ text }: { text: string }) {
  const parts = text.split(/(\[curiosita\][\s\S]*?\[\/curiosita\])/g)
  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        const m = part.match(/^\[curiosita\]([\s\S]*?)\[\/curiosita\]$/)
        if (m) {
          return (
            <blockquote key={i}
              className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 rounded-r-xl font-lora text-sm italic text-stone-700 leading-relaxed">
              {m[1].trim()}
            </blockquote>
          )
        }
        return part.trim()
          ? <div key={i} className="space-y-2.5">
              {part.trim().split(/\n\n+/).map((p, j) => (
                <p key={j} className="font-lora text-[15px] leading-[1.8] text-stone-700">{p.trim()}</p>
              ))}
            </div>
          : null
      })}
    </div>
  )
}

// ── Elevation profile SVG ──────────────────────────────────────────────────────

function ElevationProfile({ trackPoints }: { trackPoints: { altitudeMeters?: number }[] }) {
  const alts    = trackPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
  const step    = Math.max(1, Math.ceil(alts.length / 120))
  const sampled = alts.filter((_, i) => i % step === 0)
  if (sampled.length < 4) return null

  const { area, line } = profileToSvgPath(sampled, 600, 140)
  const min = Math.min(...sampled), max = Math.max(...sampled)

  return (
    <div className="mt-4">
      <svg viewBox="0 0 600 140" className="w-full" style={{ height: 64 }}>
        <defs>
          <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#40916c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#40916c" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#dg)" />
        <path d={line} fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between px-0.5 mt-0.5">
        <span className="text-[9px] text-stone-400 font-mono">↑ {Math.round(min)} m</span>
        <span className="text-[9px] text-stone-400 font-mono">{Math.round(max)} m ↑</span>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const SECTION_COLORS = ['#2d6a4f', '#40916c', '#74c69d', '#b7e4c7', '#d8f3dc']

export default async function PublicDiaryPage({ params }: { params: { token: string } }) {
  const diary = await getDiary(params.token)
  if (!diary) notFound()

  return (
    <div className="min-h-screen bg-stone-50">

      {/* Header */}
      <header className="bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700 px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <p className="font-barlow text-[10px] font-bold uppercase tracking-[3px] text-white/50 mb-2">
            DTrek · Diario escursionistico
          </p>
          <h1 className="font-barlow text-4xl sm:text-5xl font-black text-white uppercase tracking-tight leading-tight">
            {diary.ownerName}
          </h1>
          <p className="font-lora text-sm italic text-white/60 mt-2">
            {diary.reports.length} escursion{diary.reports.length === 1 ? 'e' : 'i'}
          </p>
        </div>
      </header>

      {/* Articles */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        {diary.reports.map(rep => {
          const sections = parseSections(rep.content)
          const dateStr  = rep.activity.startTime
            ? format(new Date(rep.activity.startTime), 'd MMMM yyyy', { locale: it })
            : rep.createdAt ? format(new Date(rep.createdAt), 'd MMMM yyyy', { locale: it }) : ''

          return (
            <article key={rep.id}
              className="print:break-before-page">

              {/* Article header */}
              <div className="mb-5">
                {dateStr && (
                  <p className="font-barlow text-xs font-bold uppercase tracking-[3px] text-stone-400 mb-2">
                    {dateStr}
                  </p>
                )}
                <h2 className="font-barlow text-3xl sm:text-4xl font-black uppercase tracking-tight text-stone-800 leading-tight mb-3">
                  {rep.title}
                </h2>
                <div className="flex flex-wrap gap-3">
                  {rep.activity.distanceMeters > 0 && (
                    <span className="font-barlow text-sm text-stone-500">
                      ▸ {(rep.activity.distanceMeters / 1000).toFixed(1)} km
                    </span>
                  )}
                  {rep.activity.elevationGain > 0 && (
                    <span className="font-barlow text-sm text-stone-500">
                      · {Math.round(rep.activity.elevationGain)} m D+
                    </span>
                  )}
                  {rep.activity.totalTimeSeconds > 0 && (
                    <span className="font-barlow text-sm text-stone-500">
                      · {fmtDur(rep.activity.totalTimeSeconds)}
                    </span>
                  )}
                </div>
              </div>

              {/* Sections */}
              {sections.map((section, i) => (
                <section key={i} className="mb-6">
                  <h3 className="font-barlow font-bold uppercase tracking-[2px] text-sm mb-3"
                    style={{ color: SECTION_COLORS[i % SECTION_COLORS.length] }}>
                    {section.title}
                  </h3>
                  <RenderBody text={section.body} />
                </section>
              ))}

              {/* Elevation profile */}
              {rep.activity.trackPoints.length > 4 && (
                <ElevationProfile trackPoints={rep.activity.trackPoints} />
              )}

              <hr className="mt-8 border-stone-200" />
            </article>
          )
        })}

        {/* Footer */}
        <div className="text-center py-8">
          <p className="font-lora text-sm italic text-stone-400 mb-1">
            Le fotografie sono visibili solo nella versione personale del proprietario.
          </p>
          <p className="font-barlow text-xs text-stone-400 uppercase tracking-widest mt-4 mb-1">Creato con</p>
          <a href="/" className="font-barlow text-2xl font-black text-forest-700 hover:text-forest-600 transition-colors">
            DTrek
          </a>
          <p className="font-lora text-sm italic text-stone-400 mt-1">
            Crea il tuo diario escursionistico digitale
          </p>
        </div>
      </main>
    </div>
  )
}
