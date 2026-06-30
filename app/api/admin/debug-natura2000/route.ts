/** Diagnostica temporanea — vedi commit history per dettagli. Da rimuovere a fix completato. */
import { NATURA2000_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetFeatureGml, wfsGetCapabilities } from '@/lib/geo/wfsClient'
import { fetchNatura2000Polygons } from '@/lib/natura2000/natura2000Client'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const provided = searchParams.get('secret') ?? ''
  if (!anonKey || provided !== anonKey.slice(0, 32)) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (searchParams.get('caps') === 'true') {
    try {
      const xml = await wfsGetCapabilities(NATURA2000_DATASET.baseUrl!, '1.1.0', 8000)
      const idx = xml.search(/BoundingBox|FeatureTypeList/i)
      return Response.json({
        caps_length: xml.length,
        caps_full: xml,
        caps_around_bbox: idx >= 0 ? xml.slice(Math.max(0, idx - 100), idx + 1500) : null,
      })
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 })
    }
  }

  const bbox = searchParams.get('bbox') ?? '42.30,12.10,42.45,12.30'

  try {
    const xml = await wfsGetFeatureGml({
      baseUrl: NATURA2000_DATASET.baseUrl!,
      typeName: NATURA2000_DATASET.typeName!,
      bbox,
      version: '1.1.0',
      timeoutMs: 8000,
    })

    const parsed = await fetchNatura2000Polygons(bbox)

    return Response.json({
      bbox,
      raw_length: xml.length,
      raw_preview: xml.slice(0, 6000),
      parsed_feature_count: parsed.length,
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
