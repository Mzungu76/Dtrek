'use client'
import { useState } from 'react'
import { recalcAllCts, recalcAllCL, recalcAllSafety, recalcAllSentinel2 } from '@/lib/recalcScores'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { Loader2, RefreshCw, ChevronDown, Wrench } from 'lucide-react'

/**
 * Strumenti di manutenzione dati — ricalcolo massivo dei punteggi (CTS, CL,
 * Safety Score, Ombra e Acqua) su tutti i percorsi. Sono operazioni pesanti e
 * opzionali, non azioni quotidiane: raccolte qui, collassate di default,
 * invece di essere sparse ed esposte come bottoni utente normali altrove
 * in Profilo. Piano di ristrutturazione, Parte 2.4.
 */
export default function SectionAvanzate() {
  const [ctsRunning,     setCtsRunning]     = useState(false)
  const [ctsProgress,    setCtsProgress]    = useState('')
  const [clRunning,      setClRunning]      = useState(false)
  const [clProgress,     setClProgress]     = useState('')
  const [safetyRunning,  setSafetyRunning]  = useState(false)
  const [safetyProgress, setSafetyProgress] = useState('')
  const [s2Running,      setS2Running]      = useState(false)
  const [s2Progress,     setS2Progress]     = useState('')
  const [allRunning,     setAllRunning]     = useState(false)
  const [allProgress,    setAllProgress]    = useState('')

  const anyRunning = ctsRunning || clRunning || safetyRunning || s2Running || allRunning

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

  async function handleRecalcSI() {
    setClRunning(true)
    setClProgress('Recupero percorsi…')
    const { ok, rateLimited } = await recalcAllCL(setClProgress).catch(() => ({ ok: 0, rateLimited: 0, failed: 0 }))
    setClRunning(false)
    setClProgress(`Completato · ${ok} CL ricalcolati${rateLimited ? `, ${rateLimited} già aggiornati di recente` : ''}.`)
    setTimeout(() => setClProgress(''), 4000)
  }

  async function handleRecalcSafety() {
    setSafetyRunning(true)
    setSafetyProgress('Recupero percorsi…')
    const ok = await recalcAllSafety(setSafetyProgress).catch(() => 0)
    setSafetyRunning(false)
    setSafetyProgress(ok > 0 ? `Completato · ${ok} Safety Score ricalcolati.` : 'Nessuna Safety Score ricalcolata.')
    setTimeout(() => setSafetyProgress(''), 4000)
  }

  async function handleRecalcSentinel2() {
    setS2Running(true)
    setS2Progress('Recupero percorsi…')
    const { ok, failed } = await recalcAllSentinel2(setS2Progress).catch(() => ({ ok: 0, failed: 0 }))
    setS2Running(false)
    setS2Progress(ok > 0
      ? `Completato · ${ok} dati Ombra e Acqua ricalcolati${failed ? `, ${failed} non disponibili` : ''}.`
      : `Nessun dato Ombra e Acqua ricalcolato${failed ? ` · ${failed} non disponibili (Overpass irraggiungibile o nessuna geometria)` : ''}.`)
    setTimeout(() => setS2Progress(''), 6000)
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
      const cl = await recalcAllCL(text => setAllProgress(`CL: ${text}`))
      const safety = await recalcAllSafety(text => setAllProgress(`Safety: ${text}`))
      const s2 = await recalcAllSentinel2(text => setAllProgress(`Ombra e Acqua: ${text}`))
      setAllProgress(`Completato · ${ctsCount} CTS, ${cl.ok} CL, ${safety} Safety Score, ${s2.ok} Ombra e Acqua ricalcolati${s2.failed ? ` (${s2.failed} non disponibili)` : ''}.`)
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
          onClick={handleRecalcSI}
          disabled={anyRunning}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-sm font-medium border border-stone-200 transition"
        >
          {clRunning
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {clProgress || 'Ricalcolo in corso…'}</>
            : <><RefreshCw className="w-3.5 h-3.5" /> Ricalcola tutti i CL</>
          }
        </button>
        {!clRunning && clProgress && (
          <p className="text-xs text-forest-600 font-medium">✓ {clProgress}</p>
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

        <button
          onClick={handleRecalcSentinel2}
          disabled={anyRunning}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-sm font-medium border border-stone-200 transition"
        >
          {s2Running
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {s2Progress || 'Ricalcolo in corso…'}</>
            : <><RefreshCw className="w-3.5 h-3.5" /> Ricalcola tutti i dati Ombra e Acqua</>
          }
        </button>
        {!s2Running && s2Progress && (
          <p className="text-xs text-forest-600 font-medium">✓ {s2Progress}</p>
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
