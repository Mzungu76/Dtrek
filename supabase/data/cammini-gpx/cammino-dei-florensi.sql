
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
  values ($q$Cammino dei Florensi$q$, 'cammino', 39.26614388823509, 16.448742086067796, $q$Calabria$q$, 'gpx', 'cammino/cammino-dei-florensi', 0.9,
    $q${"kind":"cammino","theme":"religioso","lengthM":92715,"tappeCount":5,"tappeSource":"official","start":{"name":"Celico","lat":39.309323178604245,"lon":16.335808178409934},"end":{"name":"San Giovanni in Fiore","lat":39.253057558089495,"lon":16.700937543064356},"ref":null,"network":null,"trackSource":"gpx","quality":{"status":"pronto","reasons":[],"tappe":5,"totalKm":96.7,"connected":true,"maxTappaKm":21.5,"namedShare":1,"officialTappe":5,"computedTappe":0,"longTappe":0,"shortTappe":0}}$q$::jsonb || jsonb_build_object('overviewPolyline', pg_temp.dpoly($q$gr|nFyqubBgJ}k@zNmBqKeWxOrGqK}RhJxBlEk]o\_g@\g[zC`Rfb@hEdBgMtGtNGsN|\d^pf@mFnWo{BtMdqAbd@ic@y@l}@b]nKnYdvAtVlWjJmLnHzWhZoN_EsXrc@ow@vAw_@iQmYka@zUUyNcUd@na@gdAiEw_@pd@e@gPqg@sDmfAlSsPqQsc@c@yh@hV}bCt^il@tWzU`q@{I`g@f\|Hes@bXBjYg^yJv@cQob@cWxHcKeKeWtI`EzeAko@qV{sBh_@e@yMyLrMzCkMqQy]pP_TrLbGxY{Odf@u}@pt@qd@wAyNdT}MxQkr@_Syz@aWzPpU}^mL{r@_t@fCbFyq@cM{OfMfReFdp@{KugAjFeu@z\{y@HsVcI[vNatAnQkMh\xd@x[aMyKqE`DmMbv@~R`EgOE{o@u]iwAxHajArXmv@wJoNtLuy@_m@xTIsq@oMxEyEqdAcO}YfScu@kZIyPhZe\kg@i`@rB{Lon@}PfVoVmQOdk@aNzE_Ha~@aSuUrD_}@`QwSyOcR|k@_{AuS}SySzFff@ofAxLeAjDc[xPgH|Cu^$q$)))
  on conflict (source, source_id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
    region = excluded.region, confidence = excluded.confidence, metadata = excluded.metadata
  returning id into pid;

  insert into dtrek_place_sources (place_id, source, source_id, raw_type, confidence, last_synced_at)
  values (pid, 'gpx', 'cammino/cammino-dei-florensi', 'gpx', 0.9, now())
  on conflict (source, source_id) do update set place_id = excluded.place_id, last_synced_at = now();

  insert into dtrek_cammino_tappe (cammino_id, ordinal, name, from_name, to_name, length_m, polyline, source)
  values
    (pid, 1, $q$Tappa 01$q$, $q$Celico$q$, $q$Pietrafitta$q$, 18991, pg_temp.dpoly($q$gr|nFyqubBqDmKeAcJkBkC`@}AQsB~@{@U{Ax@eBwBoAn@mArJPvAq@mAyAaEuAoBiHQkHz@}@IxDfAjA`@hChGaBrBb@EaAuGmDjAcGOiAqD_AHm@~DS~BrE^WQcDcCsDhBwEy@gDrE}@~AuDqDwBsC}DIaBeKuLs@mEeDcFcBqJbD{Ea@yHvDbI[|G`AgBNlBfFxAhC_Bb@t@xEqBdLdGnCcBi@cJtGpI?bD`AgCmCmIbA]~HlGnBlExAV|@aACzA~Am@UhA}EdE~DQnDlBeAVbF`CpFi@vMgIxCr@iAmBvEG`ClC|Bv@qDoGnDtAlH_FGcQv@{FSmDsAuCrDsKuAwFxDiC?_D}AwE~BqHw@aEnA}HOiCl@oDjDwBr@^DpBuAxBrArFlAvObCjG_@jDdBlHi@fDnAlENpGnA~DrALhBgDrEs@HsCn@H_AoFl@gBrGwEvIyB|BgCuAdFnDbF[pGfBrK?nEw@rCYzHy@NsAlD~C|A|JfAhErDzEt@vAhIdDhHOdBwAS\|@w@TrCx@jBjD^dItAbDq@zCnAK~@fAuAlGbDz@I`DfBxCrA|KtEnC`DzEjExBPhAg@rA`@tAdDr@fA_@d@}BzAe@hA}EvAKx@pG?nG|C\vAzE~AmAvCt@`C}EvCdBn@cBd@ZbCaG|@D$q$), 'official'),
    (pid, 2, $q$Tappa 02$q$, $q$Pietrafitta$q$, $q$Ceci$q$, 21510, pg_temp.dpoly($q$q}rnF}wvbB`@w@_@b@Sa@jB}B`@}BsBBM}@qAAVsFu@y@g@oEnBrArBuBlF_OMcIv@_@xFsMCp@pCyCpAeD|DgDkAeAdBoEgAxAYe@`@kCqApASw@xB}OhBeDqFkDuBAw@oAeB}CC}J_As@yBvGsBPu@pBkBnAeFe@_ByC}AxF}BzByCx@kDiAb@}EhCsCW}@}@fBaHuCkE`As@dAcBs@vF{GpEkBwDcBw@aB|CeShDwH~EiDdA?|@}DhEsHo@_AfCsG?kE{A}BcE{BA}FxAeAW`BrArA|AwE|BjDfCyBl@gCtFxFd@oC~E~AlCq@gFuVyCiEaBoGcAaAFsKoA}DrBaEb@{GmAeDLsC{C_JZ_Bs@oBn@oABkDcAwAbHoDR{BlBiCi@eEzB`DLvApA[t@uCeB_@tB_F{@oCf@uEaAa@AoA{CuGcG[iBiCfBsC}@wDhBeEi@yANqEo@gD_@H\}AwAyAVq@k@sBlBwAa@gEj@Q}@eLr@Q~BoJI`@qCwO`BaAFs@o@e@ZkCd@MPgJ|@Gi@OZmBb@D~CcQ|@WGqFzDsPb@mK|@iCnD{DG_E`BB|@~@f@sBrBTRgCm@yDjCoC~Dc@^yAk@cClDuDlCdI`ClAhAE`@aEjDg@lFvPj@WYcF|@cA~FXdBbCrCStChF`FqCf@aChAaAfDJ`CdCzDuEf@HbChGjCgAzFdE`AvEjCeB|@NbEfKb@NlBqBxBj@XjAhDgCv@uQ}BeG^cFfF}BRiBaAuE|A}AjClAxPR@cArAe@xBmDrEq@fD{KCiB$q$), 'official'),
    (pid, 3, $q$Tappa 03$q$, $q$Ceci$q$, $q$Lorica$q$, 21274, pg_temp.dpoly($q$yqknFkukcB}@`CkC_@sBzDyBcBeAcIg@o@eD^WqAh@oD_B}EwBkBa@wCgAw@cFvE_C[[n@wI^k@l@y@cBJz@a@DuCoB}CsFgEvBq@tDsFgBwGnCkDb`@z@xDGvGtArCVbDpDpFx@xC_@`@C{@yAm@eDpCAoF_B_@{HeHeBt@e@xIqBsH_EtAaBwDkBc@m@yCoD_@_FtCmA|Aa@hCyNk@_CdAiB{F{FfMsEm@gMNkHjC{CUFy@kK|F@f@{By@cAzAcBZeDc@{LfAl@eHsAsDk@dB^`BwIjCuA~BzCkMcAC_DxC?}FcCiEQyFeA_DTaCgDkCrDcJ|J{HrBY`B\xAfEbCv@vPiL`HqBxL_QhJmFhA{CaAuFf@yBrBoAhDiGrBaIpC_@xE{DdHoI`BaEvA?lAbC~GqPhC@rBeEvEfE`@Yz@eEE}CuACw@qCfGoE|Ap@tAe@rBoB`AaDr@GEiHp@cGh@gBr@X@e@wAyAMoCpC{@nE{DpEgNsAiPwAwCfAyCeAwJuMeTcD`@mF|DqArBSlDoCxCyB_BtEiMBmBvJqE~BsFG_DgAwDkBk@qCzAa@m@p@}VqAuCb@{CWcDi@qAaE@aOyCoAjAgA_@_H~KkJs@wDwBtDqLQwC{CuGzEyV_CiFaCw@aEyFtI~JpBfFiF`UvCzF\vCqDnM$q$), 'official'),
    (pid, 4, $q$Tappa 04$q$, $q$Lorica$q$, $q$Cagno$q$, 20059, pg_temp.dpoly($q$amqnFazwcBNcCeEB|AaChEwT{AiS^aG~FiK~B}IB}F~HwFIeLhAuDvDa@d@mN[eGsAEiEvCe@mDdC}LIyBgAwBpFkEjD{K\gNa@uEw@_AE_IfBkI`Aa@~DhEXwFlBOXmAWiD^}BbDH|AnDhAe@iApBZ~EfKgAjBfDzAd@i@tAhG`ObI{GlCE`Ar@r@aAdEa@jCoBcDWuFyD@yH~@n@~AcEzKdAdAbC`BoA|FrBzAiB`FDrGdErBjEzEbBb@Wg@_CrAk@pBcIe@{LqBmCxB{KVuPwBoAgCLk@{Fr@yIoE}B_BgCXsEgBiBUcAd@{@sCuFiAkOoCuLAuFhBuQi@sNrCa@dAaLdD}DUcCj@}A{CsLt@eDlAu@pCeHLqCpDkCrAaKEeByAmCbHsEdAcCeA{Ai@_GgGsCXoDrKiPoE{@iBsFf@sDbEsG[aDpBaFeHTaCuAgCp@mA~AkDt@wFdFMjCcCzD_B|@kDy@wDcOi@kHz@_Fz@SdAoCYmFr@qDu@iCkAlASjByHhDlB{CsC_H{@aGmAgZ_DgAjCeGU}HmC}JcDsBqEkJVeExAmE_ByHfEqSxEyHnCRbA}@oDeBQ_Bm@SkBh@y@jBuMx@iBpBq@hCuBG$q$), 'official'),
    (pid, 5, $q$Tappa 05$q$, $q$Cagno$q$, $q$San Giovanni in Fiore$q$, 14873, pg_temp.dpoly($q$ybonFkbodBh@jIUnEuADyEfDpBkF{@cD{GoCwBkHwEaAkCbBoD_@iBcCt@}HwE`B_Gc@cCx@sAs@yJn@}@mAEsBeEeFYyMnBuDgGwL_@zGfAvCkEbCkHkA_ChCPpB_@u@aNeCTm@|F^p@aAwMkI{AH}@~CShJsB|LbAdGnAa@`@f@?pDkF`HuC}A_BV_B_EcAoLgBgFk@oKk@yCeAaAhC}O{DYiAiFcEqCiAkFmBsAQgOfBq@p@yAw@iJjAeLV{OpDu@`F}IpAUzAmFKiBkDwIyAe@}Dv@w@c@QoCjDyNxAwAbB@{@{DdD_L@qFvBmAfDVzEyD|@gFzEmI^sCa@sCd@yAjBeA`@sFk@_FiC}@kAgC}@WkBrCiB{FeBNYgCqERqHhHuCaAzCgCc@{FhA_H~JyG~DiAdAmCNkDtD{@tAwDbCyTxHnAb@gBzAm@n@iBRgGbBgGBiGtD_E~@WbCtA~DeDScCfB_CNqEa@u@xB_Ch@aCgAgF$q$), 'official')
  on conflict (cammino_id, ordinal) do update set name = excluded.name, from_name = excluded.from_name, to_name = excluded.to_name,
    length_m = excluded.length_m, polyline = excluded.polyline, source = excluded.source;
  delete from dtrek_cammino_tappe where cammino_id = pid and ordinal > 5;
end
$do$;