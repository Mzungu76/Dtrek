import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { fetchPublicReport, profileToSvgPath } from '@/lib/sharePublic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getReport = cache(fetchPublicReport)

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
  return h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}min`
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const r = await getReport(params.token)
  if (!r) return { title: 'Resoconto non trovato · DTrek' }

  const km   = (r.activity.distanceMeters / 1000).toFixed(1)
  const desc = `${km} km · ${Math.round(r.activity.elevationGain)} m D+ · ${fmtDur(r.activity.totalTimeSeconds)}`

  return {
    metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
    title:       `${r.title} · DTrek`,
    description: desc,
    openGraph:   { title: r.title, description: desc, type: 'article' },
    twitter:     { card: 'summary_large_image', title: r.title, description: desc },
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
  const alts = trackPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
  const step  = Math.max(1, Math.ceil(alts.length / 120))
  const sampled = alts.filter((_, i) => i % step === 0)
  if (sampled.length < 4) return null

  const { area, line } = profileToSvgPath(sampled, 600, 140)
  const min = Math.min(...sampled), max = Math.max(...sampled)

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-6">
      <h3 className="font-barlow font-bold uppercase tracking-[2px] text-xs text-stone-400 mb-3">
        Profilo altimetrico
      </h3>
      <svg viewBox="0 0 600 140" className="w-full" style={{ height: 80 }}>
        <defs>
          <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#40916c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#40916c" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#rg)" />
        <path d={line} fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between mt-1 px-0.5">
        <span className="text-[9px] text-stone-400 font-mono">↑ {Math.round(min)} m</span>
        <span className="text-[9px] text-stone-400 font-mono">{Math.round(max)} m ↑</span>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const SECTION_COLORS = ['#2d6a4f', '#40916c', '#74c69d', '#b7e4c7', '#d8f3dc']

export default async function PublicReportPage({ params }: { params: { token: string } }) {
  const r = await getReport(params.token)
  if (!r) notFound()

  const sections = parseSections(r.content)
  const dateStr  = r.activity.startTime
    ? format(new Date(r.activity.startTime), 'd MMMM yyyy', { locale: it })
    : ''

  return (
    <div className="min-h-screen bg-stone-50">

      {/* Hero */}
      <div className="bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700 relative overflow-hidden"
        style={{ minHeight: 260 }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="relative max-w-3xl mx-auto px-6 py-12 pb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="font-barlow text-[10px] font-bold uppercase tracking-[3px] text-white/50">
              DTrek · Resoconto
            </span>
            {r.ownerName && (
              <span className="text-white/40 text-[10px]">· {r.ownerName}</span>
            )}
          </div>
          <h1 className="font-barlow text-4xl sm:text-5xl font-black text-white uppercase tracking-tight leading-tight mb-3">
            {r.title}
          </h1>
          {dateStr && (
            <p className="font-lora text-sm italic text-white/70 mb-4">{dateStr}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {[
              { v: `${(r.activity.distanceMeters / 1000).toFixed(1)} km`, l: 'Distanza' },
              { v: `${Math.round(r.activity.elevationGain)} m D+`,        l: 'Dislivello' },
              { v: fmtDur(r.activity.totalTimeSeconds),                   l: 'Durata' },
            ].map(({ v, l }) => (
              <span key={l}
                className="flex flex-col items-center px-3 py-1.5 rounded-xl bg-white/15 border border-white/20 text-white font-barlow text-xs font-bold tracking-wide">
                <span className="text-base leading-tight">{v}</span>
                <span className="text-[9px] text-white/60 uppercase tracking-widest">{l}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* Sections */}
        {sections.map((section, i) => (
          <article key={i}
            className="bg-white rounded-2xl shadow-sm overflow-hidden mb-5">
            <div className="px-6 py-3 flex items-center gap-3" style={{ backgroundColor: SECTION_COLORS[i % SECTION_COLORS.length] }}>
              <span className="font-barlow text-[11px] font-bold tracking-[2px] uppercase text-white/70">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h2 className="font-barlow text-lg font-bold tracking-wide uppercase text-white leading-tight">
                {section.title}
              </h2>
            </div>
            <div className="p-6">
              <RenderBody text={section.body} />
            </div>
          </article>
        ))}

        {/* Elevation profile */}
        {r.activity.trackPoints.length > 4 && (
          <ElevationProfile trackPoints={r.activity.trackPoints} />
        )}

        {/* Photos note */}
        <div className="bg-stone-100 rounded-2xl px-5 py-4 mb-6 text-center">
          <p className="font-lora text-sm italic text-stone-500">
            Le fotografie del percorso sono visibili solo nella versione personale del proprietario.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center py-8">
          <p className="font-barlow text-xs text-stone-400 uppercase tracking-widest mb-2">Creato con</p>
          <a href="/" className="font-barlow text-2xl font-black text-forest-700 hover:text-forest-600 transition-colors">
            DTrek
          </a>
          <p className="font-lora text-sm italic text-stone-400 mt-1">
            Il tuo diario escursionistico digitale
          </p>
        </div>

      </main>
    </div>
  )
}
