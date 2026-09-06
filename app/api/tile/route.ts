export const dynamic = 'force-dynamic'

const PROVIDERS: Record<string, string> = {
  // CartoDB Voyager — mid-tone, shows terrain, great contrast for route lines
  voyager: 'https://a.basemaps.cartocdn.com/rastertiles/voyager',
  // CartoDB Dark Matter
  dark:    'https://a.basemaps.cartocdn.com/dark_all',
  // CartoDB Positron — chiarissima e quasi senza colore: tutto ciò che si posa sopra (tracciato,
  // pallini di foto e stacchi) resta l'unica cosa satura della vista. È il fondo dell'editor.
  positron: 'https://a.basemaps.cartocdn.com/light_all',
  // OSM standard — fallback
  light:   'https://tile.openstreetmap.org',
  // OpenTopoMap — cartografia escursionistica reale (curve di livello, boschi in verde
  // desaturato, sentieri, niente POI commerciali) invece di uno stile "app di navigazione"
  // ricolorato via CSS: la miniatura del Sommario del taccuino (Fase 30) la usa per sembrare un
  // reperto cartaceo del percorso invece di uno screenshot di una mappa digitale. Licenza
  // CC-BY-SA (dati OSM + SRTM) — stessa famiglia di licenza dei tile OSM già in uso qui sopra.
  topo:    'https://a.tile.opentopomap.org',
}

// CARTO ha reso obbligatoria una API key su basemaps.cartocdn.com (fine agosto 2026) per i tre
// stili voyager/dark/positron sopra — prima erano davvero anonimi e senza chiave. Senza,
// CARTO non risponde con un errore ma con un PNG 200 valido, marcato a schermo intero
// "API KEY REQUIRED" (è esattamente il tile che arrivava al client prima di questa modifica: il
// controllo `res.ok` qui sotto non lo intercetta, perché per CARTO è una risposta riuscita).
// La chiave è gratuita entro 5 milioni di richieste/mese, anche per un uso commerciale — vedi
// https://carto.com/basemaps/apikey/ — e va impostata come variabile d'ambiente CARTO_API_KEY
// (Vercel → env del progetto), mai committata. Finché resta assente il proxy continua a
// funzionare esattamente come prima: stessa filigrana per chi non l'ha ancora configurata.
const CARTO_API_KEY = process.env.CARTO_API_KEY

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const zRaw  = searchParams.get('z')
  const xRaw  = searchParams.get('x')
  const yRaw  = searchParams.get('y')
  const style = searchParams.get('style') ?? 'voyager'
  // Le tile @2x servono a chi compone immagini grandi (condivisione, PDF): senza, una griglia di
  // tile da 256px va ingrandita e i toponimi diventano illeggibili. Solo CARTO le offre; OSM
  // standard no, quindi per 'light' la richiesta viene ignorata invece di produrre un 404.
  const retina = searchParams.get('retina') === '1' && style !== 'light' && style !== 'topo'

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
  const isCarto = base.includes('cartocdn.com')
  const url  = `${base}/${zoom}/${x}/${y}${retina ? '@2x' : ''}.png${isCarto && CARTO_API_KEY ? `?key=${encodeURIComponent(CARTO_API_KEY)}` : ''}`

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
