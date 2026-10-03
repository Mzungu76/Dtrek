
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
  values ($q$Cammino di Oropa — Varianti$q$, 'cammino', 45.499725, 7.951754, $q$Piemonte$q$, 'gpx', 'cammino/cammino-di-oropa-varianti', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":57310,"tappeCount":4,"tappeSource":"official","start":{"name":"Santhià","lat":45.363959,"lon":8.179913},"end":{"name":"Santuario di Oropa","lat":45.626047,"lon":7.982363},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":4,"totalKm":42.7,"connected":true,"maxTappaKm":19.6,"namedShare":1,"officialTappe":4,"computedTappe":0,"longTappe":0,"shortTappe":0},"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$wc{sGms|p@mMtd@_k@pJasAbhAkLjkAiJqAlPpEcLrHs@h]kdAc@uJ|QvTrkBY`wApKnG_Thc@yPaHiP~pBjj@~iCC~b@tKnJmKrc@y{@qk@?cZi]o_@_f@qS}mN`{UqKRs_AtbDygDitBeQrAzGo_@qUuk@{d@{S~AeQgKoBaRpk@wMNoBuPad@|N_X_UiHvQwNc[o^uBhXy_AmHwFjQ}Sa]sMun@e}@oFahA{Ni@wKtg@e\uh@oHnPqVsPk|@hoAob@DgN~Xc`@dAsI_QsHhM$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-di-oropa-varianti', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$CO01b Per Ostello Viverone$q$, $q$Santhià$q$, $q$Roppolo$q$, null, null, 19618, pg_temp.dpoly($q$wc{sGms|p@aFdFkFn]iB_A_Bx@DnBgD_@kVrE]fAgA{@aEfAiE`RyE_BiOxJyGjI}D}@_FrQsNbCgP`MwA|VsIls@iJqAtGhHbByArD@kE_AwErJx@~JmBhQiUwGmF|B_UjE_Jb@sEyBuJ|QpKdp@sCxPP|FhCjFN~DdElBfAzOiB`ZExPs@`EhAdDjB`OFnHs@jEpKnGkCrMaDx@cHfLmArEyPaH]hF{BjGt@zIcD\iBlE@`HnARIfAiDrPu@QrE`BcA`FoD|g@~CxFXpCkAfQZjJvAvBtGrV`Ax@lArN`DtPjIjRjAtIhDlCW`F|AtBcF`A|BxKZjInFXdDtIkCl@GnFwAzD_AvKaB`HyG}BqC@_BuFiJcHiCcF}DiDU{A{DiCaEcBgIc@`@oJv@i@uAaEZeC_@aCwRwKaGcGuAqDDaEoEGaDgE{Ko@qMqK$q$), 'official', null),
    (pid, 2, $q$CO02V Variante breve da Torrazzo$q$, $q$Torrazzo$q$, $q$Santuario di Graglia$q$, null, null, 3046, pg_temp.dpoly($q$sputGskpo@uBdIe@jJa@UkE`FcDaB?uAgFvScH`SaGlXmJnQgCvUsHhRaKx_@yA`C}Bu@$q$), 'official', null),
    (pid, 3, $q$CO03V Da Netro a Graglia$q$, $q$Netro$q$, $q$Graglia$q$, null, null, 5608, pg_temp.dpoly($q${t}tGg}mo@t@sEtFeB_D?yGlBkCYYsCbBoDDqDtEqGIgGaDaAwHiOcDa@|@oQ{CuCHaAh@lBqCoCsCe@oCeDoDl@sCwDo@{F{BkDwDLgCtBO_GfBeDF_DeFxA}@_B^Sm@mCuAv@?j@tAcBl@lC_ChAuGhK_AlC]xIqGhCzAbBy@`@AnBwMNq@{IyA{AZ}B_Er@mGzGcD|A_EcADqB$q$), 'official', null),
    (pid, 4, $q$CO04V Variante della tramvia$q$, $q$Santuario di Graglia$q$, $q$Santuario di Oropa$q$, null, null, 14385, pg_temp.dpoly($q$kuauGk`qo@_D|Io@EaArB}Eb@{@cEuCyA{ATeBqC{AIy@uDcCAqBcBeAbAoClLsAdBmHwJw@yG_B}@LyA_AyAeFEoAsDeEYsBzA_Ck@_Gl@`@eCfBiBQwBqAo@lAAzDqGZPF_DvBiD`@iCu@iCxDwFcB@rEsFfAwHCo@iHgEzF_D|CqHjB]dAmDcCoEmFO_@uAmCl@Sq@eF_Ag@cB_CHkKkPgAmGu@l@qAoBeA?wKsU{LuJK}ClAaDc@gEiAqAReGwCuLt@eE@wKd@g@oDSg@}@CqD|@aCaDWuBtBeAeB}Ca@iBjR_Cs@A~MaA`EiBz@oCwDYxCaA[a@oFeDNoCeA}@iDyBkAk@cCEiGwBqI]vFgBhGiDl@wE_@mEeFuBCuEiH{CjD{C~@u@`CwC?iA`E{Dr@yCdJ}GnCwGzMOpDyCvGKjDeDtBsBfFk@S_@aDwA}@mI`BcGlEyJu@c@|@iBLs@`B}@`MgFnE_MkFcAvARxD]t@mFIqDqAuBdAm@_OcE^aB_BsHhM$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 4;
end
$do$;