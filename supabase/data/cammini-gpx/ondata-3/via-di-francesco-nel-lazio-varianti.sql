
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
    $q${"kind":"cammino","theme":"religioso","lengthM":149203,"tappeCount":4,"tappeSource":"official","start":{"name":"Poggio Bustone","lat":42.504572155,"lon":12.892367409},"end":{"name":null,"lat":42.16314570978284,"lon":12.741112411022186},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":4,"totalKm":95,"connected":true,"maxTappaKm":26.2,"namedShare":0.75,"officialTappe":4,"computedTappe":0,"longTappe":0,"shortTappe":0},"overviewParts":[[[42.50457,12.89237],[42.50203,12.88865],[42.50124,12.89245],[42.49817,12.88574],[42.49432,12.88433],[42.49474,12.87891],[42.48524,12.85541],[42.49423,12.85559],[42.49428,12.85835],[42.49634,12.85835],[42.50017,12.8571],[42.50222,12.85276],[42.49037,12.81828],[42.49328,12.80678],[42.49153,12.80307],[42.49362,12.783],[42.48695,12.77586],[42.48572,12.76055],[42.48119,12.76139],[42.47331,12.75647],[42.46939,12.75882],[42.46736,12.7647],[42.46086,12.75587],[42.4611,12.74846],[42.44865,12.74715],[42.43255,12.75991],[42.42387,12.75567],[42.4228,12.76456],[42.40804,12.77057],[42.40552,12.77421],[42.40652,12.77186],[42.39857,12.76994],[42.39859,12.77504],[42.39309,12.7822],[42.39327,12.79585],[42.38941,12.79334],[42.38125,12.80668],[42.36961,12.81391],[42.36953,12.81669],[42.37705,12.82229],[42.37933,12.82846],[42.37991,12.82677],[42.38916,12.83369],[42.38868,12.84126],[42.39886,12.84472],[42.39687,12.85747],[42.40248,12.86072]],[[42.56421,12.64589],[42.54687,12.64167],[42.54333,12.64621],[42.54066,12.64595],[42.5408,12.65001],[42.5394,12.64858],[42.53814,12.65234],[42.52759,12.65936],[42.52393,12.66778],[42.51919,12.66324],[42.51195,12.66238],[42.51038,12.66584],[42.5089,12.66225],[42.50617,12.66193],[42.5067,12.65965],[42.50393,12.66323],[42.49507,12.66181],[42.48021,12.67159],[42.48283,12.67529],[42.48289,12.68175],[42.48495,12.68196],[42.48398,12.68662],[42.48732,12.68853],[42.48725,12.69329],[42.48302,12.70058],[42.48337,12.7142],[42.47376,12.72182],[42.46955,12.73854],[42.46109,12.75043]],[[42.19201,12.85146],[42.20481,12.84374],[42.20897,12.83331],[42.20858,12.82721],[42.21237,12.82178],[42.20549,12.81708],[42.20358,12.81278],[42.20451,12.8061],[42.19724,12.80212],[42.19425,12.79086],[42.20352,12.76382],[42.2087,12.75481],[42.21344,12.75413],[42.21407,12.74444],[42.22124,12.72668],[42.22127,12.71803],[42.21516,12.72757],[42.20961,12.72713],[42.20644,12.7318],[42.20382,12.72874],[42.19787,12.73584],[42.18104,12.7322],[42.17456,12.72521],[42.17236,12.71913],[42.16863,12.71863],[42.16249,12.726],[42.16315,12.74111]]],"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$qtlbGi`umAzNfV|CwVdR|h@`WxGsAz`@jz@zqCew@c@IgP{K?}VxFyKbZ`iAnvEeQzfA|IdVaQ~cBtIbf@~b@|\`J~`B|WqFfp@v]nWuMtKwc@rg@dv@o@hm@no@lEh\v@rcBwnAfu@nY\}i@pTaYlkAcWvNwUgEtMtp@~JC{^ja@wk@c@itAbWtN~q@krAvgAel@NkP_n@_b@gMqe@sBpIyx@gj@~Ain@s~@sTlKunAqb@mTwk^pbi@xeBrUbUk[tOr@[kXvG|GzFoV|`A{j@zUss@r\j[fl@jDxHsTfHlU`P~@iBfMhPkUjv@zGz{Ac|@kOcVKkg@{Ki@`Ec\{S}JLw\lYql@eActA`{@sn@hYogBvd@cg@bIyh@zts@sjRcnA`k@_Yd`AlAbe@uV|`@~i@j\|JzYyDvh@ll@zWtQjeA}x@~gDk_@hw@s\fC}Bp{@yk@~mBE`u@de@sz@ta@vAxRe\jObRdd@kk@dhBvUng@tj@vL~d@hVbBje@am@cCm}A$q$)))
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