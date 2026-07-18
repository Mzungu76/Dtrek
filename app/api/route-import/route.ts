import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveGeometryFallback } from '@/lib/trailConditions/geometry'
import { enrichGeometryWithElevation } from '@/lib/dtm/elevationEnrich'
import { downloadAndParseGpx, findGpxLinkOnPage } from '@/lib/gpxSourceFetch'
import { isBlockedHost } from '@/lib/scrapeBlocklist'
import { resolveAreaBbox, searchHikingRoutesByName } from '@/lib/overpassTrails'
import { downsamplePolyline } from '@/lib/downsamplePolyline'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i
const OG_TITLE_RE = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i

// Pagina già scaricata da findGpxLinkOnPage per cercare il link .gpx — riusa lo stesso HTML per
// evitare un secondo fetch solo per il titolo, invece di richiamare la pagina una seconda volta.
function extractTitle(html: string): string | null {
  const og = OG_TITLE_RE.exec(html)
  if (og) return og[1].trim()
  const t = TITLE_RE.exec(html)
  return t ? t[1].trim() : null
}

async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null
    return await res.text()
  } catch {
    return null
  }
}

// Nessuna lettura/scrittura per-utente qui (solo Overpass, il DTM pubblico e la pagina incollata
// dall'utente) — stesso motivo per cui app/api/route-search/resolve/route.ts si accontenta di
// un'identità "plausibile ma non verificabile" durante un blackout invece di richiedere l'utente
// verificato o una chiave AI di emergenza.
export async function POST(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  let url: string
  try {
    const body = await req.json()
    if (typeof body.url !== 'string' || !body.url.trim()) throw new Error('url mancante')
    url = body.url.trim()
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocollo non valido')
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_url' })
  }

  if (isBlockedHost(url)) {
    return NextResponse.json({ ok: false, reason: 'blocked_host' })
  }

  // 1) Link diretto a un .gpx — scaricalo e basta, nessuna analisi della pagina necessaria.
  if (/\.gpx(?:[?#]|$)/i.test(url)) {
    const gpx = await downloadAndParseGpx(url)
    if (gpx) {
      return NextResponse.json({
        ok: true,
        source: 'gpx',
        title: gpx.title,
        routePolyline: downsamplePolyline(gpx.trackPoints),
        trackPoints: gpx.trackPoints,
        distanceMeters: gpx.distanceMeters,
        elevationGain: gpx.elevationGain,
        elevationLoss: gpx.elevationLoss,
        altitudeMax: gpx.altitudeMax,
        altitudeMin: gpx.altitudeMin,
        estimatedTimeSeconds: gpx.estimatedTimeSeconds,
        hasElevation: true,
      })
    }
    return NextResponse.json({ ok: false, reason: 'gpx_download_failed' })
  }

  // 2) Pagina normale — cerca un link .gpx pubblicato al suo interno (findGpxLinkOnPage, stessa
  // funzione già usata dalla ricerca AI) e, in parallelo, il titolo della pagina per il fallback
  // OSM sotto e come titolo precompilato per l'utente.
  const [gpxLink, html] = await Promise.all([findGpxLinkOnPage(url), fetchPageHtml(url)])
  const pageTitle = html ? extractTitle(html) : null

  if (gpxLink) {
    const gpx = await downloadAndParseGpx(gpxLink)
    if (gpx) {
      return NextResponse.json({
        ok: true,
        source: 'gpx',
        title: pageTitle ?? gpx.title,
        routePolyline: downsamplePolyline(gpx.trackPoints),
        trackPoints: gpx.trackPoints,
        distanceMeters: gpx.distanceMeters,
        elevationGain: gpx.elevationGain,
        elevationLoss: gpx.elevationLoss,
        altitudeMax: gpx.altitudeMax,
        altitudeMin: gpx.altitudeMin,
        estimatedTimeSeconds: gpx.estimatedTimeSeconds,
        hasElevation: true,
      })
    }
  }

  // 3) Nessun GPX diretto — prova a far corrispondere il titolo della pagina a un percorso reale
  // su OpenStreetMap, stesso fallback per nome già usato dalla ricerca AI (searchHikingRoutesByName).
  if (pageTitle) {
    try {
      const bbox = await resolveAreaBbox(pageTitle)
      const matches = await searchHikingRoutesByName(pageTitle, bbox, 3)
      const best = matches[0]
      if (best) {
        const fallback = await resolveGeometryFallback(best.id)
        if (fallback) {
          const enriched = await enrichGeometryWithElevation(fallback.geometry)
          if (enriched) {
            return NextResponse.json({
              ok: true,
              source: 'osm',
              title: pageTitle,
              osmId: best.id,
              routePolyline: downsamplePolyline(enriched.trackPoints),
              trackPoints: enriched.trackPoints,
              distanceMeters: enriched.distanceMeters,
              elevationGain: enriched.elevationGain,
              elevationLoss: enriched.elevationLoss,
              altitudeMax: enriched.altitudeMax,
              altitudeMin: enriched.altitudeMin,
              estimatedTimeSeconds: enriched.estimatedTimeSeconds,
              hasElevation: true,
            })
          }
          return NextResponse.json({
            ok: true,
            source: 'osm',
            title: pageTitle,
            osmId: best.id,
            routePolyline: downsamplePolyline(fallback.geometry.map(([lat, lon]) => ({ time: '', lat, lon }))),
            trackPoints: [],
            distanceMeters: 0,
            elevationGain: 0,
            elevationLoss: 0,
            altitudeMax: 0,
            altitudeMin: 0,
            estimatedTimeSeconds: 0,
            hasElevation: false,
          })
        }
      }
    } catch (e) {
      console.error('[api/route-import] fallback OSM per titolo pagina fallito:', e)
    }
  }

  return NextResponse.json({ ok: false, reason: 'not_found', title: pageTitle })
}
