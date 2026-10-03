
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
  values ($q$Cammino della Pace — Varianti$q$, 'cammino', 41.739277221, 15.261223205, $q$Italia$q$, $q$https://ilcamminodellapace.it/$q$, 'gpx', 'cammino/cammino-della-pace-varianti', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":172091,"tappeCount":5,"tappeSource":"official","start":{"name":"Caramanico Terme","lat":42.159767054,"lon":14.011696799},"end":{"name":"Santa Maria di Stignano","lat":41.719172844,"lon":15.580454217},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":5,"totalKm":73.6,"connected":true,"maxTappaKm":19.8,"namedShare":1,"officialTappe":5,"computedTappe":0,"longTappe":0,"shortTappe":0},"overviewParts":[[[42.15977,14.0117],[42.16316,14.01151],[42.15997,14.03071],[42.16224,14.03584],[42.15932,14.0406],[42.15976,14.04863],[42.16111,14.04107],[42.17046,14.02724],[42.17617,14.03842],[42.17852,14.05386],[42.17317,14.06016],[42.17716,14.06554],[42.17085,14.07555],[42.17207,14.08012],[42.16943,14.08357],[42.17237,14.0823],[42.16996,14.09123],[42.17237,14.08214],[42.16325,14.08926],[42.16245,14.08126],[42.16516,14.07984],[42.16537,14.07452],[42.15575,14.07327],[42.15314,14.07544],[42.15546,14.07636],[42.15422,14.08177],[42.15784,14.07762],[42.1532,14.09034],[42.15439,14.09815],[42.14989,14.1005],[42.15211,14.10707],[42.15837,14.11154],[42.16292,14.12003],[42.16606,14.13019],[42.16286,14.13579],[42.17484,14.15487],[42.17336,14.15693],[42.16472,14.15113],[42.16511,14.15532],[42.17091,14.1602],[42.17406,14.17571],[42.1809,14.18121],[42.18869,14.20492],[42.1857,14.21278],[42.18736,14.21983],[42.19122,14.22042]],[[41.74035,15.26017],[41.74228,15.28806],[41.74468,15.29679],[41.74153,15.30475],[41.72853,15.31975],[41.71649,15.32786],[41.71056,15.35385],[41.70015,15.36806],[41.68948,15.37186],[41.68581,15.3794],[41.69066,15.39451],[41.68737,15.39385],[41.68541,15.40936],[41.69057,15.44747],[41.7143,15.51428],[41.72465,15.5226],[41.7273,15.53167],[41.72636,15.53881],[41.73124,15.54884],[41.72937,15.56169],[41.71917,15.58045]]],"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$qii`GctotAeTd@|R_wBeMa_@fQw\wAeq@mGfn@my@luAub@{dAuMo_Bl`@kf@}Ws`@lf@q}@sFq[nOqTkQ|F`Nyv@aNxw@~w@ok@~C~p@}OzGi@f`@b{@xFhOqLoMwDvFy`@sU|X~[onAmFyo@b[uM{Lah@cf@}Zm[at@sRo~@~R_b@{iAgvBfH{K~t@fc@mAeYgc@o]uR}_Bwi@ka@uo@esCtQcp@kIak@cWuBrgwA_hjEw`@i}EtRwp@fpAw|AfjAuq@`d@maD``AywAtaAwV|Ucn@i]m}ApSbCfK}_Bg_@emFisCq`Lu_A_s@qOuw@zDsk@o]u}@tJioAv~@gtB$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
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