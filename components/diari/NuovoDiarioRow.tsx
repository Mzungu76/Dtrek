'use client'
// "+ Nuovo volume" — stessa logica di creazione della vecchia NewDiarioTile (POST /api/diaries,
// gated: il Diario di default è incluso per tutti, ulteriori Diari solo per chi ha sbloccato
// Dtrek), qui come riga a piena larghezza invece che come tessera nella griglia — coerente con il
// registro a righe della versione A. docs/diari-restyling-piano.md, Fase 1.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT } from '@/lib/taccuinoTokens'

export function NuovoDiarioRow() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    setBlockedMessage(null)
    try {
      const res = await fetch('/api/diaries', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBlockedMessage(data.message ?? 'Impossibile creare il Diario.')
        return
      }
      router.push(`/diari/${encodeURIComponent(data.id)}`)
    } catch {
      setBlockedMessage('Errore di rete. Riprova.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="flex items-center justify-center gap-2 h-11 rounded-xl disabled:opacity-60"
        style={{ border: `1.5px dashed ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand, fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11 }}
      >
        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Nuovo volume
      </button>
      {blockedMessage && (
        <p className="text-[11.5px] text-center" style={{ color: TACCUINO_INK.hand }}>
          {blockedMessage}{' '}
          <a href="/prezzi" className="underline" style={{ color: TACCUINO_ACCENT[600] }}>Sblocca Dtrek</a>
        </p>
      )}
    </div>
  )
}
