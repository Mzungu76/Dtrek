
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
  values ($q$Cammino dell'Acqua — Varianti$q$, 'cammino', 41.432243, 14.616766, $q$Molise$q$, 'gpx', 'cammino/cammino-dellacqua-varianti', 0.9,
    $q${"kind":"cammino","theme":"naturalistico","lengthM":40785,"tappeCount":2,"tappeSource":"official","start":{"name":"Castelpetroso","lat":41.549963,"lon":14.310023},"end":{"name":null,"lat":41.428153,"lon":14.624949},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":2,"totalKm":16.7,"connected":true,"maxTappaKm":10.2,"namedShare":0.5,"officialTappe":2,"computedTappe":0,"longTappe":0,"shortTappe":0},"overviewParts":[[[41.54996,14.31002],[41.55309,14.30931],[41.55171,14.31441],[41.5534,14.31526],[41.55194,14.32079],[41.55418,14.32291],[41.55305,14.3322],[41.55525,14.33895],[41.55941,14.34219],[41.56101,14.3714],[41.56383,14.3717],[41.55288,14.36973],[41.55368,14.3659],[41.54767,14.36534]],[[41.4331,14.61748],[41.42418,14.62113],[41.41687,14.61804],[41.40716,14.61882],[41.41888,14.6332],[41.42815,14.62495]]],"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$gfr|Fs|ivAqRlCrG{^qIiDbHqa@_MgL`Fay@wLei@_YgS_IquDsP{@lcAhK_D|Vpd@nBzuUgkp@|k@mQtl@hRt{@{CghA{xA}x@pr@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-dellacqua-varianti', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Variante Sant'Angelo in Grotte$q$, $q$Castelpetroso$q$, $q$Sant'Angelo in Grotte$q$, null, null, 10209, pg_temp.dpoly($q$gfr|Fs|ivAh@aAt@~AMjBmEx@eAhBg@_AJ}BiAkAeBI}BrEeB_BDaFlGyWiCmC?sAk@Ua@~DyBqBvAeNvE_KKkFuDgExBLcKmFnB}DsBaGfEkV\uSqCqQkB{CyDwQ_CmBoDkGgDgBgFn@_CuEr@kD]gJeBqIeE{JhBmJ{@mDdBwVDsRaAeDjAi\Q}Cw@WDmIeAsJeBoCgAsGTcErAw@mL~@aAwA|Cc@Gy@yEx@bCxBtQ_BlOd@lC~AlD`G~An@nBk@z@|BxD_DbDD|@l@@nB_F~QrJzEbCGtC{ArHzAnFcB$q$), 'official', null),
    (pid, 2, $q$Variante Sepino$q$, null, null, null, null, 6474, pg_temp.dpoly($q${k{{Fg~exAjDlClDyGlGG~G{DxDItT_KlNZxEzDrHqAvBvCrDtBx@nCrAdAjT}DrLIbBaApCr@jDfEbGMtBk@XsA_AgCmEwAUw@\i@qA[c@cCkGoLoOoGqBcDkFsDmD{FeFyDmCeLoGeNuD|FaBb@kArCcJzDmAUeRzMaMxP$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 2;
end
$do$;