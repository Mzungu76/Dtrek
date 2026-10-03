
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
  values ($q$Cammino di Oropa — Varianti$q$, 'cammino', 45.499725, 7.951754, $q$Piemonte$q$, $q$https://www.camminodioropa.it/$q$, 'gpx', 'cammino/cammino-di-oropa-varianti', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":57310,"tappeCount":4,"tappeSource":"official","start":{"name":"Santhià","lat":45.363959,"lon":8.179913},"end":{"name":"Santuario di Oropa","lat":45.626047,"lon":7.982363},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":4,"totalKm":42.7,"connected":true,"maxTappaKm":19.6,"namedShare":1,"officialTappe":4,"computedTappe":0,"longTappe":0,"shortTappe":0},"overviewParts":[[[45.36396,8.17991],[45.36627,8.17388],[45.37331,8.17203],[45.38676,8.16033],[45.3889,8.14811],[45.39071,8.14852],[45.38792,8.14747],[45.39002,8.14593],[45.39028,8.14108],[45.40138,8.14126],[45.40325,8.13823],[45.39977,8.12085],[45.3999,8.10676],[45.39789,8.1054],[45.40125,8.09959],[45.4041,8.10104],[45.40687,8.0828],[45.39993,8.06056],[45.39995,8.0548],[45.39792,8.05296],[45.39991,8.0471],[45.40964,8.05423],[45.40964,8.05857],[45.41449,8.06377],[45.42073,8.06706]],[[45.49914,7.95338],[45.5129,7.92391]],[[45.54078,7.94084],[45.53928,7.94241],[45.54219,7.94199],[45.54077,7.94719],[45.54396,7.9503],[45.54365,7.95326],[45.55044,7.95768],[45.55149,7.96143],[45.55497,7.95402],[45.55789,7.95677],[45.56382,7.95422],[45.56782,7.95774],[45.56931,7.95474],[45.57183,7.95924],[45.57687,7.95983],[45.57282,7.9702],[45.57433,7.97144],[45.57139,7.97479],[45.5762,7.97713],[45.58383,7.98708],[45.58503,7.99877],[45.58757,7.99898],[45.58961,7.99247],[45.59428,7.99914],[45.5958,7.99634],[45.59957,7.99916],[45.60939,7.98631],[45.61507,7.98628],[45.61751,7.98212],[45.62281,7.98177],[45.62451,7.98465],[45.62605,7.98236]]],"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$wc{sGms|p@mMtd@_k@pJasAbhAkLjkAiJqAlPpEcLrHs@h]kdAc@uJ|QvTrkBY`wApKnG_Thc@yPaHiP~pBjj@~iCC~b@tKnJmKrc@y{@qk@?cZi]o_@_f@qS}mN`{UqKRs_AtbDygDitBeQrAzGo_@qUuk@{d@{S~AeQgKoBaRpk@wMNoBuPad@|N_X_UiHvQwNc[o^uBhXy_AmHwFjQ}Sa]sMun@e}@oFahA{Ni@wKtg@e\uh@oHnPqVsPk|@hoAob@DgN~Xc`@dAsI_QsHhM$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
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