
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
  values ($q$Via di Francesco nel Lazio — Varianti$q$, 'cammino', 42.5323242880404, 12.655137134715915, $q$Lazio$q$, 'gpx', 'cammino/via-di-francesco-nel-lazio-varianti', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":149203,"tappeCount":4,"tappeSource":"official","start":{"name":"Poggio Bustone","lat":42.504572155,"lon":12.892367409},"end":{"name":null,"lat":42.16314570978284,"lon":12.741112411022186},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":4,"totalKm":95,"connected":true,"maxTappaKm":26.2,"namedShare":0.75,"officialTappe":4,"computedTappe":0,"longTappe":0,"shortTappe":0},"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$qtlbGi`umAzNfV|CwVdR|h@`WxGsAz`@jz@zqCew@c@IgP{K?}VxFyKbZ`iAnvEeQzfA|IdVaQ~cBtIbf@~b@|\`J~`B|WqFfp@v]nWuMtKwc@rg@dv@o@hm@no@lEh\v@rcBwnAfu@nY\}i@pTaYlkAcWvNwUgEtMtp@~JC{^ja@wk@c@itAbWtN~q@krAvgAel@NkP_n@_b@gMqe@sBpIyx@gj@~Ain@s~@sTlKunAqb@mTwk^pbi@xeBrUbUk[tOr@[kXvG|GzFoV|`A{j@zUss@r\j[fl@jDxHsTfHlU`P~@iBfMhPkUjv@zGz{Ac|@kOcVKkg@{Ki@`Ec\{S}JLw\lYql@eActA`{@sn@hYogBvd@cg@bIyh@zts@sjRcnA`k@_Yd`AlAbe@uV|`@~i@j\|JzYyDvh@ll@zWtQjeA}x@~gDk_@hw@s\fC}Bp{@yk@~mBE`u@de@sz@ta@vAxRe\jObRdd@kk@dhBvUng@tj@vL~d@hVbBje@am@cCm}A$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/via-di-francesco-nel-lazio-varianti', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Poggio Bustone → Greccio$q$, $q$Poggio Bustone$q$, $q$Greccio$q$, null, null, 22118, pg_temp.dpoly($q$qtlbGi`umAZaDvAK?hB_CL\dBfEvI`H~Il@qBcAc@]_CjFnBcB}IH{C~@wAl@`FvGrHb@dEjB`EVxEvBdEzF`AXbA`JpEhC}@e@dCFnGfArN}BpD~AvApDxJjEnFbRli@fAjG|BfEj@tFvFvQ|DbR`CdUcEOaGeDqKaAm\rEIgP{K?}VxFiB~BeD`Kc@fFeBxB`@tB_@pEn@hC|BzBhAdEbDxDpDfOlCzF`AdMWnBtEdCrAnFZjJhGbIhAzNU|C`A|BkAhBfHhDfA_Ae@~EVfEnD|IHfDbLfp@yAdBk@rCaBjQsCdC~@rP]`@gByCbAH[p@v@zAeCEIxOsAfEhDvLLnFj@x@xBBi@hMyCxRm@l]sCtGoAfMoBxGBtCdF`UeAjAtDtMlNpRrCy@|HjB~DxGt@lLkC~NCdMp@nFfAb@TxBbCiAGg@hAlEt@rJcClC`AdHeA`EjAlDjBhAzCSfFqGxKr@xAhA@~Cl@~@zJ|AzGW`D~BlE\dChC|BtHpCHt@S_AwEdAmCpFwBbIjA|Co@lE{NtAoSpBKlBpGlGlBxEfKb@hDfH~GpAzE~GvHfCbVgAlAcApFmB@n@fByAEIaDaADDeAbB{@q@fC$q$), 'official', null),
    (pid, 2, $q$Greccio → Rieti$q$, $q$Greccio$q$, $q$Rieti$q$, null, null, 23771, pg_temp.dpoly($q$}gdbGefylA`BhHdDS~GjCxGgC~Jw@xC^tGtF`EeCzEdA~C[jJrCpKcM|Fc@f@aDpBwDtHcCrJwQ`A`@|@xCzA\tDu@xEyEbDAhDeEnKwAdGqF\}GpAsBpLQ`@`CjNtJrLjEnEdDbCGl@gAx@_K}@yIb@qHo@iGvDsKxNmLtOsAlAcAj@yB`JoEbICbC`Ak@aA`Cr@|ZqI~IyHvC}KwBlJoAfB`EwBp^dMxCcAfFtB|@}HyAuFVgMfDcEhBVrDgGpDiB\gH`EaIb@cEj@e@P|CdAvAjA{GuCeGvFkOUeDwCoFJmKuAeVpBmKdAWbHnFnCxEhGbAnBuEr@yMhJ_JrA}C|FaFtIaMpFsOvDeGxHkDbP[nLgFpCaCr@eHjFiIfM{EvAXv@aANkPsKeBqSwQ{AmC}IsG_DiIr@wIY{DcAiBuAnD^iBuDqEQ}B]T^rA_BmA^fBw@j@b@jCa@TwCeDC_Ba@z@yCi@oGwJ{MgC\q@eBe@k@{CoDaD}H}EsC?EwCmAyAl@Sr@yXpAiLeIU[nDs@AMyBsFQCkDiCaBme@qLC_Dg@a@nB}AhAuDO}CcCcGHiKnDoXvEyI@iBgAwD}D`DaJyAg@_PwHgAiDh@BdAJa@$q$), 'official', null),
    (pid, 3, $q$Terni → Greccio$q$, $q$Terni$q$, $q$Greccio$q$, null, null, 22912, pg_temp.dpoly($q$iixbGy{dlAbAc@]k@jCfEbTtGjE@t@wCbBSbAwBlCfBtIi@tLxDrAlAt@|DtErCfLbBhN[PkDfDiGrLeDN{EdAsAlF_AfHrBp@sJkBwH\_ChDdGlBVr@}COeGvEkI|EuC|Gp@tCgAnEiIhHy@jJqH~FeJdIsDbAgEhCuAxEcLb@{ErCyG~@kKz@oAdBIlExDHdG_DmEpGrHlH~Cf@pBlD|AxJyGpG~InJ}@pBb@d@|ArG`@rCsA^iA?cLdCqBjCdFNzEjCjGfF|BnGOh@m@WbGqAbEtBeGRaE~CcCzDz@x@kAHoBIvCvEc@dDdCPlC`_@yEbJlBjQwOfLoC|BiBnXwFjEwChDuJJ{Gf@ZsBIhCx@O}@p@q@tMQ`Ay@qDuRoD|AiDkEAgJoAcLh@mCa@uB|@{F}DKsA_BiC`AlBgC?eQrAuEkDpCaFs@mG{MnAiFiB{Jf@qItGmODsBp@VzJ{LbCkK\gGkCsI|@cAUc_AfFoA`JoP`OaA|EkDrCIbM{RrA{GlJeQZuG|FgV\mQm@oG|BqQbDqDbBoJ`MsOnBGtAxA?oCnBRvDcDl@yAWcCtAcLSgBfAeIhAy@TgCbAgAm@hCXv@\\b@uApBhB$q$), 'official', null),
    (pid, 4, $q$Variante per Farfa$q$, null, null, null, null, 26239, pg_temp.dpoly($q$aso`Gs`mmA[dCqNvK_Hb@eInEsBnG{PrFqGDsGhFuD@a@xF{BfI_HjKq@tMoI`SlAbe@sFzJNt@mCfAcKbQtVbKfObO`Bb@hBnIrGjOqClIg@h^pMlCxDnE|GRlBiAhCbHjGnEhGxT~FpGPjAmBjEr@p@CdFpA|Gd@pLkAbFeJrKwBhH{AtAM|KwDvNkDp\yCdFc@jL}DxL{ChFe@rF_IhNhAlJQ|AyEtB{JtJwEzKeE|RWbGeBhAmH[oDvA{ClEiAyE_Bt@i@g@PpZoC~_@}@nDeEjDaCbLhBzDeHnLeAnFgE`ImAvGTfF{AvAu@pI}ChCaFlONlEqAxGT~SpCnLkBhC|G_CnFkNtHcKjG{VtBgCvBShAz@t@aAnI~C{@wB`EhBfK_@bH_LhCwA`CgD|@sBJqCb@p@~@q@Vp@fAjPfIDrBsCXeDc@}FdHcB`CqBbEsHJuFpGApDqA|DPxBlCfCTfGnHvEeFbMdBhKuDvAtExDlFfDn@nAlB`D[dG}DW|B^rDlDAlDcG~B`FbBoC|@`@dLrGnJnP~CzB~@xCxGzGjB`QhFxH`BbIxEbArAaEnCcBjHdIpFgC~FyI|DcAnAsDo@_Kr@yBfB{@lEFpCyDDyNsBcJP}DjBeGByC{@md@{AcJ$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 4;
end
$do$;