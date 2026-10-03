
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
  values ($q$Cammino Basiliano — Tratto lucano$q$, 'cammino', 39.97393869794905, 16.08226826414466, $q$Basilicata$q$, 'gpx', 'cammino/cammino-basiliano-tratto-lucano', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":91058,"tappeCount":6,"tappeSource":"official","start":{"name":"Lauria","lat":40.04089585505426,"lon":15.835524145513773},"end":{"name":"Alessandria del Carretto","lat":39.959026873111725,"lon":16.379995811730623},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":6,"totalKm":93.2,"connected":true,"maxTappaKm":18.7,"namedShare":1,"officialTappe":6,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$snksF_{s_B~JbA}CiTjP_\aMt@~@_j@iH|NuCoMlR_e@xKEm[o`@~Uag@`n@kPlx@i_Al~@wxDgs@s}@jHau@wJ}i@nc@{s@fD}a@bRpAgN}WpNqPuLif@rFwmABtb@xMtGyHfIjNrI~JqTsHup@`_@oq@_@w|@oUccA~IadB{QmN|Zql@qLyXtUkWuGgLfRmHsB_^hPwNlVlD~Rri@lKgXzlAoBdPzXhU_m@pfAf~@h]fDbwAkl@oSwOuN}`Be`@ok@|CoI}n@pDs`@_UfBlNuGsRsZ^or@qe@tAuM`KpHyFiT`\y|@wo@jAiWe~AoOo@|V_hAsv@}hAtKya@eWir@pk@ciBra@}XmCwPr}@_y@tZcAkE}c@zHtTtLoCdEv[zk@}CgEpNb_@lIux@tNdJqf@aWdBiEc\uLvCyMog@xTme@cR}\oCqtAmTuHc~@eyA_LifAmj@a|@jFgc@kYogAdEkP~_@pWtRwWkF_mAtt@czA}UoViDqpAn_AgfB}IqEnNwfAkQ|RGm]d\qeA|`@gb@fJeaAnKaE_HyQ$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-basiliano-tratto-lucano', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, length_m, polyline, source)
  values
    (pid, 1, $q$CBL-01$q$, $q$Lauria$q$, $q$Castelluccio Superiore$q$, 18288, pg_temp.dpoly($q$snksF_{s_B~JbAq@mC}DsBhCkE@kBlAaCyAr@m@a@rDaF`EsMxBXz@cGCo@kFwAg@j@QwB{@rCv@zCiBsBi@lAkAeExBmQsAoKdB{DeEpCcB`F?hCTmBa@w@}@_@mAdA@oIfAoDz@e@vA_IvGaDxBgOxKE{MgCmB{GgByAD_Do@aCqDoGjD}FpI_X~DgC`@{AdN_BxDwBdGMzPeIvEgJtImIzFcCb_@oe@jBmK`BZrHe\jFqF|DaJb@{Do@mFB}GkAw@XkAbKiUhBwGjHsLj@cRtHec@]o@uEjCm@uAhA_J{A}FkDaGwA{AqRiEgGuJuE}MkAoItBqKvAqPhDmLk@cDkFeK_BsXdDoMfH}HxD_OfOmKhDaOqAiKnAqEtDKbF~FxB]nAcC?gKm@iDwAcAmDL{Bw@w@}BHiCjB}DdHsBtAuByDqRWuMcFaD~AiD^}Oi@qDtAcIuA_FrBwBjBcJa@mA$q$), 'official'),
    (pid, 2, $q$CBL-02$q$, $q$Castelluccio Superiore$q$, $q$Rotonda$q$, 18747, pg_temp.dpoly($q$}jesFkio`BaAtDJlIy@z@lBjF{@~Nf@f@~@sA`ArBCvCt@~AjEiBp@~@gCIqCxB_@vErAzDdAxAnDfA`DIpAq@|FqKn@mF{@cK_E}BTuKqAaMB{EvCmFdBJdAkHpN_YjEaGuD{RZiL|CqGc@_S{HeJ|CaO}CaDiAoFsByDj@{KaBkD_DgCdEqIoByGoA}\zGaL_FuPlDsPnBkBcBaE}KeAyAeF`CaCpA{JzG{@pBcPfAiBnCsAbAuC[qCwIyDaAuFBwFhCuB~EqKnEeBzC}Ce@uCwEoDWaBfRmH{@kNR{EkAwGpMyC`BiCIsEj@`AjBH~ChGFsEhFfCbE{A^`AaAvEnDeCd@nItEvCtBjK`ALT|Gf@^`CeA`@wDhFiPpAx@vOeA~Bl@j[kCrFb@pQi@vC`B|BtEjA[bE~OP{CtAYv@{A|@oQzAeGzG}HrBY`CnB~@xIfAdDtBM|C~BbGjAbItEbFcAtAX`DfB`@~DbBHjH~D_ApEt@pBz@m@Kt@dLNMbA_EzBtEiAhBh@r@aC~BnA?fBtB`@$q$), 'official'),
    (pid, 3, $q$CBL-03$q$, $q$Rotonda$q$, $q$Viggianello$q$, 10138, pg_temp.dpoly($q$_pzrFmw{`B~IjBbNWnVmGlOaN`Y}M~EeE_Ha@oJuNYoSqDkI|A}DZqDkCwB_FkL@oJ{C{H`BaPsC_MiEaFgD[{BeHeEcH}EgCH{AnDkD[gAsFe@iGiEaJdJkBNkAiEyGzFkEEqG}HiIsBuGuEaEw@fDlGFlEiDw@iBcD?aBv@~ErCnBbAWWyFeC{E{DeC_FsAiEt@cEaAeG~B{CoHgEdA{EcJkMcN{CX}Eu@iFcCcA}ClBuBj@aEdHpIzA_@AiA$q$), 'official'),
    (pid, 4, $q$CBL-04$q$, $q$Viggianello$q$, $q$Madonna del Pollino$q$, 18203, pg_temp.dpoly($q$id~rFamdaBqBwBVeAq@gAmAs@k@{GrHuBxBqSMiAwAq@AaBbBmEfDiBN{E~H_M{NaE_Jb@yHhE_Fv@aDWpBaBDsMeIaMcPs[OiDr@aH{@mSeFPiHaA`Jq[bBqW|FwKx@cFi@q@gBx@{DeBz@wE_DjAsAe@cAgGKmKgDyBkBd@kAs@KaAfA}D{FeAgCkLaD_CAmDe@_AkHoDrKi]@oCaDwNkHj@qAsh@s@_@}BnDs@DWmSxFsLtEu@jAwCjGgFlHgN~AcLzBgAj@yAv@}H[oHn@oDdI_JzAoIvJeDfBaCfALxAzCn@O?gJ}CcCNkAvC]zCsCrFyAbBXhD_G~BoAz@uEvAgBnF_BbCNN{CtBwEbH_IjB{DbC`BdGf@dB{@fDaG|@NfA`CvAa@F{AcA}CuD_HhAuI_AkFZaAtIhG_ApCd@xGtLoCIzQhC|B@xBbAbAnH[bIeDnA|AgBp@A|Av@f@U|Bd@TdF}CbFi@nH}Dj@LSfByA`FeCxC|GGzCsAaA`BnGR\x@g@~AdCPDw@xBs@K`Ap@EFn@YrCjBK$q$), 'official'),
    (pid, 5, $q$CBL-05$q$, $q$Madonna del Pollino$q$, $q$Terranova del Pollino$q$, 17261, pg_temp.dpoly($q$}yyrFouvaBmL~IqK_BDhAaAa@gB`AyF_@yH`A|BsGYaAzAyF`@uIxBkEH_CeDiBgGrCsIz@kAeACgCyBoA?eS}H`AwBtAe@kH`AaAQmAyDgBkAaHwEaGEgEn@qIvA_GnLkK`CoF{CcByBmHqFwIb@eC_CmAh@}Aq@iAdAeDkAcDe@wGzBiE?sF|@_EeHs[NuK}AuBoH@_HaEiE{IaDwCsCoLaKeFeFyLyFkFmIeNsHoP_LifAiBcBuKeDaBsIcB}@o@_AD}AgCsCjC}BHgAiBaCoAeG{G{LuDt@zDm@_@sOLiE~@yB@aGsB}DkBcSuAwDeEaEmDm@?sMiA[`@oByBeMdEkPtHlKzGdB^pBpB|AnEeBjBrDc@qLnCiA|CeDUyBdBp@ChB`A}AMiDxBfA`@rAnAk@IgCiAc@i@uCAiI{Ae@{@cBbCqQvCgE_G_GzBPkAaFFmGg@qDnFqK~Aa@f@gFy@sBpGiMlD_PhDaG|F}D$q$), 'official'),
    (pid, 6, $q$CBL-06$q$, $q$Terranova del Pollino$q$, $q$Alessandria del Carretto$q$, 10569, pg_temp.dpoly($q$ac_sFubnbBrMmOl@{CcCkBo@gC{JgGmDsFQuDvAaR{BeClAkJi@mCuBuCjB{@h@eJ~@eBiFyDMaIrDuAv@yBa@oEtBmBxAwFnGkC`CcD^mIfEeBVcBrCsBgB}@tA{AEmFvNeNnJwTKiGqIv@fAqI|C{AbC{Fa@cCLcFc@g@t@uDy@oJnAcEGsIxB_C}FGoCrHqB|AkArFs@cLn@_BCiMtFuUjCoFL}B|K_RJwArBoBGeJrGgJpK_EvK_Qx@iIfCqGCoAvAeBq@sGu@i@dAeDn@qKn@iBRsInKaEoBsDMwChAq@kF{E$q$), 'official')
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 6;
end
$do$;