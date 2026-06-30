/**
 * Diagnostica temporanea: chiama direttamente il WFS Natura2000 (bypassando cache/parser)
 * e restituisce status HTTP + i primi caratteri della risposta grezza, per verificare se il
 * parser GML in lib/natura2000/natura2000Client.ts (mai testato contro una risposta reale,
 * vedi commento in lib/geo/datasetConfig.ts) corrisponde alla struttura effettiva.
 *
 * Da rimuovere una volta diagnosticato il problema "Galleria Animali senza risultati".
 */
import { NATURA2000_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetFeatureGml } from '@/lib/geo/wfsClient'
import { fetchNatura2000Polygons } from '@/lib/natura2000/natura2000Client'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const provided = searchParams.get('secret') ?? ''
  if (!anonKey || provided !== anonKey.slice(0, 32)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const bbox = searchParams.get('bbox') ?? '42.30,12.10,42.45,12.30' // s,w,n,e — Monti Cimini/Lago di Vico

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
      raw_preview: xml.slice(0, 3000),
      parsed_feature_count: parsed.length,
      parsed_sample: parsed.slice(0, 2),
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
