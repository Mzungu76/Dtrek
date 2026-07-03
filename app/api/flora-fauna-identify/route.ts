// Flora/fauna photo recognition — proxies a photo taken in the field to iNaturalist's
// Computer Vision API (score_image). Online-only by nature (a real classifier call), so the
// client only shows this option when connectivity is available.
//
// KNOWN LIMITATION: iNaturalist's /v1/computervision/score_image endpoint is documented as
// requiring an authenticated user OAuth token, unlike the plain observation-search endpoints
// lib/inatShared.ts already uses anonymously elsewhere in this app. This app has no
// iNaturalist OAuth integration, so this call is attempted anonymously (no Authorization
// header) and may return 401/403 depending on iNaturalist's current enforcement — if that
// happens this degrades to a clear "servizio non disponibile" error rather than crashing.
// Wiring up a real OAuth flow (or an API key from a partner arrangement) is a follow-up, not
// something to fake here.
import { NextRequest, NextResponse } from 'next/server'
import { INAT_BASE, INAT_USER_AGENT } from '@/lib/inatShared'
import type { SpeciesIdentification } from '@/lib/inatIdentify'

export const dynamic = 'force-dynamic'

interface InatVisionTaxon {
  name?: string
  preferred_common_name?: string
  iconic_taxon_name?: string
}

interface InatVisionResult {
  taxon?: InatVisionTaxon
  combined_score?: number
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/data:(.*?);base64/)?.[1] ?? 'image/jpeg'
  const binary = Buffer.from(b64, 'base64')
  return { blob: new Blob([binary], { type: mime }), ext: mime.includes('png') ? 'png' : 'jpg' }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { imageDataUrl?: string; lat?: number; lon?: number }
    if (!body.imageDataUrl) return NextResponse.json({ error: 'imageDataUrl richiesto' }, { status: 400 })

    const { blob, ext } = dataUrlToBlob(body.imageDataUrl)
    const form = new FormData()
    form.append('image', blob, `photo.${ext}`)
    if (body.lat != null) form.append('lat', String(body.lat))
    if (body.lon != null) form.append('lng', String(body.lon))
    form.append('observed_on', new Date().toISOString().slice(0, 10))

    const res = await fetch(`${INAT_BASE}/computervision/score_image`, {
      method: 'POST',
      headers: { 'User-Agent': INAT_USER_AGENT },
      body: form,
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: 'servizio_non_disponibile', status: res.status },
        { status: 502 },
      )
    }

    const data = await res.json() as { results?: InatVisionResult[] }
    const results: SpeciesIdentification[] = (data.results ?? [])
      .filter((r) => r.taxon?.name)
      .slice(0, 5)
      .map((r) => ({
        scientificName: r.taxon!.name!,
        commonName: r.taxon!.preferred_common_name ?? null,
        iconicTaxon: r.taxon!.iconic_taxon_name ?? null,
        score: r.combined_score ?? 0,
      }))

    return NextResponse.json({ results })
  } catch (e) {
    console.error('POST /api/flora-fauna-identify:', e)
    return NextResponse.json({ error: 'servizio_non_disponibile' }, { status: 502 })
  }
}
