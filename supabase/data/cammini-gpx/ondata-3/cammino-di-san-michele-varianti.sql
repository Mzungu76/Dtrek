
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
  values ($q$Cammino di San Michele — Varianti$q$, 'cammino', 42.66615, 11.50226, $q$Toscana$q$, 'gpx', 'cammino/cammino-di-san-michele-varianti', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":187346,"tappeCount":2,"tappeSource":"official","start":{"name":null,"lat":43.249964,"lon":10.870174},"end":{"name":null,"lat":42.95694,"lon":11.150356},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":2,"totalKm":142.2,"connected":true,"maxTappaKm":76.5,"namedShare":0,"officialTappe":2,"computedTappe":0,"longTappe":2,"shortTappe":0},"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$gg~fGqajaA}Oip@hQe^d_A`GxVun@jn@~LlUg\vW`Frg@iv@tT{C~Dc`@l`@q\xCarAtv@qAx]~Yxh@_l@bIi{@pJdL`YaVdVpFuFey@~Nk}@}N]nEab@{KeTsKlDiAoj@qRqSnf@{bAyEkGvi@a\oFwIzMiBSq\dRyBmCuQzJiGg`@_\|OmaBiGohAqQ_[nKel@aEs_@~SyJbDal@jlAmfAmOcYmAur@dFsMfJ`G~a@gzA?{dBoWc`A`Mc]oS{mCbKqe@teD~lBvUqGrYjRrQmMxV~e@rp@z@`_@`Xto@eG|a@h[`G`n@x`@f~@h]zAv]cUhA|MnZQntA|}@t`@{Np^dJ~h@kWzHnKhJmYnhAhIb_@{UhD_s@r_@o@nr@enAf{@rt@le}@}phAmk@nJ_]yL_\vb@wUudA__@zAs^k^i\vp@qMmXmNv^k{@fn@z@yMqm@qDvCuXcb@wV{Peb@k|@e@mEsXsYnMksA}Mq]eq@sh@vVii@qUsY~IkGnz@iShIoU`dCaaBcJqVvYegAqRaIxQgg@oF{JfS}k@kh@qJnYbTziAcNcG_MlQ^`h@oi@}^cq@rNyaAol@}]jJgZq_@q[vTca@qIeKdm@~YzA~Jj[yIpc@lSp`@wb@luAkZfJrKpeCqQhRd@ve@aWxx@pU|g@_@zi@yrA|Ia{@~fByYhCpBrSe_@~r@}i@wJgn@ljBna@xhBzPdLwc@pD`Xjy@qHneEcNvHqYyWuWdkAxAdYp[xNca@~s@wRtjCdKrkBiRd~@xQl[s[d]q@vq@iU~HbQnVbPxnBix@dyA$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-di-san-michele-varianti', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Variante Sasso Fortino$q$, null, null, null, null, 65731, pg_temp.dpoly($q$gg~fGqajaAkEcNb@uCcAwC?cDeEiEkBiL~@kBzIyGb@sFm@sDlBAhAuDx@Jz@dClBw@r@|@ZsAhBObDsEtDxG`Do@jBf@bHYvGn@lChBfDRh@eAbB`At@oInCwAJ_FrAcBe@{DdBd@UcAr@q@~D[gDm@gBuBfEm@|FoGvE`AhB~EfAt@fDyBxDQzBr@`BbA|B~GhHkDxBFxIaI|Be@PiD|BkHdBiBfAAtEjDbAvBpCiBzC|@fCShGqHvIeFIsDxFqCrF_Mj@i@hAv@rBsEdDeA_DaBa@}AzKRxGoDr@mMfDsF[aJhH[RcHrA{Aw@cAl@]tCnA|@{GpMgFH_U{BoACyApBwI_AoAhCmE`@cDQqIxBwHu@sI|I|@vF{CzJwBlBDzCdBxOV{@rCfBbH~CzClH`C|F[`FdDhFeFtCIlAuHpB}Cz@uDKsDfKuA`I{Gn@mC?gIs@cXtCmCpDaOnBbG`G`D~OeHE{@zCyCVqBjAGf@kBbJrGn@gA|EjArBe@qB]?{KsByChA}Dc@}HbA_LyBuIp@gMt@f@p@{BpFsB~@_D[kRnAoPq@iEiExHsDyCmAJp@{BUyBnA{E{BuDAkD`CyG~ASwHeKcB_HwCv@cA~AwDTBaBkBcE^kBg@qB`AiAWiH~@{EcA{GaHaFoFcAy@wAe@sGzAcIMoFf@gArC}@WiBjC_IpKgLvByExEcDlCqFyEkGjPkNvHaBrNsIHwAe@h@aC[qAmG|ChA|HsDMs@kC]xDeOs@yIvAnAhEq@mDoGjAdAtCq@nGbBXwAiAcAw@_FmAaAf@wCzJiGiDqBiC{DqFaBd@qFyCzAeAOwBoAqAeD]V_BkCbBgKUkCcB_CdA}Hg@wBzDeNSuH|DeLdA}IBiGdByEk@oRgDyKnCoDPgHuFyM\sJmEgOcKwJ^iEvFcI}@cAkBGM_DbDgHOoDtAiDdAi@wAyB]qLb@eCoBaJzC_Gt@|@hFgCbBhCZoCbBi@pAyI_@uI|AoDWmG|@gCQkDtDMfBpAIoCjHoExDa@v@uCrEqGrDsBtBPxAu@dAgFvE{HtDAnAuA|NsVq@uDcAcAcEPvCuBJgFaFo@uCmE~@}Eo@}RbAiEqCoJO_Fl@{DvDwGjBQZ~Ab@g@vDZB~DhBaLzDiF|Fm[zPmi@m@uD`BiMViO_BgPsDaNMmFDkHfA{GfCqFcJkf@_DyEkG}Q|BmFlGcHt@qLk@iGeCqtAqBkUaB]UcHn@]e@eH}FmEr@o@h@{IxCmGjCwPbBrCbCiItIbDnDxD|@MtNzHn@lAzCj@v]|YjEpAdCpCbUpL`AaBtBp@hD|H|ClBvCvHxKf@zDfC|@IlM`PzDqAvBTbLuE`EbIvMjCxDzCpFmC`J_IhBh@bEbGz@zCOhCh@zCzExGZlC|BfAbWYnXtApClGbGrD`AlChPpE`IaBpIn@pH{CvDOtCwB~DvB`Ag@N|DjCtFxGdAbGOjHlFvBpDjEdRt@tKfArBsAzDJtDfDxBbDrSfB`FlAm@dBnCF|BhH`DJjKtAj@|@|DtJ}@vBhAzMnAdFeDpCLdCuDdD{@]eF`@}@nHUv@bEcAlDtAjBvJsB`C}AbD~CpE^pCvBfJvM|DpAxBbDnDrAzAWtAjBvH~@pDtGlB?nEtBlCtGzDlAlBi@zHhF|Pg@lD}A~@gChGmFdIEpIvClA~AhF^`@rA~DoDbG\bHqCnEmIfKyCjChAb@bFjC`Bh@gChBi@c@sETaDbFeHdCpAdIZ~KsB|Dj@dN}B~IHlG|@fD|CHzDpAqA~AuF|QkErFgE{E_K~BgDEgIvA{DFsE`BcChA{FdFPbJgDpAtEfHe@nAiApCaDpC_JFeCfG_LzFaDrCj@bAsFrCwC{@yB~C}BrA}EjDaCjAqDs@iBvAgA|CYxBdAz@zCxBrBlArEdOhJdZxX$q$), 'official', null),
    (pid, 2, $q$Variante Paganico$q$, null, null, null, null, 76481, pg_temp.dpoly($q$y_lcG_meeAsEcBeMvBgEeBgGZkHnGkEp@mAs@aAmDgAfAwCY_B{E}F~BqFiDEbFqFdNyGb@mKhKkJqUyBm]yCYNyJ{@Dk@gCgG~@oAk@gTfAwOyV{MqFkKfK\nEcAvEqKtKcClE\bDgIeA}@{SkAkAgCfG_@dFuBzF{DjBS`D}BOiDrFsJdJy@|CmExA{N`LyAw@mGvHcCBz@yMqK|CcCsA}FdCo@kBgEuCeM_CBoDnFoEcDA{CwBbF{HoF^iHuD{GuNqByA{DQh@qBoC{@aDaHAkGgC}AVy@o@RBiAcA_@qA{CaDbC_DSmFbFsDsA{@oBkEx@aF_@uCeD{C{@eGm@eD~@mAkGDmNeCy@kEBqBtEkBYkDtAk@`CqEv@wDoDwEa@cE~@}C{AyBlBcCcA_FlBgG{HoJwFeIrD}NG_G}CJ{TuE_DgAiFuEJiFmJaGnAgDnLmLcCkE`DuA]yDvFyM_DyDyBcBgC{Dw@wBgB_DU}ByBq@fCoDzA}Da@sL|CcAzIx@vCcBnO`AhIiDrDu@lJeAHkBkByBP}IxKNnEyDpJpFfIWlFsFnHeBrED`Nn@fBcAToAvDsAjOcAVkE`LkAbRLzBxAfBaKiAcLoE_G@oDgB_D`CeAtGeDn@wD}AuDaKyHEeJ~AqMe@gFvD}IjPkDrBqKu@{\iOaOZuLmAeBnL{EhDuJE{FmAyHb@{I_Eu@`DLxCyGbIy@FiMyKcDiJwCn@cDs@kCgGgEiDmAmCqAZyCxCwEtTdC~AtAzDjDhDIjD{@fBjAXMvBqA`Dp@fF}AfDlAzBe@pB|AjALiBn@]vAvDh@`IzApGqBVkCwEkBRyBwAw@hAo@c@Wd@cBxN{EFDpGrDvRq@zHgBzAoFeDcLaC_EgFuBeGkGmByByBcFzEiCwCqB_@_AbF_F[mAt@qFqAmB|BuKdDoCc@iCgDaNkDiDJyEgCIqCsFkDoG{@kMaQqE]gElAsEvFmCg@cApB}CEoCmEaFGoCgEwAd@GqFw@sDmEsFkOhOeKlD}LQu@oAaNuFmBDeAnBmCpScD|HMdKnB`CvOcDvE|BcB|GfIrGhCjEPlCs@vFHxG_AxCuC|ByAfJzBtB@rChA|CpB`AtBfDFfHlDp@f@dA{AxGmD`G[fF{B|Ck@xEeE`FgF`Mw@tHJzGoEzI_Az@kJvAiEk@gDz@mAbELbKbEnEr@rDq@|Qd@rHuFfRfDdHs@fRlBhJz@dMpBpGqQhRhBpMcAdWeDxJ_DdEsEnXgFhM^jCjOpVdD~Kl@pGmA|ApBbHLrF_CrMcJgA{OvE}Ci@_N~DgAQiBsCcK~D{F_BiI|BgB`LkAnBgLnP}JbHaEzO{AzKeEtHwJtHoBrEb@`DkCTi@bEo@mCwD{D{LxFpBrSqKdZwT`PbAvFgAc@_BnA}KqAiHoDmNaDqBl]oSzUuBrG_AxToPtVBbJtAt@tA`DpJdf@zMjZPhL~@`Gp@hA`@WtAvDnIzA`A~Ao@~EkDzAuELcEy@sAmCeGsDgEbFtLzOnAzOhDvEg@~AxCzM[|MbAxNChJoEb@OnAtAd@JvAbAFhBhE{A|E|@zDQjLiEjQPrC_F|JPja@w@lCXzPw@|JlCxFGvC_I~HcDGmEuDaFTaLyRmBxD`AzQn@VmAbGaGhOiJlP_BzGhEhQoBzF`CtBfEv@dHiAvDv@hB|IkPzLEdJ_AdBtA~AEvAiHdGwFxIU~Yi@jFtAbGaGnf@qFjUf@`FaEf[rCzZo@bOtBrJv@fP{@bQ|B~Dp@rJyLl[Y|IuCjM?lHxAjEdOrFElM}AlHmAdBoOtIwEzEgF~UVvHhDlNKpAeInF{HNgA~@bQnV_AxEtB`VrB|ANbBfDlFMdCl@lAuDtHLzEeA|F~BvJbCqAhAP|AhL[fMmEhFiQr[LbDyCpDuAS}A~FqErFyH`WeEnC$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 2;
end
$do$;