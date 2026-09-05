'use client'
// Editor delle etichette del Diario (Natura, Urbano, una zona…) — restyling pagina /diari, Fase 2
// di docs/diari-restyling-piano.md. Vive nel Sommario (non nel form di copertina/pubblicazione):
// le etichette sono metadati del registro — come lo si ritrova, non come lo si presenta a chi
// legge — quindi PATCH /api/diaries/[id], non /api/diaries/[id]/config.
//
// Testo libero, non un enum scelto da una lista: l'utente inventa le proprie categorie (Natura,
// Urbano, il nome di una zona) invece di scegliere tra opzioni predefinite che potrebbero non
// calzare — stessa impostazione già decisa in docs/mockup-diari-redesign/README.md.
import { useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { FONT_HAND } from '@/lib/taccuinoTokens'
import { TACCUINO_INK, TACCUINO_ACCENT, HandDrawnFrame } from '@/lib/taccuinoTokens'
import { MAX_LABELS, MAX_LABEL_LENGTH } from '@/lib/diari/normalizeLabels'

interface Props {
  diaryId: string
  initialLabels: string[]
}

export function EtichetteDiarioEditor({ diaryId, initialLabels }: Props) {
  const [labels, setLabels] = useState(initialLabels)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function salva(prossime: string[]) {
    const precedenti = labels
    setLabels(prossime) // ottimistico: la chip appare/sparisce subito
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/diaries/${encodeURIComponent(diaryId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: prossime }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setLabels(data.labels)
    } catch {
      setLabels(precedenti) // il server non ha una verità diversa da mostrare, solo il rollback
      setError('Etichetta non salvata — riprova.')
    } finally {
      setSaving(false)
    }
  }

  function rimuovi(etichetta: string) {
    salva(labels.filter(l => l !== etichetta))
  }

  function aggiungi() {
    const pulita = draft.trim().slice(0, MAX_LABEL_LENGTH)
    setDraft('')
    setAdding(false)
    if (!pulita || labels.includes(pulita)) return
    salva([...labels, pulita])
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      {labels.map(etichetta => (
        <span
          key={etichetta}
          className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full"
          style={{ fontFamily: FONT_HAND, fontSize: 13, color: TACCUINO_INK.hand }}
        >
          <HandDrawnFrame stroke={TACCUINO_INK.mapContour} strokeWidth={1.3} rx={50} />
          {etichetta}
          <button
            onClick={() => rimuovi(etichetta)}
            aria-label={`Rimuovi etichetta ${etichetta}`}
            className="flex items-center justify-center"
            style={{ color: TACCUINO_INK.handMuted }}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={aggiungi}
          onKeyDown={e => { if (e.key === 'Enter') aggiungi(); if (e.key === 'Escape') { setDraft(''); setAdding(false) } }}
          maxLength={MAX_LABEL_LENGTH}
          placeholder="nome etichetta…"
          className="px-2.5 py-1 rounded-full outline-none w-28"
          style={{ fontFamily: FONT_HAND, fontSize: 13, color: TACCUINO_INK.typed, background: 'transparent', border: `1px solid ${TACCUINO_INK.mapContour}` }}
        />
      ) : labels.length < MAX_LABELS ? (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full"
          style={{ fontFamily: FONT_HAND, fontSize: 13, color: TACCUINO_INK.handMuted }}
        >
          <Plus className="w-3 h-3" /> etichetta
        </button>
      ) : null}

      {saving && <Loader2 className="w-3 h-3 animate-spin" style={{ color: TACCUINO_ACCENT[600] }} />}
      {error && <span style={{ fontFamily: FONT_HAND, fontSize: 12, color: '#b3413a' }}>{error}</span>}
    </div>
  )
}
