'use client'
import { useState } from 'react'
import { AlertTriangle, Info, Shield, Zap } from 'lucide-react'
import type { SafetyScore, WildlifeRisk, SafetyRiskItem } from '@/lib/safetyScore'
import { InfoTooltip } from '@/components/InfoTooltip'
import { ScoreTile } from '@/components/ScoreTile'

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  altitude: 'Rischi legati alla quota massima raggiunta: mal di montagna, meteo instabile, temperature più basse.',
  terrain: 'Difficoltà del terreno stimata dal dislivello e dalla distanza (indice di impegno tecnico).',
  exposure: 'Durata dell\'escursione e rischio di trovarsi ancora in cammino con poca luce o tempo avverso.',
  wildlife: 'Fauna selvatica potenzialmente presente nella zona in base a regione, quota e stagione.',
  logistics: 'Difficoltà di un eventuale soccorso: quota, lunghezza del percorso, autonomia necessaria.',
}

function CategoryBar({
  icon,
  name,
  score,
  color,
  description,
}: {
  icon: string
  name: string
  score: number
  color: string
  description: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span>{icon}</span>
          {name}
          <InfoTooltip text={description} />
        </span>
        <span className="font-semibold">{Math.round(score)}</span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function WildlifeLegend({ risks }: { risks: WildlifeRisk[] }) {
  if (risks.length === 0) return null

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        🦁 Fauna locale
      </p>
      <div className="space-y-2">
        {risks.map(risk => {
          const dangerColor =
            risk.dangerLevel === 'alto'
              ? '#ef4444'
              : risk.dangerLevel === 'moderato'
                ? '#f59e0b'
                : '#10b981'
          const probLabel =
            risk.encounterProbability === 'alta'
              ? '⚠️'
              : risk.encounterProbability === 'media'
                ? '⚡'
                : '✓'

          return (
            <div
              key={risk.animal}
              className="border border-stone-200 rounded-lg p-2.5 bg-white hover:bg-stone-50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-stone-700">
                    {risk.animal}{' '}
                    <span style={{ color: dangerColor }} className="font-bold">
                      {probLabel}
                    </span>
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1">{risk.tip}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RisksLegend({ risks }: { risks: SafetyRiskItem[] }) {
  const dangers = risks.filter(r => r.type === 'danger')
  const warnings = risks.filter(r => r.type === 'warning')
  const infos = risks.filter(r => r.type === 'info')

  if (risks.length === 0) {
    return (
      <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200">
        <p className="text-xs text-emerald-700 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Nessun rischio particolare identificato
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {dangers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Pericoli
          </p>
          {dangers.map((r, i) => (
            <p key={i} className="text-xs text-red-700 pl-5 leading-tight">
              • {r.text}
            </p>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" />
            Avvertenze
          </p>
          {warnings.map((r, i) => (
            <p key={i} className="text-xs text-amber-700 pl-5 leading-tight">
              • {r.text}
            </p>
          ))}
        </div>
      )}

      {infos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            Informazioni
          </p>
          {infos.map((r, i) => (
            <p key={i} className="text-xs text-blue-700 pl-5 leading-tight">
              • {r.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export function SafetyScoreWidget({ safety, defaultOpen }: { safety: SafetyScore | null; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)

  if (!safety) return null

  return (
    <ScoreTile
      title="Safety Score"
      score={safety.overall}
      label={safety.label}
      color={safety.color}
      badge="SAFETY"
      open={open}
      onToggle={() => setOpen(v => !v)}
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <CategoryBar icon="🏔" name="Quota" score={safety.categories.altitude.score} color="#8b5cf6" description={CATEGORY_DESCRIPTIONS.altitude} />
          <CategoryBar icon="🗺" name="Terreno" score={safety.categories.terrain.score} color="#ec4899" description={CATEGORY_DESCRIPTIONS.terrain} />
          <CategoryBar icon="☀️" name="Esposizione" score={safety.categories.exposure.score} color="#f59e0b" description={CATEGORY_DESCRIPTIONS.exposure} />
          <CategoryBar icon="🦁" name="Fauna" score={safety.categories.wildlife.score} color="#10b981" description={CATEGORY_DESCRIPTIONS.wildlife} />
          <CategoryBar icon="🚁" name="Logistica" score={safety.categories.logistics.score} color="#0ea5e9" description={CATEGORY_DESCRIPTIONS.logistics} />
        </div>

        <WildlifeLegend risks={safety.wildlifeRisks} />

        <div className="space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            ⚠️ Analisi rischi
          </p>
          <RisksLegend risks={safety.allRisks} />
        </div>
      </div>
    </ScoreTile>
  )
}
