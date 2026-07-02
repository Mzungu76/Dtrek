export const dynamic = 'force-dynamic'

const PROVIDERS: Record<string, string> = {
  // CartoDB Voyager — mid-tone, shows terrain, great contrast for route lines
  voyager: 'https://a.basemaps.cartocdn.com/rastertiles/voyager',
  // CartoDB Dark Matter — free, no key
  dark:    'https://a.basemaps.cartocdn.com/dark_all',
  // OSM standard — fallback
  light:   'https://tile.openstreetmap.org',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const zRaw  = searchParams.get('z')
  const xRaw  = searchParams.get('x')
  const yRaw  = searchParams.get('y')
  const style = searchParams.get('style') ?? 'voyager'

  if (!zRaw || !xRaw || !yRaw) return new Response('Missing z/x/y', { status: 400 })
  const zoom = Number(zRaw), x = Number(xRaw), y = Number(yRaw)
  // Strict integer + range checks — z/x/y are interpolated straight into the
  // upstream URL below, so anything that isn't a clean tile coordinate
  // (e.g. a value carrying "../" or extra path segments) must be rejected
  // here rather than trusted, even though the upstream host is a fixed
  // allowlist (PROVIDERS).
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 19) return new Response('Invalid zoom', { status: 400 })
  const maxTileIndex = 2 ** zoom - 1
  if (!Number.isInteger(x) || x < 0 || x > maxTileIndex) return new Response('Invalid x', { status: 400 })
  if (!Number.isInteger(y) || y < 0 || y > maxTileIndex) return new Response('Invalid y', { status: 400 })

  const base = PROVIDERS[style] ?? PROVIDERS.voyager
  const url  = `${base}/${zoom}/${x}/${y}.png`

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
