import fs from 'fs'
import path from 'path'
import { midpoint } from './build'
import { polylineLengthM, simplifyPolyline, type LatLon } from '../../../lib/cammini/geometry'
import { encodePolyline } from '../../../lib/cammini/polylineCodec'
import { chainSegments, decodeXmlText, parseTrackFile, type ParsedTrack } from '../../../lib/cammini/trackParse'
import { TRACK_CAMMINI, type CamminoSpec, type TappaSpec } from './tracks-manifest'

// Importa cammini da file GPX/KML (tracce ufficiali degli enti) in dtrek_places + dtrek_cammino_tappe.
// Non scrive da solo: produce il report di qualità e, con --sql <cartella>, uno script SQL per cammino
// (idempotente: upsert su (source, source_id) e (cammino_id, ordinal); ogni file è autosufficiente) da eseguire sul database,
// poi zz-anchors.sql per agganciare i capi tappa ai borghi del catalogo.
//
// Uso:
//   npx tsx scripts/places/cammini/import-tracks.ts --src <cartella con gli zip scompattati> [--only <id>] [--sql <cartella>]

const SOURCE = 'gpx'
const TAPPA_TOLERANCE_M = 15
const OVERVIEW_TOLERANCE_M = 150
/** Distanza massima fra la fine di una tappa e l'inizio della successiva perché siano "collegate". */
const CONNECT_M = 2000
const ANCHOR_M = 1500

export interface BuiltTappa { ordinal: number; name: string; from?: string; to?: string; lengthM: number; polyline: LatLon[] }
export interface BuiltTrackCammino {
  spec: CamminoSpec
  tappe: BuiltTappa[]
  line: LatLon[]
  lengthM: number
  quality: { status: 'pronto' | 'da_rivedere'; reasons: string[]; tappe: number; totalKm: number; connected: boolean; maxTappaKm: number; namedShare: number; officialTappe: number; computedTappe: number; longTappe: number; shortTappe: number }
}

const fileCache = new Map<string, ParsedTrack[]>()
function tracksOf(src: string, file: string): ParsedTrack[] {
  let t = fileCache.get(file)
  if (!t) {
    const full = path.join(src, file)
    if (!fs.existsSync(full)) throw new Error(`File mancante: ${file}`)
    t = parseTrackFile(file, fs.readFileSync(full, 'utf8'))
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

export function buildTrackCammino(spec: CamminoSpec, src: string): BuiltTrackCammino {
  const tappe: BuiltTappa[] = spec.tappe.map((s, i) => {
    const raw = resolveTappaLine(tracksOf(src, s.file), s)
    return { ordinal: i + 1, name: s.name ?? `Tappa ${String(i + 1).padStart(2, '0')}`, from: s.from, to: s.to, lengthM: polylineLengthM(raw), polyline: simplifyPolyline(raw, TAPPA_TOLERANCE_M) }
  })
  if (spec.structure === 'cammino') orientSequence(tappe)
  const line = tappe.flatMap((t, i) => (i === 0 ? t.polyline : t.polyline.slice(1)))
  const gaps = tappe.slice(1).map((t, i) => polylineLengthM([tappe[i].polyline[tappe[i].polyline.length - 1], t.polyline[0]]))
  // Una rete di varianti non è una sequenza: la continuità si valuta solo sui cammini lineari.
  const allowed = new Set(spec.allowGapsAfter ?? [])
  const connected = spec.structure === 'rete' ? true : gaps.every((g, i) => g <= CONNECT_M || allowed.has(i + 1))
  const reasons: string[] = []
  if (spec.reviewReason) reasons.push(spec.reviewReason)
  if (!connected) reasons.push(`Tappe non collegate: ${gaps.map((g, i) => (g > CONNECT_M && !allowed.has(i + 1) ? `${i + 1}→${i + 2} (${(g / 1000).toFixed(1)} km)` : '')).filter(Boolean).join(', ')}`)
  const km = tappe.map(t => t.lengthM / 1000)
  const quality = {
    status: reasons.length === 0 ? ('pronto' as const) : ('da_rivedere' as const), reasons,
    tappe: tappe.length, totalKm: Math.round(km.reduce((a, b) => a + b, 0) * 10) / 10, connected,
    maxTappaKm: Math.round(Math.max(...km) * 10) / 10,
    namedShare: tappe.filter(t => t.from && t.to).length / tappe.length,
    officialTappe: tappe.length, computedTappe: 0,
    longTappe: km.filter(k => k > 35).length, shortTappe: km.filter(k => k < 3).length,
  }
  return { spec, tappe, line, lengthM: polylineLengthM(line), quality }
}

const sqlStr = (s: string | null | undefined) => (s == null ? 'null' : `$q$${s}$q$`)
const poly = (l: LatLon[]) => `pg_temp.dpoly($q$${encodePolyline(l)}$q$)`

export function camminoSql(b: BuiltTrackCammino): string {
  const { spec } = b
  const [lat, lon] = midpoint(b.line)
  const first = b.tappe[0].polyline[0], last = b.tappe[b.tappe.length - 1].polyline.slice(-1)[0]
  const meta = {
    kind: 'cammino', theme: spec.theme, lengthM: Math.round(b.lengthM), tappeCount: b.tappe.length, tappeSource: 'official',
    start: { name: b.tappe[0].from ?? null, lat: first[0], lon: first[1] }, end: { name: b.tappe[b.tappe.length - 1].to ?? null, lat: last[0], lon: last[1] },
    ref: null, network: null, trackSource: 'gpx', quality: b.quality, ...(spec.structure === 'rete' ? { structure: 'rete' } : {}),
  }
  const sid = `cammino/${spec.id}`
  const rows = b.tappe.map(t =>
    `(pid, ${t.ordinal}, ${sqlStr(t.name)}, ${sqlStr(t.from)}, ${sqlStr(t.to)}, ${Math.round(t.lengthM)}, ${poly(t.polyline)}, 'official')`).join(',\n    ')
  return `
do $do$
declare pid uuid;
begin
  insert into dtrek_places (name, meta_type, latitude, longitude, region, source, source_id, confidence, metadata)
  values (${sqlStr(spec.name)}, 'cammino', ${lat}, ${lon}, ${sqlStr(spec.region)}, '${SOURCE}', '${sid}', 0.9,
    ${sqlStr(JSON.stringify(meta))}::jsonb || jsonb_build_object('overviewPolyline', ${poly(simplifyPolyline(b.line, OVERVIEW_TOLERANCE_M))}))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, '${SOURCE}', '${sid}', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, length_m, polyline, source)
  values
    ${rows}
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
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

function main() {
  const src = arg('src')
  if (!src) { console.error('Serve --src <cartella con gli zip scompattati>'); process.exit(1) }
  const only = arg('only'), sqlDir = arg('sql')
  const specs = TRACK_CAMMINI.filter(s => !only || s.id === only)
  if (specs.length === 0) { console.error(`Nessun cammino con id ${only}. Validi: ${TRACK_CAMMINI.map(s => s.id).join(', ')}`); process.exit(1) }
  if (sqlDir) fs.mkdirSync(sqlDir, { recursive: true })
  let failed = 0
  for (const spec of specs) {
    try {
      const b = buildTrackCammino(spec, src)
      const q = b.quality
      console.log(`${spec.id}: ${q.totalKm} km, ${q.tappe} tappe (max ${q.maxTappaKm} km) → ${q.status.toUpperCase()}${q.reasons.length ? `\n   ${q.reasons.join('; ')}` : ''}`)
      if (sqlDir) fs.writeFileSync(path.join(sqlDir, `${spec.id}.sql`), DPOLY_SQL + camminoSql(b))
    } catch (e) { failed++; console.error(`${spec.id}: ERRORE ${(e as Error).message}`) }
  }
  if (sqlDir) {
    fs.writeFileSync(path.join(sqlDir, 'zz-anchors.sql'), anchorsSql(specs.map(s => s.id)))
  }
  process.exit(failed ? 1 : 0)
}

if (process.argv[1]?.endsWith('import-tracks.ts')) main()
