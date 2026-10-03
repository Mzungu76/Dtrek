
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
  values ($q$Cammino dei Picentini$q$, 'cammino', 40.7257596961575, 15.040767255909, $q$Campania$q$, 'gpx', 'cammino/cammino-dei-picentini', 0.9,
    $q${"kind":"cammino","theme":"naturalistico","lengthM":102498,"tappeCount":7,"tappeSource":"official","start":{"name":null,"lat":40.7038827538697,"lon":14.834289432384},"end":{"name":null,"lat":40.7038827538697,"lon":14.834289432384},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":7,"totalKm":104.4,"connected":true,"maxTappaKm":21.5,"namedShare":0,"officialTappe":7,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$g~lwFiipyAeNrf@gVa@zKoXi`AjRwr@kMqKurAdT}O`a@b^l\sa@s\ecBfBsr@e]lCmC_mA}TcH[mb@me@XNk\sVa[og@{H_`@lBkS|^gg@oGyc@hSaEcPrd@og@{L{QzXoRiHi]gbBeFgUoKb@kQqUll@xVc~@eDciApTemAqGaWxM_aC|M_^sEiNlh@os@uBu`@rQpJbXm}A_k@xE}[qTem@ynApC_m@hYtc@rpBjUrXtRhL~i@hIaLtFhLeIeiCnVyqAwPkh@lqA{a@~Qpz@dj@zk@lf@{LlT|UdeAhQbMhr@}Fn`Az~@jiDjOsRnZr\~q@ydAbCiXqVqFzIgyAt`@e^{D_VzSyYgLGySmt@iY}FtZiHd`@f^p`ApUrn@f_AdRkCjZjXvBl[wKuOcGxc@bu@~vCyf@dzApd@xa@_]j_AaxAkv@m[Zk_@fd@j_@|MeOpp@}SvVal@oAfLxOwUjDtUf|AgDj}@p}@j|An]`FnOrf@{ElRxX`ItWv`BuLvQof@cL_\rI{NrZcn@cYsS`U|P~I_HvUgN|A_Tnj@}S_Ek_@dRoQnc@kNqEuLrgAy^l^$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-dei-picentini', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 01$q$, null, null, null, null, 10282, pg_temp.dpoly($q$g~lwFiipyAaD`CCdIuAhLiF`KyKsBiHvBc@e@\k@q@K|A_A}@}@|@i@}B[dAk@aB[z@e@q@a@|BNhDcC`EyFGu@sRhBgHtByJHsAbC_Dh@aEpC}I`A}FkA{SYaMhAmBeBmDiIsAsJc@uSqEyI_EoO`C_JcAkEx@uExHcEjJyIzDnGdMnGzFfIbEzB`AyAnBoJfIcOrLeCoEsD_AgGcDuG\y@bJdEm@oEcBsC`AaAAeAqBiCgEmPqCyS{BsGw@eGoDgF`BcD|@wHw@eL?qVwEQk@r@JjB$q$), 'official', null),
    (pid, 2, $q$Tappa 02$q$, null, null, null, null, 11981, pg_temp.dpoly($q${fpwFwrwyA{CzBqP{BuCkN^eKbC{GT}Cc@_GyCuLJ}McBmC}GI{HkC@qEyCyIhCeKM{DcDFqFbG_FqAaIPuGqD_@}E}C{GbE}C`@kCWgCcKuGkCaJcFiGmXuEyDh@eElCaB}GeQ_@yMlCYhIuGiBkBhD_CCu@lEXdCsAbHmEwDmGg@oA|B{E`A}C}@{@oBeHaAcBxBO`EsC\kEoCoHxBwBnJ_B}@}DRiBgCwA{KzC}AzCgGzKuJzBwHbJ{FwBgB}BhCsAuCoCiAgA_CdB}GxHmHnDPlBiH|@L~@zBdBsDuAgHi@uJiDkHcFmBaGhDyH@mCt@}A_HyBs@$q$), 'official', null),
    (pid, 3, $q$Tappa 03$q$, null, null, null, null, 11663, pg_temp.dpoly($q$_cywF}e`zAqC_@cKjA}EuEqAG}BtAgAaBmBc@uLhGqLm@yBgA}CcEiJ{@eAgA`A}N]mAgBlEW~EcHdE_C~T{AfBqAPnCeEXyDy@oEp@wIjEqGdBwRtAaHxBpBtAAgE{LdByRkCoInDkDgB{Ef@sGg@aHzAiGzA}AAcHhDeFlByMn@}Js@uG`@cEvCyCl@gCqGaWxDuSa@gEvG}Q@ab@xAiQqBgFE}C`@{DzDeDsAkAcAcDjLoTp@oHsB\q@_Ak@{CAkHzEsF`MkGf@kFjB_Ef@cIzBi@LyAvADFaDhABlAcCpA?_GmKvAuGC_Et@qE|AgA\`BfFjFfBcCn@zCs@lA$q$), 'official', null),
    (pid, 4, $q$Tappa 04$q$, null, null, null, null, 16584, pg_temp.dpoly($q$_cywFebozAjCDYuCb@gE`HwHtFuNEcDg@SEaCk@w@rAkAmA{C|AwDkB}DNqFhDqCl@^i@gDjAkBuA}BtD{BsDcDoV|I{M^qGoL}LuBmEkCm@eEaCeEOsDiCgAuBgMcEqBe@kEcB}BuL{I_EqQaA_AE{I~@yAo@iC|BiDiB{CjB_Bs@uBz@cJ~@jBpBLzApGxCTj@~FzDCfCnCv@pDEtDzCFjAvAvHz@t@~@|FcA`FpAhA|CjCqDfB?zEtBdBzF`EhAxA_@fB`Bv@iD`C{@xDpAbKLhAnCxA_CrB?bClAE~BzDkBnDJjBhGnA`@CvDzE_BlH~GpBm@|@~FMpH`DtCsAvCh@RFzAdDYb@p@MrD|@bExB}CnAA~BaGdBhGg@|BvAz@~AYtAsDUcDx@eEAcGqDeOaDg\IwEdA_FsAgKeAaA|AeKq@cDGkMo@}FrAkDI{Mt@mErBAlAcAMqIgAcFRwB`G_LlFoRE{@{EeCs@gB{GsZEmC|A}A\yBrAi@nVaDxM_@rd@wS$q$), 'official', null),
    (pid, 5, $q$Tappa 05$q$, null, null, null, null, 21548, pg_temp.dpoly($q$eeswFg|{zA~GpMDlLlBt@_AlHjCbG~BhK|KjPfSjHzElMbBtBzCPxCsBnDIlOkGxFcApIrBdGnJtAxFlEcBlL|FtAWxCwDjIx@_AxBGhC|F}EfAf@jCbIpHh@zDnCtCEc@|CfCdEeAnDfErKHvH~CrDr@tEa@rSuBvDY`Ln@lL{BrKrEhKA|HjA`KnFlMlFl^fCdGlDpAvAtPnDjIzCbBdC|HaErEnKz@pB|A{@rM|@bH|AbBv@m@v@kDvH_KbBYpIxGfI|OtEzB~JwNpJcEbD_N|KyHpCoIEwA~C{Hx@sOhAuGcRwFmCDvE}ZVyI_@mCnBcKbBkCAgEgCoHdB_Cc@yI|DsAxG_N~CNbAuHdDYrA_C~BLqAaEnBpA[uF}DyJ|DiNtBaEvCOp@mB|Co@uCe@cBzAmD}@k@cG`AwC_HsQaD_Cg@sFeEiI_HwDiPeAHu@fN}B^WaAi@Vy@bE|@b@u@dDAnEnBnDpFtHzDdEhJhD~A|He@~AlDzEHr@dBnM`BClBzGdB`Ae@jDrAxAsB\hCtH~AvAzC~@EKpBtEfHvFrDv@dExBzBU`E^~@xFpD$q$), 'official', null),
    (pid, 6, $q$Tappa 06$q$, null, null, null, null, 19021, pg_temp.dpoly($q$itcwFocvzAdFpB~@~FpCpAj@hBxEMbFaCfDBdFlHnKjDtFpI`@|BrBdBqByAzAlHGtM_@r@uA}@LaC_EsKoBH{@`GmBfEy@aATpDu@~QrDnErIrSbGpUhBtL|GjQpAdGOhErCpK?lBbC|Cf@xClD~\eTzp@qHjNgBzLyD`KjK`HdXvXiBzJuCdHwI~JyFxAKxNaBtKuNqDiGuFsGu@}DsF_FkC_QgCoXeWsHWaDx@{BuAkDtAoCEwC|CeDtHmGlGuDv@iGlK@xCpAZ`Lq@xFZzG|H@`HiBbDBrCcDnLoCnDMjD_BjEuC|BkHxL{E~DgCJoHyDsF`@_GdDeJEoCcBoBfBFjBrMpFz@rAaAl@cJw@yDh@_@bBZ`DsByBrB|PClM|GfPzAlL@~EbDdIdA~KmFfQBbE|D|LShHmBjIDjCdEhGzLb^lDuBpHvEe@~B`@rD$q$), 'official', null),
    (pid, 7, $q$Tappa 07$q$, null, null, null, null, 13343, pg_temp.dpoly($q$unfwFuk_zAhJbRvEdDx@|EvF~HrKoArBbDfMlCtBrK~BtDZbH|FdKuCnG`@rAgBhGrRbEdE|B]vJp@vH|CzKlCfU~Jr\tAnJuLvQeCuAcGXmIiBwO}F_EpC{MhDcGVaD|JoGlMiAf@kD}AsGrBqHoEyIiCoDeDgFyImFbKeL|H|HvA~FfGiFzIu@zJ{EpBkGSiAdC\vHY|AwInNoAh@qDxHqAn@{Bi@uEcFsDzAeA}@}GxEcIzBiLnGiHfQCrBeE~D{ArGaMwFi@d@qCfFk@xMkGl]QjKd@vFcHlEiPfReB|DeAE$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 7;
end
$do$;