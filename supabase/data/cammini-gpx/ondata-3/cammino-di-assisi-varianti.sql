
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
  values ($q$Cammino di Assisi — Varianti$q$, 'cammino', 43.427837351, 12.47207067, $q$Italia$q$, 'gpx', 'cammino/cammino-di-assisi-varianti', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":160357,"tappeCount":7,"tappeSource":"official","start":{"name":"Rocca San Casciano","lat":44.05122756958008,"lon":11.839420795440674},"end":{"name":"Assisi","lat":43.08042908,"lon":12.61452961},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":7,"totalKm":60.7,"connected":true,"maxTappaKm":35.5,"namedShare":1,"officialTappe":7,"computedTappe":0,"longTappe":1,"shortTappe":2},"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$ewzkGkkggArh@}]zObHJ`]nyx@a|PvL}e@l[x@fl@u^vShQ_KpPvG`U`d@vJ`}\ytj@sS{{@{X}g@{HbDsHws@}VrH~CmS{Ng\kB|WuKqA?}WcNqKvy^uzv@~m@dx@baA_Wbl@lPpQuCjgAq`Bxp@ckBgVoXjcFyvNhXhYdhErKxbAe]ddAjVtb@qNbdApn@jIzX`y@_y@vThQzd@_A`Fmf@tOiLtc@tn@hc@qhA~RzEvKiPaEld@xKoPnPtVbh@}JoDp_@b_@~N~`@bCt@sjAfThW}@jo@|v@mk@jHjLwF|l@`ZyJhVwg@`Xzr@~Qa^cKkk@fQuX}P{MfBkb@vSse@dj@nf@tiAv\zTep@r~Ao{AzT~@rFmZflJt^$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
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