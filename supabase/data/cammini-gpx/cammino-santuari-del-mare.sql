
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
  values ($q$Cammino dei Santuari del Mare$q$, 'cammino', 44.51840400695801, 8.611671924591064, $q$Liguria$q$, 'gpx', 'cammino/cammino-santuari-del-mare', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":105083,"tappeCount":6,"tappeSource":"official","start":{"name":"Sestri Ponente","lat":44.42491292953491,"lon":8.849186897277832},"end":{"name":"Pegli","lat":44.42353963851929,"lon":8.819811344146729},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":6,"totalKm":110.2,"connected":true,"maxTappaKm":28.9,"namedShare":1,"officialTappe":6,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$uvcnGmj_u@um@tWoI_JkCnRcYzFmS_FdI_]sIh@rIi@k\pn@}`Al^m`@_BudAqa@pBkg@iqAiAc\}WkH_h@`R_OwOoAfCl_@qQdm@lHpc@kd@`ZmPgHiLf\lWdkAqE`Qs`Bfa@~Dn^aRpz@fKvXwOxPkp@}NbFdr@wX`kAoa@UpYt[sKjZrItq@|x@tpC{TnUra@n{@_Uf|@gcAbc@g\rwAv\nQn@jg@hh@OpJb]hf@xQfUjs@dVcDpu@p_@e`A|h@af@rF}`@gQoHtd@yPvE|C|z@_Y|s@dRlJw@he@bSbOiJpC~h@cAk\pxAv]ePhQtJ|Muz@bNnK{Vay@prA{s@rBy`@`LmI[|b@rOy[~l@rBaXagAfSsSfwA`TlNwa@v_AwVvl@qbAlj@|U`]{[jDy[j[sKds@nGhN|f@vc@P~IhOaA_NdP{Glf@pLfS{KiIgFdRyRuJkD~j@g`@Q{VubAwvB_Mi|Bs_AigBeIop@mWvr@eZnGor@mPgD{Xiw@m[mYfF_Ue]sSs@vi@ck@m@gd@pPmb@iGsS|N}UgYaRnLeRaIgWzIeTbp@dVgFxNph@ld@doAnOnXx[Ny{AbX{mBwIcx@hGcQ$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-santuari-del-mare', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, length_m, polyline, source)
  values
    (pid, 1, $q$Tappa 01$q$, $q$Sestri Ponente$q$, $q$N.S. della Guardia$q$, 12864, pg_temp.dpoly($q$uvcnGmj_u@uAi@a@bCg@e@}A`JuQgCsAhFoCZmB|BwDgAuAr@a@vCo@KIcAmD?gBoGdAvFwDvFY~B_DhAuBy@iFxDcIp@eJcAgH{CHyDyAiAnEiGdEqL{B[JjBcFe@bFd@KkBzBZeEpLgJpIf@bCUfBeCUgCz@d@hAqC`DUnFcRHyBfHyE~DwFSyDhBwBe@aBlEaCB}A`BeD?sBvCqA_BcAj@oBcBgFtAiAyEoAs@yDlCiBa@aCbCcEgAqCmE_HbCkHcC{GYqAs@{BqIsBqCoFgBsDBqGeDg@iA\iBkAeCd@iEi@wBp@qGtAiAbAsHeDnBmAQ{QqImCJ{@vBgBbAiEm@}EqEeCz@oDg@_AkCeExGiGtAwBw@aB`@cLkQiGwDuFYmEqK\_B]sDrB{DB}JsDFa@gAz@yDjB{@r@yCdDB~EsBcF?oFmBcA\$q$), 'official'),
    (pid, 2, $q$Tappa 02$q$, $q$N.S. della Guardia$q$, $q$Campo Ligure$q$, 23548, pg_temp.dpoly($q$impnGu{au@mAbCCxBwBvBNxCe@r@\bAvDCC|JmBvDNzE}Az@_ArQiGxCkAfGp@lFxCtCKrDvDxHiA~GiDvDkBa@eIv@{BbCsBPiA`DpAhAaF^p@t@uC]F~Bi@xAkBcC]l@wDkAiAXaD_D{EhRmE|HSvFjCtFaBfHdElMpKhRq@xDxAdGvBvBs@|E{DjD\vDwB~Aw@pEwBhB_Q\aG~C}AvBqIh@sKfHoFTcFeEkJkAeI~G~Dn^kAbHcDjF_C`IsDvDnAzMmCjKhA`FFvGzGdBXvEkHdBmCpEc@fEy@x@a_@_LoFeEgDYqC`C{@fHxCtAs@rFHzFlBbH`ArMkBnMqCdEaBMcBlC_AnH`@zCaBnHU`IkDlGq@~GuN?wKwBaE`BTlAnJhGzEbNnFxA}CdIVdCuCdKwBX`EfD{@xA?rDfF|Hp@nDkApTr@rD`H|OjDd@v@|Ar@rIbCfLu@~NlBbAnB`D`@lEO~GbCxF]~@pSl]d@tLrBpAkDbCv@n@\~BoDUiC{Be@\G|H}FpEfHbAd@dAvBdKaD~@{@nDN|AbBvBzDYzClAt@lGsBjIjDlIlAr@bFuAgDdO{BbBgBC}CfEh@XuAfBoAtGFbBv@z@XvFyAtCYrD}DXsB|ATxBe@|A_F~DoFdAoBzDiGG{@{CiBpCsBoDFvEa@z@aIfCaCrGm@CiAqCkA|A_AcAoBxGMfHqFfJx@tBcEnGeAfEqBN_AbD$q$), 'official'),
    (pid, 3, $q$Tappa 03$q$, $q$Campo Ligure$q$, $q$Tiglieto$q$, 15471, pg_temp.dpoly($q$}tynG}~at@kAxEm@MzAz@TnBe@~@d@pCjBNQ|@f@TeAz@~@FgEfBk@xCmA~@HtAfCrFq@uCNmAXr@vDGPnBxAnBbAI]ClN`IY`KdC|FTxIqApHxCpA~Bk@`I`@lG{BlEz@fB|AhCuBzAjDc@jEZrDdFhFv@lDjFlDxDTTpCjBpCfGT`CrCvD}@n@dAnA_ARbHtGxAB`FjDzE|Ab@sAhJbF`M`JXbK}DbFzGrGfFrGLfCnDdLv@vKvGo@jAuExA{Kv@wExCcCi@kBlEkHlEj@lKqCkAmCNyFdEaDz@mAGwDoDgMs@sD|A_J`KaFeDaLuA}GyH{CQmBfDBrDkDfDYpToBtAwBOsDzBuAw@gAlA\`M~BdKrBvBsBtL?fOsDxGi@|DaCrBm@nQkBlC{DrBiC~FdGiBjDtArD`Kl@fFBdGkAuD?vGsBzBXbDl@YtAtAgA|GjDvEhGuAlE`KqJ_AeBpAhBYBxC|HxHdGRhEyA$q$), 'official'),
    (pid, 4, $q$Tappa 04$q$, $q$Tiglieto$q$, $q$Arenzano$q$, 28852, pg_temp.dpoly($q$o_wnG{prs@jB{E~@pAbAQ`CoH~@TGzBcDfLCdCdC`IyAjCaE`CsDbJyCXRpA_GdMYpEcBpEpA|FjBv@`@mAjBlAbEYjIgJt@cDvCw@nJzBzBfF|APn@oBgA}NxAyJdBcHxA]pAn@fAeAq@_JrBuEN~BnDdGtA]pCdEz@}Ce@yHuEkMNcC_CcA}HeLQ_AhAo@iC}IhCuA|Et@bBq@tAyDv@iI`B?jFaFxC`@tAqCtEl@XcAm@gAtNeA|C{OxHeCJ{B|A`Bj@jDrD_AzByNG_Q`LmIAtEqExF|AJxAdEa@pG`@hE|F_Ja@mIvHkFjDJjBkBhBTDlCnAGT{C~@a@vIjB|ElC`E{@xCv@BaAkAoAnBaAl@aD]eCyAcAU{BwB_AqCqH`@wN]b@oAoCcBwK}Ek@qAkDjB_EpCs@h@{B~IcHrFYjL`Ed@dAdD{DhMXtDhAx@lBzBgAzBn@fEdGPhFz@pAbDFnPsC~@yKpEwIfDqDr@sDjSoDlDp@rEiAlF_EjEaBhDFdLuGbDqH`DiM~FaD|AsHj@g@pJJYkCpAgF]k@xCyCrBJC_EpAuC`GbFjFUbR`DzGlJ|C}HxBiAFoAdDyDj@uCtALtCiCnDr@r@k@o@mIdEGBcBkB{B|BcJtEcC`MiApEwB`@mAzThExAe@qKtAd@\`OqArBr@nBo@tNdAz@fAvBrMm@xHbJfLlG}A|CvD|H~@tAw@zDtCu@}G`HhKoAqIzBpExCpC`@xCf@JRm@uAqLfKgB|CsDOdClEuAjC`E|JjCnI??dAtEQ~KaIfBP~BkBn@cHwCbBaFg@~BqAz@b@bBiG~@IfAgFwBXFxAcCpChCmIzBCcDCPo@bF]z@zB\m@mAoBwFU}@n@LuAr@o@nAv@tDs@nAhAeBaC~BC]?dCkA\qCtCmArBkHYxAdBuAm@jBXh@tA{@$q$), 'official'),
    (pid, 5, $q$Tappa 05$q$, $q$Arenzano$q$, $q$Acquasanta$q$, 16000, pg_temp.dpoly($q$i~_nGuk~s@zG_IfBa@kBgKxAsJqGaGwGeK}R_e@o@aHmAeAkCcSsG_RgAmA{Eo@kCeFIaIrB_JyCgHyFy\gAoe@}A}RNwEmB}EmCeAoKuKsFwIaB{OuAyDJcEiCmHwDoFqCSkJiRgDaEa@iGk@T{FgSBsTwBLkAhBgBxOiAdD?lCgFtHoDzJ_GtA}DcAr@s@cATg@tA_EpCoDr@iAUj@eC{EcAO_CqAcB_C\yFsBgAdCmAgBcCCgFaDuCxA]dBeCgC}Az@mE}FxATcAqCz@G}BmAOgBd@_AkA]`DgCY]eBt@mP{BeEcEgAEiAuEgFX_Co@uClAsDmC_BiGoALnAk@Ki@{@JaE~GkFiIoAFU|AmAUTz@aB}Ac@qCHjBQgBi@KUpA`BtE]pA{@GoDmLoFw@qAsFmEkF{FiAsG~@{@_CgAtAh@kDbDkAlAeCrF{@zBh@xAu@iBcB`BsD?cHhCtCp@wBfFuETgDpAqClBnBP_PgAwC~@sHw@{DFg@rF`AC{E$q$), 'official'),
    (pid, 6, $q$Tappa 06$q$, $q$Acquasanta$q$, $q$Pegli$q$, 13459, pg_temp.dpoly($q$whjnGq}ot@W{@lB_Ca@yAd@s@OoBcA_A~DgD~@PlAiCw@eB_AoKoB{@a@aBr@w@v@fArAs@K}AhAYBcA~@pAz@]UeAz@cJxAgCmC{C`AdCyAqAFvByCwD\zD{GcEU}D_EwB{@{BnDkB~FyNWqGsEuCuA_JjFeADgEv@_Dg@uCxAaBrDtAhApCjBz@bEyAbB`DhDvBjBw@xJ~Co@aAxDjGuA~@d@d@fDuCyAvKmC`BbCT`C{Bg@xEw@z@lCd@OpAz@m@Y|A|As@\X]r@vDp@xDhEhBj@pCxEhEzBtA|DjDQl@gCnBYrDl@pE|HlEhCHuA|CfA|JwBpElA|D]v@bHhBJzBcCtAfF|HoBT~@qAbAGdCv@rBlEJtAhAp@gBxAGiBvF|AnBrBQXvChGfANeRyA_HSyIB{TlCo^c@M`E}[z@uSa@a@hCsBs@gApAwBByDxAaFo@{EF{IdEyGLsBtCoFoD}QsBwDd@]s@wD~@sB?{Gq@}As@iIh@}O~Ee@$q$), 'official')
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 6;
end
$do$;