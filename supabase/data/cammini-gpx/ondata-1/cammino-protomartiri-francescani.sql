
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
  values ($q$Cammino dei Protomartiri Francescani$q$, 'cammino', 42.48406292183478, 12.49489050555363, $q$Umbria$q$, 'gpx', 'cammino/cammino-protomartiri-francescani', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":101382,"tappeCount":6,"tappeSource":"official","start":{"name":"Terni","lat":42.5327011489309,"lon":12.66288431183612},"end":{"name":"Terni","lat":42.56746038793724,"lon":12.65287457362503},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":6,"totalKm":103.7,"connected":true,"maxTappaKm":28.5,"namedShare":1,"officialTappe":6,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$kdrbG_fhlApj@oj@xe@tg@|g@~E{TadApEa~@rHlt@bo@gO}Ide@hWhv@hb@JnPht@ppAjJra@`|AyEbkAnZ~YwC~TdPzR|`Azp@|\gBu@~_@dO_DwPdd@hi@gd@fRxRrLyLb]`o@zo@d@_T|ZnGhEr{@eAzb@sSpWp]uMziAx~A|n@y]xJgE~[g_AjpAyX`EaZs[gl@jU{VgKkPfy@t^ffAiaBtT{GbErNrEmd@ni@sOqMqBxQuS}F_GuOiFzh@sOjMtOfdA}g@`c@nE|UwLjV~J~o@u^{AeGo|@cd@`IcQ}h@zI{]iYkd@cp@fTiSg\eIww@vViUVgSgKaSi~@fZ{\_D}[nh@oo@}BxKtn@_Our@sd@x]t@wNy`AgFo^xLkSyV}NkaAi`@l@_jBnu@yu@`jByLg@_g@cmBkJrRaTmH}Hca@er@qCbLckAcIwt@g{@oe@mc@|IabAmc@iWe`@_EiQbL}RyRgCzHeEgWok@tCuc@rYxy@jm@pGn]sErYmi@xQrEbz@k{@}HtUpJvOhc@jLxe@ueAoKm_AdSbEt[w\p[c}A}FexBpWcDdNua@{ByaAdT{c@tc@jY`ZkG|B~\$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-protomartiri-francescani', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 01$q$, $q$Terni$q$, $q$Stroncone$q$, null, null, 10381, pg_temp.dpoly($q$kdrbG_fhlAV^rAyBbDeNnG~B~BmIvEg@dEwJrHaE`@DiAlBXvB`FlFr@~CzAkFrAhBjDl@B|D~A|EdHpCjF`E~BPf@qArCcAjBaCdElIzDz@zHyB`AvCtB|@q@cFFyE_CgH}E}FR_G_DiGyAkUmAVz@mZw@@pFcPT{Dw@{@OwFLaBzAi@b@rBu@i@Zj@f@i@r@fBQlC\Pu@|EtApRjBjKe@fDzL}AnDmCbGhAhEMRfAdB_AtDLfBcDXr@OqCf@kByArN@tGyB|FaBd@i@vChAs@dF`CKxBhAhGqA`E]|Ip@Pf@zC|C`@fFfEbAfFWvBtE{@zDtBJwBtBe@pAdDrCy@U{CbErCc@eBdFpBhEbMcExG$q$), 'official', null),
    (pid, 2, $q$Tappa 02$q$, $q$Stroncone$q$, $q$Calvi dell'Umbria$q$, null, null, 20874, pg_temp.dpoly($q$wmkbG{kglAv@sAbGS~D`ALz@sAnErBbVdEiAnKbCvFeD~BfGvG}BnCpAbKQnEjCfHkB~HlFvDjVbKrFnEha@bGlPIzClAlDaBxJxB~Bq@|HHjHfAlEYfCdB|@oD~DQbHmDrFPrDnByB`B\r@dK|BbE[jCMaAc@Jt@r@JiExFdG|FjDwC~TfFnE|HjLpH~D~FcBTtBzIhNfHqA|FrQdCIbB}Cp@~@HxCfE|FdClAfD`@zEmGtAf@lI]tCxBkAdAd@`EgD|HvCxMp@xA`BTpJoGmAxFwBxC_@jDyBtBwEnNvEoNrEuFdMuG~CyDx@f@|FY`LhEz@QM|CrClAXpAuCvA~Bj@xGuCxCcHvGdZbPzKnB|BV`CjKmB|IjD~DeBrGxB|Ik@_T|ZnGhE|HgC`HjCx@eBdCzAjCGhOiD~IbC|BQx@mFlFaFxJaBbFdEcAoGdE}@rBd@zGnK~I|FtCbIs@l[wAjO_CzFyEnFqAjE`BhGzAr@`GQpBhGlGvAtAzE|DfF|OkCrJzAxA`ExBv@tRPjHxM$q$), 'official', null),
    (pid, 3, $q$Tappa 03$q$, $q$Calvi dell'Umbria$q$, $q$Narni$q$, null, null, 28531, pg_temp.dpoly($q$urxaGylukAsF_DcVbOuBlIqApQiO|PiGlE_A`DSjJ}DRo@rBwDvCeIbRaGvGqDtBqCqFgGnFqB~@yENsArBsEoGmAa@cBoEsA@qBoEwAa@cAsByBm@eD|@aAjBl@t@{EvCcCmEkCpHaChCyFaBeKfEkN}CoGiFsBrLsKfQjAzCoAfG_@fL~@fCrJtEGdCpC`DN`D|Al@@dM`@zAk@z@@rBfA|B`ClAl@lEtApC@rCeIwA}EaD}F`EsJ\cEfBeG}@wItC_ENuWxN{DDsAhCgEx@pMzC`@v@aHfEkAzF}CnBiAvCcDfAyE~EyEzIqJu@aD{K]~@Z~GoBxFiEqGsFkDwE~DV_AwGuMoFbMf@hCT|Pw@nDmD`EaIrDc@tA`FzLt@lPe@nFhFdRx@fJyFhFyANc@`Bp@`Am@rHgCDe@w@e@|@TzAiADMyAgDyE?dAgAlAOtLq@pCg@s@PgBuGu@u@jBhBhO`B~ABrBy@tE}JtOtEbLnDzNrAzMyAbDaJ`BkIiAcCwBcEBm@_`@yA}NkDyGEyBp@@@t@?u@iQeCiH|HoHhCkDaIeBoIYr@KiAq@Lp@QRfANu@yByCuDiOdFTnCuFs@sLXgI_IaDoAoF}F{CoCqFk@kK{FnAi@lAmF`ChBxAs@jAp@kA_CqAaMTuPhJiSg\{B_KgAcOaC_FbAeGeB{Cj@sBI}CvGkQ|HuD`Dv@cAkOzA{BgDoDMmCqEcIyDz@c@`CqEiAwEbA_CfDoI~CkEi@uEt@oNzIeGyEoG`BsJjFv@wBy@eDo@H_IpLlAdIkFlBkB~CyC~AoBu@YZl@dC}A|A$q$), 'official', null),
    (pid, 4, $q$Tappa 04$q$, $q$Narni$q$, $q$San Gemini$q$, null, null, 19369, pg_temp.dpoly($q$amobG_ikkAgAgC}OlI`AqH]MwLpEnAgFgAc@y@{CsA`AiAlEs@uAoGXjGbVxDhGwCvAr@`G|A]}@dDVd@pBk@u@oBp@~AsBv@n@iEaBVo@wFjC{AoC{D{HoXwA_Cq@BzAvCFzDo@OsG~DsGb@u@i@wQvMoA}BnBcDr@wD]]uDfBmHKaEwAeB^mO{BoMV?eBoIaA}M?aA`BsC^kGrDo@bCkCiDa@wEwEmGkCyCyBn@kGo\s@G{CgX\sC_AwEaMgAqInBuGDyD~@oGzEaLtAiDlEuJfD}InMoFj@}C`BiZrB}JtG_CvGuGt^{CdBo@bFwK|GcDnF}@dEuItPgD~NcBdAuImBwE{UyEoGyBuZyLkMuDo]cBeE_@IKdEm@vAqG~IaTmHiBgVsE{I_MqE{HdFwBcFkBbBoEI_DhCuGeDKaMdFgNR_HrBgCj@eJ_@aKt@iIUgDqBoCg@eF\qPwDiND}B_DY}@iBqFyBgMsC$q$), 'official', null),
    (pid, 5, $q$Tappa 05$q$, $q$San Gemini$q$, $q$Cesi$q$, null, null, 12022, pg_temp.dpoly($q$szacG{lqkAqLsL{BBp@_AuF_ByFiF_OeBsHlHwCNaEdCoA}EqFcGmDKkNmEyFuGuEVm@gAsOkAsB_AqJiKzAwDsBSuBwBgB}BkAyEuA?m@aBlAyLIg@uEE~@mGlCiHtEeAeC{AeDf@mIsAF}@rHgCqHeC@iMgAmIwAaA{BqH{D}BSsLzCyF]uIj@qCx@@lBjKnBgED{AfAjARrErBpAPzDaCEQhA^iArBNvAf\zFnGlJlDpKn@vJFzAsClA|BhD`AfJW~BmAtHBpDqBm@eLdHExNwNdAaBZgIrJfFdFSf@sAM}CrBDxGyCh@qBbEeClQ_Rn@kIpF`@dFeH$q$), 'official', null),
    (pid, 6, $q$Tappa 06$q$, $q$Cesi$q$, $q$Terni$q$, null, null, 12488, pg_temp.dpoly($q$_dacGqcykAzBcBg@pDuGbPvE{AlBtDjAZkAjBj@tHrB|BvAe@pBr@bB_@~AsBrJbErGnFbK}ZlVm_@fBiIBqQm@{FuBsGAqCkEsEsAwEBkBd@B\qBm@{@VwAdSbEj@_CvTyPpD}FwEaEHs@nEsI[g@j@sBnNm`@nKod@b@}LgBuUDe_@wCsSBqWk@eFlOqEbGl@`AyC{AuBpGiHhC}KbB}B_@i@tAmKf@aMaDaTb@mN{AoAxHkHpAGuABvFgMEwB|BkHdKx@xFpBnFdKdHxGbGsF|QW|F~W_C~C$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 6;
end
$do$;