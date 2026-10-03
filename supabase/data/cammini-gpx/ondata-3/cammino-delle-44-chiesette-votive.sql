
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
  insert into dtrek_places (name, meta_type, description, latitude, longitude, region, official_url, source, source_id, confidence, metadata)
  values ($q$Cammino delle 44 Chiesette Votive$q$, 'cammino', $q$Percorso friulano tra le Valli del Natisone che collega 44 chiesette votive, borghi, boschi e testimonianze della cultura locale.$q$, 46.15690095350146, 13.558088382706046, $q$Friuli-Venezia Giulia$q$, $q$http://www.chiesettevotive.it/$q$, 'gpx', 'cammino/cammino-delle-44-chiesette-votive', 0.75,
    $q${"kind":"cammino","theme":"religioso","lengthM":118001,"tappeCount":7,"tappeSource":"official","start":{"name":"Cividale del Friuli","lat":46.09297242946923,"lon":13.431155355647206},"end":{"name":null,"lat":46.09290361404419,"lon":13.431129455566406},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":7,"totalKm":121.8,"connected":true,"maxTappaKm":22.2,"namedShare":0.2857142857142857,"officialTappe":0,"computedTappe":7,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$apixGwg~pAxPkIok@cwB{HnDa[i|@FigAmzAka@eY|\cAuw@mi@{Ny@cRce@mBcZud@kFfRyiAmNlCp\aPlB?pYfi@fLcFzOoQgGnCrg@xj@xLkP`t@fIdN{y@nh@cP\uCi]kb@lIiSg^gCy[hWak@kO{G`Lyg@yVbLeEk\wRhMyM{OmEeUzP}l@}V{x@cv@|{@_f@oLw]s}@uK~kCwMiiBwa@srA|G_~AzVs|@tg@vYtGjo@sIjRlZb`@_Kl~@dG~PbuAyn@gRyBfHo|@yn@fTwKqr@vSoR{NW`Eg{@bf@i\~BqNoNHjUlBhFgP{NiZn`@|AoOw_B{Wyd@zYiuAhu@zk@~e@vmB|_@fX|FbcA~Sxq@nd@vc@`Fzu@pz@jOb|@|q@`g@yGc`@o\bWgUiUof@n@qj@sx@gnAq~@wrFbI}jA}Iyf@bU}r@xU{Ib\ri@|^{EpCpo@jp@tz@zK`t@x^xBla@xtC~a@pb@zPft@cRrsBsVqcB_eAtI~EbN_U`i@sJzvAdb@~j@~MhrArQi@tp@chAx@jM|BmY{XvJvZc`@p^qHrNn_@jW_NfDus@xv@iPnWrVuEb[hK`R}PzFtG`TiGjQn^n_Cnw@tXrMeJtLxd@vSe~@vOb\qTvg@mz@vp@tAb^dl@|o@mK|t@ceAfq@iGza@mo@_LwTrMn@jO_|@t[$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, description = coalesce(excluded.description, dtrek_places.description), official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-delle-44-chiesette-votive', 'gpx', 0.75, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 1$q$, $q$Cividale del Friuli$q$, null, '30cdf34d-767e-4cfe-91c3-0705bb823680'::uuid, null, 20004, pg_temp.dpoly($q$apixGwg~pArKuDdDuCiNs\}AiJFsGoAuFqDiHViGgHkQ}H{YiErFqBcAcLeX{EeSaG}N}@kYoBcEiAiJZgGbFgSiLaBmEqEgO_ByEoEyBoGwE}Ay@~EiEeB}\sFeLtCuB~JsDrFu@rD_A?mB{Dx@uH{ByEjBia@mG}DuA~@kGqDeNkAwF_CNyG}@oAKyF{Rh@gQwCoIqVwBgAqIpDe@wFf@gDkAmCc@`Ai@s@yBh@n@fF}@jB`BfAV`CoCPaQsF}C^EqAoCqAcCfCsItB_AlCkD`@kPgIkCiFgBLm@vBhCjE]~KnAlEeFrB{HEYtAx@vK_@bJ`Ey@vOjDhDjBjElHvFcBAjAaCtBc@hG{@nA{EuBcDsEaBMmBnAwAzI~DbKf@rPrBxD`Da@zAfBzF_Ap@lAlHeBzB}CtA|AlAY_@~EvCsB[xEn@d@Gt@eEfLSdEf@dBi@tDyAtCIpDmCdAMrDtBC}DbDlBYxAbA`Cs@yAhG`Bx@IjDoE[iAiBaCn@sApD}F|E}C|HoFpC{Ca@qBlFmEGkCjBwBtFoLwAsBtBgC_KaDgApEsIYoA$q$), 'computed', false),
    (pid, 2, $q$Tappa 2$q$, null, $q$Pulfero$q$, null, '3350ff8c-c930-47fc-b6bb-9e303a20d5a2'::uuid, 13132, pg_temp.dpoly($q$gjvxGstcqAc@}AgAb@uJbLaBJyA~AeCO{GyEoABF_EqBgDt@iBi@sDs@Ru@iB{BU{FoFiAE}AoP{AoAp@yGzEkGp@mMtFcEdGcNcCpAkFU{CwIbAsEUaCtGeOa@gAx@gFaAcAfCiAaBmAeEXwDbC}ApG{D`Am@o@R}B}AaNJiCyAqC{It@oChBkChH}AyA@eAiD@bAsEk@iCaAz@}A{DkA~A@kC}@cDt@m@ScDqBm@aAuCl@cAAkBhDoCUyBjByKlAgCIqAbA{@fCsImF_GlA}@s@eIZeEoDsLj@{EqHAaB}@m@aHkBnESfF{BtFeD{@kB|D{CpCgD`I_EmEcDzByE~GkB^aBrBw@vEmA~AsJeHsDi@_Fr@oGsEgE~@q@mB]_JoCPw@aFgE}CiH}Lg@}GeAe@_BuKsBrFkDrc@ZhQs@pEd@nGWhL_AtEEjNbBfHw@vDM|K$q$), 'computed', true),
    (pid, 3, $q$Tappa 3$q$, $q$Pulfero$q$, $q$Savogna$q$, '3350ff8c-c930-47fc-b6bb-9e303a20d5a2'::uuid, '55159be8-2854-4952-9fc9-e1d88397cb3a'::uuid, 17913, pg_temp.dpoly($q$yf~xG_zhqAcA@RoCyAqB^gKwAaLuBuFEmK}F_i@^yIcBy@cAsGaB}Bu@uF`@yDuBmI[cK}Al@DqA}BvA{Aa@RcDn@c@f@eFp@cAMyA}BnBwDt@\aDiBiCKeEwB_DdCyGXuE}AkNxBgAQ{Rj@yMz@iDJ{TpDmLbEkXtDyJXf@J}EnCEXcDfB`G`FvGd@pBbIl@~AbA?dBFcB|EcAzGzCbBjLUdHz@IrAnEXdD[hCx@bImBnHeFzHlF~DhGjAzAxIUrE~E`AnAfD\rLKrFaArCd@nDc@hJmCnMcEfEtDlJMjC|AdA~Be@fAcCpBX~IyBjD{EbDv@hLQpI_D`C}HnGiDlByC`Ho@zDgFkHQgCoCcCbAo@[jCqRDwA{@gBbB_DfDe[y@wAcFxFqIjDsB}@uA|AgKzDsDa@}DfAQ}EmAyB~AcHBiDmAoCe@{Ex@{DaDg@YuFeDEvH{EVsC`@FNoCl@k@z@HJpBbAo@DaCaAiArAk@n@dCRe@CeGuBk@aKxGT{FbDqFs@wDDmEmAaGPiKpBgKnDyHfLsC`JyHdBPwAeBqAATi@zCv@dAkAtBM~BqN}BvAkDA_AjAPaB$q$), 'computed', true),
    (pid, 4, $q$Tappa 4$q$, $q$Savogna$q$, null, '55159be8-2854-4952-9fc9-e1d88397cb3a'::uuid, null, 20005, pg_temp.dpoly($q$k`{xGgnuqAwCu@tCv@ObB`AmAfDD~B}AzEvBhFgPKcK}AoFqH_C_BuBhKEvLpD`EQj@{@EcLyB_JE_FaDcN_@kKaBmDqB[s@kIcC{EpAkCb@v@Zq@CcCfAcAQcCwCwCcG}P_KcN^i@l@j@pAyF`FkItDcUc@[DcBfByFC}BnAs@AyDs@UW}B~@uBSu@v@}AzAtCx@a@JyHi@wBhDpBhG`AzQtKpC`Ep@`Fj@VmBjFnFqBuA`GrEiAhEbBH|AgAxD~@~CdBzBd@|CvGtNhDbElA_@|@dErAdBXxAq@~BbFvYhCbGrF|BaDjHF~A~BdErC~AzBpFdDf@rDu@fFlGjANb@vDpBvCv@pQvA~IKfD|@pHyAfLpF|GlC~IlCxSpC`I~LlFdAhF`LtIzA|DjDjDHpBvCtIQvEd@jDkAxTvBtEtEpCtI]tC~AvFMzQrDpFhDhBW`MjMtHr@vExMlI`A~EzGdEXzCdCbAdCfC\zGuD`KgBZeAW}@v@gA~KpDwCgNaGmCkIv@cB{@yEuHvLoNfDm@bDiDcBsB}DsAz@{Ge@gC{CgFSqBo@C}EeHYaFzCwBg@wF{@{AFcFbAuEy@iGoGsHkAoHsEcDcCwEaEiDsBmFoGoF$q$), 'computed', false),
    (pid, 5, $q$Tappa 5$q$, null, $q$San Leonardo$q$, null, 'bf2f8275-c87d-44d1-9c32-417298a10d83'::uuid, 22230, pg_temp.dpoly($q$maqxGckuqAkFqJoBeAJmBaAeFwBc@o@oAgBkJ|AyFBcB_AeCl@{F}A{DoEmAmEsFCqGwCoNdA{H]mA}GqELiLsFoI{BiI?kGmCqKe@mH\eLmBaKqBkCl@MiCqGc@wP`@aEuBeLqBoAm@{FfA{AkAwN~CqGd@uRnBgQPyIeJuYFcLjIgW~JiSGkFhDyA`BiCxE_@fCfAjB_DxBtIbAdAnCKfBbGlGm@RrCm@lEd@i@rEtLnJkCdCtCfOeFFjHfBpE]t@z@FiAn@pA|GqAzB`@tCi@zCtAxEx@jCxEhEzCThAjAdG~KjDxApAxDtBLn@bO|BhDhGlAo@~AfAh@bAzDAbDm@pA^zHbFfHj@rI~@lDtAvBvDOZ`Cf@HjKgIjEhAnAbCb@~F|CpIrBvRzFpJ~DnTZhFeA~CP|Em@xCf@~CCrJtHbXfArKdBnBrChJx@ZnCfHnCJxD|BrB~DpBoAjBxAd@zHq@rHh@dFf@l@|A_@fDtDz@jGrD`Kq@nF{@X]fELpJnAdE_GtSJ`FqAt@uBbIh@|NcDx[h@wRw@qJuAaAyBqFEiIoA}Dn@sHeBsKmBe@mBcDXcEgEuGgTuDcFhBwOy@Ml@fA|@`BAH|AgAjBkUbAmDbBbA|Cr@JfBxHo@zA_FfCmAvCmAfNL|FaH~EUtDj@jBHhGmAl@kAtIlAdH$q$), 'computed', true),
    (pid, 6, $q$Tappa 6$q$, $q$San Leonardo$q$, $q$Prepotto$q$, 'bf2f8275-c87d-44d1-9c32-417298a10d83'::uuid, '54a303d8-63a0-4583-9fbb-459b0dc0d0af'::uuid, 12185, pg_temp.dpoly($q$ypnxGi{qqAu@dGyDl@aBzEj@~Ya@tD`D|GvGxAE`CtB`Cl@lCdJvIfD|Gz@lDPpJdBxLHlLo@zAjEtL`F~H{AnKfB`A~E]jCr@~BaCrBkI~EiD`GcIpBwHvCwAl@yCxAHl@u@xEuQvFwDlAeCvBbAKlC{AvCh@`BvCiFfA{FIgD}AJDkEgLxFqDMaFjCbEqFvAc@eCKbLqInGuHl@yBtC|AbFiHdDnBbCeBpBFzEwBLxAxApBzCq@gAnGp@_Cd@xEv@SdB|A`A`MQuCPtChMiMdA~@zFuA~@kXq@eKxCcNpIiClA~@lAkFp@r@tF_CbAkFzBpGfBNfJoDrIm@dKlCnDzBxEhNe@pKoDpNzB~BdE`AFl@{DbBa@fA|GdE$q$), 'computed', true),
    (pid, 7, $q$Tappa 7$q$, $q$Prepotto$q$, null, '54a303d8-63a0-4583-9fbb-459b0dc0d0af'::uuid, null, 16296, pg_temp.dpoly($q$ezexG}moqA}PzFQhAxAhKjDrB`@xAi@vG_FrHnDjKzEtIlBjIv@nFq@bJnA~K?vOlEbM`AlOnCbOfBFrF_C~CpGChEtCpAbEqChGnBnDgBnGpAtClENlElAZrD]~GgIrDrH\tE|C`IdAlJbAeKTyUv@yAdBR|CqCjBwMtCuExG`V|F`EyCUbBtEwEB^zFmJrRuAbF}FYq@hIkI~AmGvMkQtNwKxExAfJi@bMd@vDlAJ`BnD`EtC~KhEr@hErB`CzFjNnFhEXjSeDbHeEtN{@vGcJdIoD`KgFjDfFkDtAsDuArDgFjDkHxAoOdIkSrH{CtWmBdIiAgAOeCwE]m@gCuLdDM{BwF}E_C~DwIj@YcBcDvDyEv@yAdE_F\w@`E`AlBd@zE_UNuYbUiK`E$q$), 'computed', false)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 7;
end
$do$;