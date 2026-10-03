
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
    $q${"kind":"cammino","theme":"religioso","lengthM":181599,"tappeCount":11,"tappeSource":"official","start":{"name":null,"lat":42.081388,"lon":13.590241},"end":{"name":null,"lat":42.207431,"lon":13.51895},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"da_rivedere","reasons":["Il file contiene 11 tratti senza nome né numerazione, non in sequenza (con diramazioni): ordine e tappe da confermare con l'ente."],"tappe":11,"totalKm":93.2,"connected":true,"maxTappaKm":16.7,"namedShare":0,"officialTappe":11,"computedTappe":0,"longTappe":0,"shortTappe":0},"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$u_z_G_j}qA}Uq]p\{fEi^sjArGsa@`YaRsr@dhTnXy_Afm@qH}w@oqBmA}|AnM}h@vMhBolIduMno@`Jt{@eOny@eY`RuXnhAcWl]}aAm_Pb_CnHxJ`zCmU}Qte@~o@SvSkZl\pTuwCawVzTpWiIlUuh@r[a_@bp@lL`{B}t@zoEoR~yD~Ejh@fUlu@jxA{uWby@iuB}Acx@}Qwj@|Or@zlC}oGc\rhAbF`Ycq@_}@{OpUsv@lkE~yB{cDdi@|m@zVus@hAee@_e@ka@_MsdAxrL`gSuvC{fD`XyhA`FwlA_m@xMed@iLwv@nh@eHob@uHdKsAeaA{ZsClJolAyuAfc@~h@}s@yRiGw\lS_aOlab@||D|ResO}k@fHaN~Kf^mZ~cAtj@`Hbb@emAhqAcsApM~^ug@|wA`n@naBwh@j@i^pVlD`HrbA_a@}B`ZzlBcyBpp@mY$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-dei-francescani-abruzzo', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, length_m, polyline, source)
  values
    (pid, 1, $q$Tratto 01$q$, null, null, 5851, pg_temp.dpoly($q$u_z_G_j}qA^yAgG}@eGiHoFoOvBkJ}@eLjF}HdBaFtA{M@oFdDmVm@gBqCkB`CwAZmBm@_b@vEsYrC{IJeZeF}KiCuNyDmKgDYg@wI_DkGoAsMfBoRjDcN~PmPlBw@rCh@?e@$q$), 'official'),
    (pid, 2, $q$Tratto 02$q$, null, null, 6462, pg_temp.dpoly($q$oj{_G{gsqAd@UQgL~C}NxFiD~@_M|ByFx@k@hE\YaGfY]~RsGcOs`@aEoHqA_KcDmFuAeSmMsV{EkFaBW~C_ZwB{PhBeEwE@A{@`AyDlDuFJmBaGcWpCoJGeFvFkEW_EeA_B\sBlCgCrBP~AtDbG}A$q$), 'official'),
    (pid, 3, $q$Tratto 03$q$, null, null, 7022, pg_temp.dpoly($q$cvd`GcrnqA|Gu@jDyGh@r@aCtDlCxDjFz@mCj@fAx@~Y_CdAb@sA`BtHn@~HgCjETbLoEvO}BtB{AvIT`@iAnI{@xRcGpDApTyLjM{TtCyBnOj@vOqCjDgL`Ae@hBrA~DoEbBIEvCzDa@tE{CnB|@nCaB|CaK`AcIxF{Mx@c@dAgH_@wCrKwM$q$), 'official'),
    (pid, 4, $q$Tratto 04$q$, null, null, 5870, pg_temp.dpoly($q$wkl`GueoqAXaAnEa@rAxCJ`GpLu@tg@{Jn`A~BrYkJtGo@D|B_E~LsGpOoCdCxM|D~EkDfGsA|Ql@pDcFjAX`C{CfCInC{NdFn@`MxIdGfH$q$), 'official'),
    (pid, 5, $q$Tratto 05$q$, null, null, 11639, pg_temp.dpoly($q$qqi`GqkfrAvAj@jA~CvMnCcA~BPdChEzEsEdKuBfIeB|AkDy@iGtHkBn@wCdFgKhDmCxBsJrMwDxKuMtTZdG_Bjd@~B`RtHb`@`AfNE`JaAbEyDfFoEh_@sBt@gAzC_@|M{@zB@pBcBrA{AxMDfFqD~d@u@fBuAXRnHyDjRkBhBW|A_@nJ_ArCUfHcA~Ep@xUiAhHiA|A?zE{AvKpA|SqGvOKzCzAxLMjGaEjIc@`Rr@hMrAnEuEhPJfF~BpMrApRjDtHp@vEpLbUS~CjAzI$q$), 'official'),
    (pid, 6, $q$Tratto 06$q$, null, null, 4692, pg_temp.dpoly($q$qqi`GqkfrA_CqCfDaZaAkP|HmTtEaGjB_IbEyFj@_GfDsIjFiGrJuVjEkSQ}Is@cAp@sHa@sDsAcCc@oJnAeLuD{H}BiBe@_HmCuEyAeH|@}@yAwBn@m@xFpBrFOBsG{AJ$q$), 'official'),
    (pid, 7, $q$Tratto 07$q$, null, null, 10640, pg_temp.dpoly($q$ipc`GqwwrA^nOgBzLqE|La@dHiBxH}MxYvAfPjCxGeDJ_EoBiCaF_KqKcH}JkEaLw@mHiBeCaASuK|KeCrHWnHkE~R@nHyBlIw@lMaE`SwDfJi@bNaJbQ}C`LkClYaEfPQlDwAf@~@n@cA`J~yB{cDfChCzIlUhDjDdCvGxBdAfIg@~@Vn@jCfAG$q$), 'official'),
    (pid, 8, $q$Tratto 08$q$, null, null, 3873, pg_temp.dpoly($q$qgb`GwsrrA}OYC}BxAsH[}B`AwGfImPnFwGrB}Qi@gR_HqMwKcLiK{B}ByAyEg]sDkJpA{MwCrEuANzEmILkG_Cm@$q$), 'official'),
    (pid, 9, $q$Tratto 09$q$, null, null, 16437, pg_temp.dpoly($q$cav_GomdrAJs@kS_IaKkVyS_JyFiNkDeEcGoDq\ee@sO_YeP_RkJsGkAuCK}D|DuYdDqLfBeCZaHnAoEtF{FTaG_@_GfEgXPoKhAqHRaHkAiD{OaBkGzEgBnEoIn@_F~AeIcDiCMsK_HmDz@sCSaK|MkAFs@y@oAZeIvNqH`ByBkBqC]sAjAwC`Iu@HgAgW}EgJmDmA{@dNg@`@c@s@sBaT`BqH\eVAwBmCaBn@qDsD}EmCcAyPlCrC_Ku@kF|Cs\hEmRHkAaBuE_b@hOoXrEiYhLm@g@xAeGjOwL}FF|IeI`PkFFo@qEIKm@hE{BpCiDg@_@cFbAqFyF{Bs@w\lS$q$), 'official'),
    (pid, 10, $q$Tratto 10$q$, null, null, 3932, pg_temp.dpoly($q$msr`GmloqAzH{CzAB~AtDjVyCrCj@vBvCtKhBxIYlD_DtDk@hEpBhL@vMxBvBtD~MkA`J\`MpFnEuArFb@j@gBlA[fH|DfKyACiG$q$), 'official'),
    (pid, 11, $q$Tratto 11$q$, null, null, 16744, pg_temp.dpoly($q$im}`GcdpqAnLeEjDgDt@cFdAuAzAd@~AbHvBsA~Az@JtT_FvLp@vBEzCmElQkNd[fTVlE`BbEuBlFrGlAHtBcG~C}CpBkLdIkPnDiP~E_LDaChDaCxDkHvCoBjFwLdCApFaJlJ}H`JiBhDcE|CcHxHqFvCgEjCbBj@gBTRj@dNnB|JfBjCuDxIsCpCB|BmBzC}C|@cBfHkFjHcHxWoAjR~AnCJpLhA|BtTtV~D|UtLz\yGxA}_@m@wD`HqEzEaD`B_HD}CjC@pBjDnDrbA_a@}B`Z|MsUrLiPtl@qo@`AbBpQ}PpGsKlEeEzKeDhVcMlLm@AuD$q$), 'official')
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 11;
end
$do$;