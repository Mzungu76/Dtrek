
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
  values ($q$Anello Cimino — Cammino dei Santi Patroni$q$, 'cammino', 42.346424320712686, 12.253818064928055, $q$Lazio$q$, 'gpx', 'cammino/anello-cimino-santi-patroni', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":55562,"tappeCount":3,"tappeSource":"official","start":{"name":"Viterbo","lat":42.41456282325089,"lon":12.109956191852689},"end":{"name":"Viterbo","lat":42.41419653408229,"lon":12.110312506556511},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":3,"totalKm":57.7,"connected":true,"maxTappaKm":21.7,"namedShare":1,"officialTappe":3,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$_b{aGgf|hAkh@`AqA}Wtn@efDpI_qB~g@uhAxf@qJp]y}@pLfCfHmf@fl@w^ru@uvD{Cqj@giA_jAkMya@cFosAz[inAgQ{dAt^~Yp@lbBbe@|GlUp}@~xBdoB|Nm@vb@_uBvFbb@fAoa@|~@olAnNoFVdR|eA_Okf@x~@pStx@}I|YvIRuZ|_@qRhfBhWjn@}gAv^pUlIv@fQ}u@xh@gIf]wg@bKq^lz@tG~Vsq@pyBmuApj@s]v`@e[`A{N~f@ylA~w@s]rkAel@xh@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/anello-cimino-santi-patroni', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 01$q$, $q$Viterbo$q$, $q$Vignanello$q$, null, null, 21747, pg_temp.dpoly($q$_b{aGgf|hAmAq@_Gn@oFy@qPT{DfBkAkCd@kKk@eGpAi@dD_ZjCwEy@yErBwCvFaShAgBhDkRO_Th@uFvDoGfEiRNeCaAkCNuCrEcG}DgLlEoLAySjGy_@v@s`@jLm\rF}GbHCVqFhBgH@qEvEyJvBMfA~@xLyHvKGfFaBjI_VzBqNhOgW`EmExEzDGjD\QzCuMjCwWdBYj\uUtFm@~CyEt@cHdF{HlAqGpGkHb@s[dBkF|@{Js@eEzAwNxDiInBgRhDuH|B{OfCiFlCoL`AmO_CqJRmEqBcHiHiGkCZoBi@cDwE_A{D{H_Dx@iBc@UXd@R_AaDwGeGcHoBe@pBTrEnGkKoKKgB|A{BqAyCmFaAaCeCwJgBuFsSKqFsB_Dx@y@oCDCsJ|@qEqE{QKuTqA{KP{KpEgAz@sd@nF{G`DcOzFmMeDcGhBgOm@sFiHoTi@qFiCcE?uAhDcExOrTdCjGrAfBvACoAMUy@h@fBx@]$q$), 'official', null),
    (pid, 2, $q$Tappa 02$q$, $q$Vignanello$q$, $q$Caprarola$q$, null, null, 17241, pg_temp.dpoly($q$scuaGmk}iAlB~Zz@d^gAtIb@x@u@Kg@lF\rK]lEvC|@`HkArMx@tHpFjCrD?xEpAdM`DfJfDbPdDpF|LrMhInC~CjFlAlGhMbIpGlG~K~P`I~C|GzElB|ClItBlJbLjDi@vCjGfBYdF_EnDjDlBcLAaOhD_If@}DfDxAhC_EfOudAbAfBhCjARdCuEjPjF|FkDsHnF{RB_DdJgOrJgKdBiArCOxF{IFfCh@f@dFgEnMkTfAeLrEX`CyA`At@QmBhBG[HZyB}@~@dC~CgB`Hv@bB|EeG~Ch@xFaFpKk@|HjA`DbH|BeFvFuEfBcDhALjEjECl@}IzM`FoGwF|HoE~LaL~GsDbJmA|JdApIBtIjDlE|B|HbDjEYnFrCdEKtOkCjCmDlAWlB`I{@TnAuZ|_@$q$), 'official', null),
    (pid, 3, $q$Tappa 03$q$, $q$Caprarola$q$, $q$Viterbo$q$, null, null, 18716, pg_temp.dpoly($q$ggjaGgvtiAcBvEEjJwBfFsAbMdB|VyDpSyAdC{AXdC|Ac@nRhHrJzErC`DtGgA|@eGwAqApBqCmAqBjCyEmA}BfHmDF}@jBaElAaAzEeEhFuJu@uFt@m@rAtHVhHzD~Cd@pAvDYnKgL`KoBaBk@Z_ClC[tEwAjDoFfEuTdHg@zEd@vF{DfDiCjIcIlAgBhBuD|@o@Ws@kE{@SyCpCoBMkG`GgBdGZ^kAAw@lA{HnXeNjUGlE|@zG~EtGaApEcOl]iDvUgBpE_BdLuDpKAvDqArEU]yA|B{@g@iDxF{@pGog@hRkGtH_AoB{B~BsGfA_B`CiI`EwHt@aLpKsElB}AvDQhCmFtF_Ex@{GuDuGhDsCRgDbIiG|FfAtFCtFmCpEkK~GkExF{H`BaDhIoH}BsNxF_DvLcFpA{ErEmHpVaKhScF|[_AxBoTrVoC~LaJEcGjC$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 3;
end
$do$;