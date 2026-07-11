'use client'
import { useState } from 'react'
import { Gauge, ShieldCheck, CloudSun, MapPin } from 'lucide-react'
import { AssessmentPanel } from '@/components/routehub/AssessmentPanel'
import { CurrentConditionsNotice } from '@/components/CurrentConditionsNotice'
import { textMuted } from '@/components/routehub/overlayTheme'
import ScoresWidget from './ScoresWidget'
import type { ScoresBundle, SafetyDetailsBundle } from '../GuideReader'

interface Props {
  scores?: ScoresBundle
  safetyDetails?: SafetyDetailsBundle
}

type TabKey = 'punteggi' | 'valutazione' | 'condizioni' | 'segnalazioni'

function MarkerList({ markers, highlightedMarkerIndex }: Pick<SafetyDetailsBundle, 'markers' | 'highlightedMarkerIndex'>) {
  return (
    <div className="space-y-2">
      {markers.map((m, i) => {
        const highlighted = i === highlightedMarkerIndex
        const colors = m.severity === 'danger' ? 'bg-red-50 border-red-200 text-red-700' : m.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-sky-50 border-sky-200 text-sky-700'
        return (
          <div key={i} className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${colors} ${highlighted ? 'ring-2 ring-offset-1 ring-offset-black/50 ring-current' : ''}`}>
            {m.text}
          </div>
        )
      })}
    </div>
  )
}

/** "Dati e sicurezza" a sotto-tab interne (Punteggi/Valutazione/Condizioni/Segnalazioni) invece di
 *  un unico lungo scroll con tutto impilato allo stesso peso visivo — vedi mockup, variante A. Un
 *  pallino segnala le sotto-sezioni con un avviso attivo. Ogni tab monta/smonta il proprio
 *  contenuto (non solo lo nasconde) così il grafico punteggi riparte con la sua animazione
 *  d'ingresso ogni volta che si torna sulla tab Punteggi, invece di restare statico dopo il primo
 *  montaggio. */
export default function DatiSicurezzaTabs({ scores, safetyDetails }: Props) {
  const hasAssessmentRisk = !!safetyDetails?.assessment?.risks.some(r => r.type === 'danger' || r.type === 'warning')
  const hasPermanentRisk = !!safetyDetails?.signals && (
    safetyDetails.signals.satellite.rockfallPenalty < 0 ||
    safetyDetails.signals.osm.visibilityPenalty < 0 ||
    safetyDetails.signals.satellite.ndviAbsolutePenalty < 0
  )
  const showCondizioni = !!safetyDetails?.hasGps && !safetyDetails?.notMatched

  const tabs: { key: TabKey; label: string; icon: typeof Gauge; dot: boolean }[] = []
  if (scores) tabs.push({ key: 'punteggi', label: 'Punteggi', icon: Gauge, dot: false })
  if (safetyDetails?.assessment) tabs.push({ key: 'valutazione', label: 'Valutazione', icon: ShieldCheck, dot: hasAssessmentRisk })
  if (showCondizioni) tabs.push({ key: 'condizioni', label: 'Condizioni', icon: CloudSun, dot: hasPermanentRisk })
  if (safetyDetails?.markers.length) tabs.push({ key: 'segnalazioni', label: 'Segnalazioni', icon: MapPin, dot: true })

  const [activeTab, setActiveTab] = useState<TabKey | null>(null)
  const active = tabs.some(t => t.key === activeTab) ? activeTab : tabs[0]?.key ?? null

  if (tabs.length === 0) {
    return <p className={`text-sm italic ${textMuted}`}>Nessuna valutazione disponibile per questo percorso.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`relative flex-1 min-w-0 flex flex-col items-center gap-1 px-1 py-2 rounded-lg transition-colors ${
              active === t.key ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <t.icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
            <span className="font-barlow font-bold text-[10px] leading-tight text-center break-words">{t.label}</span>
            {t.dot && <span className="absolute top-1.5 right-[18%] w-1.5 h-1.5 rounded-full bg-terra-500" />}
          </button>
        ))}
      </div>

      {active === 'punteggi' && scores && (
        <ScoresWidget {...scores} />
      )}
      {active === 'valutazione' && safetyDetails?.assessment && (
        <AssessmentPanel a={safetyDetails.assessment} />
      )}
      {active === 'condizioni' && showCondizioni && (
        <CurrentConditionsNotice osmId={safetyDetails!.osmId} polyline={safetyDetails!.polyline} plannedId={safetyDetails!.plannedId} signals={safetyDetails!.signals} />
      )}
      {active === 'segnalazioni' && safetyDetails && safetyDetails.markers.length > 0 && (
        <MarkerList markers={safetyDetails.markers} highlightedMarkerIndex={safetyDetails.highlightedMarkerIndex} />
      )}
    </div>
  )
}
