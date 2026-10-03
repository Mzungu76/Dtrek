
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
  values ($q$Cammino delle Sette Sorelle$q$, 'cammino', 42.584741657863475, 13.493987709864165, $q$Abruzzo$q$, 'gpx', 'cammino/cammino-delle-sette-sorelle', 0.9,
    $q${"kind":"cammino","theme":"naturalistico","lengthM":124294,"tappeCount":7,"tappeSource":"official","start":{"name":null,"lat":42.553051342288526,"lon":13.536035920661998},"end":{"name":null,"lat":42.551986,"lon":13.538931},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":7,"totalKm":130.1,"connected":true,"maxTappaKm":22.4,"namedShare":0,"officialTappe":7,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$qcvbGgwrqAzIec@~e@iBpTfUsG|XhMpj@fBo^zYub@uB{TbOGdQu]j`A}PuNsOyBys@cZoItIi\gPbG}VoP}XzWmm@f@aNae@pGp[sv@\bGyd@u^{m@rIgKae@eU}]~KkMmJp@soCg^xSnVhXuLbZbLzRwDhVu@_VqZ_VfAb{@_h@{nCyV{HkwAraBfBfw@zb@lSlWuj@bEx\pYdVuKhYfDfVxXn[p\~ByCte@hg@gUhPdb@zNvA{B`]tl@bKms@zn@uq@aJaSh\cvAxh@yPjt@sPpKoc@aSmHtS_`@qE|Dkf@qJ~@{Uyq@eUnTqTyIo_@nMkRaIcAmZ{AzKl]h_BmKbTjOrI{Hze@fa@|QvJpv@vIqJt\t]nQsV|E~UfP|BbbAq`@ph@rx@pj@nJ{U_ACjo@gPiXgRn\nGjMwb@lKvOnn@_l@zjA~c@fnAxkA_SDgQjk@a^tHk\sCzkAbYsIaArWh_@r{@bc@lQjOqgBeMncB~MiAhYho@}CtcAxToB`m@pl@xj@hOjEzTlBgZnc@dCsb@_CsJhgA_d@d_@y_AjiBan@l[xoAqvArG_cBvUm_@cp@sh@zvAbYor@mwAfEkx@_Umh@sFgcAm`@s}AB}S`MxYhz@`\ub@cw@lBos@oTmIeHzP}DaUyQiDh@lJu_@om@t]sXeMmPxJaYaTgI|XegAhVjCr`@u]sSUvEy^gRdG_XaWxSmQcDci@lF`QrTgr@tNdUbFeZac@zNuC{R$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-delle-sette-sorelle', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, length_m, polyline, source)
  values
    (pid, 1, $q$Tappa 01$q$, null, null, 21565, pg_temp.dpoly($q$qcvbGgwrqAbAi@SsGpHoMEwJdD`@pE{AzJTrFiEvFbCt@|ApAFrBrIlAx@dEu@fBfBx@`DOhFcGrQfCj[xAJzC`MjAVz@cAg@_MrAkNzIcQfI_HvDqGJ_CyC}LV}B?jF|Ay@_@eDbALFlCrE{ADcC~Cn@`AgIhAD|BiMzHiEzAC~DrBvEUbAaBtEk@vAp@vAm@jA}BlCFdC{BxJOjDcDfFgBxAqC]_BaEe@uGwDfEs@}A}CiAx@\xBiBj@m@qAz@oFyB{Dy@oNf@sQi@iD_C`@qCuAiBmCaEIeHcCzAiDb@gHjFuKUaA}AXkBw@iBp@sFnFoIuB}BwBqFgB}@yE{CxGcKvJ}GhCePlBmDcByDAiCaDuBtEe@JQu@gGT{IsFaAwBvBMtDpA[cCnBo@iKeHmEwAvLl@oG_Ek@uBT_Bc@nBTlAfHjEsLg@dGjB~IlGkC`AoBwB`AjFmB_DyAWoAXfAxAw@h@{GqA?xBsByAwBtAwN`AkNm@cAwDl@aMrCqJdCmEgJwTmScXh@wBxEkAnAcEaE?}CmEoLiJwEtAyEcFaAf@yAe@qA|A}HxAqLdFcBsDgJyDDaCcAsCHiG_Bq@{AiGnBuE~AsKhBwBoAuMiAiBYcDpHkPo@_@ZwG}BoG@kEgBgFgCuCpBkDvBgKq@h@$q$), 'official'),
    (pid, 2, $q$Tappa 02$q$, null, null, 18013, pg_temp.dpoly($q$gmybGcv`rAeBlCuBPoBbBeA?f@mDiAbBsBD}GbGoArCEbGrKnAdGfFzAlF?fE_CzBcHbMQzAH|@jHdElBvJqCtKe@rIa@eBiBAAiByAyAHmCfDeHcJcGiBP}BaAsCsDcBwFm@?r@tRjC`BcBAa@~@}EjAxA~Dl@~ItCpKq@nBgEcCiCaIGwBm@SVeAyB_MjBcQeAcA_EM}CaCm@qB`AkN_CuOLoMyBmEUuCqAgAWkF_DyFEuDiAkA_Hx@uDeCIqBmBTaBgAcBhDqCBeBjCwAc@mCbCqC\wDbEyAjCMdEaCzGk@nFiEtAOjDkBXeFbMwB~AUa@{AdDcBOGaAgCeAuAtE[nEsFj@g@lCvBbAgBxBaFn@T~AcDbHeAlLzCbHp@xIlBvIpDvH~DfCpB`DbCh@rO@nL{JlE}QvBa@w@gKnALlA|Kx@jAz@nMxIbI`D_@pBx@bFfKkA|IwCzCMbDcDjD|BvDc@nKlA~CzFbEVjFz@qAfF~AvGnFZ[q@|FrK_FdFTnBr@fEtGDrBsCpSi@vJ\vAxDcBfIUjBzAjEcAbBmBzAiG~Di@nAcEhHjErAfE$q$), 'official'),
    (pid, 3, $q$Tappa 03$q$, null, null, 14701, pg_temp.dpoly($q$smybG{hxqAxBtG@bJx@~B|JB|BrANtDcDzSVnBfDl@nBdCfDXlErHfBHpHkFpE@zD`B_JDrBrAv@dCsBCPf@m@Nn@z@aB]sBfBvB@_BlA]pBeGjA?zC_BsBiCw@w@fFkAx@sBe@AdBcE`JoF~CeCa@qFzBeAg@wCr@aB_@wDgHcE}@kKPuCsAkIrFcB|KqEvGsKbEeE^kNgA_@fBaBl@sCpHqCnAsEtIuG~FiKgAaKvBu@tBXbDcAdAi@zEj@|DgF|@sFrZgDvDkKxEaMh@sCqBcDD{FyET}@kAsB^m@cCeCgCbDYxFkCvFoCwBeDO}A{CqJWqBtAgDRWsAx@iGKkGfCgI^yHqJ~@_AaDCyDo@^xCwDgDm@yBwEWkD}D{@kAkFcDuC|@c@w@m@n@MeAaAIsAuBpA}@QOpBg@]yMzOuE_@sCuEgIcBaHdE}FMcF~AsCy@wBpFqAEyF_A_H{FuAsLp@oJ_@iA$q$), 'official'),
    (pid, 4, $q$Tappa 04$q$, null, null, 19782, pg_temp.dpoly($q$eqecGu`tqA{AzKhA\z@tKvIbNVvH_@vGnH|KAxEkC|CZnFxHzO@jAi@TsEaAQjO_CvBjGpCHv@pCbBrAWN|@S`Dp@vD]lLsEnDi@|E}@dApMe@`@`DaAjItADUj@t@`@zFs@vAsAj@bB`BPGl@dAd@dCpKpBlEO|Dn@lBl@~Wp@dAhBTjCeH`BaBjFrDtBnIhG|AhIrJV_AnCcA~BkLjAhA?mAtBi@^aCdAS|E~UfP|BnIm@vNeDjDwDhBGpBiEnKoCbOcInIhDtErJbDtDbBfFnDpCfElGCxAxArCt@hFbMPr@kA`CIhOpDfCxEdBf@_AVsEoD{F[kErBs@~Bx@|MmA?_DdFlB|GJhFhB~DeALkAwBkEeBcCsPeAe@aDrNeA|AaAh@}@yDm@Z|@nGdEcA}EtDPfDiGwAfJ`HwAhDyD`CuCxD_B[~FkH^_Bi@QsHnH{D|HmMaBAlAvElFoCnIbAxHbA~AfDiD`AtArA|DJ~IQn@sA_AuAtDf@lB}B~@IlEwA@aBvC}GjDlExKJdEo@vA{FrDeGnNyCm@gAlDqBv@nAzCEhClF`BdHlLYpClAhAqAbCrBrDM|DpBhBt@tChHb@`@lJq@tAv@vFj@RpJ_HxApAvJrBw@{B$q$), 'official'),
    (pid, 5, $q$Tappa 05$q$, null, null, 18894, pg_temp.dpoly($q$eb}bG_qaqApIqLcJaBhBw@rG@~AeAj@^rAw@OoAv@_@p@`AGmAdBl@SlCPw@Z`@lCu@DhAf@AM}Ap@NA}@iBaHlAyCfCcCr@h@xCcAbAuCtCc@lA}CzDaAdIaJjGgA\o@w@u@@wCf@qGlCgElCLHaF`CdB}E}@t@BnCrD}FzdAfHcD`ICxEkDNtDpDzKk@\uAcBqAf@o@~ElE`AYfAtBhIfD`FXzLt@lBOvCxChB`AbDpEfBhAdDx@XFmB|DqBdDbEdAY~HlElAtAKz@vCfDnAFl@xAxCwGaAcA[uDfDmAnBsE}@sI`AoCO_H}@_D|@aIgBgAU}AfCiF?aCrA]RgBe@oApGIcD}En@_AsAgBl@_Cc@~B`AlBe@`AzCpEcGRLnCiAn@KlCaBzCCnD~A~@aArIbArDLlFy@~Ct@bIsB~E}CvARxDt@t@kA|C|BwB`Fy@~BfBX~CbC~A~BfPxDnGAdH~Gb@rAfCaCjHGrKkBjAu@tD|AfEgAjFbBfI_B~CrBvHbCbClCn@`IcHdB?|ClHzAFnHjKvAHjDvDpBb@p@rB|FnApFdIrMv@lI~FdHrBvBQxDnBhD|Cn@tBMfLr@kG?qLx@iDzEb@vGjCtBe@|CaDpBY`DzCrBZ$q$), 'official'),
    (pid, 6, $q$Tappa 06$q$, null, null, 22444, pg_temp.dpoly($q${oqbG_`zpAmHaF_HrEuBTaKoEgA\yAhEFxLmAdLj@`HcD~K{A|OgF`Ci@|AaHvFeCf@m@zDqB|CeIjDqTp`@_GbYkKnKoDf@kFtO_IfOmDXkJlFaCYwFjMmQrEjQaFjDkGh@eDrCmChBcEnAgECgI|HkCd@uHnLZhEk@jIcJbCeM@uJgAyCnAcDwCyFbDiAmCeDnDeCU}DxBsHs@_JxDqC`CAo@{DP}KqB{GvCaBX{DxGg@@mDhGyOiAaE}JaFqEsJi[{OtHa@~AmAbKCpIvClErHdBn@~MbAdE~DtTvDqE_EW{EcDuDaHuTsE_Fs@uB`@sAwFaK_A_EaLyOk@}CzAqUm@yKbBoGhBsAG}D{E_HcCaHq@sFcFaIiAuD_B{Kf@_RgCcNy@iJD}HcFmJu@yLgDiEOaH}AoB{Ech@wBmFyCHOgApC_EqBgF[uFvBdGdCfCbEjMhAw@`DbAlEKx@`En@LzAq@k@qAX_@rD\~@jA~AFTdBtAl@pAfCrIzE|Dd@d@nBpDtBuHcX_Y_^aBmNn@sCxC_C{AeC{@mLb@uBhB_BNcCwB_B$q$), 'official'),
    (pid, 7, $q$Tappa 07$q$, null, null, 14681, pg_temp.dpoly($q$edubGqlgqAgCeB_M_CaHpF_@dDZbDw@kCWaG^_BmCsEgEDw@o@yBr@_FsDc@l@lA~HScBaCu@AmCcBwEcCoBeAeHsF_I{IyFlBgAbJErFyCnGkQD{Bs@qB_Ci@gAcCoEqC~CiIvEkDj@}Ei@mBiA_AwCD}DqFkElAu@iBTmErCmKjAoAcBc@e@mAdKuUtAoBt@FhCoFfA?o@wE\aF~ByA`C|@~GJlAjCxBN~GaLPdAnEyD`BJu@`BrImBVkFbBy@t@yCKw@c@LiGnDkBaB{BEGh@iB}Ax@uIhAcBDuC~BqEq@wEeFhAeGnD{BJe@}DwAnAyE_@yAoDIcHoHoAs@oAzAsE|C}@ZyBxDOlBnAv@sC[k@~@aAHkDcAgDh@s@u@yAVm@aDgFj@kQj@b@bAzN|B`@fBiDl@_MtBlAGgIt@nAfDIl@wIbDqN~AcArA`LrErHlBr@j@_@uANyAyAnB{@`CuDPyEbBoHGs@aBXNkBy@M{DlIcFmEqBWiA|FgEd@iEbGAyB_CVdBcIyBuE$q$), 'official')
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 7;
end
$do$;