'use client'
import { useEffect, useState } from 'react'
import { Loader2, CalendarClock, BookOpen } from 'lucide-react'
import {
  GUIDE_SECTIONS, DEFAULT_BREVE_SECTIONS, GUIDE_TEXT_LENGTHS, DEFAULT_SECTION_LENGTHS,
  sanitizeSectionLengths, countMoltoApprofondita, MAX_MOLTO_APPROFONDITA_SECTIONS,
  type GuideSectionKey, type SectionLengthMap,
} from '@/lib/guideSections'
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

  const [sectionLengths, setSectionLengths] = useState<SectionLengthMap>(DEFAULT_SECTION_LENGTHS)
  const [savingLengths, setSavingLengths] = useState(false)

  useEffect(() => {
    getUserSettingsCached()
      .then(d => {
        if (d.guidePendingDays) setDays(d.guidePendingDays)
        // Anche un array vuoto è uno stato valido e intenzionale (nessuna sezione automatica) —
        // non va scambiato per "non ancora caricato", altrimenti l'interfaccia mostrerebbe il
        // default invece della scelta esplicita dell'utente.
        if (Array.isArray(d.guideBreveSections)) setBreveSections(d.guideBreveSections as GuideSectionKey[])
        if (d.guideSectionLengths) setSectionLengths(sanitizeSectionLengths(d.guideSectionLengths))
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

  async function setSectionLength(key: GuideSectionKey, length: SectionLengthMap[GuideSectionKey]) {
    const next = { ...sectionLengths, [key]: length }
    setSectionLengths(next)
    setSavingLengths(true); setSectionsStatus(null)
    await updateUserSettings({ guideSectionLengths: next })
    setSavingLengths(false)
    setSectionsStatus({ ok: true, msg: 'Lunghezza del testo salvata.' })
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
              non premi &quot;Approfondisci con Giulia (AI)&quot; su quella specifica sezione. Per ogni
              sezione puoi anche scegliere quanto Giulia si dilunga — puoi comunque cambiarla al momento
              della generazione, per una singola guida. Al massimo {MAX_MOLTO_APPROFONDITA_SECTIONS}{' '}
              sezioni possono essere impostate su &quot;Molto approfondita&quot; contemporaneamente
              (limite tecnico, per evitare che la generazione si interrompa a metà).
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-stone-400 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
          </div>
        ) : (
          <div className="space-y-1.5">
            {(() => {
              const moltoCount = countMoltoApprofondita(sectionLengths)
              return GUIDE_SECTIONS.map(s => {
                const active = breveSections.includes(s.key)
                return (
                  <div key={s.key} className="flex flex-wrap items-center gap-2 py-1">
                    <button
                      onClick={() => toggleSection(s.key)}
                      disabled={savingSections}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors disabled:opacity-50 shrink-0 ${
                        active
                          ? 'bg-terra-500 border-terra-500 text-white'
                          : 'bg-white border-stone-200 text-stone-600 hover:border-terra-300'
                      }`}
                    >
                      {s.title}
                    </button>
                    {/* "Verificato online" non passa mai dal meccanismo delle lunghezze (è
                        generata da una chiamata AI dedicata alla sola ricerca web, vedi
                        SECTION_LENGTH_BY_LEVEL in app/api/guide/route.ts) — mostrare qui un
                        controllo senza alcun effetto sarebbe fuorviante. */}
                    {s.key !== 'verificato' && (
                      <div className="flex items-center gap-1 rounded-full border border-stone-200 p-0.5">
                        {GUIDE_TEXT_LENGTHS.map(l => {
                          const isCurrent = sectionLengths[s.key] === l.key
                          // Al limite, ogni pillola "Molto approfondita" non ancora selezionata si
                          // disabilita — tranne quella già attiva su questa sezione, altrimenti
                          // l'utente non potrebbe nemmeno tornare indietro a un'altra lunghezza.
                          const atLimit = l.key === 'molto_approfondita' && !isCurrent && moltoCount >= MAX_MOLTO_APPROFONDITA_SECTIONS
                          return (
                            <button
                              key={l.key}
                              onClick={() => setSectionLength(s.key, l.key)}
                              disabled={savingLengths || atLimit}
                              title={atLimit ? `Massimo ${MAX_MOLTO_APPROFONDITA_SECTIONS} sezioni in "Molto approfondita" — riduci un'altra sezione prima` : l.description}
                              className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                isCurrent
                                  ? 'bg-stone-700 text-white'
                                  : 'text-stone-500 hover:bg-stone-100'
                              }`}
                            >
                              {l.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            })()}
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
