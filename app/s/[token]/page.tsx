import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { fetchPublicActivity, routeToSvgPath, profileToSvgPath } from '@/lib/sharePublic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Dedupe the DB read between generateMetadata and the page render
const getActivity = cache(fetchPublicActivity)

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
  return h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}min`
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const a = await getActivity(params.token)
  if (!a) return { title: 'Escursione non trovata · DTrek' }

  const km   = (a.distanceMeters / 1000).toFixed(1)
  const desc = `${km} km · ${Math.round(a.elevationGain)} m D+ · ${fmtDur(a.totalTimeSeconds)}${a.trailScore !== undefined ? ` · TrailScore ${Math.round(a.trailScore)}` : ''}`
  const title = `${a.title} · DTrek`

  return {
    metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
    title,
    description: desc,
    openGraph: { title: a.title, description: desc, type: 'article' },
    twitter:    { card: 'summary_large_image', title: a.title, description: desc },
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 px-4 py-3.5 text-center shadow-sm">
      <div className="text-xl font-bold text-stone-800 leading-tight">{value}</div>
      <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}

export default async function PublicSharePage({ params }: { params: { token: string } }) {
  const a = await getActivity(params.token)
  if (!a) notFound()

  const routePath = routeToSvgPath(a.routePolyline, 100, 8)
  const prof = profileToSvgPath(a.elevationProfile, 600, 140)
  const dateStr = a.startTime ? format(new Date(a.startTime), 'd MMMM yyyy', { locale: it }) : ''

  const stats: { value: string; label: string }[] = [
    { value: `${(a.distanceMeters / 1000).toFixed(1)} km`, label: 'Distanza' },
    { value: `${Math.round(a.elevationGain)} m`,           label: 'Dislivello +' },
    { value: fmtDur(a.totalTimeSeconds),                   label: 'Durata' },
    { value: `${Math.round(a.altitudeMax)} m`,             label: 'Quota max' },
  ]
  if (a.calories > 0)     stats.push({ value: `${a.calories} kcal`, label: 'Calorie' })
  if (a.avgHeartRate > 0) stats.push({ value: `${Math.round(a.avgHeartRate)} bpm`, label: 'FC media' })

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Top bar */}
      <header className="bg-gradient-to-br from-sky-800 to-sky-900 text-white">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <span className="text-sky-300">▲</span> DTrek
          </div>
          <a href="/" className="text-xs font-semibold bg-white/15 hover:bg-white/25 transition rounded-full px-4 py-1.5">
            Apri l&apos;app
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        {/* Hero */}
        <section className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="relative bg-gradient-to-br from-sky-50 to-stone-100 p-6 flex items-center gap-5">
            {routePath && (
              <div className="w-32 h-32 sm:w-40 sm:h-40 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <path d={routePath} fill="none" stroke="#0284c7" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-stone-800 leading-tight">{a.title}</h1>
              <p className="text-sm text-stone-500 mt-1">
                {a.ownerName ? `di ${a.ownerName}` : 'Escursione'}{dateStr ? ` · ${dateStr}` : ''}
              </p>
              {a.trailScore !== undefined && (
                <div className="inline-flex items-center gap-2 mt-3 rounded-full pl-1 pr-3 py-1" style={{ backgroundColor: (a.trailColor ?? '#16a34a') + '18' }}>
                  <span className="flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold" style={{ backgroundColor: a.trailColor ?? '#16a34a' }}>
                    {Math.round(a.trailScore)}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: a.trailColor ?? '#16a34a' }}>
                    TrailScore · {a.trailLabel}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.map(s => <Stat key={s.label} {...s} />)}
        </section>

        {/* Elevation profile */}
        {prof.area && (
          <section className="bg-white rounded-3xl border border-stone-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Altimetria</h2>
            <svg viewBox="0 0 600 140" className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
              <defs>
                <linearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.03" />
                </linearGradient>
              </defs>
              <path d={prof.area} fill="url(#elev)" />
              <path d={prof.line} fill="none" stroke="#0284c7" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
          </section>
        )}

        {/* CTA */}
        <section className="bg-gradient-to-br from-sky-700 to-sky-900 rounded-3xl p-7 text-center text-white">
          <p className="text-lg font-bold">Traccia le tue escursioni con DTrek</p>
          <p className="text-sm text-sky-200 mt-1.5 max-w-md mx-auto">
            Mappe 3D, profili altimetrici, TrailScore e condivisione epica delle tue avventure.
          </p>
          <a href="/" className="inline-block mt-4 bg-white text-sky-800 font-semibold text-sm rounded-full px-6 py-2.5 hover:bg-sky-50 transition">
            Scopri DTrek
          </a>
        </section>

        <p className="text-center text-[11px] text-stone-400 pb-4">
          Condiviso tramite DTrek · Mappa © OpenStreetMap contributors
        </p>
      </main>
    </div>
  )
}
