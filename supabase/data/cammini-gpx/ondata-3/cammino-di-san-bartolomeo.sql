
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
  values ($q$Cammino di San Bartolomeo$q$, 'cammino', 44.0059548988938, 10.8100935816765, $q$Toscana$q$, 'gpx', 'cammino/cammino-di-san-bartolomeo', 0.75,
    $q${"kind":"cammino","theme":"religioso","lengthM":82515,"tappeCount":5,"tappeSource":"official","start":{"name":"Fiumalbo","lat":44.179936889559,"lon":10.647810632363},"end":{"name":null,"lat":43.9342329651117,"lon":10.9200420230627},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":5,"totalKm":85.3,"connected":true,"maxTappaKm":20,"namedShare":0.2,"officialTappe":0,"computedTappe":5,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$s{slGys~_Afk@aF~O__@x[rMnt@wr@~^pC_HcMlPcSnXq@qt@_}@hMqa@oHku@`\oW|d@zNpg@wu@lC_`@nLvD`Qmo@`DpHsJcXp_@gwB|fBakA`Y}b@\{WzR|Jzi@ss@|TdDrc@si@sQtm@xqA{NbIdj@cHnPvMvWz]yZvb@wCfOlNdw@aQYmShgAvs@ld@eHjL}u@jZmTkJwk@ej@hEhUaI|Mig@fd@oFfLay@x|@qiBha@pBvYcvBgJuItWub@sAwRw]gGfAkbAuTwq@nUaBe~@s~@uAe]s_@rEep@ggA_StU}^gt@}BpQ_BkO|n@mXwf@wsA{L_aBsNiRfTkr@rWhSx]oZyBej@rNeMq_@IwZeq@lZ`j@jh@HgBiSxi@eiApLau@oB_x@lLeWwGko@p`@lMs@pZpS~Sjp@Jbi@va@jgAxaB|PtArIzc@j\r@dXen@pc@xM`w@zm@jBjxAvl@cEf@te@he@mH~g@li@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-di-san-bartolomeo', 'gpx', 0.75, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 1$q$, $q$Fiumalbo$q$, $q$Abetone Cutigliano$q$, '949169a5-1f14-41f0-b759-5d86d970bbfa'::uuid, '3ebbeacb-7381-4f32-b0d3-15b75c6d69ca'::uuid, 12018, pg_temp.dpoly($q$s{slGys~_AlBaEfLfAtJqFfBHfEpCjEQhDiLxAuJzG_FhCb@dAdEp@]~G~Bp@[~DpCdCPlHcKrDuAzBuDdCUbBmEhJ}An@sDvC_FtHqGbPvDzMe@v@oC{AyCmCOmBiChEq@~DiCx@cJhBcBlDv@~BjCdEqEtCjAdDoB}BaCx@gFsCkCaAjBaCd@s@aCqAMcAsB{AnAuEkCg@_GuEXkCsLeBDiEqO_BuBbBcDv@eMrBkJxD{BiAsDp@}MmGcG{AwEv@eDjB{@yA}DF}DtB_Bz@_DrKuDzIyIjBr@xHIzAbHbBxAxA{@`B{DhGuAM~IdAc@xAdBtDuNhAUjA}BhCm@`AkFjGwDPgEq@aFxFp@d@wAxBSrBwCi@aMvAaFC_DbB{EdAa@AxBdByAhFOgAvD$q$), 'computed', true),
    (pid, 2, $q$Tappa 2$q$, $q$Abetone Cutigliano$q$, null, '3ebbeacb-7381-4f32-b0d3-15b75c6d69ca'::uuid, null, 20011, pg_temp.dpoly($q$o`klGkqi`AbBPbEaGDaCvBsF|EeFaA}MP_@n@pCp@Xi@cGXyA`DpH_A{Ty@eAoEl@i@oAjGqPXkM]y@`CyEw@cZnDsC|@uCTjBtAx@S_BnBpBm@{FtA{Cf@_MhDsDUmBlBc@_AoDGqErDbA@vBr@Z`EcS~Im@bE{CpAsDjFB~BqDrBFhEcI`DzAbGo@`C{HfFgApCaG~C}AzAuDW_AdG_AdD_C~PoT^}B`FoIu@Nm@_GRiEhCa@o@iFRuA~CxC`BpDxJp@xB{ELz@t@e@|@wD|CyCxA_@`AhAdAuAFsBnDNn@wAJ_HzAwC|CO\sCpD{D`@{BxMrEbFm@`EwCzEsGl@qDfDg@bKoMvBmB|@LY}CrCjD@fByQ|VN`C_D`Il@R~B_BSfBbCgBx@nCrAgCfBzAtA@VsEvCiA~@`EpGIj@}ChSmCx@_DvJqCdKlDf@z@oAv@DzCtClCzA`EVhNzAzGcCfG[zCwB|@KlAb@rAbFjBnEvQ|DkIfEQbF}GlCn@f@{CzDqCbBd@xAgAhDpCnINbC|A`C_HtAqAbBCG|Gh@fBbHjB`EClHaKpCw@dD[`MxApDwCjPm@x@m@EaBy@EWuBkA]eAqCVaB|BoBdEfChHmAf@gA\|@y@nLrC~C\tBfFdBV{Bb@JzC`HrBaAp@bAKgBn@qAxEhJdGKnAjC$q$), 'computed', false),
    (pid, 3, $q$Tappa 3$q$, null, null, null, null, 20007, pg_temp.dpoly($q$s_ykGmyr`A`LvIdAGd@iAhAZxA_C`AhApBsAZdApFb@xImF`C\[w@vBaF\qErCgGn@qIx@{AtE}Be@GEaBmAMf@cAy@c@`@iBw@sBlCg@GuBrAHWo@l@WJqBlCsGvF}CnDdBx@SeDoE@cDjAaDG}AgCgDx@wEOyGmDiCuC{@oJvMuFaBsL`@uDqC`IqAfKoF|C_Hw@q@lAiHkB_BMqCh@qAdFeCrCcErCb@~DqBxC|@fDoGTxBbDsAjD~BjDuBe@cGkBkAh@yGtAkF~I}HGmAi@JHmD`C}LpDkCbBgIl@jAj@qCpBiCJwD~E~@G}El@}BhB_AhG_Q`PoRnFsRnBiAZkCkA_DpD`B`CeDlB|CdDfB~Bl@dBm@_@hCh@|@rAmD|DiBnAwD`@kShBiIEsD~CgKc@gFlBuL`ByCa@yGn@}A_AoG~CmDMoB|@MZyBUeBzBUTw@iAg@LeD]g@sCg@a@xBd@`BsBkA]_ARgCxCcC~FgTxH{B`AmEwBuEfAgHc@yB{EF{IoIsHhBkBi@`@gDK{Lz@sCAaCoC_Gh@cHtAaFFkN}BwGJuJsBeD}C_B_DiFqCyMx@}C`EKxJxBxAq@mC{BeBuHaFyGgKyDaBoKeDk@{@gE_BgAgCb@gFwDaBwDqGuA]yDhC{EaB_BTkEuBcG_Hp@}IxFqBAuBiCmDr@oKmNoGsSJyBiDeD$q$), 'computed', false),
    (pid, 4, $q$Tappa 4$q$, null, null, null, null, 20008, pg_temp.dpoly($q$suukGqdkaAuLcCcDmPcBeAi@mBAhG_C|C{B^mA{CgAvDkBv@e@lCyAj@wBw@cCoEoMyMsAmQoC{@mA{H}EdAkAjC|C|FL`CMaC}C}FjAkC~EeApL_MdEk@fC{B`CDhB}ApHg@cGgLuDiDCgEaDgJsBwN_AcCiCsAuByKcFkL|@c\}@uCeCiBgAiRuAgEiCe@w@aBa@wJbBsEWuK{LqFw@wJdBqBDaLvB}MxFeEf@uE`D}ExAi@fBb@nEjDhBzEvGfGrI{PlErAjE@z@w@nDqId@oEwA}DoAcKFsQnDaDbBqE~EqAeEcA{NhAo@nBuE{CiAZiFkGmAWWuAuE_D@_C}CoEcAyGmAgCd@yA}@{@KcDrB[dLh[rIrNfAo@lEfCbH\rC_D|Qr@JyHqByEAuBjLqTjCmLjFmF`EqNlEwJdDmC@yD|BiHYcSjIyQq@{MVwIaAyFNmJy@{BTgGxB}D~CqBJsCfCaIkDcEsAqIkDqItAgPnA@u@gAt@DQ{@vBg@dCb@BpC|F~E~CyA|CbElC}@dBr@EnAcB|BAzHhAhCQ|Eh@YtEzGjDp@|@jDpBd@t@xC`CGT{AtArBGvAnBeBv@\fAiDvBpEMr@tAmA$q$), 'computed', false),
    (pid, 5, $q$Tappa 5$q$, null, null, null, null, 13209, pg_temp.dpoly($q$q|qkGkp~aA|DcCbHp@~@hArJYnEhBlCpIbDa@zEtBt@tDlBzB`MtGvA~FfJ|LrFzLbCpAhAi@|@xFjAXNfBxBxClA]hA{JrApGrDhE|@jEzEnGjH`F|A`CKpAKiBLzBnC|HsA|BhEt@lBtB?yD~@R?cCdErEOlFhDvTxDtFxE\~@{ArBm@lBdExElAdCgDnAr@~@{Dm@oLtCdBdBWfEaMzA{AN{CbFmGfBl@pAhEdDjA`LeBnKzFa@fCjEVA~@fBzB|AfJjExDtJhEhOrAnC|AvD`FmC`LlApBqApC?|CrCjIk@lT{BnMfElGhAnGdD|BlNL|GsEdO{B]|Q|@hHFlI|DoAhEl@bH}BlCHbE`CjEyGfIbKjD~BYrHbQdOvCzAnAAXiA$q$), 'computed', false)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 5;
end
$do$;