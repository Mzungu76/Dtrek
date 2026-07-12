'use client'
import { useEffect, useState } from 'react'
import { Loader2, UserCircle2 } from 'lucide-react'
import { getUserSettingsCached, updateUserSettings } from '@/lib/sync/userSettingsStore'
import {
  EXPERIENCE_LEVELS, HIKER_CONCERNS, HIKER_ENVIRONMENT_PREFS,
  type HikerExperienceLevel, type HikerConcernKey, type HikerEnvironmentPrefKey,
} from '@/lib/hikerProfile'

/**
 * Stesso profilo raccolto dal wizard di onboarding (components/onboarding/OnboardingWizard.tsx),
 * qui rieditabile in qualunque momento. Usato dalla valutazione di comfort AI nella ricerca
 * percorsi (app/api/route-search/route.ts).
 */
export default function SectionProfiloEscursionista() {
  const [experience, setExperience] = useState<HikerExperienceLevel | null>(null)
  const [concerns, setConcerns] = useState<HikerConcernKey[]>([])
  const [envPrefs, setEnvPrefs] = useState<HikerEnvironmentPrefKey[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    getUserSettingsCached()
      .then(d => {
        if ('hikerExperienceLevel' in d && d.hikerExperienceLevel) setExperience(d.hikerExperienceLevel as HikerExperienceLevel)
        if ('hikerConcerns' in d && Array.isArray(d.hikerConcerns)) setConcerns(d.hikerConcerns as HikerConcernKey[])
        if ('hikerEnvironmentPrefs' in d && Array.isArray(d.hikerEnvironmentPrefs)) setEnvPrefs(d.hikerEnvironmentPrefs as HikerEnvironmentPrefKey[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggle<T>(list: T[], setList: (v: T[]) => void, key: T) {
    setList(list.includes(key) ? list.filter(k => k !== key) : [...list, key])
  }

  async function handleSave() {
    setSaving(true); setStatus(null)
    await updateUserSettings({
      hikerExperienceLevel: experience,
      hikerConcerns: concerns,
      hikerEnvironmentPrefs: envPrefs,
      onboardingCompletedAt: new Date().toISOString(),
    })
    setSaving(false)
    setStatus('Salvato.')
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <UserCircle2 className="w-5 h-5 text-forest-600 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Profilo escursionista</h2>
          <p className="text-xs text-stone-400">Usato dalla valutazione di comfort quando cerchi percorsi con l&apos;AI</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Esperienza</p>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE_LEVELS.map(lvl => (
                <button
                  key={lvl.key}
                  onClick={() => setExperience(lvl.key)}
                  title={lvl.description}
                  className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-colors
                    ${experience === lvl.key ? 'bg-forest-600 border-forest-600 text-white' : 'bg-stone-50 border-stone-300 text-stone-600 hover:border-stone-400'}`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Attenzioni</p>
            <div className="flex flex-wrap gap-2">
              {HIKER_CONCERNS.map(c => (
                <button
                  key={c.key}
                  onClick={() => toggle(concerns, setConcerns, c.key)}
                  className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-colors
                    ${concerns.includes(c.key) ? 'bg-forest-600 border-forest-600 text-white' : 'bg-stone-50 border-stone-300 text-stone-600 hover:border-stone-400'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Preferenze ambientali</p>
            <div className="flex flex-wrap gap-2">
              {HIKER_ENVIRONMENT_PREFS.map(p => (
                <button
                  key={p.key}
                  onClick={() => toggle(envPrefs, setEnvPrefs, p.key)}
                  className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-colors
                    ${envPrefs.includes(p.key) ? 'bg-forest-600 border-forest-600 text-white' : 'bg-stone-50 border-stone-300 text-stone-600 hover:border-stone-400'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      )}

      {status && <p className="text-xs font-medium text-forest-600">✓ {status}</p>}
    </div>
  )
}
