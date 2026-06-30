// Rete Natura 2000 (SIC/ZSC/ZPS) — protected-area polygons. Confirmed via real GetCapabilities
// (WFS 1.1.0, legacy MapServer CGI at wms.pcn.minambiente.it) that this endpoint serves GML only
// — no JSON outputFormat exists — so this client parses GML by hand instead of calling the
// shared wfsGetFeature()'s JSON-only path (uses wfsGetFeatureGml instead, see wfsClient.ts).
// No generic GML module: this is a one-off, scoped parser (same minimal-utility spirit as
// pointInPolygon.ts), not a reusable XML layer — no other dataset in this repo needs GML.
//
// The exact GML tag names below (gml:featureMember, gml:posList/coordinates, gml:exterior/
// outerBoundaryIs) are MapServer's well-documented WFS 1.1.0/GML 3.1.1 conventions, inferred
// from this server's CGI fingerprint (ows:OnlineResource's "/ogc?map=..." pattern, the
// MapServer-style "WARNING: Optional metadata..." comments in its own GetCapabilities) — not
// guessed from an unrelated snippet. Still unconfirmed against one real GetFeature response
// (sandbox network egress blocks that test call, see plan Sezione 9 punto 2): if a live run
// finds GML content but extracts zero features, fetchNatura2000Polygons logs a warning rather
// than silently returning empty data, so a wrong structural assumption surfaces loudly.
//
// Falls back to designation:'unknown' (never fabricates SIC/ZSC/ZPS from an unrecognized
// value) — same "never invent a classification" discipline as lithologyRiskMap.ts.
import { NATURA2000_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetFeatureGml } from '@/lib/geo/wfsClient'
import type { AnyPolygonGeometry } from '@/lib/geo/pointInPolygon'

export type Natura2000Designation = 'SIC' | 'ZSC' | 'ZPS' | 'unknown'

export interface Natura2000Feature {
  geometry: AnyPolygonGeometry
  siteCode: string | null
  siteName: string | null
  designation: Natura2000Designation
  habitatNotes: string | null
  rawAttributes: Record<string, unknown>
}

// Thrown when NATURA2000_DATASET isn't configured yet (baseUrl/typeName still null per
// datasetConfig.ts) — callers must treat this exactly like "no data found".
export class Natura2000UnavailableError extends Error {}

// Same budget reasoning as PAI_TIMEOUT_MS/GEOLOGIA_TIMEOUT_MS, though this client is never
// called from computeCL.ts's 5s collector budget (plan: "Nessun hook SI" for Natura2000) —
// kept tight anyway since it does run inside computeTEI's client-side fetch path.
const NATURA2000_TIMEOUT_MS = 4000

const SITE_CODE_FIELDS = ['sitecode', 'SITECODE', 'SITE_CODE', 'codice', 'CODICE', 'cod_sito', 'COD_SITO']
const SITE_NAME_FIELDS = ['sitename', 'SITENAME', 'SITE_NAME', 'nome', 'NOME', 'denominazione', 'DENOMINAZIONE']
const DESIGNATION_FIELDS = ['sitetype', 'SITETYPE', 'tipo', 'TIPO', 'designazione', 'DESIGNAZIONE', 'tipologia', 'TIPOLOGIA']
const HABITAT_FIELDS = ['habitat', 'HABITAT', 'habitat_principali', 'note', 'NOTE']

function firstStringField(props: Record<string, unknown>, fields: string[]): string | null {
  for (const f of fields) {
    const v = props[f]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return null
}

// Only matches an explicit SIC/ZSC/ZPS/SPA/SAC string in the field value — does not attempt to
// decode the EU SITETYPE A/B/C convention (A=ZPS-only, B=SIC/ZSC-only, C=overlap), since getting
// that letter-mapping wrong would silently mislabel every site. Revisit once a real endpoint's
// actual field values are inspected via scripts/probe-natura2000.ts.
function extractDesignation(props: Record<string, unknown>): Natura2000Designation {
  const raw = firstStringField(props, DESIGNATION_FIELDS)
  if (!raw) return 'unknown'
  const upper = raw.toUpperCase()
  if (upper.includes('ZSC')) return 'ZSC'
  if (upper.includes('SIC')) return 'SIC'
  if (upper.includes('ZPS') || upper.includes('SPA')) return 'ZPS'
  return 'unknown'
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Matches <prefix:tag ...>...</prefix:tag> blocks where prefix is captured (not assumed to be
// literally "gml" or "wfs") — MapServer's prefix choice for feature wrappers can vary by config.
function matchAllPrefixedTagBlocks(xml: string, tag: string): string[] {
  const t = escapeRegex(tag)
  const re = new RegExp(`<([\\w]+):${t}\\b[^>]*>([\\s\\S]*?)<\\/\\1:${t}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[2])
  return out
}

function extractFeatureBlocks(xml: string, typeName: string): string[] {
  const memberBlocks = matchAllPrefixedTagBlocks(xml, 'featureMember')
  if (memberBlocks.length > 0) return memberBlocks

  // WFS 1.1.0 allows a single <gml:featureMembers> wrapper containing repeated typeName-tagged
  // elements instead of one wrapper per feature.
  const membersBlocks = matchAllPrefixedTagBlocks(xml, 'featureMembers')
  if (membersBlocks.length === 0) return []

  const localPart = typeName.split(':').pop() ?? typeName
  return matchAllPrefixedTagBlocks(membersBlocks[0], localPart)
}

function matchAllGmlTagBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<gml:${tag}\\b[^>]*>([\\s\\S]*?)<\\/gml:${tag}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}

function matchFirstGmlTagBlock(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<gml:${tag}\\b[^>]*>([\\s\\S]*?)<\\/gml:${tag}>`))
  return m ? m[1] : null
}

type LonLat = [number, number]

// gml:posList under GML 3.1.1 with a URN-style srsName (urn:ogc:def:crs:EPSG::4326) orders
// axes lat,lon per ISO 19111/EPSG — opposite of this repo's internal [lon,lat] GeoJSON
// convention, so each pair is flipped here.
function parsePosList(text: string): LonLat[] {
  const nums = text.trim().split(/\s+/).map(Number)
  const pairs: LonLat[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i + 1], nums[i]])
  return pairs
}

// Legacy GML2-style gml:coordinates ("lon,lat lon,lat ...") already matches this repo's
// [lon,lat] convention — no axis flip needed, unlike posList above.
function parseCoordinates(text: string): LonLat[] {
  return text.trim().split(/\s+/).map(pair => {
    const [lon, lat] = pair.split(',').map(Number)
    return [lon, lat] as LonLat
  })
}

function extractRingCoords(ringWrapperXml: string): LonLat[] | null {
  const posList = matchFirstGmlTagBlock(ringWrapperXml, 'posList')
  if (posList != null) return parsePosList(posList)
  const coordinates = matchFirstGmlTagBlock(ringWrapperXml, 'coordinates')
  if (coordinates != null) return parseCoordinates(coordinates)
  return null
}

function extractRings(polygonXml: string): LonLat[][] {
  const rings: LonLat[][] = []
  const exterior = matchFirstGmlTagBlock(polygonXml, 'exterior') ?? matchFirstGmlTagBlock(polygonXml, 'outerBoundaryIs')
  if (exterior) {
    const ring = extractRingCoords(exterior)
    if (ring) rings.push(ring)
  }
  const interiorTag = polygonXml.includes('<gml:interior') ? 'interior' : 'innerBoundaryIs'
  for (const interior of matchAllGmlTagBlocks(polygonXml, interiorTag)) {
    const ring = extractRingCoords(interior)
    if (ring) rings.push(ring)
  }
  return rings
}

function extractGeometry(featureXml: string): AnyPolygonGeometry | null {
  const polygonBlocks = matchAllGmlTagBlocks(featureXml, 'Polygon')
  const polygons = polygonBlocks.map(extractRings).filter(rings => rings.length > 0)
  if (polygons.length === 0) return null
  if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] }
  return { type: 'MultiPolygon', coordinates: polygons }
}

// Flat attribute extraction only (no nesting) — matches every dataset's schema in this repo
// (PAI, Geologia, Uso Suolo all expose a flat property bag), and Natura2000's EU-standard
// schema is documented as flat too.
function extractFlatProperties(featureXml: string): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  const re = /<([\w.]+):([\w.]+)(?:\s[^>]*)?>([^<]*)<\/\1:\2>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(featureXml)) !== null) {
    const [, , localName, text] = m
    if (text.trim() === '') continue
    props[localName] = text.trim()
  }
  return props
}

export async function fetchNatura2000Polygons(bbox: string): Promise<Natura2000Feature[]> {
  if (!NATURA2000_DATASET.baseUrl || !NATURA2000_DATASET.typeName) {
    throw new Natura2000UnavailableError('Natura2000 dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }

  const xml = await wfsGetFeatureGml({
    baseUrl: NATURA2000_DATASET.baseUrl,
    typeName: NATURA2000_DATASET.typeName,
    bbox,
    // This layer's GetCapabilities declares DefaultSRS as the URN form
    // (urn:ogc:def:crs:EPSG::4326), not the legacy "EPSG:4326" string — they imply opposite
    // axis orders (lat,lon vs lon,lat) per WFS 1.1.0. Passing the legacy string here matched
    // a different axis convention than the server's declared default and the server silently
    // returned an empty (but structurally valid) FeatureCollection for every bbox.
    srsName: 'urn:ogc:def:crs:EPSG::4326',
    version: '1.1.0',
    timeoutMs: NATURA2000_TIMEOUT_MS,
  })

  const featureBlocks = extractFeatureBlocks(xml, NATURA2000_DATASET.typeName)
  if (featureBlocks.length === 0 && xml.includes('<gml:')) {
    console.warn(
      '[natura2000Client] risposta GML non vuota ma 0 feature estratte — la struttura GML reale ' +
      'potrebbe differire dalle assunzioni del parser (vedi extractFeatureBlocks in natura2000Client.ts).',
    )
  }

  const features: Natura2000Feature[] = []
  for (const block of featureBlocks) {
    const geometry = extractGeometry(block)
    if (!geometry) continue
    const props = extractFlatProperties(block)
    features.push({
      geometry,
      siteCode: firstStringField(props, SITE_CODE_FIELDS),
      siteName: firstStringField(props, SITE_NAME_FIELDS),
      designation: extractDesignation(props),
      habitatNotes: firstStringField(props, HABITAT_FIELDS),
      rawAttributes: props,
    })
  }
  return features
}
