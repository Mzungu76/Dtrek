
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
  values ($q$Cammino della Madonna Nera$q$, 'cammino', 40.433599, 15.800637, $q$Basilicata$q$, $q$https://www.camminomadonnanera.it/$q$, 'gpx', 'cammino/cammino-della-madonna-nera', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":50546,"tappeCount":4,"tappeSource":"official","start":{"name":null,"lat":40.54391,"lon":15.638013},"end":{"name":null,"lat":40.339919,"lon":15.899452},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":4,"totalKm":51.6,"connected":true,"maxTappaKm":15.5,"namedShare":0,"officialTappe":4,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$mvmvFqhm~AlM{mAvo@q`@xMmk@hFrGdi@qr@zu@wPptBw_BrIqkBl_@gNjNu\oCiVfWma@oW_`AuClOfAeUxu@s`AjWyEzU{eCd`@i[tf@cCpa@}t@dh@}\p`Ccc@zDes@{n@eGqXvL_]}WzRhAdNgTs`@jYp[nPpXwLvl@zHlx@ccAx\jApg@{k@yAcQlR{RgLsFlp@uv@hFw_@ln@aTtjAegCI_Oua@tE|M}LuDgJm@r]|_@cGbBi|@tm@uHoAwWz\vK~b@e}@bZvDz\eiAvs@B$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-della-madonna-nera', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 01$q$, null, null, null, null, 15483, pg_temp.dpoly($q$mvmvFqhm~AwAm@~AwK|A{DCeK~AkIGuGlDeLdBkMvF_DxFoM~M{DjBL`GcEvEoAfAeCj@mJvCwBvAkNtBuHZ[jBxAKz@lBxCnDuFbEUhDmDdDqHfAsI|C{D~JaGZsBfB?tB_BrAjB~NuE`I]fRoInS}QdK}Fr`@sf@xF{CnReFdIc@v@mD~JsJt@cB\}MeBkFEcHoAwBhAwRM_FzC{Hx@_G~EgBbAcByBgRVo@fAzAnDdAtBqEnF_BdDAfAsAJaD|Co@p@cDpC{DpA_MtEuCu@iHoAkDIsGrDiBpDcE|FySz@o@R^rAuBL_C}BeQcGmKqEkCd@yDoCuC_BoN}@bEPnDmArE[y@fAeU`@oA`Bc@FgAfEmApCLtNqRbAmGdEgLlEwCdHwJlKuEdBr@~Cq@RcAbB|@$q$), 'official', null),
    (pid, 2, $q$Tappa 02$q$, null, null, null, null, 12408, pg_temp.dpoly($q$ah`vFieb_Bw@sE^iBWuHPy@nCOTqEk@sCp@uEjCeHEcC~AiChBk@lBiHwBeFlAsJu@kAeCIlEwHVuCjCiAhA{C?{DwAyHP}FjERfAg@vAyEfBi@hEx@~BuMrDoAvB~@c@eEdGfEdJcHhE}AjB`@o@bEbKoD~DaDbBsDeAe@OmAd@eD|Yma@nIqDt]kWfU{FnNoJfZyCpRiH`KVxJmDrBTn@zA~No@@oAiDaDhFyB~@kFx@m`@oBz@aKmFiJjCqCKoIiA}DiCcNvCsCjGyDRkFyAyAaKm@m@}BFs@}AmGpA}Aa@m@mF~E`CpCsClDvBzA[fBgD`C_@f@mD~CoBr@aE$q$), 'official', null),
    (pid, 3, $q$Tappa 03$q$, null, null, null, null, 15021, pg_temp.dpoly($q$oyxuFc_n_Bs@`E_DnBg@lDaC^gBfD{AZmDwBqCrC_FaCl@lF|A`@lGqAr@|A|BGl@l@xA`KjFxAxDSrCkGbNwC|DhCnIhApCJhJkCbExChFlAzFqIh@cL`AsBdPcOnImD~GDz@cBaBgABk@pIuK`DiBdOhEpGSNaFlB}CWoA~JgH`E{G`BO@w@dO_Ia@{BaCoBbAmCDiEtEiD`EqItE_Cu@iAgIgBi@aA~JeDlEePvAJbBwBdEwAzDyF|DeLbFeEKyJhF_NJ}DxCFtLqHAi@|DG`HuGhHr@tCcBI}@l@Hf@wDl@WKu@dHeMdNac@xFeHBiGbGwBkAsBnAk@m@cB~EaDnCwMhB_Ch@~@b@kCtBmBx@mElAc@k@e@z@a@s@UxBq@oBeA`B{AhAd@jBe@qBeC{Ck@tBkAJ}@dCe@C}CQr@_Fs@gIdI{CBeB~@g@OxA}EkEfB_Cm@xCcKbIy@sAeEcCg@`@yB$q$), 'official', null),
    (pid, 4, $q$Tappa 04$q$, null, null, null, null, 8736, pg_temp.dpoly($q$_{muFciz_B?j@vC|@~@nDcIx@q@~DiBpD`C~@jEgBqAfF`H}@fIeI~Er@rBaDfAn@V|Dt@_CPeGl@\QcF_B_JjAhAmDsKaA{HbGwJ`F_DhOe@fDmCfHx@xG[{E_OzCyCO}BtI|FlIs@tAzBbBODhAvAV~DwMlEeAd@eAn@`@aCcG~GoECaJvAoBpD{AhDB`@sAoA_CzBqDnBc@~QzHrC_BbGsH~GgSdBuBPsCq@uEfDwQnDgDEiD|AEJl@pAgAll@hAl@e@$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 4;
end
$do$;