
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
end $f$;
do $do$
declare pid uuid;
begin
  insert into dtrek_places (name, meta_type, latitude, longitude, region, source, source_id, confidence, metadata)
  values ($q$Cammino della Magna Grecia — Varianti$q$, 'cammino', 39.15419651431783, 16.95531166797161, $q$Calabria$q$, 'gpx', 'cammino/cammino-della-magna-grecia-varianti', 0.9,
    $q${"kind":"cammino","theme":"storico","lengthM":10384,"tappeCount":1,"tappeSource":"official","start":{"name":"Eremo della Via Sacra","lat":39.16325252411399,"lon":16.9936540672958},"end":{"name":"Santa Severina","lat":39.14695787760364,"lon":16.91152151756781},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":1,"totalKm":10.4,"connected":true,"maxTappaKm":10.4,"namedShare":1,"officialTappe":1,"computedTappe":0,"longTappe":0,"shortTappe":0},"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$ia`nFiavfBqSvgAzVuGtf@lZiWtjA`j@hp@cKx^j[`f@wQfh@xKtwAzm@fqAcPvL$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-della-magna-grecia-varianti', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Variante Via Sacra: Eremo → Santa Severina$q$, $q$Eremo della Via Sacra$q$, $q$Santa Severina$q$, null, null, 10388, pg_temp.dpoly($q$ia`nFiavfB|DbFaGpAiEtIlDtJcL|EmCv`@`C\xRsHp\bPbIhIFdLaB`IJtF{Tvk@~ArNnOzAdJlKxB`KpGhEeDbV}EtGbFtOfFvGzFbAjAfGjAa@j@hCoBrGc@lQyKjMi@EE`DbIzRkBb]fEr`@pFk@gAlKxEk@pCzHn@lW~BlGbVbRp@tIaDnFuF]kCdF$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 1;
end
$do$;