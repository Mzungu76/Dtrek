'use client'
import { useState } from 'react'
import { Compass, ChevronRight, Loader2 } from 'lucide-react'
import { updateUserSettings } from '@/lib/sync/userSettingsStore'
import {
  EXPERIENCE_LEVELS, HIKER_CONCERNS, HIKER_ENVIRONMENT_PREFS,
  type HikerExperienceLevel, type HikerConcernKey, type HikerEnvironmentPrefKey,
} from '@/lib/hikerProfile'

interface OnboardingWizardProps {
  onDone: () => void
}

const STEPS = 3

/**
 * Wizard guidato mostrato una sola volta al primo accesso (vedi components/onboarding/
 * OnboardingGate.tsx) — raccoglie il profilo escursionista usato dalla valutazione di comfort AI
 * nella ricerca percorsi (app/api/route-search/route.ts). Sempre saltabile, sempre rieditabile
 * dopo in components/profilo/SectionProfiloEscursionista.tsx.
 */
export default function OnboardingWizard({ onDone }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const [experience, setExperience] = useState<HikerExperienceLevel | null>(null)
  const [concerns, setConcerns] = useState<HikerConcernKey[]>([])
  const [envPrefs, setEnvPrefs] = useState<HikerEnvironmentPrefKey[]>([])
  const [saving, setSaving] = useState(false)

  async function finish() {
    setSaving(true)
    await updateUserSettings({
      hikerExperienceLevel: experience,
      hikerConcerns: concerns,
      hikerEnvironmentPrefs: envPrefs,
      onboardingCompletedAt: new Date().toISOString(),
    })
    setSaving(false)
    onDone()
  }

  function toggle<T>(list: T[], setList: (v: T[]) => void, key: T) {
    setList(list.includes(key) ? list.filter(k => k !== key) : [...list, key])
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div className="relative w-full sm:max-w-md bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-2">
          <div className="w-9 h-9 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center shrink-0">
            <Compass className="w-4.5 h-4.5 text-forest-600" />
          </div>
          <div className="flex-1 flex items-center gap-1.5">
            {Array.from({ length: STEPS }).map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-forest-600' : 'w-1.5 bg-stone-200'}`} />
            ))}
          </div>
          <button onClick={finish} disabled={saving} className="text-xs font-medium text-stone-400 hover:text-stone-600 transition-colors uppercase tracking-wide">
            Salta
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">
          {step === 0 && (
            <>
              <div>
                <h2 className="font-display text-lg font-semibold text-stone-800 mb-1">Come ti definiresti come escursionista?</h2>
                <p className="text-sm text-stone-500">Ci aiuta a valutare se un percorso è adatto a te — puoi cambiarlo quando vuoi dal profilo.</p>
              </div>
              <div className="space-y-2.5">
                {EXPERIENCE_LEVELS.map(lvl => (
                  <button
                    key={lvl.key}
                    onClick={() => setExperience(lvl.key)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-2xl border transition-colors
                      ${experience === lvl.key ? 'border-forest-500 bg-forest-50' : 'border-stone-200 bg-white hover:border-stone-300'}`}
                  >
                    <div className={`w-4.5 h-4.5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center
                      ${experience === lvl.key ? 'border-forest-600' : 'border-stone-300'}`}>
                      {experience === lvl.key && <div className="w-2 h-2 rounded-full bg-forest-600" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-stone-800">{lvl.label}</p>
                      <p className="text-xs text-stone-500 mt-0.5">{lvl.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h2 className="font-display text-lg font-semibold text-stone-800 mb-1">C&apos;è qualcosa da tenere in considerazione?</h2>
                <p className="text-sm text-stone-500">Seleziona quello che si applica, anche più di uno — ci serve per avvisarti sui punti critici di un percorso.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {HIKER_CONCERNS.map(c => (
                  <button
                    key={c.key}
                    onClick={() => toggle(concerns, setConcerns, c.key)}
                    className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-colors
                      ${concerns.includes(c.key) ? 'bg-forest-600 border-forest-600 text-white' : 'bg-white border-stone-300 text-stone-600 hover:border-stone-400'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2 className="font-display text-lg font-semibold text-stone-800 mb-1">Cosa rende un&apos;uscita perfetta per te?</h2>
                <p className="text-sm text-stone-500">Facoltativo — aiuta l&apos;AI a suggerirti i percorsi più adatti quando cerchi con &quot;Cerca con l&apos;AI&quot;.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {HIKER_ENVIRONMENT_PREFS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => toggle(envPrefs, setEnvPrefs, p.key)}
                    className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-colors
                      ${envPrefs.includes(p.key) ? 'bg-forest-600 border-forest-600 text-white' : 'bg-white border-stone-300 text-stone-600 hover:border-stone-400'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-6 pb-6 pt-2">
          <button
            onClick={() => step < STEPS - 1 ? setStep(step + 1) : finish()}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
          >
            {saving
              ? <Loader2 className="w-4.5 h-4.5 animate-spin" />
              : <>{step < STEPS - 1 ? 'Avanti' : 'Fine — inizia a esplorare'} <ChevronRight className="w-4 h-4" /></>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
