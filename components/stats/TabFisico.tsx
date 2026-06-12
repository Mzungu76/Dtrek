'use client'
import { useMemo, useEffect, useState } from 'react'
import { ActivityMeta } from '@/lib/blobStore'
import {
  computeRecoveryScore, computeFitnessScore, computeEFTrend,
  estimateZoneTimesFromMeta, computePolarizedDistribution,
  computeVO2maxEstimate, computeCalorieEfficiency, type EFPoint,
} from '@/lib/bioMetrics'
import { computeTrainingLoad, activityStress } from '@/lib/trainingLoad'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ComposedChart, Scatter,
} from 'recharts'
import { Heart, TrendingUp, Zap, Activity, AlertCircle, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import InfoButton from './InfoButton'

interface UserSettings {
  hrMax?: number
  derivedFCmax?: number
  hrRest?: number
  userWeightKg?: number
  userAge?: number
}

interface Props { activities: ActivityMeta[]; onGuideLink: (section: string) => void }

export default function TabFisico({ activities, onGuideLink }: Props) {
  const [userSettings, setUserSettings] = useState<UserSettings>({})
  const [loadingSettings, setLoadingSettings] = useState(true)

  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.ok ? r.json() : {})
      .then((data: any) => setUserSettings({
        hrMax:       data.hrMax ?? null,
        derivedFCmax: data.derivedFCmax ?? 0,
        hrRest:      data.hrRest ?? 55,
        userWeightKg: data.userWeightKg ?? 0,
        userAge:     data.userAge ?? 0,
      }))
      .catch(() => {})
      .finally(() => setLoadingSettings(false))
  }, [])

  const maxHR = userSettings.hrMax ?? userSettings.derivedFCmax ?? 190

  // ── Training load for TSB (Recovery Score) ─────────────────────────────────
  const tsb = useMemo(() => {
    const events = activities.map(a => ({
      date:   format(new Date(a.startTime), 'yyyy-MM-dd'),
      stress: activityStress(a.distanceMeters, a.elevationGain, a.totalTimeSeconds),
    }))
    const load = computeTrainingLoad(events, 90)
    return load.length > 0 ? load[load.length - 1].tsb : 0
  }, [activities])

  const recovery   = useMemo(() => computeRecoveryScore(tsb), [tsb])
  const fitnessInfo = useMemo(() => computeFitnessScore(activities), [activities])
  const efTrend    = useMemo(() => computeEFTrend(activities), [activities])

  // Zone approximation from avgHR
  const zoneTimes  = useMemo(() => estimateZoneTimesFromMeta(activities, maxHR), [activities, maxHR])
  const polarized  = useMemo(() => computePolarizedDistribution(zoneTimes), [zoneTimes])

  const vo2max = useMemo(() =>
    computeVO2maxEstimate(maxHR, userSettings.hrRest ?? 55)
  , [maxHR, userSettings.hrRest])

  // Latest activity with HR for decoupling info
  const lastHRActivity = useMemo(() =>
    [...activities].filter(a => a.avgHeartRate > 0).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0]
  , [activities])

  // Calorie efficiency for last 5 activities with data
  const calorieEff = useMemo(() => {
    if (!userSettings.userWeightKg) return []
    return activities
      .filter(a => a.calories > 0)
      .slice(-5)
      .map(a => ({
        title: a.title ?? 'Escursione',
        date:  format(new Date(a.startTime), 'dd/MM'),
        eff:   computeCalorieEfficiency(a, userSettings.userWeightKg!),
      }))
  }, [activities, userSettings.userWeightKg])

  const hasEFData = efTrend.length >= 3

  const TrendIcon = fitnessInfo.trend === 'up' ? ArrowUp : fitnessInfo.trend === 'down' ? ArrowDown : Minus
  const trendColor = fitnessInfo.trend === 'up' ? '#16a34a' : fitnessInfo.trend === 'down' ? '#dc2626' : '#ca8a04'

  if (loadingSettings && activities.length === 0) return null

  const noHRData = activities.filter(a => a.avgHeartRate > 0).length === 0

  return (
    <div className="space-y-6">
      {noHRData && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">Nessuna attività con dati di frequenza cardiaca trovata. Alcune metriche richiedono un cardiofrequenzimetro.</p>
        </div>
      )}

      {/* ── Stato Attuale ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Recovery Score */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Recovery Score
            <InfoButton section="recovery-score" onGuideLink={onGuideLink} />
          </p>
          <div className="flex items-end gap-2 mb-1">
            <p className="text-3xl font-bold font-display" style={{ color: recovery.color }}>{recovery.score}</p>
            <p className="text-stone-400 text-sm mb-1">/100</p>
          </div>
          <p className="text-sm font-medium" style={{ color: recovery.color }}>{recovery.label}</p>
          <p className="text-xs text-stone-500 mt-1 leading-tight">{recovery.suggestion}</p>
          {recovery.daysToRecovery > 0 && (
            <p className="text-xs text-stone-400 mt-2">Recupero completo stimato: {recovery.daysToRecovery} giorn{recovery.daysToRecovery === 1 ? 'o' : 'i'}</p>
          )}
          {/* Mini gauge */}
          <div className="mt-3 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-2 rounded-full transition-all" style={{ width: `${recovery.score}%`, backgroundColor: recovery.color }} />
          </div>
        </div>

        {/* Fitness Score */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Fitness Score
            <InfoButton section="fitness-score" onGuideLink={onGuideLink} />
          </p>
          {fitnessInfo.hasData ? (
            <>
              <div className="flex items-end gap-2 mb-1">
                <p className="text-3xl font-bold font-display text-forest-700">{fitnessInfo.score}</p>
                <p className="text-stone-400 text-sm mb-1">/100 del tuo picco</p>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendIcon className="w-4 h-4" style={{ color: trendColor }} />
                <p className="text-xs font-medium" style={{ color: trendColor }}>
                  {fitnessInfo.trend === 'up' ? `+${fitnessInfo.trendPct}% vs 3 uscite fa` :
                   fitnessInfo.trend === 'down' ? `-${fitnessInfo.trendPct}% vs 3 uscite fa` :
                   'Stabile rispetto al recente'}
                </p>
              </div>
              <p className="text-xs text-stone-400 mt-2 leading-tight">Basato sull'efficienza aerobica (velocità/FC) confrontata con il tuo storico.</p>
              <div className="mt-3 h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-2 rounded-full bg-forest-400 transition-all" style={{ width: `${fitnessInfo.score}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-stone-400 mt-2">Dati insufficienti. Servono almeno 3 attività con FC registrata.</p>
          )}
        </div>

        {/* VO2max estimate */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5" /> VO₂max Stimato
            <InfoButton section="vo2max" onGuideLink={onGuideLink} />
          </p>
          {vo2max > 0 ? (
            <>
              <div className="flex items-end gap-2 mb-1">
                <p className="text-3xl font-bold font-display text-sky-700">{vo2max}</p>
                <p className="text-stone-400 text-sm mb-1">ml/kg/min</p>
              </div>
              <p className="text-xs text-stone-500 mt-1 leading-tight">
                {vo2max >= 55 ? 'Eccellente — atleta allenato' :
                 vo2max >= 45 ? 'Buono — sopra la media' :
                 vo2max >= 35 ? 'Nella media' : 'Margine di miglioramento'}
              </p>
              <p className="text-xs text-stone-400 mt-2">Formula Uth-Sørensen: FC max / FC riposo × 15,3</p>
              {!userSettings.hrRest || userSettings.hrRest === 55 && (
                <p className="text-xs text-amber-600 mt-1">Imposta la tua FC a riposo nel profilo per una stima più precisa.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-stone-400 mt-2">Imposta età o FC massima nel tuo profilo per calcolare il VO₂max.</p>
          )}
        </div>
      </div>

      {/* ── Efficienza Aerobica (EF) ── */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
          <Zap className="w-4 h-4 text-forest-600" /> Efficienza Aerobica nel Tempo
          <InfoButton section="ef-aerobica" onGuideLink={onGuideLink} />
        </h3>
        <p className="text-xs text-stone-400 mb-4">
          EF = velocità / FC, normalizzata per il dislivello. Un EF crescente indica un cuore che lavora meno a parità di ritmo: la tua base aerobica sta migliorando.
        </p>
        {hasEFData ? (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false}
                    tickFormatter={d => format(new Date(d), 'dd/MM')}
                    type="category" hide />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44}
                    tickFormatter={v => v.toFixed(4)} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                    labelFormatter={d => format(new Date(d as string), 'dd MMM yy', { locale: it })}
                    formatter={(v: any, name: string) => [Number(v).toFixed(4), name === 'ef' ? 'EF raw' : 'EF (media mobile)']} />
                  <Scatter data={efTrend} dataKey="ef" name="ef" fill="#378d44" fillOpacity={0.3} />
                  <Line data={efTrend} type="monotone" dataKey="efSmoothed" name="efSmoothed"
                    stroke="#378d44" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-stone-500">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-forest-500 inline-block rounded" /> Media mobile</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-forest-300 inline-block opacity-60" /> Valori singoli</span>
            </div>
          </>
        ) : (
          <div className="py-10 text-center text-stone-400">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Dati insufficienti. Servono almeno 3 attività con dati di velocità e FC.</p>
          </div>
        )}
      </div>

      {/* ── Distribuzione sforzo (Polarized) ── */}
      {polarized.hasData && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-forest-600" /> Distribuzione Intensità Allenamento
            <InfoButton section="distribuzione-polarizzata" onGuideLink={onGuideLink} />
          </h3>
          <p className="text-xs text-stone-400 mb-4">
            Basata sulla FC media per attività (approssimazione). I ricercatori dello sport raccomandano ~80% bassa intensità e ~20% alta intensità.
          </p>
          <div className="space-y-3">
            {[
              { label: 'Bassa intensità (Z1+Z2)', pct: polarized.lowIntensityPct, color: '#6ee7b7', ideal: 80 },
              { label: 'Media intensità (Z3)',     pct: polarized.medIntensityPct, color: '#fde047', ideal: 10 },
              { label: 'Alta intensità (Z4+Z5)',   pct: polarized.highIntensityPct, color: '#fb923c', ideal: 10 },
            ].map(({ label, pct, color, ideal }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-stone-600">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-400">ideale: ~{ideal}%</span>
                    <span className="text-sm font-bold text-stone-800">{pct}%</span>
                  </div>
                </div>
                <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-xl text-xs text-stone-600 bg-stone-50">
            {polarized.medIntensityPct > 35
              ? '⚠️ Stai dedicando molto tempo alla soglia (Z3). Considera di sostituire alcune uscite con passeggiate lente (Z1-Z2) per costruire la base aerobica.'
              : polarized.lowIntensityPct >= 70
              ? '✓ Distribuzione equilibrata. La base aerobica è ben sviluppata.'
              : '↑ Aumenta le uscite a bassa intensità per migliorare la base aerobica.'}
          </div>
        </div>
      )}

      {/* ── Calorie per kg ── */}
      {calorieEff.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
            Efficienza Metabolica (kcal/kg/h)
            <InfoButton section="calorie-metabolismo" onGuideLink={onGuideLink} />
          </h3>
          <p className="text-xs text-stone-400 mb-4">
            Calorie bruciate per kg di peso corporeo per ora. Valore tipico per trekking: 4–7 MET (kcal/kg/h).
          </p>
          <div className="space-y-2">
            {calorieEff.map((e, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-stone-400 w-12 shrink-0">{e.date}</span>
                <span className="text-xs text-stone-600 flex-1 truncate">{e.title}</span>
                <span className="text-xs font-mono font-bold text-terra-600 w-16 text-right">{e.eff} kcal/kg/h</span>
                <div className="w-24 h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-terra-400 rounded-full" style={{ width: `${Math.min(100, e.eff / 10 * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Info box ── */}
      <div className="bg-sky-50 rounded-2xl border border-sky-100 p-5 text-sm text-sky-800 space-y-2">
        <p className="font-semibold">Come interpretare le metriche fisiche</p>
        <p><strong>Recovery Score</strong>: derivato dal TSB (Training Stress Balance). Un valore alto indica che sei riposato e pronto per uno sforzo intenso.</p>
        <p><strong>Fitness Score</strong>: confronta l'efficienza aerobica recente (EF) con il tuo massimo storico. Non è una scala assoluta — misura la tua evoluzione personale.</p>
        <p><strong>EF (Efficiency Factor)</strong>: velocità / FC, normalizzato per il dislivello. Un EF che cresce nel tempo è il segnale più affidabile di un miglioramento aerobico.</p>
        <p><strong>VO₂max</strong>: stima dalla formula Uth-Sørensen (FC max / FC riposo × 15,3). È un'approssimazione — per valori precisi serve un test da laboratorio.</p>
        <p className="text-xs text-sky-600">Imposta FC massima e FC a riposo nel tuo profilo per calcoli più accurati.</p>
      </div>
    </div>
  )
}
