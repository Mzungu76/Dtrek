
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
  values ($q$Alta Via delle Grazie — Varianti$q$, 'cammino', 45.716750621795654, 10.094997882843018, $q$Lombardia$q$, 'gpx', 'cammino/alta-via-delle-grazie-varianti', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":50686,"tappeCount":2,"tappeSource":"official","start":{"name":"Santuario del Frassino","lat":45.8712044544518,"lon":9.80380218476057},"end":{"name":"Peschiera Maraglio","lat":45.69518566131592,"lon":10.093860626220703},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":2,"totalKm":28.1,"connected":true,"maxTappaKm":17.7,"namedShare":1,"officialTappe":2,"computedTappe":0,"longTappe":0,"shortTappe":0},"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$_f~vGwxyz@_m@xg@_Qth@sZ}j@_`@sO}Oyv@d_BsgAxDjRxJiDlNy]eFoK`XTlCsx@~JdB``@mq@iH_{A}TmG`Hct@mUwAxAei@{WoRyg@n`@nY{}Af~]usg@`T|v@lVq_@nTzVQaLve@lAae@n^xYbWcJfa@lRzFwBjKiLaKjOrZ`KcK`Cyz@j^ew@iLaZ$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/alta-via-delle-grazie-varianti', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Variante tappa 4$q$, $q$Santuario del Frassino$q$, $q$Parre$q$, null, null, 17730, pg_temp.dpoly($q$_f~vGwxyz@e@nB}G`HoCALfB{@`A_D@oD`Ei@~ByF~DiBrC_FfAkDjVz@`DuDg@sAxJ_EsHl@rFs@tCmFqFgBeFaGqD_EyJi@}Gq@{A{HeAcVmMw@eE|AiEDgFuDu@eDcEaBkOkAyA_AaHn@}BUiCjIw@ZcD`C{DxDb@dFyJdFgCv@wDpEIl@qCdFrA`CsBrHIrBoAvHZlGcHr@aDxD}GZMQfBdBzCHhE~@jDfHyApAoAhBsB`AoJbBwBqB{EnIaDeFoKdLNjDlAnEgAlBwh@|A{H}@_EfAUtEbD`Bg@nAcBt@{FfDGxCqGrAaPlDYtAt@n@oFpE}EYoBoBoAd@mIv@gBK{FxAeBsBgIPqF{BgCeBYmCuDjB_DXuZeGgGwFSsCdBk@wAlBgE^yE|@iBc@cEt@eCnB{Af@oCsAaRoLyEaAfA{Ex@dCmMnC}Eo@aCd@yB[e@qGx@jBwCNyGwDkB_D~@oCmG|@_BDoBgEd@oDkC{A`DmFfBgGxI}DpBkDdEoDxBmDXdRid@yC{ShFqGCgEjCcM]gCn@oB|FaFtCf@n@yB$q$), 'official', null),
    (pid, 2, $q$Monte Isola: Carzano → Peschiera Maraglio$q$, $q$Carzano$q$, $q$Peschiera Maraglio$q$, null, null, 10398, pg_temp.dpoly($q$eb`vG{xr|@n@bCr@Hk@fCxA|D_AxC?zBxCsDpE}AmEvKCrHpAzDw@jBPv@bFmAfAj@z@jB{@`Fh@YbBjB~B_CUqC`AqApEr@d@k@L{Bo@yCnFeIzByA|DvDfAhEvE|GpEzA}B}FX_CpAc@zGdClEQU_AxAa@fA`@lCm@vE~BjCoBnBv@yArIyA`BuUdGaHNEfB`AvBqAbANfBhCFqCpAjDfAhCbDzOtIeCjGoAt@CzCs@jA`@bBuCXxAzD{@bFbAjAtAw@tCjBr@eB~@\bDnJIoDn@Bn@|DgDlEw@kD}F_FsBH|HjWlEfBxHkDfAwEn@cNsBeIGiGtA{MvBiJdDaH|Q_XfFcUl@yIgAyDa@{@oDa@}DoF$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 2;
end
$do$;