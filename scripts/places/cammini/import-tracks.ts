import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { midpoint } from './build'
import { polylineLengthM, simplifyPolyline, type LatLon } from '../../../lib/cammini/geometry'
import { encodePolyline } from '../../../lib/cammini/polylineCodec'
import { splitIntoTappe, type TappaAnchor } from '../../../lib/cammini/tappe'
import { chainSegments, decodeXmlText, parseTrackFile, type ParsedTrack } from '../../../lib/cammini/trackParse'
import { WAVES } from './tracks'
import { officialUrlFor } from './tracks/ministero'
import type { CamminoSpec, TappaSpec } from './tracks/types'

// Importa cammini da file GPX/KML (tracce ufficiali degli enti) in dtrek_places + dtrek_cammino_tappe.
// Non scrive da solo: produce il report di qualità e, con --sql <cartella>, uno script SQL per cammino
// (idempotente: upsert su (source, source_id) e (cammino_id, ordinal); ogni file è autosufficiente) da eseguire sul database,
// poi zz-anchors.sql per agganciare i capi tappa ai borghi del catalogo.
//
// Uso:
//   npx tsx scripts/places/cammini/import-tracks.ts --wave 2 --src <cartella con gli zip scompattati> [--only <id>] [--sql <cartella>]
// I .kmz si leggono con `unzip -p` (serve il comando `unzip`). Ondate: scripts/places/cammini/tracks/ondata-N.ts,
// SQL generato in supabase/data/cammini-gpx/ondata-N/, ancore dei borghi per le tappe calcolate in .../ondata-N/anchors/<id>.json.

const SOURCE = 'gpx'
const TAPPA_TOLERANCE_M = 15
const OVERVIEW_TOLERANCE_M = 150
/** Distanza massima fra la fine di una tappa e l'inizio della successiva perché siano "collegate". */
const CONNECT_M = 2000
const ANCHOR_M = 1500

export interface BuiltTappa {
  ordinal: number; name: string; from?: string; to?: string; lengthM: number; polyline: LatLon[]
  source: 'official' | 'computed'; fromAnchorId?: string; toAnchorId?: string; endsAtAnchor?: boolean
}
export interface BuiltTrackCammino {
  spec: CamminoSpec
  tappe: BuiltTappa[]
  line: LatLon[]
  lengthM: number
  tappeSource: 'official' | 'computed' | 'mixed'
  quality: { status: 'pronto' | 'da_rivedere'; reasons: string[]; tappe: number; totalKm: number; connected: boolean; maxTappaKm: number; namedShare: number; officialTappe: number; computedTappe: number; longTappe: number; shortTappe: number }
}

const fileCache = new Map<string, ParsedTrack[]>()

/** Percorso reale del file: i nomi con byte non UTF-8 (es. "Cirò" in latin1) si scrivono nel manifest con U+FFFD. */
export function resolveFile(src: string, file: string): Buffer | string {
  const full = path.join(src, file)
  if (fs.existsSync(full)) return full
  const dir = path.dirname(full)
  if (fs.existsSync(dir)) {
    const hit = fs.readdirSync(dir, { encoding: 'buffer' }).find(b => b.toString('utf8') === path.basename(full))
    if (hit) return Buffer.concat([Buffer.from(dir + path.sep), hit])
  }
  throw new Error(`File mancante: ${file}`)
}

function tracksOf(src: string, file: string): ParsedTrack[] {
  let t = fileCache.get(file)
  if (!t) {
    const full = resolveFile(src, file)
    const kmz = /\.kmz$/i.test(file)
    let xml: string
    if (kmz) {
      // unzip vuole un percorso testuale: con byte non UTF-8 nel nome si passa da una copia temporanea.
      const tmp = Buffer.isBuffer(full) ? path.join(os.tmpdir(), `dtrek-${process.pid}-${fileCache.size}.kmz`) : full
      if (Buffer.isBuffer(full)) fs.copyFileSync(full, tmp)
      try { xml = execFileSync('unzip', ['-p', tmp, '*.kml'], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8') } finally { if (Buffer.isBuffer(full)) fs.rmSync(tmp, { force: true }) }
    } else xml = fs.readFileSync(full, 'utf8')
    t = parseTrackFile(kmz ? `${file}.kml` : file, xml)
    fileCache.set(file, t)
  }
  return t
}

export function resolveTappaLine(tracks: ParsedTrack[], spec: TappaSpec): LatLon[] {
  let picked = tracks
  if (spec.track?.startsWith('#')) picked = tracks.slice(Number(spec.track.slice(1)), Number(spec.track.slice(1)) + 1)
  else if (spec.track) {
    const re = new RegExp(spec.track, 'i')
    picked = tracks.filter(t => re.test(decodeXmlText(t.name ?? '')))
  }
  if (picked.length === 0) throw new Error(`Nessuna traccia per ${spec.file} / ${spec.track}`)
  if (spec.track && picked.length > 1) throw new Error(`${picked.length} tracce per ${spec.file} / ${spec.track} (attesa una)`)
  const line = chainSegments(picked.flatMap(t => t.segments))
  if (line.length < 2) throw new Error(`Traccia vuota: ${spec.file}`)
  return line
}

const dist = (a: LatLon, b: LatLon) => polylineLengthM([a, b])

/**
 * Alcune tracce sono registrate in senso opposto al cammino: ogni tappa viene girata, se serve, perché
 * il suo inizio sia il più vicino alla fine della precedente (la prima si orienta sulla seconda).
 */
export function orientSequence(tappe: { polyline: LatLon[] }[]): void {
  if (tappe.length < 2) return
  const ends = (t: { polyline: LatLon[] }): [LatLon, LatLon] => [t.polyline[0], t.polyline[t.polyline.length - 1]]
  const [a0, a1] = ends(tappe[0]), [b0, b1] = ends(tappe[1])
  const toNext = (p: LatLon) => Math.min(dist(p, b0), dist(p, b1))
  if (toNext(a0) < toNext(a1)) tappe[0].polyline = tappe[0].polyline.slice().reverse()
  for (let i = 1; i < tappe.length; i++) {
    const prevEnd = tappe[i - 1].polyline[tappe[i - 1].polyline.length - 1]
    const [s, e] = ends(tappe[i])
    if (dist(prevEnd, e) < dist(prevEnd, s)) tappe[i].polyline = tappe[i].polyline.slice().reverse()
  }
}

/** Linea di una tappa: una traccia (o più, concatenate) da uno o più file. */
function specLine(src: string, spec: TappaSpec): LatLon[] {
  const files = [spec.file, ...(spec.moreFiles ?? [])]
  if (files.length === 1) return resolveTappaLine(tracksOf(src, spec.file), spec)
  return chainSegments(files.map(f => resolveTappaLine(tracksOf(src, f), { ...spec, file: f })))
}

export function buildTrackCammino(spec: CamminoSpec, src: string, anchors: TappaAnchor[] = []): BuiltTrackCammino {
  let tappe: BuiltTappa[]
  if (spec.computeTappe) {
    // Traccia unica: si taglia a budget di giornata sui borghi del catalogo (come l'import OSM senza tappe ufficiali).
    if (spec.tappe.length !== 1) throw new Error(`${spec.id}: computeTappe richiede una sola traccia`)
    if (anchors.length === 0) throw new Error(`${spec.id}: mancano le ancore (anchors/${spec.id}.json)`)
    const raw = specLine(src, spec.tappe[0])
    const drafts = splitIntoTappe(raw, anchors, spec.split)
    const first = drafts[0], last = drafts[drafts.length - 1]
    if (spec.tappe[0].from && !first.fromName) first.fromName = spec.tappe[0].from
    if (spec.tappe[0].to && !last.toName) last.toName = spec.tappe[0].to
    tappe = drafts.map(d => ({
      ordinal: d.ordinal, name: d.name, from: d.fromName, to: d.toName, lengthM: d.lengthM, polyline: simplifyPolyline(d.polyline, TAPPA_TOLERANCE_M),
      source: 'computed' as const, fromAnchorId: d.fromAnchorId, toAnchorId: d.toAnchorId, endsAtAnchor: d.endsAtAnchor,
    }))
  } else {
    tappe = spec.tappe.map((s, i) => {
      const raw = specLine(src, s)
      return { ordinal: i + 1, name: s.name ?? `Tappa ${String(i + 1).padStart(2, '0')}`, from: s.from, to: s.to, lengthM: polylineLengthM(raw), polyline: simplifyPolyline(raw, TAPPA_TOLERANCE_M), source: 'official' as const }
    })
    if (spec.structure === 'cammino') orientSequence(tappe)
  }
  const line = tappe.flatMap((t, i) => (i === 0 ? t.polyline : t.polyline.slice(1)))
  const gaps = tappe.slice(1).map((t, i) => polylineLengthM([tappe[i].polyline[tappe[i].polyline.length - 1], t.polyline[0]]))
  // Una rete di varianti non è una sequenza: la continuità si valuta solo sui cammini lineari.
  const allowed = new Set(spec.allowGapsAfter ?? [])
  const connected = spec.structure === 'rete' ? true : gaps.every((g, i) => g <= CONNECT_M || allowed.has(i + 1))
  const reasons: string[] = []
  if (spec.reviewReason) reasons.push(spec.reviewReason)
  if (!connected) reasons.push(`Tappe non collegate: ${gaps.map((g, i) => (g > CONNECT_M && !allowed.has(i + 1) ? `${i + 1}→${i + 2} (${(g / 1000).toFixed(1)} km)` : '')).filter(Boolean).join(', ')}`)
  const km = tappe.map(t => t.lengthM / 1000)
  const computed = tappe.filter(t => t.source === 'computed').length
  const quality = {
    status: reasons.length === 0 ? ('pronto' as const) : ('da_rivedere' as const), reasons,
    tappe: tappe.length, totalKm: Math.round(km.reduce((a, b) => a + b, 0) * 10) / 10, connected,
    maxTappaKm: Math.round(Math.max(...km) * 10) / 10,
    namedShare: tappe.filter(t => t.from && t.to).length / tappe.length,
    officialTappe: tappe.length - computed, computedTappe: computed,
    longTappe: km.filter(k => k > 35).length, shortTappe: km.filter(k => k < 3).length,
  }
  return { spec, tappe, line, lengthM: polylineLengthM(line), quality, tappeSource: computed === 0 ? 'official' : computed === tappe.length ? 'computed' : 'mixed' }
}

const sqlStr = (s: string | null | undefined) => (s == null ? 'null' : `$q$${s}$q$`)
const poly = (l: LatLon[]) => `pg_temp.dpoly($q$${encodePolyline(l)}$q$)`

/**
 * Panoramica a pezzi: una tappa che non riparte da dove finisce la precedente (varianti, traghetti, trasferimenti) apre un
 * pezzo nuovo, così la mappa non disegna rette fra tratti scollegati. Soglia: 300 m per le reti di varianti, CONNECT_M per i cammini.
 */
export function overviewParts(b: Pick<BuiltTrackCammino, 'tappe' | 'spec'>): LatLon[][] {
  const maxGap = b.spec.structure === 'rete' ? 300 : CONNECT_M
  const parts: LatLon[][] = []
  for (const t of b.tappe) {
    const cur = parts[parts.length - 1]
    if (cur && polylineLengthM([cur[cur.length - 1], t.polyline[0]]) <= maxGap) cur.push(...t.polyline)
    else parts.push(t.polyline.slice())
  }
  return parts.map(p => simplifyPolyline(p, OVERVIEW_TOLERANCE_M))
}

export function camminoSql(b: BuiltTrackCammino): string {
  const { spec } = b
  const [lat, lon] = midpoint(b.line)
  const first = b.tappe[0].polyline[0], last = b.tappe[b.tappe.length - 1].polyline.slice(-1)[0]
  const parts = overviewParts(b)
  const meta = {
    kind: 'cammino', theme: spec.theme, lengthM: Math.round(b.lengthM), tappeCount: b.tappe.length, tappeSource: 'official',
    start: { name: b.tappe[0].from ?? null, lat: first[0], lon: first[1] }, end: { name: b.tappe[b.tappe.length - 1].to ?? null, lat: last[0], lon: last[1] },
    ref: null, network: null, trackSource: 'gpx', quality: b.quality, ...(parts.length > 1 ? { overviewParts: parts.map(p => p.map(([la, lo]) => [Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5])) } : {}), ...(spec.structure === 'rete' ? { structure: 'rete' } : {}),
  }
  const sid = `cammino/${spec.id}`
  const uuid = (id?: string) => (id ? `'${id}'::uuid` : 'null')
  const rows = b.tappe.map(t =>
    `(pid, ${t.ordinal}, ${sqlStr(t.name)}, ${sqlStr(t.from)}, ${sqlStr(t.to)}, ${uuid(t.fromAnchorId)}, ${uuid(t.toAnchorId)}, ${Math.round(t.lengthM)}, ${poly(t.polyline)}, '${t.source}', ${t.endsAtAnchor == null ? 'null' : t.endsAtAnchor})`).join(',\n    ')
  return `
do $do$
declare pid uuid;
begin
  insert into dtrek_places (name, meta_type, latitude, longitude, region, official_url, source, source_id, confidence, metadata)
  values (${sqlStr(spec.name)}, 'cammino', ${lat}, ${lon}, ${sqlStr(spec.region)}, ${sqlStr(officialUrlFor(spec.id))}, '${SOURCE}', '${sid}', ${b.tappeSource === 'official' ? 0.9 : b.tappeSource === 'mixed' ? 0.8 : 0.75},
    ${sqlStr(JSON.stringify(meta))}::jsonb || jsonb_build_object('overviewPolyline', ${poly(simplifyPolyline(b.line, OVERVIEW_TOLERANCE_M))}))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, '${SOURCE}', '${sid}', 'gpx', ${b.tappeSource === 'official' ? 0.9 : 0.75}, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    ${rows}
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > ${b.tappe.length};
end
$do$;`
}

/** Funzione temporanea (vive solo nella sessione): decodifica una encoded polyline 1e-5 in jsonb [[lat,lon],...]. */
export const DPOLY_SQL = `
create or replace function pg_temp.dpoly(s text) returns jsonb language plpgsql immutable as $f$
declare i int := 1; lat int := 0; lon int := 0; shift int; res int; b int; out jsonb := '[]'::jsonb; d int;
begin
  while i <= length(s) loop
    for k in 1..2 loop
      shift := 0; res := 0;
      loop
        b := ascii(substr(s, i, 1)) - 63; i := i + 1;
        res := res | ((b & 31) << shift); shift := shift + 5;
        exit when b < 32;
      end loop;
      d := case when (res & 1) = 1 then ~(res >> 1) else (res >> 1) end;
      if k = 1 then lat := lat + d; else lon := lon + d; end if;
    end loop;
    out := out || jsonb_build_array(jsonb_build_array(round(lat / 1e5, 5), round(lon / 1e5, 5)));
  end loop;
  return out;
end $f$;`

/** Dopo gli import: aggancia i capi tappa ai borghi del catalogo e crea le relazioni 'near' (stessa logica dell'import OSM). */
export function anchorsSql(ids: string[]): string {
  const list = ids.map(i => `'cammino/${i}'`).join(',')
  return `
with c as (select id from dtrek_places where source = '${SOURCE}' and source_id in (${list})),
ends as (
  select t.id tid, t.polyline->0 p0, t.polyline->-1 p1, t.from_name, t.to_name
  from dtrek_cammino_tappe t join c on c.id = t.cammino_id
),
pick as (
  select e.tid,
    (select jsonb_build_object('id', b.id, 'name', b.name) from dtrek_places b where b.meta_type = 'borgo_citta'
       and st_dwithin(b.geometry::geography, st_setsrid(st_makepoint((e.p0->>1)::float, (e.p0->>0)::float), 4326)::geography, ${ANCHOR_M})
       order by b.geometry <-> st_setsrid(st_makepoint((e.p0->>1)::float, (e.p0->>0)::float), 4326) limit 1) f,
    (select jsonb_build_object('id', b.id, 'name', b.name) from dtrek_places b where b.meta_type = 'borgo_citta'
       and st_dwithin(b.geometry::geography, st_setsrid(st_makepoint((e.p1->>1)::float, (e.p1->>0)::float), 4326)::geography, ${ANCHOR_M})
       order by b.geometry <-> st_setsrid(st_makepoint((e.p1->>1)::float, (e.p1->>0)::float), 4326) limit 1) t
  from ends e
)
update dtrek_cammino_tappe x set
  from_place_id = case when (p.f->>'id') is not null and (x.from_name is null or lower(x.from_name) = lower(p.f->>'name')) then (p.f->>'id')::uuid else x.from_place_id end,
  to_place_id   = case when (p.t->>'id') is not null and (x.to_name is null or lower(x.to_name) = lower(p.t->>'name')) then (p.t->>'id')::uuid else x.to_place_id end,
  from_name = coalesce(x.from_name, p.f->>'name'),
  to_name = coalesce(x.to_name, p.t->>'name')
from pick p where p.tid = x.id;

insert into dtrek_place_relations (from_place_id, to_place_id, relation_type, metadata)
select t.cammino_id, a.pid, 'near', jsonb_build_object('tappe', jsonb_agg(distinct a.ord order by a.ord))
from dtrek_cammino_tappe t
join dtrek_places c on c.id = t.cammino_id and c.source = '${SOURCE}' and c.source_id in (${list})
cross join lateral (values (t.from_place_id, t.ordinal), (t.to_place_id, t.ordinal)) a(pid, ord)
where a.pid is not null
group by t.cammino_id, a.pid
on conflict (from_place_id, to_place_id, relation_type) do update set metadata = excluded.metadata;`
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** SQL che compila solo official_url dei cammini già importati (tutte le ondate), senza toccare altro. */
export function officialUrlsSql(): string {
  const rows = Object.values(WAVES).flat().map(s => ({ id: s.id, url: officialUrlFor(s.id) })).filter((r): r is { id: string; url: string } => !!r.url)
  return `-- Link di approfondimento dal catalogo del Ministero del Turismo (vedi tracks/ministero.ts). Idempotente; non tocca altri campi.
update dtrek_places p set official_url = v.url
from (values
  ${rows.map(r => `('cammino/${r.id}', ${sqlStr(r.url)})`).join(',\n  ')}
) v(source_id, url)
where p.source = '${SOURCE}' and p.source_id = v.source_id;`
}

function main() {
  const urlsOut = arg('urls-sql')
  if (urlsOut) { fs.mkdirSync(path.dirname(urlsOut), { recursive: true }); fs.writeFileSync(urlsOut, officialUrlsSql()); console.log(`Scritto ${urlsOut}`); return }
  const src = arg('src'), wave = Number(arg('wave'))
  const specs0 = WAVES[wave]
  if (!src || !specs0) { console.error(`Servono --src <cartella con gli zip scompattati> e --wave <${Object.keys(WAVES).join('|')}>`); process.exit(1) }
  const only = arg('only'), sqlDir = arg('sql')
  const specs = specs0.filter(s => !only || s.id === only)
  if (specs.length === 0) { console.error(`Nessun cammino con id ${only}. Validi: ${specs0.map(s => s.id).join(', ')}`); process.exit(1) }
  if (sqlDir) fs.mkdirSync(sqlDir, { recursive: true })
  const anchorsDir = arg('anchors') ?? (sqlDir ? path.join(sqlDir, 'anchors') : undefined)
  if (process.argv.includes('--anchors-sql')) {
    // Query (sola lettura) per ottenere i borghi entro ANCHOR_M dalla traccia: il risultato va salvato in anchors/<id>.json.
    for (const spec of specs.filter(s => s.computeTappe)) {
      const raw = specLine(src, spec.tappe[0])
      // Linee lunghe: query più leggera (linea semplificata a 400 m, raggio allargato in proporzione); lo split filtra comunque a 1,5 km.
      const long = polylineLengthM(raw) > 150_000
      const tol = long ? 400 : 100, radius = ANCHOR_M + (long ? 400 : 0), minPop = spec.split?.minPopulation ?? 300
      const wkt = simplifyPolyline(raw, tol).map(([la, lo]) => `${lo.toFixed(5)} ${la.toFixed(5)}`).join(',')
      console.log(`-- ${spec.id}\nselect json_agg(json_build_array(b.id, b.name, round(b.latitude::numeric, 5), round(b.longitude::numeric, 5), b.population) order by b.name) from dtrek_places b where b.meta_type = 'borgo_citta' and (b.population is null or b.population >= ${minPop}) and st_dwithin(b.geometry::geography, st_geomfromtext('LINESTRING(${wkt})', 4326)::geography, ${radius});`)
    }
    return
  }
  let failed = 0
  for (const spec of specs) {
    try {
      const anchorFile = anchorsDir ? path.join(anchorsDir, `${spec.id}.json`) : undefined
      const anchors: TappaAnchor[] = anchorFile && fs.existsSync(anchorFile)
        ? (JSON.parse(fs.readFileSync(anchorFile, 'utf8')) as [string, string, number, number, number | null][]).map(([id, name, lat, lon, population]) => ({ id, name, lat, lon, population }))
        : []
      const b = buildTrackCammino(spec, src, anchors)
      const q = b.quality
      console.log(`${spec.id}: ${q.totalKm} km, ${q.tappe} tappe ${b.tappeSource} (max ${q.maxTappaKm} km) → ${q.status.toUpperCase()}${q.reasons.length ? `\n   ${q.reasons.join('; ')}` : ''}`)
      if (sqlDir) fs.writeFileSync(path.join(sqlDir, `${spec.id}.sql`), DPOLY_SQL + camminoSql(b))
    } catch (e) { failed++; console.error(`${spec.id}: ERRORE ${(e as Error).message}`) }
  }
  if (sqlDir) fs.writeFileSync(path.join(sqlDir, 'zz-anchors.sql'), anchorsSql(specs.map(s => s.id)))
  process.exit(failed ? 1 : 0)
}

if (process.argv[1]?.endsWith('import-tracks.ts')) main()
