'use client'
import { useEffect, useState } from 'react'
import { getUserSettingsCached, updateUserSettings } from '@/lib/sync/userSettingsStore'
import { DEFAULT_TEI_WEIGHTS, type FAntrSensitivity } from '@/lib/tei'
import { Loader2, Compass, Landmark, Mountain, Droplets, Footprints, Layers } from 'lucide-react'

interface Row { key: keyof typeof DEFAULT_TEI_WEIGHTS; label: string; hint: string; icon: typeof Mountain }

const ROWS: Row[] = [
  { key: 'cultura',      label: 'Cultura',        hint: 'Rovine, siti archeologici, castelli, cappelle',        icon: Landmark },
  { key: 'topografia',   label: 'Topografia',      hint: 'Pendenza e dislivello — quanto ti piace il saliscendo', icon: Mountain },
  { key: 'idrografia',   label: 'Acqua',           hint: 'Torrenti, cascate, sorgenti, laghi',                    icon: Droplets },
  { key: 'fondo',        label: 'Fondo',           hint: 'Sterrato/roccioso vs asfalto/cemento',                 icon: Footprints },
  { key: 'geodiversita', label: 'Geodiversità',    hint: 'Varietà morfologica del terreno attraversato',         icon: Layers },
]

const F_ANTR_OPTIONS: { value: FAntrSensitivity; label: string }[] = [
  { value: 'ignora',   label: 'Non mi importa' },
  { value: 'normale',  label: 'Normale' },
  { value: 'fastidio', label: 'Mi dà fastidio' },
]

/**
 * Preferenze personali del TEI (Trekking Excellence Index, lib/tei.ts) — quanto contano per te
 * le 5 componenti che lo compongono, più la sensibilità alla penalità antropica (asfalto/
 * elettrodotti/traffico). Introdotte perché il TEI trattava l'assenza di una caratteristica
 * (es. niente acqua nei paraggi) come un difetto oggettivo del percorso invece che come un gusto
 * personale — vedi il default neutro già applicato lato formula (lib/tei.ts) indipendentemente
 * da questi slider, che riguardano invece QUANTO deve contare ciascuna componente nel totale.
 * La preferenza di sforzo che decide se un saliscendo marcato è un pregio o un difetto vive
 * altrove (Comfort TrailScore — preferenze, lib/useUserPrefs.ts's prefSforzo).
 */
export default function SectionTei() {
  const [weights, setWeights] = useState<typeof DEFAULT_TEI_WEIGHTS>(DEFAULT_TEI_WEIGHTS)
  const [fAntrSensitivity, setFAntrSensitivity] = useState<FAntrSensitivity>('normale')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState<string | null>(null)

  useEffect(() => {
    getUserSettingsCached()
      .then(d => {
        setWeights({
          cultura:      d.teiPesoCultura      ?? DEFAULT_TEI_WEIGHTS.cultura,
          topografia:   d.teiPesoTopografia   ?? DEFAULT_TEI_WEIGHTS.topografia,
          idrografia:   d.teiPesoIdrografia   ?? DEFAULT_TEI_WEIGHTS.idrografia,
          fondo:        d.teiPesoFondo        ?? DEFAULT_TEI_WEIGHTS.fondo,
          geodiversita: d.teiPesoGeodiversita ?? DEFAULT_TEI_WEIGHTS.geodiversita,
        })
        if (d.teiFAntrSensitivity) setFAntrSensitivity(d.teiFAntrSensitivity)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true); setStatus(null)
    await updateUserSettings({
      teiPesoCultura: weights.cultura, teiPesoTopografia: weights.topografia, teiPesoIdrografia: weights.idrografia,
      teiPesoFondo: weights.fondo, teiPesoGeodiversita: weights.geodiversita,
      teiFAntrSensitivity: fAntrSensitivity,
    })
    setSaving(false)
    setStatus('Salvato · si applica ai prossimi calcoli. Per aggiornare subito i percorsi già valutati, usa "Ricalcola tutti i CTS da zero" più sotto in Impostazioni avanzate.')
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <Compass className="w-5 h-5 text-forest-600 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Bellezza del percorso (TEI) — preferenze</h2>
          <p className="text-xs text-stone-400">Quanto conta ciascuna caratteristica per te — l&apos;assenza di una non è mai un difetto</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : (
        <div className="space-y-5">
          {ROWS.map(row => (
            <div key={row.key}>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-stone-600 flex items-center gap-1.5">
                  <row.icon className="w-3.5 h-3.5 text-stone-400" /> {row.label}
                </label>
                <span className="text-xs font-mono text-stone-500">{weights[row.key]}/100</span>
              </div>
              <input type="range" min={0} max={100} value={weights[row.key]}
                onChange={e => setWeights(w => ({ ...w, [row.key]: Number(e.target.value) }))}
                className="w-full accent-forest-600" />
              <p className="text-[10px] text-stone-400 mt-0.5">{row.hint}</p>
            </div>
          ))}

          <div>
            <label className="text-xs font-medium text-stone-600 block mb-1.5">
              Asfalto, elettrodotti, strade trafficate
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {F_ANTR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFAntrSensitivity(opt.value)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition ${
                    fAntrSensitivity === opt.value
                      ? 'bg-forest-600 border-forest-600 text-white'
                      : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                  }`}
                >
                  {opt.label}
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
            {saving ? 'Salvataggio…' : 'Salva preferenze'}
          </button>
        </div>
      )}

      {status && (
        <p className="text-xs font-medium text-forest-600">✓ {status}</p>
      )}
    </div>
  )
}
