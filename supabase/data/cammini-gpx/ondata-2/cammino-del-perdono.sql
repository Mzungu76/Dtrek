
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
  values ($q$Cammino del Perdono — Sui passi di Celestino$q$, 'cammino', $q$Itinerario tra Abruzzo e Molise dedicato a Celestino V, con borghi, eremi, luoghi della sua vita e paesaggi dell’Appennino.$q$, 42.183221, 13.703627, $q$Abruzzo$q$, $q$https://camminodelperdono.it/$q$, 'gpx', 'cammino/cammino-del-perdono', 0.75,
    $q${"kind":"cammino","theme":"religioso","lengthM":75163,"tappeCount":4,"tappeSource":"official","start":{"name":null,"lat":42.342899,"lon":13.404133},"end":{"name":"Sulmona","lat":42.054614,"lon":13.9202},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":4,"totalKm":75.8,"connected":true,"maxTappaKm":22.7,"namedShare":0.75,"officialTappe":0,"computedTappe":4,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$cbmaGy~xpAiH{[bX~Mto@k_AlPqv@qOsDY}`@rd@_dCde@oeA{GclAda@ad@pp@msBb[yFf@k[d^{Rve@qcChkBcg@mKkOhu@seA|i@cL{FgMvh@_WtZcm@h_AyPthAi_DiBiq@f`@ae@sFhl@nPwVtiBcxEhKybAvh@ws@zg@crA{CeTxTmJjI}`AmGkUdt@yeBdzB_mAdn@xUjt@ix@dqAoPqB|SnnCm{Bl`AqyAjoAaYqHeFfJa`@vZwChCyR}K_AuHoi@{dA^gAol@{o@oXtHkTuTkn@rIay@nZbKzV{Qfj@ywCka@sd@`g@uz@suAmrBdv@z`@ts@{m@|RpSjWqOjcBctB}H{c@hUax@}GuJ|]{u@$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, description = coalesce(excluded.description, dtrek_places.description), official_url = coalesce(excluded.official_url, dtrek_places.official_url), confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-del-perdono', 'gpx', 0.75, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, from_place_id, to_place_id, length_m, polyline, source, ends_at_anchor)
  values
    (pid, 1, $q$Tappa 1$q$, null, $q$Villa Sant'Angelo$q$, null, '3cc6f394-5554-4db0-80b6-249bbd2e77db'::uuid, 16830, pg_temp.dpoly($q$cbmaGy~xpAU_EqD_Eb@wDeCcJhAJxBnE~QbG|DkIvAuOpBfB~EoBlGoU~SqMl@cJxBsHt@iLnIoTqCkCwBaFaACeE|DjCiTEmEiCwBUmAvCcNlD{GzAmWrDgFpA{RhByC|DeNbB{Q~AsF^}IpIuBlEeOzHyi@|F{GlApA\o@o@qAZoCaAkCTeE}AsGmEoHc@qTy@cEvAmDBeBpAaDfCVnF}FvLsOtGgL~HeVpQc`@h@_MfOwb@lBkIrAmBdKh@hLuD{DmObF}JtJyK\qChBkD|BbArAaATf@|Bo@`C`B~CgLfDem@nCuRtK}KzDsKvDkE_DkHtCcK|DyBfECbIoIfT{EdCWjCv@zFaAhFgCv]sEfI{EHyB$q$), 'computed', true),
    (pid, 2, $q$Tappa 2$q$, $q$Villa Sant'Angelo$q$, $q$Acciano$q$, '3cc6f394-5554-4db0-80b6-249bbd2e77db'::uuid, 'ad47f5b9-9474-40e4-9ed1-3b1d627d06ee'::uuid, 22723, pg_temp.dpoly($q$}z_aG{fsqAwKqKhu@seAbPkJnRVfDs@`@[{FgMrLeIfFiBbJk@vHcHxEqFzKuRhBkKtCoEvEi@hI|EtH}TfSCnJlAxDyB~EmMdFkHlHqRxBiInA{KjBqFnDsH|EaFnAsDNyKxFgThBkBfA_G|CuCrEwL_@oCnAab@sA_E_BmAXiAlA|@fFmDy@kE`@cD`AV`CbEzBcC|H}KjC{KTzKq@hHwEbVl@NbBwE|KoPl@cFnEiHvCuMjCcHzCyD`Pyi@`IuP`AuOrDyE|AsEpFyAnAyBQ{I`EqMvKcMbFiSpJ}L`EyVfE_k@lCsBtB}DlGmPrGqEpGqHzASbD_HbRuh@pCgPrDkIeAe@h@iArCSxFuHqDgLb@{@MaEpBsDpBuAd@^@cBt@QSiBvEpFx@?xBuCtAiU~@wH~AoATeLl@mCPwLmAwM{BaBcAqChEyS`HaN~EkD`GeVnFkEjFeIzFyTdEcEnHsBnBwDzBTjGwG$q$), 'computed', true),
    (pid, 3, $q$Tappa 3$q$, $q$Acciano$q$, $q$Raiano$q$, 'ad47f5b9-9474-40e4-9ed1-3b1d627d06ee'::uuid, '536f67c2-eff6-433e-89c6-ec092ae3d6f2'::uuid, 20143, pg_temp.dpoly($q$}el`GslurA~BZbBqErGrBnDsP|OiF`EkDhQDxEoEr@uEvH{@dAgBxG}BjH|A|G`GnSbCjGtF~A[xG}GrDw@EsE`Cc@n@oBzCyBtQ_Z~EuBvUoAdA{@rGFzBcCvCSxLrCbDSfMiExEiEnAdCY|C{DvGR`BjBwAfFmLnKiLdWwOlA_DhH}CdBkDbSoGjPaRpBQrCyFdW_OjJ}IxE}IlNmKlQyXl@mFrDiEvFyPhGkDr@mC|OeFjJvAnSsH~@pB~AK|M}MlEpAdDyAAsAaD^{BeBQkAn@eElCoFhDkRrGPzDoCb@{CvA|HxEqEpATdAyMbA_DsIMiAq@xC_FwBi@wCmD_Ew[oEs@aE`B_LkBu]iA_F`@sEdC[q@fCqEcFwD@mAjB_Cx@{Iu@}IaAkBkOq@{G{BwGgCeEqGsFaCTWw@mA|F{@{AyC`DeHMoDcMmWqF}UtIk]OaQ$q$), 'computed', true),
    (pid, 4, $q$Tappa 4$q$, $q$Raiano$q$, $q$Sulmona$q$, '536f67c2-eff6-433e-89c6-ec092ae3d6f2'::uuid, '87e680af-8a96-4442-bae5-45fd8d50e941'::uuid, 16056, pg_temp.dpoly($q$ke~_Gu{hsALsHzCdCrU|FpMwMhHcCi@wG`SqmApIyQjGuWpD_UCmDoa@u[FoBrGaMvEeFrRgb@`DeBmB_Fi[gWiEiUy@sAyGcCaCyEoBaI}LoT{K{HqB{E~AgAhN~ArJzKdA~@f@c@hDfDnFxH|BhB`D^|DqA~DiGxG{PtD_CnIe@vN}KjKhEpFfMvKeKtBgAbBdAxCiCx@kCrFsEdD_I`AoAn@f@xHaMtDoKlCy@xFqKhGuH`BcFpCShC_BxJwKbCcAtEEpJmQn@eEyDgHsDmTrEuVzDoMjEcHlBwHCcHyGqAba@st@eBg@$q$), 'computed', true)
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    from_place_id = excluded.from_place_id, to_place_id = excluded.to_place_id, ends_at_anchor = excluded.ends_at_anchor,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 4;
end
$do$;