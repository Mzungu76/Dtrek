
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
  values ($q$Cammino di Oropa$q$, 'cammino', $q$Itinerario piemontese verso il Santuario di Oropa, tra Biellese, montagne, borghi, santuari e paesaggi alpini.$q$, 45.499151, 7.953689, $q$Piemonte$q$, $q$https://www.camminodioropa.it/$q$, 'gpx', 'cammino/cammino-di-oropa', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":63352,"tappeCount":4,"tappeSource":"official","start":{"name":"Santhià","lat":45.363959,"lon":8.179913},"end":{"name":"Santuario di Oropa","lat":45.626018,"lon":7.982387},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":4,"totalKm":64.7,"connected":true,"maxTappaKm":17.6,"namedShare":1,"officialTappe":4,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$wc{sGms|p@mMtd@qj@~IosAthAkLjkAiJqAlPpEcLrHs@h]kdAc@uJ|Qb\xzEsOtTyPaHsMn~@iTnVa_AjJ}W`ZhWxiAqgAlbBu`AdBimBb~F_a@RxF`VbLuBwCv_@}xAlzDyyB~mCaa@_z@_Gww@zGeDig@tzArUjMuYfo@uUncCoeArlBmGwZqZrS_i@w`@nHoRwPmF}Omy@sQiF`QeqAu[fGg{Aab@kOgt@|HgPsO~L_X_UiHvQwNc[o^uBhXy_AmHwFjQ}Sa]sMun@e}@oFahA{Ni@cRlf@um@cfAqKXcz@jtAmGuIuh@fo@us@rJ$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, description = coalesce(excluded.description, dtrek_places.description), official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-di-oropa', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 01$q$, $q$Santhià$q$, $q$Roppolo$q$, null, null, 16465, pg_temp.dpoly($q$wc{sGms|p@aFdFkFn]iB_A_Bx@DnBgD_@kVrE]fAgA{@sDt@wErRyE_BiOxJyGjI}D}@_FrQsNbCgP`MwA|VsIls@iJqAtGhHbByArD@kE_AwErJx@~JmBhQiUwGmF|B_UjE_Jb@sEyBuJ|QpKdp@sCxPP|FhCjFN~DdElBfAzOiB`ZExPs@`EhAdDjB`OFnHs@jEpKnGkCrMaDx@cHfLmArEyPaH]hF{BjGt@zIcD\iBlE@`HnARsDzRcCk@ePzW_E`BqCiE}FyBwFrDqGXeJxM{FyAeI?}E~Fb@|BqCCqHpL_Dt@i@rVtBfC`AbIjB~APpIf@Mn@rBn@uDw@mCg@gJ|AEfD|CNnBw@pEhA`A}@jK`ElBh@vG$q$), 'official', null),
    (pid, 2, $q$Tappa 02$q$, $q$Roppolo$q$, $q$Sala Biellese$q$, null, null, 17585, pg_temp.dpoly($q$icftGe~fp@cArEgEqCm@dCLlCgAzCwEdEeA`C}D`BhAfFy@|BcEzByAyDyAMuBdNHhEyCPaCoA_AjGeEhKoHdJyCfIaElEgGsByH|HcHoEaDUaCsD}JaAoAvA{CO{@xAcAFwDrIy@xKuCtH]~FiGdDaBvJiAh@cAnHaLtR]f@iBiBqArKu@nCgBhA}FhZsDrBmEpKmCxQuBnFuCnXqI|KiAq@_E|KyCp\cBfBmFn@s@GuBeEqG_@qHhBzB`N|B~F|ATdIkCoAhEzCr@aGnGdAD{@dB`AtCm@fGuIpSkC~JsBpCak@btA_D`Od@fA_FvOkErH_InSuDj@uCeCiMfWqKxOuFhLcF~EqLdRaB`G{JbOwUvVqAxC_Cn@}ClE_GpCkB_CeD`@wDiPqFwGg@_FiD}Ks@gH_CYf@iKoAsCm@{OaAoGaAqAe@{JxAiC`E[$q$), 'official', null),
    (pid, 3, $q$Tappa 03$q$, $q$Sala Biellese$q$, $q$Santuario di Graglia$q$, null, null, 15773, pg_temp.dpoly($q$olvtGamso@uQ`s@qBrCs@`LoFvOWdD~ChAfI^zAdB|C{DHpGqEdLsC~@w@fER~AgGpJcEfKk@rUn@nJmAhHy@Xu@bDt@rDi@lPkFtP{AxO_FpX{FuAuGj_@qKfIwBzD_F`QWfIkApD{@dAsFa@kFlCwFjS{A~BiDgCw@yBk@uRgAVoBnFyGnH_LzAyBoEsEfAwJc@aCoMaBlA[yBaD}@j@aASsAoF{DnHgH\qC]uDkC{CkLqA?oFcA_EVwBa@cBgBgBe@uB{JuJj@gGcBsC@gAnBiCwBj@kB}CoJwBdAuHhEaDkBmCbAyFw@eEsAs@tA_FAeFrIyQ\qC|BeCqC_@r@sC_Fn@gJfEmINkAmAoGyA_IsLuGoBmVsCcImD_ALPdAaAvAmCOkAkAmBaG{C{@aEvEmC}@g@eBn@eEm@yDoAiBc@aGaFgHoCmPv@iFzAMzAoHlA?$q$), 'official', null),
    (pid, 4, $q$Tappa 04$q$, $q$Santuario di Graglia$q$, $q$Santuario di Oropa$q$, null, null, 14876, pg_temp.dpoly($q$kuauGk`qo@_D|Io@EaArB}Eb@{@cEuCyA{ATeBqC{AIy@uDcCAqBcBeAbAoClLsAdBmHwJw@yG_B}@LyA_AyAeFEoAsDeEYsBzA_Ck@_Gl@`@eCfBiBQwBqAo@lAAzDqGZPF_DvBiD`@iCu@iCxDwFcB@rEsFfAwHCo@iHgEzF_D|CqHjB]dAmDcCoEmFO_@uAmCl@Sq@eF_Ag@cB_CHkKkPgAmGu@l@qAoBeA?wKsU{LuJK}ClAaDc@gEiAqAReGwCuLt@eE@wKd@g@oDSg@}@CqD|@aCaDWuBtBeAeB}Ca@iBjR_Cs@L|JqAbHiBz@oCwDYxCa@IaAaGeDNoCeA}@iDyBkAk@cCEiGwBqIqMsC_AgBWcIcCyCJcByAwCq@vA}Eh@aCgB{BrD^rEmDnDe@^yBsCsChBy@hOgFSwEnIqDJkA`ASvE{ArF}CbEBrAoDjGAvBqB`CeBDKmH{Cm@uBfCgAzECfDuCrEuFTsA}@aHvBsBvH}BpB_ClHqBD_JuG{ChFoAmAoDrGGuBo@hBQq@uB`Ae@iEqDv@mB}AaH~L$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 4;
end
$do$;