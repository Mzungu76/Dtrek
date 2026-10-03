
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
  insert into dtrek_places (name, meta_type, description, latitude, longitude, region, official_url, source, source_id, confidence, metadata)
  values ($q$Via di Francesco nel Lazio$q$, 'cammino', $q$Percorso laziale sulle tracce di San Francesco, tra Rieti, valle reatina, eremi, conventi e paesaggi appenninici.$q$, 42.20014996826649, 12.880029967054725, $q$Lazio$q$, $q$https://www.camminodifrancesco.it/$q$, 'gpx', 'cammino/via-di-francesco-nel-lazio', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":141389,"tappeCount":7,"tappeSource":"official","start":{"name":"Piediluco","lat":42.53593202680349,"lon":12.754913968965411},"end":{"name":"San Pietro","lat":41.902250004932284,"lon":12.457330003380775},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":7,"totalKm":143.3,"connected":true,"maxTappaKm":28.9,"namedShare":1,"officialTappe":7,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$qxrbGeezlApTckBiNeFtFs~@xVaeAxe@mXEyOwJtEhDiWrWcTxMek@{\_lAhKal@mCmq@sKsf@wu@ch@kH}rB|d@`qAm@{N~\iJxGzPbJmn@}^ke@~g@fGx_@f`@lNwq@vp@iu@qFsb@nOpObGsS|c@v`@lp@kD|`Aum@vk@iFP{g@lOiKn_@nv@fc@~Evr@xtBbm@nOq@aTzBxL`UyB~Lj^fY_UvIh\ba@sCji@lVtEnz@hhA{BK}Uju@uXjXlNqDzSff@hEhoCq^|n@hWvOdb@xyGomBb_AfMrUhk@jc@mRhmAjaAr\kA`Ywt@`f@dm@vQ`n@wGxAf`@fb@fLkYh_@~H`@ai@rW|AeP}h@f`@hLbg@gcAxt@{_@xeBcjBpXtiAzMoRtW|f@mKhi@lWnJfHxvAlqAj]e@ny@g\vqAn|@zcA_N~}Atq@vtAqJrYzFtTda@bZjPnm@`H`f@_N~cBkKT``@t~AfdApQjnB}bAdNvr@~Y|@qF`Yjd@h~@yLzt@`n@b^xw@rhBjiBh|@hEvm@vYiDzvCtsAjN|a@oGv_Afq@dw@{OxV`a@jTmD~Lnk@dBto@|n@gLbk@veAbd@aHjz@hy@c@zGmMveBzlAn\_]ncBjpDfuFliB_Hdp@hTbLer@ntAdf@hRo\r`Aze@tOlc@ltAyIda@zDpi@_l@xT|a@bi@hh@vBpW}_Al~AkZfLhTxBjoA$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, description = coalesce(excluded.description, dtrek_places.description), official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/via-di-francesco-nel-lazio', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 01$q$, $q$Piediluco$q$, $q$Poggio Bustone$q$, null, null, 21718, pg_temp.dpoly($q$qxrbGeezlAp@CdA{GGaDn@a@hAcGgCwT^yCjBg@dAmGt@oNi@gIbA}JnBwEbDiAX{@EmGuD}BgAPM`C{@n@iB\q@{@LcIq@oDlF_]QsF|@kInBaIfD{FnEoNfF}Wh@uJ~M[jPkOlEeGX{G_@}FmBnFmDrAa@oDy@`A@yEnBaGv@mH~@yBvG_CzLiLxDiJjCeOpBcE`@qIOqHoAiHcCyFsHmKqAwMyFkFwAwNhCaGpAmMhCcLb@mHW_GkBsGm@sH~@wJ[mKmBgG_GoDbAi@h@yBsCwS_GiEgGuI_IiDiC_HgEsEcL~AyCeEBoChEkKu@qBAsGqA{G]}VyA}@LsBkCkJ@}A~@sA{BoU`AaFaAuB_At@TbJnBhJnFjH@hHnDxDnBzGdDlBvDvGfE`M_AuKPeBvANpAaB`BS|BdCfCiCbGf@rAwEtAoAtBhClAzJtAt@tAwBbAcK~G{GXiDcB{IKoEyC_KeH_H}AwF_DoBy@oBkEh@_A_AD}@|Ew@fOrGrAa@dNlAlAzBpG~C~ApJhGxDPtExC`AbDw@~DgGzCuNsBqJdGgN`AcBhDcAnF_OnFgFdCoH|JiNvFj@nBkAt@wN_CyIgDaH$q$), 'official', null),
    (pid, 2, $q$Tappa 02$q$, $q$Poggio Bustone$q$, $q$Rieti$q$, null, null, 17297, pg_temp.dpoly($q$_elbGkitmAn@{A{@aAUyBdF`C_BcG@iFVeBrBU`ANaBrBHdA`K`DjAvAtAtFtCdCzPfGlIcCbFQzJ{E~RdEzMsOvFRzQcFpMkLtA_EzBKhByB|E`BpAtC~CNxDgEJuFtCyBnChCzMcA?uDdAcCI}Dx@eBOqCl@iACaBh@EqA{AuA}Gp@gA`Dk@CgBt@T~@_CYo@fB_@GpA`CeAjFtBnC`Ef@nA@|NtF~FrJhRnG^rKgCtHvClDnDnGbTfNvOtClHZlZ|B~QrBq@BnFhH~FlDbIlM`DfD`DtQZvFnDFiB{AgF`@oIh@`HpAvC`EyANcBz@m@nAzAdA]tA|CfEiBz@dAyAzJlEdDnGbKpFmCdCmFdJmIhBHlAh@xCjKnBrNxEb@rIyGjE`EhI_B`OlNjOhE|Ht@zAjEn@pp@hApBbn@DzIo@dBbAbKuCJyG$q$), 'official', null),
    (pid, 3, $q$Tappa 03$q$, $q$Rieti$q$, $q$Poggio San Lorenzo$q$, null, null, 21815, pg_temp.dpoly($q$}uxaGcpnmAg@sJ~Ca@dMx@PqI~FmHrYmEhEb@~C|I`MjB_DhFQpLff@hE|CU~KkEfC@xFlBlGFtQgBvH{BtS_BbFiDAcDtEmCzQBzHuAfMUlBfA~E\rCrD|DpBbOpCxIjFrDxHcAhG`BhD?zAdIzGpGo@jP_FqBoHlJyD`HiBdIQzFqBnDLjHbDh@wCa@sEfS_C`UaGpRyD^\rAcCzOqHj[_GdTSzFuCrZiFxQeJlFiGvDBhFyAxJhDfHd@zBk@~Cz@jHmACbE|BjCtMSbAj@dCq@lOnWdCLnD|FoBlJhL_LtCmAxBwEvAGhEhCnDi@dVvRH`BsAzC`FiAdCXfTpLjIhGbDbHlHdHbM_@xJ}CXzBzAI~@kHjIkDE{@bDaDjDaMTaHtA}GhBfFpFtHhDdK|GtJlH@nChD`Mz^GrC|CpIcBIaFeEl@hH|JbHhFbBzGjL$q$), 'official', null),
    (pid, 4, $q$Tappa 04$q$, $q$Poggio San Lorenzo$q$, $q$Ponticelli Sabino$q$, null, null, 20389, pg_temp.dpoly($q$cl{`GcskmArDlI`@YG}FxCzDTsEeEcHlB?tG|Cx@uEY_EnDpF|L~BzKq@oA{PxDoEiFkG|DwB[qDtAdAQzDv@LxJm@pBbAjDgEuBeOmGwFiBaEw@}J`F}@|LvIvFM~@rEXoAt@XfA}GtCoFpCuAzCwHvEuE`H}S|FwJMpFhAcFjB_C`F|@~EqMlGqB~AoFB_CnBZpA{A~AnCjF[nEgBhUk[tCPxA{DtN{LhI}K|D{KlKyGrWqW~BKr@`BQrHlOba@`GzZ`@\hCiAOlAv@Og@vBtAYtBcFYeL|@cB~@LGfAbBrDtBl@QhFx@lBJhEtAOxL`MeCbKcCLC|ImBnIQhGlSbCn@tDnAt@Q|BbDtIm@xH|BtGUvFfBxKiBnFq@pKnC`M`@eBhBxC`BPlHcBzL|CnChBh@tGhB`GzLuBlAmA}AtIrJqNlB|DlBXtIpI|AjT{CvCx@lJa@|ScCvGuAvJyA|Ak@xG{E|IOxEu@rBt@fGmEfEcC~HIrC|CnOxH`MnGnFvSlErIlJzE|K$q$), 'official', null),
    (pid, 5, $q$Tappa 05$q$, $q$Ponticelli Sabino$q$, $q$Monterotondo$q$, null, null, 28864, pg_temp.dpoly($q$qbl`G}oemA{CrEUzBnE|Jg@jDaB`@e@bFbAx@QxI{AdDFpFkE~EmAxDmBDzAvSfAhDvLzI`FnHK|EhRj_@x@fJdC|BtApDFvCjArBeJ~GQvCmAnCxBBT~CzCjHr@TcBjC?bA|Dp@|GxJhRvL~EjYnBjEVvDbE~FqAzMfCrFj@nL~D`BsBhH]vHwDxBrBlFU`H}C|BQhDyAzDb@hCc@lMhAdOcA~DNpD{AbAsGwA[h@jAxEdB~AzGjO`Kr[vBtOOpEy@pBFxCzCfH|RyC`O~F~@lAjCLxIjHrBUlKxBz@gChDyCzVsAdWcRdKwKnBlAjEo@~GwDjMeLfIkBL_BvFdNfEhPq@|KfAtANrBtHw@`BjApFm@tEvAIbKgF|L~AnBl@dFrKp^zFfB@|FpEbHpApAfBy@ZhGoCzDWjEV|IyAjGkF~LtJ~CdBxIpGhHxHQbIdAtBjCrE`LxGzFnCxHGfItChMpCjHrFlFtDjQpMbNfW~J`c@tYdVhSrObGtAaDpBW|C`j@j@tBdOZpIeErGvHvOnJjJhBrEvF|ErCrbAv]rTxFhKdHtCrLtIhTuDbSApBjAlEF`JYtFqCzNnCj@fEbGhEfRlGpM|C~BxRzGBv@qLvMmBhF$q$), 'official', null),
    (pid, 6, $q$Tappa 06$q$, $q$Monterotondo$q$, $q$Monte Sacro$q$, null, null, 18050, pg_temp.dpoly($q$_~s_Gki`lAxT~HfE`G~DlBaBpGyD\Mp@zB|AdD~AbI`AhDc@`Jz@jF{BlDf@vM|RnM~IrBlFxNpHg@nEwEnGjB~CsGbW|^tEjOzIlUpRRlIsDtKsD`E_A`EFnJhBrKhPiFxH_AhMvAdDbDtJHxG_F@mFnWrJtJ~Md\t]x`@`OpBnC|MaBrCcFxCwPhAkAxAHjO~NtApGbE|DhAvTpB`GrL`WdNrSzSvd@pGvIlDjIpAxHdBtB|d@~M~WrDlSnJbE^~VzIpP`CnT`Qt\tRpXrLfKjBfR`K|G}@_AoE$q$), 'official', null),
    (pid, 7, $q$Tappa 07$q$, $q$Monte Sacro$q$, $q$San Pietro$q$, null, null, 15199, pg_temp.dpoly($q$oq}~FejokAbDhQmLdYWzC~GrF|E}BxAHpAbHyDnI}BvBUtCl@jGeHtCsIXaBrJ_Ql`@l@`BwApCLfAlGbIbEtBxDoCv@gB{AaFrBAnEzES~@bApFpEYh@nAyIhJyObf@y@jFAxFtAhF`NfC~L\bFdCdAlD]hFfIrK~Ibe@fAnBhBKv@pErEfKa@r@RdE}@rSmGvDdE~\c@t@z@zEi@p@FlA}]~J_LvEa@`BxQpZzEzFfHtE~RhEjHsA|J@v@cHzIgQlDmZx@sCtCoD~JqCtNr@bV_DTd@b^aSnEw@hEd@hF|D|DjNxAp^_@|B~@zk@$q$), 'official', null)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 7;
end
$do$;