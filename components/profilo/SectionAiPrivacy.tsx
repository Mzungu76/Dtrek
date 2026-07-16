'use client'
import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck, HeartPulse, History, Radar } from 'lucide-react'
import { getUserSettingsCached, updateUserSettings } from '@/lib/sync/userSettingsStore'

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

/** Consenso all'uso di dati personali/ricerca web nei prompt AI — 3 interruttori separati (dati
 *  fisiologici/biometrici, storico/preferenze, ricerca web), tutti attivi di default (scelta
 *  esplicita dell'utente: default acceso, opt-out). Disattivarli non impedisce l'uso dell'AI, la
 *  rende solo meno personalizzata/aggiornata — vedi app/lib/guide/resolveApiKeyAndSettings.ts per
 *  dove vengono letti. */
export default function SectionAiPrivacy() {
  const [loading,  setLoading]  = useState(true)
  const [biometric, setBiometric] = useState(true)
  const [history,   setHistory]   = useState(true)
  const [webSearch, setWebSearch] = useState(true)
  const [savingBiometric, setSavingBiometric] = useState(false)
  const [savingHistory,   setSavingHistory]   = useState(false)
  const [savingWebSearch, setSavingWebSearch] = useState(false)

  useEffect(() => {
    getUserSettingsCached()
      .then(d => {
        if (typeof d.aiUseBiometricData === 'boolean') setBiometric(d.aiUseBiometricData)
        if (typeof d.aiUseHistoryData === 'boolean') setHistory(d.aiUseHistoryData)
        if (typeof d.aiUseWebSearch === 'boolean') setWebSearch(d.aiUseWebSearch)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleBiometricChange(v: boolean) {
    setBiometric(v)
    setSavingBiometric(true)
    await updateUserSettings({ aiUseBiometricData: v })
    setSavingBiometric(false)
  }

  async function handleHistoryChange(v: boolean) {
    setHistory(v)
    setSavingHistory(true)
    await updateUserSettings({ aiUseHistoryData: v })
    setSavingHistory(false)
  }

  async function handleWebSearchChange(v: boolean) {
    setWebSearch(v)
    setSavingWebSearch(true)
    await updateUserSettings({ aiUseWebSearch: v })
    setSavingWebSearch(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <ShieldCheck className="w-5 h-5 text-forest-600 shrink-0" />
        <h2 className="text-sm font-semibold text-stone-800">Privacy dei dati con l&apos;AI</h2>
      </div>
      <p className="text-xs text-stone-500 mb-4 ml-7 leading-relaxed">
        Di base Giulia usa i tuoi dati per personalizzare guide, resoconti e questionari — puoi
        disattivare separatamente ciascuna categoria qui sotto: l&apos;AI resta comunque utilizzabile,
        solo meno su misura per te.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs ml-7">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : (
        <div className="ml-7 space-y-4">
          <div className="flex items-start gap-3">
            <Toggle checked={biometric} onChange={handleBiometricChange} disabled={savingBiometric} />
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-800 flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5 text-stone-400" /> Dati fisiologici e biometrici
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                Età, sesso, frequenza cardiaca, calorie bruciate — usati per commenti personalizzati
                sullo sforzo fisico e per rivolgersi a te con il genere corretto.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Toggle checked={history} onChange={handleHistoryChange} disabled={savingHistory} />
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-800 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-stone-400" /> Storico e preferenze escursionistiche
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                Percorsi passati, voti dati, livello di esperienza e attenzioni dichiarate — usati per
                confrontare un nuovo percorso con le tue abitudini reali.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Toggle checked={webSearch} onChange={handleWebSearchChange} disabled={savingWebSearch} />
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-800 flex items-center gap-1.5">
                <Radar className="w-3.5 h-3.5 text-stone-400" /> Verifica sicurezza online
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                Prima di scrivere &quot;Verificato online&quot;, Giulia controlla in rete se ci sono
                chiusure, frane o allerte recenti specifiche per il percorso. Disattivandola, la guida
                si basa solo sui dati già raccolti dall&apos;app (mappa, punteggi, storico) — resta
                comunque affidabile, solo senza questo controllo aggiuntivo in tempo reale. Genera più
                veloce e a costo inferiore.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
