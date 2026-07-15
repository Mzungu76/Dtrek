'use client'
import { useEffect, useState } from 'react'
import { Loader2, CalendarClock, BookOpen } from 'lucide-react'
import { GUIDE_SECTIONS, DEFAULT_BREVE_SECTIONS, type GuideSectionKey } from '@/lib/guideSections'
import { getUserSettingsCached, updateUserSettings } from '@/lib/sync/userSettingsStore'

const PRESETS = [7, 14, 30, 60, 90]

/** Scadenza predefinita dei percorsi "in attesa" nel tab Guida, e sezioni della guida Breve. */
export default function SectionGuida() {
  const [days,    setDays]    = useState(30)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState<{ ok: boolean; msg: string } | null>(null)

  const [breveSections, setBreveSections] = useState<GuideSectionKey[]>(DEFAULT_BREVE_SECTIONS)
  const [savingSections, setSavingSections] = useState(false)
  const [sectionsStatus, setSectionsStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    getUserSettingsCached()
      .then(d => {
        if (d.guidePendingDays) setDays(d.guidePendingDays)
        // Anche un array vuoto è uno stato valido e intenzionale (nessuna sezione automatica) —
        // non va scambiato per "non ancora caricato", altrimenti l'interfaccia mostrerebbe il
        // default invece della scelta esplicita dell'utente.
        if (Array.isArray(d.guideBreveSections)) setBreveSections(d.guideBreveSections as GuideSectionKey[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(next: number) {
    setDays(next)
    setSaving(true); setStatus(null)
    await updateUserSettings({ guidePendingDays: next })
    setSaving(false)
    setStatus({ ok: true, msg: 'Scadenza predefinita salvata.' })
  }

  async function toggleSection(key: GuideSectionKey) {
    const already = breveSections.includes(key)
    // Nessun tetto massimo: l'utente può automatizzare da zero a tutte le sezioni.
    const next = already ? breveSections.filter(k => k !== key) : [...breveSections, key]
    setBreveSections(next)
    setSavingSections(true); setSectionsStatus(null)
    await updateUserSettings({ guideBreveSections: next })
    setSavingSections(false)
    setSectionsStatus({ ok: true, msg: 'Sezioni della guida breve salvate.' })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <CalendarClock className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-stone-800">Scadenza percorsi in attesa</h2>
            <p className="text-xs text-stone-400">
              Dopo quanti giorni una Guida importata e non ancora percorsa ti chiede se prorogare o archiviare
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-stone-400 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={() => handleSave(p)}
                disabled={saving}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors disabled:opacity-50 ${
                  days === p
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-white border-stone-200 text-stone-600 hover:border-amber-300'
                }`}
              >
                {p} giorni
              </button>
            ))}
          </div>
        )}

        {status && (
          <p className={`text-xs font-medium ${status.ok ? 'text-forest-600' : 'text-red-600'}`}>
            {status.ok ? '✓ ' : '✗ '}{status.msg}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-5 h-5 text-terra-600 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-stone-800">Sezioni della guida breve</h2>
            <p className="text-xs text-stone-400">
              La guida breve viene generata da sola all&apos;import di un percorso. Scegli per quali sezioni
              Giulia scrive subito un testo narrativo — da nessuna a tutte, a tua scelta: più ne scegli,
              più lunga (e più costosa in token AI) sarà ogni generazione automatica. Le sezioni non scelte
              restano comunque visibili con i loro dati (mappa, punteggi, POI…) ma senza racconto, finché
              non premi &quot;Approfondisci con Giulia (AI)&quot; su quella specifica sezione.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-stone-400 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {GUIDE_SECTIONS.map(s => {
              const active = breveSections.includes(s.key)
              return (
                <button
                  key={s.key}
                  onClick={() => toggleSection(s.key)}
                  disabled={savingSections}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors disabled:opacity-50 ${
                    active
                      ? 'bg-terra-500 border-terra-500 text-white'
                      : 'bg-white border-stone-200 text-stone-600 hover:border-terra-300'
                  }`}
                >
                  {s.title}
                </button>
              )
            })}
          </div>
        )}

        {sectionsStatus && (
          <p className={`text-xs font-medium ${sectionsStatus.ok ? 'text-forest-600' : 'text-red-600'}`}>
            {sectionsStatus.ok ? '✓ ' : '✗ '}{sectionsStatus.msg}
          </p>
        )}
      </div>
    </div>
  )
}
