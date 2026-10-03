
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
  values ($q$Cammino della Pace — Varianti$q$, 'cammino', 41.739277221, 15.261223205, $q$Italia$q$, 'gpx', 'cammino/cammino-della-pace-varianti', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":172091,"tappeCount":5,"tappeSource":"official","start":{"name":"Caramanico Terme","lat":42.159767054,"lon":14.011696799},"end":{"name":"Santa Maria di Stignano","lat":41.719172844,"lon":15.580454217},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":5,"totalKm":73.6,"connected":true,"maxTappaKm":19.8,"namedShare":1,"officialTappe":5,"computedTappe":0,"longTappe":0,"shortTappe":0},"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$qii`GctotAeTd@|R_wBeMa_@fQw\wAeq@mGfn@my@luAub@{dAuMo_Bl`@kf@}Ws`@lf@q}@sFq[nOqTkQ|F`Nyv@aNxw@~w@ok@~C~p@}OzGi@f`@b{@xFhOqLoMwDvFy`@sU|X~[onAmFyo@b[uM{Lah@cf@}Zm[at@sRo~@~R_b@{iAgvBfH{K~t@fc@mAeYgc@o]uR}_Bwi@ka@uo@esCtQcp@kIak@cWuBrgwA_hjEw`@i}EtRwp@fpAw|AfjAuq@`d@maD``AywAtaAwV|Ucn@i]m}ApSbCfK}_Bg_@emFisCq`Lu_A_s@qOuw@zDsk@o]u}@tJioAv~@gtB$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-della-pace-varianti', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Variante 09b$q$, $q$Caramanico Terme$q$, $q$Santo Spirito$q$, null, null, 14362, pg_temp.dpoly($q$qii`GctotA}E~B{Gl@kDgCPsEpFmMMsDdC{Dq@kKs@uAfAgIGkDlAuCkAgMh@mWfBwJrCs@UwD_BkAkIkNCqGfByGbD_@zH}RwBaY^cWmBdK_D`b@mDfFgFqBHrIqFtCb@dFs@zDkCr@kC~JgAp@iAa@oB|DcAjFuCnD_F`LkFjGeJgMBgD{C{NkD_Hy@_OgFm@iDaG}AcNdBcF}BsCiEaLV_JiBaL~@yDuA{@m@yW~@?vBwE~CaAfAwGKkCbL{EtFqIh@mEcA}CeQe@}DaT|@mDlLsN`E{OrFaLbG}CfAsEj@wEUgDiGqOnEwL~HyFgBqDgA|BcIjDwAlD?g@j@sDfDmFvBwGVgI`CcNCsGgC~I_@fE$q$), 'official', null),
    (pid, 2, $q$Variante 10b$q$, $q$Santo Spirito$q$, $q$Rifugio di Marco$q$, null, null, 9702, pg_temp.dpoly($q$cnk`Guv~tAxCsLEjHqBhL[jIcGtMgAdGtA_DhIsD`AyBr@nBfEaAEi@bFmDjBiFbF}BPkA~JoK`Cj@S`@pBpBxBZTbFoBpJHhAf@CeCvCtBzQmCvAwH@wA`En@vJyAnTnDjJ^ZrEoF|B[xD~@`CSdElC|JnBv@iBhLaA`GwEf@t@~EoG{JcAsAsB|AsDc@cAd@{CvE_EA}I}@gC[`Bl@rBm@WkAfBw@aAgCf@Ky@mFpDoAvBaB`IL_IbEeJb@yNh@qBxOsU[wG`CqF_CcKpA_Fz@iL{FqK?yB~AcEhHDbA`A$q$), 'official', null),
    (pid, 3, $q$Variante 11b$q$, $q$Rifugio di Marco$q$, $q$Guardiagrele$q$, null, null, 16246, pg_temp.dpoly($q$oyg`Gct`uApBPjCgBvDiGsEyF}BeYiBaFeIaAoEwBmUcUaEgGkUyk@cG{Vq@kNmBuHsCiC{@gINaEx@oDlEqH@_G~B}CdF]qB{A`@g@iCMuDyCyRoXsCgOqDcIVg@m@KvA_NcBxA_Ae@u@oA]oFgAm@uAZP}@iBsAWuBuAq@_Bn@aFyPcCiAk@_ChDsH|BgBzB`J`EZvIxFhAkAvDDrA|@~DaCdAr@bAYrBrChCLInBtClJmAeYkDqJiADsF{EgHd@aDm@eAeEmCyDKo`@y@oDsMiRSqAr@{EgA{ChA}J}BkKkCoDsImDyIoLcAu@gETqG}G}@{DiBeXsHeJwCaKLoH_B{HbAoFqAwBlBIeF{F{@oLkFeVoHkJqB_FBuSnDoJvIiGhAsGg@gHkDyOwB_QkOqIoCAE~AaB|B$q$), 'official', null),
    (pid, 4, $q$Variante 25$q$, $q$San Paolo di Civitate$q$, $q$San Severo$q$, null, null, 13542, pg_temp.dpoly($q$elw}Faoc|AtEqEcEmMMac@{Igr@z@{KeB_U?c^oBaL{AeYwAuG{DsEtRwp@bK}WbdAycAfjAuq@p[g`BnGe`Ad]iYtQ}Z|D_RfIqN|Ea@jA{@lAqExU_Mb_@G|Ucn@{BwCXs@$q$), 'official', null),
    (pid, 5, $q$Variante 26b$q$, $q$San Severo$q$, $q$Santa Maria di Stignano$q$, null, null, 19757, pg_temp.dpoly($q$szl}F__{|A~A}J@wFgKoMwD{HgEeQyDmXZeAtDMfBxFvHh@^kAxBiYc@kf@pHg^Qi[_Jis@\cG|CwNyB}Lm@qOiTefBqc@aaBwnBo~HaFkFsx@sk@yBkIHqH{CsEeGc]TaHeAmIVgBpF}I]}IqQ}QOoJ}DgFoD_XJoZ|DiSjDo_@bMeM|H{YwAwFrEgSfKiMhFgLbGkHvCaIrCyCg@rB$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 5;
end
$do$;