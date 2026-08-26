'use client'
import { useEffect, useState } from 'react'
import { recalcAllCts, recalcAllSafety } from '@/lib/recalcScores'
import { getUserSettingsCached, updateUserSettings } from '@/lib/sync/userSettingsStore'
import { Loader2, RefreshCw, ChevronDown, Wrench } from 'lucide-react'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full relative transition-colors shrink-0 disabled:opacity-50 ${checked ? 'bg-forest-500' : 'bg-stone-200'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
    </button>
  )
}

/**
 * Strumenti di manutenzione dati — ricalcolo massivo dei punteggi (CTS,
 * Safety Score) su tutti i percorsi. Sono operazioni pesanti e opzionali,
 * non azioni quotidiane: raccolte qui, collassate di default, invece di
 * essere sparse ed esposte come bottoni utente normali altrove in Profilo.
 * Piano di ristrutturazione, Parte 2.4.
 */
export default function SectionAvanzate() {
  const [ctsRunning,     setCtsRunning]     = useState(false)
  const [ctsProgress,    setCtsProgress]    = useState('')
  const [safetyRunning,  setSafetyRunning]  = useState(false)
  const [safetyProgress, setSafetyProgress] = useState('')
  const [allRunning,     setAllRunning]     = useState(false)
  const [allProgress,    setAllProgress]    = useState('')

  // Flag di rollout Fase 4 — docs/diario-a-libro-piano.md. Scoped SOLO al punto d'ingresso
  // Percorso del Diario (/diari/[id]/percorsi/[percorsoId]): /guida/[id] e /resoconto/[id]
  // standalone restano sempre sul motore invariato, a prescindere da questo flag. Default spento
  // finché non validato in produzione — qui solo per poterlo accendere sul proprio account durante
  // la validazione, non pensato per un rollout via impostazioni utente diffuso.
  const [libroEnabled, setLibroEnabled] = useState(false)
  const [savingLibro,  setSavingLibro]  = useState(false)

  useEffect(() => {
    getUserSettingsCached().then(d => {
      if (typeof d.diarioLibroEnabled === 'boolean') setLibroEnabled(d.diarioLibroEnabled)
    }).catch(() => {})
  }, [])

  async function handleLibroChange(v: boolean) {
    setLibroEnabled(v)
    setSavingLibro(true)
    await updateUserSettings({ diarioLibroEnabled: v })
    setSavingLibro(false)
  }

  const anyRunning = ctsRunning || safetyRunning || allRunning

  async function handleFullRecalcCts() {
    setCtsRunning(true)
    setCtsProgress('Recupero preferenze…')
    let computed = 0
    try {
      const prefs = await getUserSettingsCached()
      computed = await recalcAllCts(
        { hrRest: prefs.hrRest ?? 55, hrMax: prefs.hrMax ?? null, prefSforzo: prefs.prefSforzo ?? 50, prefDurata: prefs.prefDurata ?? 270 },
        setCtsProgress,
      )
    } catch {}
    setCtsRunning(false)
    setCtsProgress(computed > 0 ? `Completato · ${computed} CTS ricalcolati.` : 'Nessun CTS ricalcolato.')
    setTimeout(() => setCtsProgress(''), 4000)
  }

  async function handleRecalcSafety() {
    setSafetyRunning(true)
    setSafetyProgress('Recupero percorsi…')
    const ok = await recalcAllSafety(setSafetyProgress).catch(() => 0)
    setSafetyRunning(false)
    setSafetyProgress(ok > 0 ? `Completato · ${ok} Safety Score ricalcolati.` : 'Nessuna Safety Score ricalcolata.')
    setTimeout(() => setSafetyProgress(''), 4000)
  }

  async function handleRecalcAll() {
    setAllRunning(true)
    setAllProgress('CTS: recupero preferenze…')
    try {
      const prefs = await getUserSettingsCached()
      const ctsCount = await recalcAllCts(
        { hrRest: prefs.hrRest ?? 55, hrMax: prefs.hrMax ?? null, prefSforzo: prefs.prefSforzo ?? 50, prefDurata: prefs.prefDurata ?? 270 },
        text => setAllProgress(`CTS: ${text}`),
      )
      const safety = await recalcAllSafety(text => setAllProgress(`Safety: ${text}`))
      setAllProgress(`Completato · ${ctsCount} CTS, ${safety} Safety Score ricalcolati.`)
    } catch {
      setAllProgress('Errore durante il ricalcolo.')
    }
    setAllRunning(false)
    setTimeout(() => setAllProgress(''), 5000)
  }

  return (
    <details className="group bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-6 select-none">
        <div className="flex items-center gap-2.5">
          <Wrench className="w-5 h-5 text-stone-400 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-stone-800">Impostazioni avanzate</h2>
            <p className="text-xs text-stone-400">Ricalcolo massivo dei punteggi — operazioni pesanti, opzionali</p>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-stone-400 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="px-6 pb-6 pt-1 border-t border-stone-100 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-700">Diario a libro (beta)</p>
            <p className="text-xs text-stone-400">
              Apri un Percorso del Diario nella nuova veste a pagine sfogliabili invece della
              schermata Guida classica. /guida/[id] e /resoconto/[id] restano invariati.
            </p>
          </div>
          <Toggle checked={libroEnabled} onChange={handleLibroChange} disabled={savingLibro} />
        </div>

        <div className="border-t border-stone-100 pt-2" />

        <button
          onClick={handleFullRecalcCts}
          disabled={anyRunning}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-sm font-medium border border-stone-200 transition"
        >
          {ctsRunning
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {ctsProgress || 'Ricalcolo in corso…'}</>
            : <><RefreshCw className="w-3.5 h-3.5" /> Ricalcola tutti i CTS da zero</>
          }
        </button>
        {!ctsRunning && ctsProgress && (
          <p className="text-xs text-forest-600 font-medium">✓ {ctsProgress}</p>
        )}

        <button
          onClick={handleRecalcSafety}
          disabled={anyRunning}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-sm font-medium border border-stone-200 transition"
        >
          {safetyRunning
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {safetyProgress || 'Ricalcolo in corso…'}</>
            : <><RefreshCw className="w-3.5 h-3.5" /> Ricalcola tutte le Safety Score</>
          }
        </button>
        {!safetyRunning && safetyProgress && (
          <p className="text-xs text-forest-600 font-medium">✓ {safetyProgress}</p>
        )}

        <div className="border-t border-stone-100 pt-2 mt-1">
          <button
            onClick={handleRecalcAll}
            disabled={anyRunning}
            className="w-full flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-sm font-medium border border-red-200 transition"
          >
            {allRunning
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {allProgress || 'Ricalcolo in corso…'}</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Ricalcola tutti i punteggi di tutti i percorsi</>
            }
          </button>
          {!allRunning && allProgress && (
            <p className="text-xs text-forest-600 font-medium mt-2">✓ {allProgress}</p>
          )}
        </div>
      </div>
    </details>
  )
}
