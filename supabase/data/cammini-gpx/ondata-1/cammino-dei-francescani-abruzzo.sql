
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
  values ($q$Cammino dei Francescani$q$, 'cammino', 42.129967, 13.722892, $q$Abruzzo$q$, 'gpx', 'cammino/cammino-dei-francescani-abruzzo', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":181599,"tappeCount":11,"tappeSource":"official","start":{"name":null,"lat":42.081388,"lon":13.590241},"end":{"name":null,"lat":42.207431,"lon":13.51895},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"da_rivedere","reasons":["Il file contiene 11 tratti senza nome né numerazione, non in sequenza (con diramazioni): ordine e tappe da confermare con l'ente."],"tappe":11,"totalKm":93.2,"connected":true,"maxTappaKm":16.7,"namedShare":0,"officialTappe":11,"computedTappe":0,"longTappe":0,"shortTappe":0},"overviewParts":[[[42.08139,13.59024],[42.08506,13.59513],[42.08033,13.62711],[42.08534,13.63921],[42.08396,13.64475],[42.07979,13.6478]],[[42.08824,13.5387],[42.08397,13.54918],[42.07657,13.55071],[42.08568,13.56903],[42.08607,13.58406],[42.08446,13.59009],[42.08139,13.59024]],[[42.13618,13.51474],[42.13389,13.51642],[42.13279,13.51351],[42.12699,13.51324],[42.11137,13.51781],[42.10487,13.52413],[42.09311,13.52799],[42.08824,13.5387]],[[42.17548,13.51787],[42.14902,13.5199],[42.15205,13.51371],[42.14421,13.51381],[42.14089,13.51819],[42.13618,13.51474]],[[42.16105,13.63657],[42.15711,13.63242],[42.15876,13.62883],[42.16543,13.62425],[42.17056,13.61639],[42.16841,13.59654],[42.17611,13.5683],[42.17895,13.54834],[42.1801,13.53204],[42.17548,13.51787]],[[42.16105,13.63657],[42.16118,13.64441],[42.15188,13.66334],[42.15235,13.67248],[42.15538,13.67948],[42.15311,13.68054]],[[42.13013,13.72553],[42.13463,13.71111],[42.13349,13.70694],[42.14118,13.71676],[42.14354,13.71479],[42.15311,13.68054],[42.13343,13.70692],[42.12949,13.70038],[42.12632,13.69945]],[[42.12361,13.69932],[42.12634,13.70008],[42.12249,13.71395],[42.12857,13.71945],[42.13081,13.73059]],[[42.06114,13.62664],[42.08535,13.65376],[42.08134,13.66557],[42.08021,13.67801],[42.08757,13.67564],[42.09352,13.67777],[42.10244,13.67113],[42.10391,13.67681],[42.10546,13.67486],[42.10588,13.68545],[42.11034,13.68619],[42.10851,13.69859],[42.1224,13.69279],[42.11568,13.70126],[42.11885,13.70259],[42.12361,13.69932]],[[42.20743,13.51895],[42.18177,13.51613],[42.17548,13.51787]],[[42.26277,13.52274],[42.25913,13.52614],[42.25711,13.52461],[42.26144,13.5101],[42.25445,13.50865],[42.24511,13.52607],[42.23463,13.53454],[42.23333,13.5295],[42.23984,13.51527],[42.23231,13.49951],[42.23899,13.49929],[42.244,13.49552],[42.24313,13.49407],[42.23231,13.49951],[42.23294,13.49518],[42.21536,13.51472],[42.20743,13.51895]]],"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$u_z_G_j}qA}Uq]p\{fEi^sjArGsa@`YaRsr@dhTnXy_Afm@qH}w@oqBmA}|AnM}h@vMhBolIduMno@`Jt{@eOny@eY`RuXnhAcWl]}aAm_Pb_CnHxJ`zCmU}Qte@~o@SvSkZl\pTuwCawVzTpWiIlUuh@r[a_@bp@lL`{B}t@zoEoR~yD~Ejh@fUlu@jxA{uWby@iuB}Acx@}Qwj@|Or@zlC}oGc\rhAbF`Ycq@_}@{OpUsv@lkE~yB{cDdi@|m@zVus@hAee@_e@ka@_MsdAxrL`gSuvC{fD`XyhA`FwlA_m@xMed@iLwv@nh@eHob@uHdKsAeaA{ZsClJolAyuAfc@~h@}s@yRiGw\lS_aOlab@||D|ResO}k@fHaN~Kf^mZ~cAtj@`Hbb@emAhqAcsApM~^ug@|wA`n@naBwh@j@i^pVlD`HrbA_a@}B`ZzlBcyBpp@mY$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-dei-francescani-abruzzo', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tratto 01$q$, null, null, null, null, 5851, pg_temp.dpoly($q$u_z_G_j}qA^yAgG}@eGiHoFoOvBkJ}@eLjF}HdBaFtA{M@oFdDmVm@gBqCkB`CwAZmBm@_b@vEsYrC{IJeZeF}KiCuNyDmKgDYg@wI_DkGoAsMfBoRjDcN~PmPlBw@rCh@?e@$q$), 'official', null),
    (pid, 2, $q$Tratto 02$q$, null, null, null, null, 6462, pg_temp.dpoly($q$oj{_G{gsqAd@UQgL~C}NxFiD~@_M|ByFx@k@hE\YaGfY]~RsGcOs`@aEoHqA_KcDmFuAeSmMsV{EkFaBW~C_ZwB{PhBeEwE@A{@`AyDlDuFJmBaGcWpCoJGeFvFkEW_EeA_B\sBlCgCrBP~AtDbG}A$q$), 'official', null),
    (pid, 3, $q$Tratto 03$q$, null, null, null, null, 7022, pg_temp.dpoly($q$cvd`GcrnqA|Gu@jDyGh@r@aCtDlCxDjFz@mCj@fAx@~Y_CdAb@sA`BtHn@~HgCjETbLoEvO}BtB{AvIT`@iAnI{@xRcGpDApTyLjM{TtCyBnOj@vOqCjDgL`Ae@hBrA~DoEbBIEvCzDa@tE{CnB|@nCaB|CaK`AcIxF{Mx@c@dAgH_@wCrKwM$q$), 'official', null),
    (pid, 4, $q$Tratto 04$q$, null, null, null, null, 5870, pg_temp.dpoly($q$wkl`GueoqAXaAnEa@rAxCJ`GpLu@tg@{Jn`A~BrYkJtGo@D|B_E~LsGpOoCdCxM|D~EkDfGsA|Ql@pDcFjAX`C{CfCInC{NdFn@`MxIdGfH$q$), 'official', null),
    (pid, 5, $q$Tratto 05$q$, null, null, null, null, 11639, pg_temp.dpoly($q$qqi`GqkfrAvAj@jA~CvMnCcA~BPdChEzEsEdKuBfIeB|AkDy@iGtHkBn@wCdFgKhDmCxBsJrMwDxKuMtTZdG_Bjd@~B`RtHb`@`AfNE`JaAbEyDfFoEh_@sBt@gAzC_@|M{@zB@pBcBrA{AxMDfFqD~d@u@fBuAXRnHyDjRkBhBW|A_@nJ_ArCUfHcA~Ep@xUiAhHiA|A?zE{AvKpA|SqGvOKzCzAxLMjGaEjIc@`Rr@hMrAnEuEhPJfF~BpMrApRjDtHp@vEpLbUS~CjAzI$q$), 'official', null),
    (pid, 6, $q$Tratto 06$q$, null, null, null, null, 4692, pg_temp.dpoly($q$qqi`GqkfrA_CqCfDaZaAkP|HmTtEaGjB_IbEyFj@_GfDsIjFiGrJuVjEkSQ}Is@cAp@sHa@sDsAcCc@oJnAeLuD{H}BiBe@_HmCuEyAeH|@}@yAwBn@m@xFpBrFOBsG{AJ$q$), 'official', null),
    (pid, 7, $q$Tratto 07$q$, null, null, null, null, 10640, pg_temp.dpoly($q$ipc`GqwwrA^nOgBzLqE|La@dHiBxH}MxYvAfPjCxGeDJ_EoBiCaF_KqKcH}JkEaLw@mHiBeCaASuK|KeCrHWnHkE~R@nHyBlIw@lMaE`SwDfJi@bNaJbQ}C`LkClYaEfPQlDwAf@~@n@cA`J~yB{cDfChCzIlUhDjDdCvGxBdAfIg@~@Vn@jCfAG$q$), 'official', null),
    (pid, 8, $q$Tratto 08$q$, null, null, null, null, 3873, pg_temp.dpoly($q$qgb`GwsrrA}OYC}BxAsH[}B`AwGfImPnFwGrB}Qi@gR_HqMwKcLiK{B}ByAyEg]sDkJpA{MwCrEuANzEmILkG_Cm@$q$), 'official', null),
    (pid, 9, $q$Tratto 09$q$, null, null, null, null, 16437, pg_temp.dpoly($q$cav_GomdrAJs@kS_IaKkVyS_JyFiNkDeEcGoDq\ee@sO_YeP_RkJsGkAuCK}D|DuYdDqLfBeCZaHnAoEtF{FTaG_@_GfEgXPoKhAqHRaHkAiD{OaBkGzEgBnEoIn@_F~AeIcDiCMsK_HmDz@sCSaK|MkAFs@y@oAZeIvNqH`ByBkBqC]sAjAwC`Iu@HgAgW}EgJmDmA{@dNg@`@c@s@sBaT`BqH\eVAwBmCaBn@qDsD}EmCcAyPlCrC_Ku@kF|Cs\hEmRHkAaBuE_b@hOoXrEiYhLm@g@xAeGjOwL}FF|IeI`PkFFo@qEIKm@hE{BpCiDg@_@cFbAqFyF{Bs@w\lS$q$), 'official', null),
    (pid, 10, $q$Tratto 10$q$, null, null, null, null, 3932, pg_temp.dpoly($q$msr`GmloqAzH{CzAB~AtDjVyCrCj@vBvCtKhBxIYlD_DtDk@hEpBhL@vMxBvBtD~MkA`J\`MpFnEuArFb@j@gBlA[fH|DfKyACiG$q$), 'official', null),
    (pid, 11, $q$Tratto 11$q$, null, null, null, null, 16744, pg_temp.dpoly($q$im}`GcdpqAnLeEjDgDt@cFdAuAzAd@~AbHvBsA~Az@JtT_FvLp@vBEzCmElQkNd[fTVlE`BbEuBlFrGlAHtBcG~C}CpBkLdIkPnDiP~E_LDaChDaCxDkHvCoBjFwLdCApFaJlJ}H`JiBhDcE|CcHxHqFvCgEjCbBj@gBTRj@dNnB|JfBjCuDxIsCpCB|BmBzC}C|@cBfHkFjHcHxWoAjR~AnCJpLhA|BtTtV~D|UtLz\yGxA}_@m@wD`HqEzEaD`B_HD}CjC@pBjDnDrbA_a@}B`Z|MsUrLiPtl@qo@`AbBpQ}PpGsKlEeEzKeDhVcMlLm@AuD$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 11;
end
$do$;