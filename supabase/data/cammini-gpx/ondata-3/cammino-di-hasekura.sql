
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
  insert into dtrek_places (name, meta_type, latitude, longitude, region, official_url, source, source_id, confidence, metadata)
  values ($q$Cammino di Hasekura e dei martiri giapponesi$q$, 'cammino', 41.8743862118572, 12.179245948791504, $q$Lazio$q$, $q$https://www.camminodihasekura.it/$q$, 'gpx', 'cammino/cammino-di-hasekura', 0.75,
    $q${"kind":"cammino","theme":"storico","lengthM":103356,"tappeCount":5,"tappeSource":"official","start":{"name":null,"lat":42.09415979683399,"lon":11.790331760421395},"end":{"name":null,"lat":41.90231152810156,"lon":12.457557152956724},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":5,"totalKm":104.1,"connected":true,"maxTappaKm":26.9,"namedShare":0.2,"officialTappe":0,"computedTappe":5,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$oo|_Gqx}fAv[qHzUcy@h`@gd@~[sHvJjLS_P`OjCnaAuq@~Uio@f|@q`@l`@|Kb]e_@vl@_OwkAczLrOokAfn@gz@rEeu@tMv@pTy]d{@edBgDyQrN_[z`B_jAkKcNdPw_@m|@m}@nvCouJnh@vy@jNoFlTth@lpAw{@kMkQbVmu@kHqGfbBerCuRyQ~BiR|s@{xBbUhAhg@a`BnoAewB`|C}rCnwEmsC}y@eiB|r@_r@_Qqa@vy@g}@kc@ceAx^a_@kb@yj@aBeXfzAox@hGbMn}Agg@|pByuBHk_@|JzCiJeTpj@mXnBwnEcxBuTjr@kHpPia@xAuoBxa@igBgNepDig@wOtC_\}lCsTiE{\li@go@qGk_AeGjFul@_dAmXwVgD|P_k@oq@qf@fd@w^eEiQgRe@cy@sOcSsvApe@}o@ct@}B~QeOuSui@tnA{VjNwNkJN|k@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-di-hasekura', 'gpx', 0.75, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 1$q$, null, $q$Santa Marinella$q$, null, '659daa5d-acb4-4b9f-ab8b-13deb9150993'::uuid, 12882, pg_temp.dpoly($q$oo|_Gqx}fAzBfAzQoJfCd@v@o@lAqBfB}KjGaJd@eJ~AqHvDkFc@mA`Ah@zFoEX_EzP_MhC{DWwCb@m@~[sHvJjLrAu@gBiNzJeD`@|EbBrAxEyFw@oElXmQrNu@jSgO]cA~BiAc@qBvMeJOmDqAkAIuAlAe@jDxAViPb@}ArEgAdVsMj@Jj@jChFHlEaDtCyHfI{E~InKbEtChOgCpLwIvIaPxDkCxT_C|V_Kz@sC?kQ{DsVDqN_Pa~@qD{KkBu^z@kF]aF\g@iCeR$q$), 'computed', true),
    (pid, 2, $q$Tappa 2$q$, $q$Santa Marinella$q$, $q$Ladispoli$q$, '659daa5d-acb4-4b9f-ab8b-13deb9150993'::uuid, '0f9a47b7-f875-4380-8281-ceccab0ebd5c'::uuid, 26860, pg_temp.dpoly($q$o~p_G{~lgAS}DuBeD]iC_CkBaD_HqEwa@a@qLnBUnAoHo@aC^wAc@_F}@yFeBuCyCOTgBeEqWO{GiCkAxCyRFaG_AaRiAsGiCuGeB_UtEsU|H{t@dAe@fBt@z@aAlKi[dGjE|AUnAqBzHsZ~B{BxCcL[cG{F{DpIaZbJa@pBxA~E{Mz@[xHwMt@^d@i@vP}^bEaSfNy]~MsMdB`@zAyCF_DmAsBmCYj@kHrN_[xc@y^bj@oW|PuQV{AqD{AqFkHdPw_@wTuPjDgJal@o`@|Sou@dBeXdCyJjH_Nnd@wkAhkAg~DpF~ArJt[hU`ZjNoFnOpY|CbNlKuG~E|A|MeIbU}U|W{TkMkQbVmu@kHqGxNaf@jAaB~BQfCuDvCaFrA_H$q$), 'computed', true),
    (pid, 3, $q$Tappa 3$q$, $q$Ladispoli$q$, null, '0f9a47b7-f875-4380-8281-ceccab0ebd5c'::uuid, null, 20050, pg_temp.dpoly($q$ax`_Gw}thA`CiDdCq@hHlEzDaMtMwZhZog@kHyKiI_E~BiRfEmQ`Wal@v@c@lG}PlKif@z@VtIiBpHzCjAwBdDqR`Js]hHmSxDkFpEiNpG_JdSm_@xo@kbA|AkHbOkMtAaDdEmEvAhB|A_@lAcIdL{Hd}@ex@`AtBvBo@nAiGdg@_c@@aDlrA}z@rBpFv^ySs@uHj@aC|`Bo|@qr@w~AkFmI|r@_r@wO_YSiC$q$), 'computed', false),
    (pid, 4, $q$Tappa 4$q$, null, null, null, null, 20058, pg_temp.dpoly($q$gen~FikriASgCvy@g}@_Og\q@gFyQs`@x^a_@yUwg@qKaBaAcIj@qFkAoFfUwUtKkIrEhHv@JlTkHnYuWhGbMn}Agg@x}@i~@br@ov@DcMo@iBfC}C_BuDJiChCiBjE`Hf@[iJeTnC`FpBO~QaL~@_CfBD~CuBPkBw@sClFmBaDuUx@ah@vIw~A_@_d@_BgJqJcKkl@_CyEoBsCGub@?kN|Bu@wDtTsDjT?hGwB|B{B|EsJtEyQnA}T$q$), 'computed', false),
    (pid, 5, $q$Tappa 5$q$, null, null, null, null, 24204, pg_temp.dpoly($q$ycd~FstkjAcAaaAlAuWvIwa@hQwj@fBmInAkNKwZ}Eca@yA_[N{ObCce@_BmRwE{KoEoEsFiCmUgFy@uA}@~Bh@a@jB}Zq@V{y@}Owv@a@mTiAiCaAeDsDqBuJlAqKvL}LnTgQzCuGhAkFPoPgGkWyAuP|@yCk@k@uBfHcBO{Vgh@yTwZmXwVvA`A_GzNaSuRuKsQgJeKaEw@uEjAoCbCcLrVeHzGoF`AoDS_L{BwDwBiIwK_GoEtAeKi@y[qAcPoFyLcHiEcDJkDhBy@k@_L|Jce@bQqMhDsHZwFqAmGgFkRoZkLyNiBjGrAnAgBbG{DyAoAsB}BcAf@}CoCmBSwBoFrN}AfRqBzFu[|c@mOzLmFn@uCe@qHmIo@F^ha@p@^L~BiBZXvC$q$), 'computed', false)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 5;
end
$do$;