
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
  insert into dtrek_places (name, meta_type, description, latitude, longitude, region, official_url, source, source_id, confidence, metadata)
  values ($q$Percorso della Santa Spina$q$, 'cammino', $q$Breve itinerario calabrese dedicato alla devozione della Santa Spina e ai luoghi di culto collegati alla tradizione locale.$q$, 39.11198618776749, 16.77470392463604, $q$Calabria$q$, null, 'gpx', 'cammino/percorso-santa-spina', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":3678,"tappeCount":1,"tappeSource":"official","start":{"name":null,"lat":39.1102953926835,"lon":16.79396882654575},"end":{"name":null,"lat":39.104270843602,"lon":16.76865081183454},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":1,"totalKm":3.9,"connected":true,"maxTappaKm":3.9,"namedShare":0,"officialTappe":1,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$kvumFiaoeBwS~sApc@tfAzTp@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, description = coalesce(excluded.description, dtrek_places.description), official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/percorso-santa-spina', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Percorso$q$, null, null, null, null, 3852, pg_temp.dpoly($q$kvumFiaoeB]|FyDnEh@lEzDdAQ`B}BLq@x@yFS^pWcFbQPbCwAHdBrBeAnE|DvHfCtXzBpDvDJ~G|FTxBt@^i@|CjBfBa@p@dAEi@pAhAK`@r@BdCbAG~BmDbDEKoA|BPi@h@zBl@ZsAfBnAJvE$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 1;
end
$do$;