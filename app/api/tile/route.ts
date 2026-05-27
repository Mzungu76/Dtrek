export const dynamic = 'force-dynamic'

const PROVIDERS: Record<string, string> = {
  // CartoDB Dark Matter — free, no key, great aesthetics for fitness sharing
  dark:  'https://a.basemaps.cartocdn.com/dark_all',
  // OSM standard — fallback
  light: 'https://tile.openstreetmap.org',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const z     = searchParams.get('z')
  const x     = searchParams.get('x')
  const y     = searchParams.get('y')
  const style = searchParams.get('style') ?? 'dark'

  if (!z || !x || !y) return new Response('Missing z/x/y', { status: 400 })
  const zoom = parseInt(z)
  if (isNaN(zoom) || zoom < 0 || zoom > 19) return new Response('Invalid zoom', { status: 400 })

  const base = PROVIDERS[style] ?? PROVIDERS.dark
  const url  = `${base}/${z}/${x}/${y}.png`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DTrek/1.0 (personal trekking diary)',
        'Accept':     'image/png',
        'Referer':    'https://www.openstreetmap.org/',
      },
      next: { revalidate: 86400 },
    })
    if (!res.ok) return new Response('Tile not found', { status: 404 })
    const buf = await res.arrayBuffer()
    return new Response(buf, {
      headers: {
        'Content-Type':                'image/png',
        'Cache-Control':               'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return new Response('Failed to fetch tile', { status: 502 })
  }
}
