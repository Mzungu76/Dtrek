
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
  values ($q$Cammino del Santo Marino$q$, 'cammino', 43.935334, 12.44533, $q$Italia$q$, 'gpx', 'cammino/cammino-del-santo-marino', 0.75,
    $q${"kind":"cammino","theme":"religioso","lengthM":74906,"tappeCount":4,"tappeSource":"official","start":{"name":null,"lat":44.059217,"lon":12.568547},"end":{"name":null,"lat":43.817146,"lon":12.276432},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":4,"totalKm":76.4,"connected":true,"maxTappaKm":21.8,"namedShare":0,"officialTappe":0,"computedTappe":4,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$ci|kGmxukAuX~Z]riAgKfGjY~oA__@taBqGbwAbWfc@`aAxe@qGl`Dta@t_BrcDneFpjExzAhw@}KcJhElCuPpaAeh@d^tLtAdXl]xa@ro@wW`|@HyG{l@dNoKyYaaAjj@sfAsByX{LyBmInSuXaTN{_AiLyItViWdMhLhGwVzWf@`Grq@_R`XbLOF|_@ph@gz@~{AiBnGpi@jTfRkIji@vi@gUiClw@f~Ax]k\`VyAlU~f@dXlBxm@zWzLaAfh@h[|P}GnR`Kxl@is@GiZ|ZxHfaB{RyCcRzn@nShPtBjl@dI_Yll@mHxj@_rAdLh\vdAnn@lQzeBzgAtx@|g@raA~h@w`@rCn^|i@ne@bNns@hQwBo@xUvgAnF{Gr\nJ|UcVdt@hCha@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-del-santo-marino', 'gpx', 0.75, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 1$q$, null, $q$Verucchio$q$, null, '5b794333-bd9a-4615-95ae-b3c8869255ab'::uuid, 21824, pg_temp.dpoly($q$ci|kGmxukAuX~ZrAbAXxCgAvDl@|VqB~d@QfAgBdAoBq@}CjD`DfIvCjOtGbTdFnYTvEsEv^kKvZ_B`AQlOqD|H{BvIi@pc@oFfS`@zOYlM|BxJdSlWnf@tOrNtH`GzEzApDzBdXiAbMAdX{BjRSxN{Cn@CdGwAbIxAfVStQx@tG~EdP~BfEnKx[xClCxDpJBtA_C~CrA`KrCvDhBQr@r@nFrOxGvIxBrK?`EpAbEvIdKxKxGpAq@hI`ErDzL~LxK~DxPhDfFV|GfGpLlK|KlAnE~DrGhC~C~@k@dAlCvCjCzTf^vBK`CpCfDmCtDY~HzFzM~E|PbApAjJK|BtAnAfRbApDvCvAaE|Bl@xGxEt@a@zC|CdDUv@`ExG`EfGfHtCr@z@y@dNhMv@mBrAnBvJvCdKgCdOvHrLsF`MAb@fAfUeGfDTcJhEYWfD}OfEAzAkDfDqB$q$), 'computed', true),
    (pid, 2, $q$Tappa 2$q$, $q$Verucchio$q$, null, '5b794333-bd9a-4615-95ae-b3c8869255ab'::uuid, null, 20028, pg_temp.dpoly($q$uylkGqovjAvNwEzJa@tDcGzKgCTwA\n@xAyHp@]d^tLtAdXrIfL|FhMzJfF~EsAvDj@|BiJhCcDhL_BpAxA~DiDrCAb@o@Bf@vEo@OtGb@z@dLoAjNoE~W_@oABlA}JyAqAc@}Gy@}@nB}AmAQo@{BqAgLnEgC|Ec@v@cF{E{GaB{H}BsAiJyXs@{Q`GqRqBm@\uCbB\t@aBx@d@tCkEP`@bGcC|BmR|D}ElCqGrBSyEoK[uE`CsEmAgEJhB}DdB{DaCsArLu@d@a@`CaDr@oJeEaAwHmHqDuAL|@iGkAmEq@kJIyPxA}SY{AoK}Fv@w@rCDbByDlHcFh@cDlBuC~Dc@dGlMr@aAv@cJ|CqI`CrDtGmDhBlDK~@|B}AAr@hDaDzCbDGxBtBvGcBpEbC`An@jBwA|S_AdCiJfEkCfGi@jE|A^bAlBbAoDzCdA`@s@JfFiDbOdDpHvHwDtC{EfG{Fg@gAgLnIjN_PKi@`BuA[}@vAw@s@mD`N{OlEK~HeDfJe@tA}@pBv@xIe@EzBtH}BxC\`BlBkBnB`MgDp@CHbBjFgAfFpAtBa@xCvBvCbJEtC}AfDPtFe@PBjA$q$), 'computed', false),
    (pid, 3, $q$Tappa 3$q$, null, null, null, null, 20090, pg_temp.dpoly($q$_m`kG}|}jApAbFYmEdG`JrDvL|E{Al@vBBhYw@z@QzCkFgIcAjBqA_@Zv@YjDxB`I|@z@rDvA`IuAj@wA~O{LvEqFXrGj@fAoA`Gn@|CWrDmDxHTbPrHdAVq@HfB|ElAnJbM`IcAAmAfCmB`Dp@pAo@dBzBtF_@T|DxAe@bCdC|GcCbA~FdE|EnA?jBuCrAJ}GzO{GZkE~CeDHoB~QTlBlFaCnARfA|DtFx@rNdSnCTxBzLKhA{Ar@mAlNp@fBhEy@qAbKbBP@~BvCkAYnE^n@lFYhHnCiApJnA~FvBfAsBbAx@tCuCvANzHjPlD|InKmGxCOtMtAfKhA|BRjEeAjB`GhHv@zEe@tBcGgBuDnB_F`JeDeEyAgFsMlK{GqI}HlNuJvJf@xAeBr@wBuBzC|HiCvGaBdAtA`LQzHz@lOjDxB`ArJjCjBaDlJCzCt@zAy@r@iG{Dw@fBiAiCuDN^bRwC_AqBnEcCdAw@nGoB`CmAnHbJpO`Ea@hBx@UfOtBdJ_BfGnA`Cd@rDe@sDzEdAdAq@c@{LlBcFfImClUqApEuCdEfA~CiQ~FeMxFiHgA_FJmBvHcEv@cG`E_ChFoK$q$), 'computed', false),
    (pid, 4, $q$Tappa 4$q$, null, null, null, null, 14426, pg_temp.dpoly($q$miyjGafnjAjD~NzCpB|AvHlJV\tD|D}@nBx@~BnBx@tIpAbBhG|B`DkBlAb@rAjKxKHhGnH`C`EjBlJe@bOm@PpAnBMrEvB|IR~DmBvGD~GtDdMfAl@lAfGj@SxCxBlBnDjHpAzDhClLnNrDpA^dBhEbExHrErCpFdFPvJnWfFc@hFtEhDnWhH`Kb@Ut@sKdBQxBuBfEr@rNcLhIuCF|Az@WZpAgB|FNhEjCnK`B\v@nBrDcBE~DpAtC~AvA`FSvBt@d@hDfD~A|DjKvAtAd@UMrFlArMdC~C~AbFA~BfEDiApH`AjCtKiDrDp@ZtHkBlG^tChLvErP_FfLi@hBcBnCKbFxBvCMbArDvEpBjAbCeD|CaEpS|IrHPhLiBrGwGtDGxBdCzDRhCsAjEmGhFqCdJ^~IjBhD~@vFVhEyA|B$q$), 'computed', false)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 4;
end
$do$;