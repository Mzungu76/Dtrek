
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
  values ($q$Cammino di Assisi — Varianti$q$, 'cammino', 43.427837351, 12.47207067, $q$Italia$q$, $q$https://www.camminodiassisi.it/$q$, 'gpx', 'cammino/cammino-di-assisi-varianti', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":160357,"tappeCount":7,"tappeSource":"official","start":{"name":"Rocca San Casciano","lat":44.05122756958008,"lon":11.839420795440674},"end":{"name":"Assisi","lat":43.08042908,"lon":12.61452961},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":7,"totalKm":60.7,"connected":true,"maxTappaKm":35.5,"namedShare":1,"officialTappe":7,"computedTappe":0,"longTappe":1,"shortTappe":2},"overviewParts":[[[44.05123,11.83942],[44.04457,11.84437],[44.04187,11.84291],[44.04279,11.83811]],[[43.74565,11.92786],[43.7441,11.9355],[43.73898,11.93573],[43.73174,11.9408],[43.72842,11.93787],[43.73034,11.93506],[43.72894,11.93153],[43.72301,11.92965]],[[43.57357,12.14707],[43.56972,12.1533],[43.56998,12.15758],[43.57716,12.16959],[43.57874,12.16877],[43.58028,12.17721],[43.58411,12.17567],[43.58331,12.17894],[43.58585,12.18362],[43.58639,12.17963],[43.58842,12.18004],[43.58842,12.18403],[43.59084,12.18604]],[[43.42791,12.47183],[43.42032,12.46292],[43.40974,12.46676],[43.39955,12.46472],[43.38797,12.48033],[43.38,12.49763],[43.38372,12.50171]],[[43.35059,12.5764],[43.34718,12.58232],[43.34313,12.57811],[43.31094,12.57609],[43.30009,12.58092],[43.28902,12.57718],[43.28331,12.57967],[43.27225,12.57206],[43.27059,12.56792],[43.2613,12.5772],[43.25782,12.57427],[43.25176,12.57459],[43.25063,12.5809],[43.24796,12.58303],[43.24209,12.5754],[43.23628,12.58717],[43.23308,12.58607],[43.23104,12.58884],[43.23201,12.58285],[43.22996,12.58565],[43.22716,12.58186],[43.22058,12.58377],[43.22146,12.57856],[43.21632,12.576],[43.21088,12.57534],[43.21061,12.58744],[43.20721,12.58355],[43.20752,12.57581],[43.19857,12.58292],[43.19707,12.58078],[43.19831,12.57343],[43.19398,12.57532],[43.19025,12.58184],[43.18624,12.57354],[43.1832,12.57851],[43.18514,12.58561],[43.18222,12.58972],[43.18509,12.5921],[43.18457,12.59776],[43.18125,12.60394],[43.17434,12.59762],[43.16239,12.59286],[43.15889,12.60073]],[[43.14545,12.61384],[43.14009,12.61521],[43.13887,12.6196],[43.1257,12.61959],[43.12682,12.61854],[43.12229,12.61646]],[[43.07983,12.6124],[43.08043,12.61453]]],"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$ewzkGkkggArh@}]zObHJ`]nyx@a|PvL}e@l[x@fl@u^vShQ_KpPvG`U`d@vJ`}\ytj@sS{{@{X}g@{HbDsHws@}VrH~CmS{Ng\kB|WuKqA?}WcNqKvy^uzv@~m@dx@baA_Wbl@lPpQuCjgAq`Bxp@ckBgVoXjcFyvNhXhYdhErKxbAe]ddAjVtb@qNbdApn@jIzX`y@_y@vThQzd@_A`Fmf@tOiLtc@tn@hc@qhA~RzEvKiPaEld@xKoPnPtVbh@}JoDp_@b_@~N~`@bCt@sjAfThW}@jo@|v@mk@jHjLwF|l@`ZyJhVwg@`Xzr@~Qa^cKkk@fQuX}P{MfBkb@vSse@dj@nf@tiAv\zTep@r~Ao{AzT~@rFmZflJt^$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-di-assisi-varianti', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Variante del guado$q$, $q$Rocca San Casciano$q$, $q$Premilcuore$q$, null, null, 2263, pg_temp.dpoly($q$ewzkGkkggAfFM~AlAX_@gB{F\_Er@tEnCT|BkDt@uE|BuClCaB`Fe@tDmCrFnJpCYdBwAn@d@wAnML`BdAsArArLcAn@cCuA_ArA$q$), 'official', null),
    (pid, 2, $q$Variante al sentiero 53$q$, $q$Biforco$q$, $q$Caprese Michelangelo$q$, null, null, 4531, pg_temp.dpoly($q$ia_jGctxgAOaKl@cGbDoVrBaCpBgBhNHrAsApE`C|B@xByKpF[fLuGrA?pFnExBiGrEoFr@~AyAtCl@v@xEqDjCl@^`Ay@bF|@|A|BkCfCfDkDzKyACyBxC`CnHlAd@fAjJxBLnAjBlIqE~HfIhIfC$q$), 'official', null),
    (pid, 3, $q$Variante pioggia$q$, $q$Sansepolcro$q$, $q$Città di Castello$q$, null, null, 6112, pg_temp.dpoly($q$ym}hGenciAlHgTlHeMdDoBs@wYoOuUoAmJqEmEeJaF_FyIeAcF`@oHoCtFkDqAaBqHbAmQq@cHmBkBuBgKeDcAeB~@iBdGp@~ASxAkEgCyE?~CmSyAgG_DaAcAqG}DkIa@k@_ATM`An@xKk@vIw@bAeDgCwDMeBqJ|BuHWuBcNqK$q$), 'official', null),
    (pid, 4, $q$Variante Pietralunga → Gubbio$q$, $q$Pietralunga$q$, $q$Gubbio$q$, null, null, 8440, pg_temp.dpoly($q$m_ahG}{bkALo@x@\tDhDbFhLdFfEvGKj@h@oA~QxBX|BzDxHvCvGA~DwDvIxAnByIlElAjC}ChYuFrMf@rFrAzUpLrFaCjFeIL~FbBp@|@gEhL}I\cEoAwEfCtBdBGEyDvPyOZ_LdC]hHwGhRsXrCeJjBkMdHaPjCcWxBaAlWif@?aAoG{EwMqO$q$), 'official', null),
    (pid, 5, $q$Gubbio → Valfabbrica (diretta)$q$, $q$Gubbio$q$, $q$Valfabbrica$q$, null, null, 35468, pg_temp.dpoly($q$e|qgGoiwkA|@eHnGiEzIoTfOhHtGrKJjCdhErKzLSnSoNbIuBtAZ~A{AdKxAlDeJjDnJrAd@n@sFjEfDzReAl`@fNrRcI`OmDpNxMpB~ErM`CbJvHfFbApG`FlGvA~BzDN`KzD|FhAuD`CMbCyAlA}FjBsAt@uBZyE`DwFlV{GjEsChCwEnGlEtAhE|D]rCnEvDqA~G|@pH{ApIzA~Ak@pAkFgBaLxA_CdEs@LcFu@gEnH}AtBl@MgCqBqAt@e@vCl@WkBx@{@`DpAvF`GxEdNfGnLxB`D~ChBnGiJbBuGtIkNnGgTtGwEYm@iBr@\kI~BNtBkCbI~@LnEv@fAb@gDzEiBvCwGoCpP~@jEqCxI^tAxKoP?jDvAr@fGg@KzHrBlEfBr@hMuC|EfCzBKhE_BdDiEnCy@d@tC}A`AHjEcCnG@|Ir@PlEoG|AlGtAk@|Ax@bA`C|Dp@OtD`BOzCfCtJrAlL|DtDQdB{B`@kF{@}EhAcMyAeGx@uCDkFoCmNFqDfD}DjFbFmB|DpAzEdIf@pCbBGzJ_AlAO`EoBnBn@dDoBvExCxAn@vHpAaC|Cw@nBoBBeBtAsAxCFrAsAlEOxCmCzEIv@oCrAkA`B_HbHyDO~ClAdDhD[bA`CkCzDbAjDObFgErC`BlDUhIq@dAL~CxAVnG_ETyB`NwA~BqGfHoIW{OxIyC]rJz@FTwDtG`A\hAS`GdDvCpBpRtD~GdGeDAiMlAeAlEL~@yHwGwBb@aIeCqJIuEl@iEm@_ExAqDzMuKPmFwCc@eLwLrBwORqI_@aGtEmLxGkKfDyKxFBzM|MMjBjBf@vDhGdEnArD~GbGI|S~BdGvIlIdBbFe@jBzAzA{@rLhK|GeRtBqOpCsCtCyG$q$), 'official', null),
    (pid, 6, $q$Variante 1 Valfabbrica → Assisi$q$, $q$Valfabbrica$q$, $q$Assisi$q$, null, null, 3706, pg_temp.dpoly($q$azifGos~kAxGsDxA}CpChAf@uBdAU|BGpChAjAfB~Ag@qB\hHkEqAaAg@mGiAgCtBgDhC_AxARUrA^V~Dp@~NkGbIvBvEe@jOzGhLaErIoA_FpErBbB~Fp@nAnAdMxD$q$), 'official', null),
    (pid, 7, $q$Variante 2 Valfabbrica → Assisi$q$, $q$Valfabbrica$q$, $q$Assisi$q$, null, null, 206, pg_temp.dpoly($q$}_}eGoj~kANiDgC_G$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 7;
end
$do$;