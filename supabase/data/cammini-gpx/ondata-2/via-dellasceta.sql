
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
  values ($q$Via dell'Asceta$q$, 'cammino', 39.19277342385529, 16.78557715696207, $q$Calabria$q$, 'gpx', 'cammino/via-dellasceta', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":56321,"tappeCount":3,"tappeSource":"official","start":{"name":"Belvedere di Spinello","lat":39.20844461871136,"lon":16.88858448578402},"end":{"name":"Petilia Policastro","lat":39.10414430548094,"lon":16.76842854830574},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":3,"totalKm":55.7,"connected":true,"maxTappaKm":22,"namedShare":1,"officialTappe":3,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$w{hnFspafBcTnC}Ln_@bBxvAcvBlQhMz]sJf]}x@o@kObVk]`Cd\xd@sa@xb@`e@lHkPxQaFx|Bbf@`r@hO~p@}B_WzR|H|Ma^rZeHdPG\xY`K~@ehAz~@h_@ju@mJtHb\bZlAg[fR`mBhu@KrJm[dd@dBdbAij@`ZkYxA{]`X{KyFs[tj@kp@b~@oTuJcRhTiAg@aK_LkFd^d@|A_m@vx@xYnE~GoLfH`JnGzRq^mDem@|O_WjDem@mTaVr\um@~a@{h@zq@mXFcV`h@kMjr@bFnj@aX`LdA|AbUnSi@tCxRoI|TxDvw@sf@zhCbRfgBgWnQzMbp@|\gMoWpdBvLrf@vl@|`@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/via-dellasceta', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 01$q$, $q$Belvedere di Spinello$q$, $q$Caccuri$q$, null, null, 22022, pg_temp.dpoly($q$w{hnFspafBsE`DpCpD}BAcNaEaGfPfAdKaEu@vCdCyEPvCpCkCtMcBVMnWzLf[qF`N}YbJw]dFc`@gGgC`GcFs@}O|@hCbX~HvDsJf]wFe@qV`BsYkBkJrC_DnQk]`CvArDx@xIrWjTeF`I_BgAmAbKaIaDeBzAtDzCmMdLnUtHjC|BdJeCyBxImJvAcAfDvCzKmDjI|BbFoCjBmAnGuDpq@dFhH{CtVh[xm@xIfC`J`XfD|WpBcQoF{DpIBhHxHxFsHuBmIdDqBrDmFjHbBfQiKdPGn@vIQ`O`K~@uNvAS~Fya@xm@aUhE|DzYpGhGnGBI~E`D~BiDfAxBpB`EfAkKfE\lBdZ~T|@bDbBkNU{K$q$), 'official', null),
    (pid, 2, $q$Tappa 02$q$, $q$Caccuri$q$, $q$Roccabernarda$q$, null, null, 19930, pg_temp.dpoly($q$gllnFoikeBxAlL`GxTSpV`HtAbCgD`Ij@dB~D|MsC|KQpMqRAkC{AoClQwG~GnIvHl@hGcHlFN`JyAzJiLn[qQhIsOxGuB|FaEiCuObFeMnDi@xEwGxFt@|CoCoBiGiCiS~F_@zHwP~LuMbIiEeCZzDoI~OsBpNyFlLgIbPDuJcRhTiAy@kEPuDmJk@q@_Ed^d@ByRxAeYrJr@`TfQ`X|EnE~GoLfH`JnGvBkFnJcLrCaJ}BcNLoJ}@qRlAiLlEwK`G`AiB_EeAqO~DeHPoGhC}DmBwD}Eo@aJyNbD_LlHcFvGk@hEeXrHI`GmPhPcW`VuMvMiA`LmGFcVpEdBpC_DpHQbLsE$q$), 'official', null),
    (pid, 3, $q$Tappa 03$q$, $q$Roccabernarda$q$, $q$Petilia Policastro$q$, null, null, 13715, pg_temp.dpoly($q$k}ymFa|{eB`FyBpd@KnCzBo@~DxIkAxQsKnNZFgH|GaC`LdA|AbUnSi@tCxR{GvHs@dKhF|Ho@xm@_XpgAErJwDnBuGdq@@vNvAjNbCz@lIxZv@lj@eCeBaFA_LvTvMhi@BxE`AXfVuNrCRm@lFa@wBsEhMq@vKiB~KiBo@Hl]oFz[vLrf@bEPxG|FZzBz@n@]pC~AhBg@r@~@U_@nArBt@JfAzGkCrAZxCqFpA~EhAn@`@jF$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 3;
end
$do$;