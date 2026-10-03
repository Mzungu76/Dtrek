
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
  insert into dtrek_places (name, meta_type, latitude, longitude, region, official_url, source, source_id, confidence, metadata)
  values ($q$Cammino dell'Acqua$q$, 'cammino', 41.464338, 14.501966, $q$Molise$q$, $q$https://www.camminodellacqua.org/$q$, 'gpx', 'cammino/cammino-dellacqua', 0.75,
    $q${"kind":"cammino","theme":"naturalistico","lengthM":59943,"tappeCount":3,"tappeSource":"official","start":{"name":"Castelpetroso","lat":41.549848,"lon":14.310022},"end":{"name":"Cercemaggiore","lat":41.456359,"lon":14.707965},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":3,"totalKm":61.1,"connected":true,"maxTappaKm":26.2,"namedShare":1,"officialTappe":0,"computedTappe":3,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$qer|Fs|ivAz@ybAt~@{sBgp@jD}BePfXme@}b@wx@oHwp@zSgCcEaPzMsj@dXgLdO}l@qDma@jk@xP~A|k@nUtJjRwT~Cof@h_@eL_HuMzJgqAzk@ueA~bAVvSp_@za@pHyb@me@cVmuBngAwcB`Pew@~ZiUtXkwALk_Az[okAvOk_@no@xVff@n|@_A}e@jk@lTnSeqAdp@yXpHe]{JkAg@qiBdOan@~RjAwD_T_g@grAaZsVaq@~@_Ee~@~}@qwCzXqVxQiy@l~@g`B{gAucAuaA}a@s\dQuGyHhWm}Aij@{WlIgSuF{n@l]sfAjFw~@cPsd@{Ag~@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-dellacqua', 'gpx', 0.75, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 1$q$, $q$Castelpetroso$q$, $q$Cantalupo nel Sannio$q$, null, 'e65a8341-8004-4616-b0ef-86f1bed96dde'::uuid, 13981, pg_temp.dpoly($q$qer|Fs|ivA`CmJi@kLdA_G}@uFcBqDp@oF[{ElA_Ec@k@bLg`@jTcd@nT_YxD_Iz@oIqAw@qEIcg@lFCoBaCaHFsCzBgDrC}KzIwLvCoBb@_Bk@qDmEgGy@}EyFgE_@eF_DcFo@kE_JaIYiNgBeHSqIyCuM|CgBhBJxAtAzBI|DwB?eDuDqGMiBfGq[rB_E~AaHbAHtAqBrD`BlAM`DgBrA_HrCKlDgQh@uLvEuFtAiEc@sJ{AaBG}FmAsFb@eCfFgClDrEhRjCjK`JrAxEkAvOvAjTrHdBdBw@tDtF~BpAbDwCnFi@G_ChBsBRgC`ByBeDmPxC_EhAyH`BgEvCiBhEiGvBy@jCzIhBfBzAkI|EoBJiAeA}BwEgDMeB$q$), 'computed', true),
    (pid, 2, $q$Tappa 2$q$, $q$Cantalupo nel Sannio$q$, $q$Campochiaro$q$, 'e65a8341-8004-4616-b0ef-86f1bed96dde'::uuid, '5382c925-3f68-491d-a018-451fa7eeffbf'::uuid, 20933, pg_temp.dpoly($q$kvl|Fi`zvA`EjAgBoEGeCxCeN{AoH?{EjBcIeAcB~Aw@h@kGfB_Gk@_JvIsHrFoPdM_OxHgQnAiH`EzCz@_BrW{GnFvDnJnDvCvCtJgGrF~QzCIbEjCbAnHv^tEbBzAZuDgBUkBmCiAkGaCgF_EoBqKgAcDgEt@oD_B}HO}Gk@qAuAHOyGcAs@WaFcIoVeCuMg@wUt@kLdIwV`DoGzC}BhQi`@pLaJ`KuMlGoD~@cCpA{TmAc@?s@pEgCjGeVn@]bC~@hDoH`P{LfBgPKsJdAaGo@eBxCmMtAl@fA}DtAqNtHwLmA}Hj@eHkC{JdBaFtAiYvGwPb@wEpAyBfDaXhANzGsVhIaK^eFlDcL`IdFnIc@rFbFnKfDxFjD|CpEnBxH~EjCh@`CUxCj@RlBgB`@~Bt@eCZxD~AvBhAbIlH~MLcBaBeIXkFi@qEb@uJpOpLnAqAbBrBnAkC`D]~CnKjCeDfDxCt@{@tD{Je@k[NcDlCqAs@uIdAi@d@gDrFcNr@`@rAcB$q$), 'computed', true),
    (pid, 3, $q$Tappa 3$q$, $q$Campochiaro$q$, $q$Cercemaggiore$q$, '5382c925-3f68-491d-a018-451fa7eeffbf'::uuid, null, 26179, pg_temp.dpoly($q$wd~{FqtpwA~HqCvBqG`Aw@|FXrDmCxBKzFoEzBr@fByDfAwK`CsJQaBq@OwHd@j@yJ_AoG~AKhBqEyDk@iB_BbA{FgAuEWoGpAsFpAaOaAe[~@w@xCrAfAO]sIh@_JlCyJCqElAmFlCy@vBhBl@WeAjAXVjFiBjCx@wDo@r@u@s@yPkE]oAwFqHgNVkEcBiCwBcA{HmSqDaYkCk@kIiGkEi@}DsK{FbAi@uBwCj@uDeCyJx@q@|@uJBkDnAoA}D_CmSx@mWk@uC@uFxDcQ`Eo^pEsH~CuBt@uGlBuF|AY|G}LzGeRdBeBC{AlAuDjIwLeAyLhMeVdDg@nAuAzBpBZeCk@aB~FsNfGsHM}NnB{HhFoG`DiLnHeKdT}_@|CuClNsXgIoLoNwF_GaFoCq@oWw^cIaFae@kLqOiImCPsFyJsJ|I}K`BaDdCuB_DgANwAiDfB}EaBoJxA_NrH}Kh@}BFwHdF{USgEpBgDqDyCaYmK]wBb@_BmAeAeEt@o@z@w@gAxA{@dBcElCgKeEmTkBmC@uGt@k@A{BbDzDZ`CEkLw@yAcBDW_AhB}CnBwRfHcOi@oEpG_HbFiNTwD_Bq`@j@gCtBwBSeJfDgDw@cEoDuE{HyWQkHcAoDuAcOA}Iv@aJa@yFz@mA$q$), 'computed', false)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 3;
end
$do$;