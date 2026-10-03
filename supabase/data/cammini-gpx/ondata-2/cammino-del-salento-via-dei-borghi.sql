
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
  values ($q$Cammino del Salento — Via dei Borghi$q$, 'cammino', 40.14184316564179, 18.47995880609424, $q$Puglia$q$, $q$https://www.camminodelsalento.it/$q$, 'gpx', 'cammino/cammino-del-salento-via-dei-borghi', 0.9,
    $q${"kind":"cammino","theme":"storico","lengthM":132936,"tappeCount":6,"tappeSource":"official","start":{"name":"Lecce","lat":40.35640639819639,"lon":18.16868793153619},"end":{"name":"Santa Maria di Leuca","lat":39.79655660759484,"lon":18.36824459325176},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":6,"totalKm":134.3,"connected":true,"maxTappaKm":26.4,"namedShare":1,"officialTappe":6,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$qbiuFiq{mBJ{Vlk@}@tfAx[pGmg@pgAuNjEr`@vcAlJdV`Z~Rw@|CfL_QbQf\nEjf@y{@~g@{Afp@yvA~`AtL~L{XlXdMn`@qhAdu@yg@uG_Xl~DyhB|Qe`@|E|z@tz@zl@xfA{CfLrX|YzFnQmLtUb`A_OtNhPx]Y~i@f[Hha@~zAxr@svBzg@Ozj@c_Bsd@mt@nk@qi@aUoeA~Ekb@{TuoBoYsi@rPqMKigAbXeiAqLm`@j~@u|Ak`AepDxd@u|@tn@}fCvCkcAyPgI`Qc_@uAgr@jLkEcI_d@xD{nAxb@_d@pjAsK|Nkj@mLqs@zEe{AuO_o@m[kc@}XqoAwr@gOg[ib@|H{f@sOua@tFw_@jo@uOhEgUb\vn@jo@{EpnBuzAz]|mAx]wEnSnT{Qxd@pe@i@h`A`v@_F`_@`T`B}Hh[lRpq@dxCyVxVpAl]|g@tVwHfl@doBkMzAP|Zlq@vbAPbRrz@nYfQqLp_A`EiE`J|fB|tAgOjv@zq@oDcA|Zlc@zFlDaY`\Rzi@zOiFv]r}@mVpI~Zxy@hGbJbU`n@qA~Ryc@~g@~BjSfb@vVqPf`@bMdFiTho@dx@mInW~D~a@gIdDlXzu@ri@ub@tHzOh[iLvFdKvZ{u@tj@TvRui@ha@iGWmZbW`BcIoEpYuJpjBlXtDfaBtj@hd@hYfs@d]sCbi@vTrXuHfH__@ja@wV`iAhTvIwd@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-del-salento-via-dei-borghi', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 01$q$, $q$Lecce$q$, $q$Sternatia$q$, null, null, 21704, pg_temp.dpoly($q$qbiuFiq{mBJ{VzQkAz@bFjN^hGuF`PtLru@bNpF{R^qShFiBpLdBlUPf\cOzCbLlBi@}@xThNd@hJfC~LsA|Jv@fCpAn@zChEnDbCaEdV`ZbBeArFvBfHiB|CfLiNzJuAfEf\nErAuDcAkBbQiWlAdApKsMvD_NlXcJ`Ep@nHtEhH}QpBu@OkAfCwEzBeL`JaQzCaAvB{C`H{R`Iv@lIa@zEfAtNMfFtExAcA|DH|EhEjG{KrD_LlSzN~Cu@zBiD}@qDfAsB|Gg_@lCxB|Ns]tDuDnTeHbGgHzQuOuG_X`N}I`Nz@SeB`LaBlfAmn@b`@uQbIgBrMaJpRaI~AeArLu\hAi@nAfIEvAyAjB$q$), 'official', null),
    (pid, 2, $q$Tappa 02$q$, $q$Sternatia$q$, $q$Corigliano d'Otranto$q$, null, null, 20001, pg_temp.dpoly($q$mjntFsufnBvEzAmHzFTjFxAj@pE~VhC`@~BjGjO~BnArAh@~DvEpAdH`FbIfAz@dGfBvBxD}@fCzBtIsCjCh@tAe@hD`DfG~A|OwG`Dt@lGiBpCnKtGbLzKkA`MfIjDo@GaAjL{H`@pEpBK^~Dj@Od@tGnMvk@mNvGQ|EbC`Le@lBJnD`HgB~@fA|AxHy@d@FzBuChCJbLvAjFhAbLjAbDbBy@f@hClHeDrB_@P`BzFeCdUbdArAjCtHlGE`InFyAzCyBy@_Gy@o@lEiJd@aElI_M`GwO|Okv@rD~CpH@lH~BzFKjGeHlDaNp@wK~BoJtHkM|Du@|EyEaD}@jN__@yHwIyZui@rj@ue@Z{BaCcJIwChAgCwCgRgNc^^gLfEiPGyCwGoYMoF_CmFYiEeBqB~AgDaAyIIoJsAsIa@Ds@kVaFkLaBRq@yA$q$), 'official', null),
    (pid, 3, $q$Tappa 03$q$, $q$Corigliano d'Otranto$q$, $q$Otranto$q$, null, null, 26418, pg_temp.dpoly($q$ipbtFsxlnByM}YvGaHzGoD~Cm{@u@qAoCCXeHv@eB`GuDWkO~FwOv@wIhEmT}BaBj@{BsCsCkE{TzC{AzBz@HmB`BArA_PnCkIlAmJtNuF|IeIrAeFDwCnJuIV{HkCmPeCa@}AcDgBsHtAaAyDyAuB}B_AgFgFsLo@_VqLc`@uDsHWaE}CqKcG{\hFaK_@_BjBkBn@wEfF}HpC{I|DmCzGgJzCcWpDeFKcDh@_ChFqI~A}KlBoBo@{E`BkQtEsPfEkJvDwDhAoGjDat@SiNuAcHeK`@}AeAb@aCfLkJtBuO@}LsBmJIePd@uGtCs@n@^dFwDmDaCh@_AiCsJPeEgAcLb@od@vAaNUyG|@qAT}NxAe@|BbCGaIh\{\f@CxA`IpEkE~IiA|\{NzDc@bQbB`CgEQyLpE}En@eFnBiBZ{DSwIsA{ChAqAg@w@_Eo@{AqCkAqYzAe\~DiZs@aJKsWoAoGoHaPwCeQ@gC{CaCMkBcV}[M}DeHwQ|@yBw@iKcEwIiH}Ha@aRmLkHgIm@wGoBcGd@eJcBeMuLmBiEeHuIm@sCQmR$q$), 'official', null),
    (pid, 4, $q$Tappa 04$q$, $q$Otranto$q$, $q$Santa Cesarea Terme$q$, null, null, 21088, pg_temp.dpoly($q$m{_tFuozoBrBgEuA_Cb@kNaNiNbDyLpA}QrB{FtHqFvLj@xCy@~B{BtBb@hAaAnE~B`A{CpAoOt@[`DtD~@xEbErFjF|KfBzI|DuCXvBm@vCxDVx@qCnCtAhHVxVyFbBh@dSiG\aAqA}CJ_AhCq@nCr@n@aE|EmDlFsJbGe@rCuKhGqGlTcKtRmOJp@jD{@dArAvAtH~Y~o@}@|MZtApBx@jAcCrBgA`G}@dLGxLjH`ClJrATwFlPsFvAaEvCMvD~AbFdLgA^s@lFzA|F{@~Gp@b@bDfDFrF|J~HdEvDP`D|BfFjLfVtLtArJqG|Fw@xCRtFlA?f@oDfCiAfKvGZbANnLmIxMbJhb@c@hAlDxC~BbGvYeLvMe@fEn@pC}A~ARtDmA`MClFsBhP|GtF}DvMmBxPg@|Bl@dHeA`TpDvA_BfInGAzAhBjFrCfCo@`Av@zB`K~JgA_EjBkD~A`AvHaDxHrCnHvK|CjWhA|@~C[rDtSQhDl@hFpDnH$q$), 'official', null),
    (pid, 5, $q$Tappa 05$q$, $q$Santa Cesarea Terme$q$, $q$Marina Serra$q$, null, null, 23230, pg_temp.dpoly($q$cqjsF}stoBjD`OSvEl@zEnCrE`CbKKpFpCnChCtHM|D}F{E{@CI~@yB|@jBnQw@pAa@zEpKbUlOfP~B`FvFnFtHxLPbRxAyBbHjAjNtOdGN~IjEbLjCzFyBjIwHlg@rK`PaDjAd@tCuAk@vBiEhBj@~BfCc@dFp@@fBrI~Hz@tD~A~@pE_AxC|HjW`\fI~F|HxC]`Dt@Nv@nE^wD~@a@nNnHm@jAZzKgFnG@rGsE`L{@|HtFCdHeHbHvB~AnBzTmB_ApBp@hGy@xGBfFxY|@Bv@nHdClAeEFoCw@wI~AZn@oDzLoBzDdAcA\lJ^~@pAbEpAfFDQrCfF]jJhBt@`BvFn@}@jEkBz@_AfJoDnBnDvFbI_CfCgDrA_GpFz@Ju@tEsBxA~@lIiB~Al@PvBdMsEdElEjCpTpK{Cx@`DvJcB^lDwA|BnCbErCkDh@~BpH`@~Gg@lDuAr@~FlD~C`CbHpBYlDx@@_D~HcCRsAbBn@|AWtAhBpE{@fBZv@rA`FnAWqCdBaB]uAl@a@hBqKzDsJbCNvBw@|JfFvG|AvIQpHsDNr@cDpAFr@tGp@nA`J~FbCT`Ao@pCjE`E|FuCjD{ElI_E|K|@|H~G`DShDxB~BeF]oA|@QhBaGdACiB{A$q$), 'official', null),
    (pid, 6, $q$Tappa 06$q$, $q$Marina Serra$q$, $q$Santa Maria di Leuca$q$, null, null, 21809, pg_temp.dpoly($q$ifrrF_kgoBhJnFpIrHh@vE_@t@f@fDg@pDXz@xEe@hAdCjCsAfGnN`BpIiH~D^rEeDh@dCzSv@bB@~IgIdD~BrDfBlHbJxDpChLCvEdChGq@rDhImBlPkYbDiB`AzBtFmEtHzOfC{BfBlExS{NvFdKxE{R|S_b@hGgD|Jt@`FiAjE|B~HrAZkEvGeA^eC]sLr@Wh@v@~AqACcA~CyAg@aDNwCvJyGj@`AdTq@JiHvBcGcDgFFwAlFjChFkAjH`@cIoEnGaDxL_@fCsDz@hDtFu@x@vBnD\vIlFlEb@rEgGfFxAjJaA~DfBjGBpA~A~Fc@`KdBfJrF|@vAc@bCZtCrDb@uA`BPbBwE~EaBhFOvU~AjU~GpCTvB{@rJhIjBrHxOlH|BvDlDpAbG~DKx@tErA[xGnJl@zFqBbBvGjQlEpDpC_D|CFlArBpEqBtJ@pHxBpNdL~OvCxG}DfM_ApAw@a@wC~AgKdB}GbCaEx[kTpDkAnDe@pMp@dGw@|BnI~HrEzIiAvFbHvHiA\o@|@BRlAnDsOpCcEmAsIbBkC$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 6;
end
$do$;