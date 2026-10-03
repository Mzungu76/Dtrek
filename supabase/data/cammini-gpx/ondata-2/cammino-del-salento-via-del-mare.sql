
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
  values ($q$Cammino del Salento — Via del Mare$q$, 'cammino', 40.10072666014901, 18.50523917790801, $q$Puglia$q$, $q$https://www.camminodelsalento.it/$q$, 'gpx', 'cammino/cammino-del-salento-via-del-mare', 0.9,
    $q${"kind":"cammino","theme":"storico","lengthM":113809,"tappeCount":5,"tappeSource":"official","start":{"name":"Lecce","lat":40.35639109492555,"lon":18.16865942067366},"end":{"name":"Santa Maria di Leuca","lat":39.79655660759484,"lon":18.36824459325176},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":5,"totalKm":114.9,"connected":true,"maxTappaKm":24.7,"namedShare":1,"officialTappe":5,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$mbiuFcq{mBFiWbUeAjX_n@dWsrAvo@e|AfJeaBlOcUg]guBzJmvAkFscBxWmiB_NitAwT_c@~AciAa]s{Arc@ogAgDyZzIiM}Mmk@pwC{}Bd`BskCl]cuAbr@sZ|@aTncBoCzJo]qGu_@ri@kO|VjHheEghBjd@b|Azp@{s@iF}HrNUoBuYx|@vDzu@sOfToq@ppAqPqCuPj}Caz@jk@iv@sOua@hJsg@vk@yGhEgUb\vn@jo@{EpnBuzAz]|mAx]wEnSnT{Qxd@pe@i@h`A`v@_F`_@`T`B}Hh[lRpq@dxCyVxVpAp]`h@|TwJzm@`qBkMzAP|Zlq@vbAPbRrz@nYfQqLp_A`EiE`J|fB|tAgOjv@zq@oDcA|Zlc@zFlDaY`\Rzi@zOiFp]r}@gVpI~Zxy@hGbJbU`n@qA~Ryc@~g@~BjSfb@vVqPf`@bMdFiTjr@vbAwPbu@|Uda@uC`Xxp@ag@tHzOh[iLvFdKvZ{u@tj@TvRui@ha@iGWmZbW`BcIoEpYuJpjBlXtDfaBpv@ns@nMfd@b]yCbi@vTrXuHfH__@ja@wV`iAhTvIwd@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-del-salento-via-del-mare', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 01$q$, $q$Lecce$q$, $q$San Foca$q$, null, null, 24666, pg_temp.dpoly($q$mbiuFcq{mBFiWbUeA~@wE|Be@vC_StMaRhFy_@zOyq@hOob@nWef@|FoQzDmm@dBoCt@cEvAgQgA{UrBcEjIuAFsFdAuDJsYuAqCwAaJcEkE]cCcCsDwDgXo@}M_D}Gw@wItBqUj@}r@xE}KkHgr@EaN`BqH[wWnDm]fE}XdCoGzGqh@y@}PcAFyBoObAKuBcWwCuL]}KkBcGkQ{Z|Cc]qAqEtAyDo@uGbAMuAoUaJmm@mK{a@yBiAwA_HzOsP}CgRtWsb@LuAuDqS?qCzIiM}Mmk@tF}ChSmRjD{ApUiRnD_GzDeDbCIhGwDtIqAzI_MrEcBnMcJxOwStCs@rG{FrAsExJiOfDmMbKeOz@wBM_DbAiA~CSfTaUxEiKrBgNtDwC$q$), 'official', null),
    (pid, 2, $q$Tappa 02$q$, $q$San Foca$q$, $q$Otranto$q$, null, null, 23878, pg_temp.dpoly($q$gm~tFcvioBnR_TpDuK^{GbG_Op@uHjDcH`BqKdAwCxCcAPqCy@wD|OsMlJh@fGmDnDq@zAyBbEoBf@wCq@eFVyEn@iA`O{IpSR`HvD`FfGbAPrBoEdCm@t@|@rA?|B~Fp\yI|DmJ|DaRSqHiFbAR_DkAwMb@oD|XgGtOcG~ECbFjIxH[l@uBzIwI`Fo@fEyBhDoF~CeBlEaA|HPrAmBlG}@bR}LbB`ApYqKjCa@lAf@hnAuj@jd@b|AF}BxKkGx@mFUcAlSsJfNkRgFeEAwBbHbFnEyFg@mLsAkEJ{Eth@xBv@`BrHSxAqB|D`BzCcDvIwAnP{KrGuAb@z@~J|Cm@qB`F}Aq@aDFoLrCsGfHyG`B_GfKeB~@x@hbAeOqCuP|\uMlc@k@dLyC`DGhc@kXjPqCtLiFjEUhN_WnB~@~DiBpHyI$q$), 'official', null),
    (pid, 3, $q$Tappa 03$q$, $q$Otranto$q$, $q$Santa Cesarea Terme$q$, null, null, 21089, pg_temp.dpoly($q$m{_tFuozoBrBgEuA}Bb@mNaNiNbDyLpA}QrB{FtHqFvLj@xCy@~B{BtBb@hAaAnE~B`A{CpAoOt@[`DtD~@xEbErFjF|KfBzI|DuCXvBm@vCxDVx@qCnCtAhHVxVyFbBh@dSiG\aAqA}CJ_AhCq@nCr@n@aE|EmDlFsJbGe@rCuKhGqGlTcKtRmOJp@jD{@dArAvAtH~Y~o@}@|MZtApBx@jAcCrBgA`G}@dLGxLjH`ClJrATwFlPsFvAaEvCMvD~AbFdLgA^s@lFzA|F{@~Gp@b@bDfDFrF|J~HdEvDP`D|BfFjLfVtLtArJqG|Fw@xCRtFlA?f@oDfCiAfKvGZbANnLmIxMbJhb@c@hAlDxC~BbGvYeLvMe@fEn@pC}A~ARtDmA`MClFsBhP|GtF}DvMmBxPg@|Bl@dHeA`TpDvA_BfInGAzAhBjFrCfCo@`Av@zBdKbKkAcEhBmD`BbAvH}CdGrAhB`CvFhIlAbNpBtIhECrDtSQhDl@hFpDnH$q$), 'official', null),
    (pid, 4, $q$Tappa 04$q$, $q$Santa Cesarea Terme$q$, $q$Marina Serra$q$, null, null, 23230, pg_temp.dpoly($q$cqjsF}stoBjD`OSvEl@zEnCrE`CbKKpFpCnChCtHM|D}F{E{@CI~@yB|@jBnQw@pAa@zEpKbUlOfP~B`FvFnFtHxLPbRxAyBbHjAjNtOdGN~IjEbLjCzFyBjIwHlg@rK`PaDjAd@tCuAk@vBiEhBj@~BfCc@dFp@@fBrI~Hz@tD~A~@pE_AxC|HjW`\fI~F|HxC]`Dt@Nv@nE^wD~@a@nNnHm@jAZzKgFnG@rGsE`L{@|HtFCdHeHbHvB~AnBzTmB_ApBp@hGy@xGBfFxY|@Bv@nHdClAeEFoCw@wI~AZn@oDzLoBzDdAcA\lJ^~@pAbEpAfFDQrCfF]jJhBt@`BvFn@}@jEkBz@aAdJoDrBpDnFtHqBrCmDtAaGpFz@Ju@tEsBxA~@lIiB~Al@PvBdMsEdElEjCpTpK{Cx@`DvJcB^lDwA|BnCbErCkDh@~BpH`@~Gg@lDuAr@~FlD~C`CbHpBYlDx@@_D~HcCRsAbBn@|AWtAhBpE{@fBZv@rA`FnAWqCdBaB]uAl@a@hBqKzDsJbCNvBw@|JfFvG|AvIQpHsDNr@cDpAFr@tGp@nA`J~FbCT`Ao@pCjE`E|FuCjD{ElI_E|K|@|H~G`DShDxB~BeF]oA|@QhBaGdACiB{A$q$), 'official', null),
    (pid, 5, $q$Tappa 05$q$, $q$Marina Serra$q$, $q$Santa Maria di Leuca$q$, null, null, 22061, pg_temp.dpoly($q$ifrrF_kgoBhJnFpIrHh@vE_@t@f@fDg@pDXz@rDq@jGjAvD|H`DtNiH~D^rEeDh@dCzSv@bB@~IgIdD~BrDfBlHbJxDpChLCvEiA`BdAnHsE~AdAvAdFkChImBlPkYbDiB`AzBtFmEtHzOfC{BfBlExS{NvFdKxE{R|S_b@hGgD|Jt@`FiAjE|B~HrAZkEvGeA^eC]sLr@Wh@v@~AqACcA~CyAg@aDNwCvJyGj@`AdTq@JiHvBcGcDgFFwAlFjChFkAjH`@cIoEnGaDxL_@fCsDL`BzBe@x@rAlB[x@vBnD\vIlFlEb@rEgGfFxAjJaA~DfBjGBpA~A~Fc@`KdBfJrF|@vAc@bCZtCrDb@uA`BPbBwE~EaBhFOvU~AjU~GpCTvB{@rJhIjBrHxOtIzCbDpD|@`F~DKx@tErA[lFjHlAlCLxCsBzB`F`OdG`GrCeDxCFlArBpEqBtJ@pHxBpNdL~OvCxG}DfM_ApAw@a@wC~AgKdB}GbCaEx[kTpDkAnDe@pMp@dGw@|BnI~HrEzIiAvFbHvHiA\o@|@BRlAnDsOpCcEmAsIbBkC$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 5;
end
$do$;