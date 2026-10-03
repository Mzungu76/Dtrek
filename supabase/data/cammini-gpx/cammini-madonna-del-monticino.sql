
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
  values ($q$Cammini della Madonna del Monticino$q$, 'cammino', 44.222116470336914, 11.774275302886963, $q$Emilia-Romagna$q$, 'gpx', 'cammino/cammini-madonna-del-monticino', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":81100,"tappeCount":5,"tappeSource":"official","start":{"name":"Madonna del Monticino","lat":44.221046855673194,"lon":11.769530894234776},"end":{"name":"Madonna del Monticino","lat":44.220915930345654,"lon":11.769730048254132},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":5,"totalKm":82.8,"connected":true,"maxTappaKm":31.2,"namedShare":1,"officialTappe":5,"computedTappe":0,"longTappe":0,"shortTappe":0},"structure":"rete"}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$q|{lGqvyfAoSeG}J`n@zIrdBpUjMsS`b@o_@nCoc@faAoZ{IaBlP}W}h@{RUw{@abAuElRaj@el@zP{c@cJcOvFqX`_@eCbq@da@rOmEoAgYzn@aA~c@kzB|f@w\hkAfkEbWhAtKi`@`OjIh@da@hZ~MtNpv@o\bf@|BnIiBcOnUmJhz@t`C_O~EyBgRuDlOcVmUcSpGxHvKmc@IvC`Lyn@|@geAmqBrF}h@kUz@eC{X`Tck@mL{xAzNgu@pOjNmTy}@~P_|@nMhIxLkUfLbNwBaOxSiEhR_|@w@eu@k\aVxAmN|]oHeK{Pdj@yf@lEco@v^_LoRtKVaSsUs@a]aj@_`@nFkZwQq`@vRx@l\wRnMzC~RmLjQa`@ycAePOmF|l@eTbXvPv\eEbeAgSkHqAdh@m]~n@hGliAiXjlAhVf\iEp~@bJhR`CmLd^vEpUcn@n\fm@ba@kK`Lgn@dTfHiOg[aR~QdKzD}Hdh@xHzc@XcqArU`DsOsgA`T}JpHrOpk@{@rRrp@ko@hAuHjSsMyJcG`VrAuL$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammini-madonna-del-monticino', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, length_m, polyline, source)
  values
    (pid, 1, $q$Percorso 1$q$, $q$Madonna del Monticino$q$, $q$Madonna del Monticino$q$, 20758, pg_temp.dpoly($q$q|{lGqvyfAcEzBq@e@p@d@o@N_EgE}A?IuAkANg@cC_A|COhPqA`E{BzBk@lKs@lA`CVd@xMhA|CJxDr@h@mAtG\pCe@bF`BfFv@xHe@vONpClAnBqAvJXb@jHsBm@xGfATdCeBdDRq@~GvB\yA`EwEBuCnBkAtE|AzBaCzDWnDcAlBoCVaDrDeGnBw@o@}Fz@m@iBh@cD}CtAiCxLyCtEcCz@yB`GmELoAfNpCxF{CiAoE|BZMcAtAmAlGoAs@F_EoDxA}DsDyE|A_FkBDfMgBdBYaDcCsDsBsKkFa@_HqPcFfEeDaIcDrBmAOoH_L}W}SiYc`@yAn@e@pMuAjBaByJkBmEaKgFqWuRtCuChEeN{@mGXsBpCm@jBoBiCcJh@eCS_Ag@YmBfByAg@vBkAg@oQfDuCxNfEfDm@jBsDrFkBfDlCzHbLjId@fN|JjHnBrOmEK{DcD{E~AoL`BIrDvG`CYFw@gBGi@aCdBe@j@kDxAhCpNlIpEeB|HsGJqElA}EbH{PzBuChMcb@f@sD{@mAbAeTpAkNxAqFhEsJzB]nFaGrGeErAdA~IcDvEhYnDnFjCjJpNv\tEt\$q$), 'official'),
    (pid, 2, $q$Percorso 2$q$, $q$Madonna del Monticino$q$, $q$Madonna del Monticino$q$, 20553, pg_temp.dpoly($q$q|{lGavyfAiCrAnArLfHlTfFjKnDbEhG`[l@?nFzMlE{Gr@AfCbG`Fg@vCjCbBeE~FqDX_CoCaI~CgCFgBtHrMjEgCnCzXsDvClApB`CcBjAVbBtHt@h@^{AtBUrBxFvFbAtNpv@{@xGcFlBjAlG{GxEeGjAsAhBmAMWjEl@~@bDTsAxF`BaGiDYa@gFxABrAkBvEq@hIsEvFv[rBp@hAxHUbF`@`DdAdAdBkDfBo@jCxJvEvBxEpG{@pA}AUdElAxC`GdGbYnBzCrAbKy@lAeBbBsIxCeA]kAkFJ_Gy@{Bs@RTnDwChI_FiIuA{Ew@r@`@fAaArCuIwL_EtEaG_AaEzBnGjD_@BhAfFiE_B}GP}D}D}AjBkBo@}GdE|DnJe@p@wEkBsHfAkEc@wD{CeA?gGj@_BhE{Dj@bAsBOeAmE}CiEe@}AeCuC{IEmIeKeGoDiNkHqKqGaGyD}HwBcLL_HmCn@cAiAQuCjHm]e@yEcDsGuCv@kDxDeF|AtAk@}@m@zA_DkBaDmC_Lj@}BpGmIxA}HlEeEU_CpAsHmAoBOqCd@wOw@yHaBgFd@cF]qClAuGs@i@KyDeA_Ds@qMwB]r@mATwHbFsK\{RnCeC^kDtIlAl@rDbBj@h@|D$q$), 'official'),
    (pid, 3, $q$Percorso 3$q$, $q$Madonna del Monticino$q$, $q$Madonna del Monticino$q$, 31190, pg_temp.dpoly($q${{{lGouyfAoA?`@}D}DyWuI_TXsB{CoG`IqT|AiKlEaPLsB{@mE`@Td@kBzCrKjFJbHwFQsBfD_JbCpEpCpApC~DwBaOdEnBbHmLnDrB}BoMbFaIXgElEeIbCgOvCwBsBaCQyA~@_R]_Bz@kJO}LqAeEiCkD}C?v@uG}Ad@kDrGcDyHKgHoDlExAmNpAaBrFiAjF}HvDjDrFLm@sI}F}C{@J]uAnFmMzE`BxCmIxHuL?lEbAN`KgJsD\nDmGxC{KpAcJYsOpAcBnB]nD|DjKyEbBuGtCR_Dy@}BjHqIbDvAsF_AmK{BkBmAzDuGGsF{BgBwDmEcDkB}FiGkCSeIkDqAuAcFmGXmEsBuEN~DGNz@oJfDxC\Kr@{IJcFgA_CiEgOeIw@XWhBa^rNx@l\uExDsGrBmC`D~CtAXpE]vIU\qCyC}Az@a@nDeCz@hAhBqAhEFjBmIgHsDgHeDyCDoJc@mCiIeSQkHoBk@uLZmF|l@cC|BqApEkBk@cJ~NvPv\qC|H\fC_BtFj@xEeCfJlEdJeB~Qw@`@}CgAyDaKwFzBqAdI}A`@oBnD\rKxCrFTdC}H~MP`BsB}A_H~Rs@GyEbLnBfOUbUxAzFtAd[cF`OcE|Hc@bF|@vFmCdCBxAyCbHs@nDCtI_AdC`H`TzCxArFJv@~CUhR|AtCpAtJ_AvHyFrKi@nDtApCGhE`BIrDvGlCa@Co@gBGi@kBdB{@b@kD`BhCpNlIpK_G|ByBBeE`BuG|EkJh@qCbCoC`B_G~L~NnEvO`Bp@bAfFxBtCfCaGrEsCxHQhEmCbFhD`Ak@`AuLzB{BpAaENiP~@}Cf@bCjAOHtAxAEbElEhGiB$q$), 'official'),
    (pid, 4, $q$Percorso 4.1$q$, $q$Madonna del Monticino$q$, $q$Madonna del Monticino$q$, 4455, pg_temp.dpoly($q${{{lGywyfAkCeF{@`@c@mE{Hk@MqEj@mDc@D_@rEeBt@b@oDaBoA{CzF_C|A}AtFdKzDM`O{AvEsBnBk@lKs@lAvB\n@rM~B`Ke@fDv@~BfBcQuAeDl@aGUkDdAqE}Bn@m@gFrDg@gAqENsBeAu@^}Rv@}@XfCjAOHtA|A?~DfElGuD$q$), 'official'),
    (pid, 5, $q$Percorso 4.2$q$, $q$Madonna del Monticino$q$, $q$Madonna del Monticino$q$, 5869, pg_temp.dpoly($q$w{{lG{wyfAoFk[aIuRD}C{CoGrDcJ~CjB`OiNfBz@dBjFB~C~AjAB{Dz@i@zBzDlPeBfTrA`FrRzBzBcAhErFrFdBdKk@fCwCsAsMdEoDe@w@aC{Or@y@YPc@gA@gBjAkArIaCjFaFe@B}HuFUdArO{@|AmGnBeAyHxC{B$q$), 'official')
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 5;
end
$do$;