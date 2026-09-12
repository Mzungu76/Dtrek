'use client'
import { Globe2, Lock, Loader2 } from 'lucide-react'

// Icona pubblicato/bozza, cliccabile per accendere o spegnere la pubblicazione direttamente
// dall'albero — stessa coppia Globe2 (pubblicata)/Lock (bozza) già usata nell'elenco delle
// Raccolte prima di questa riscrittura ad albero, qui estesa anche a Diari e Reportage.
export default function PublishToggle({
  published, busy, disabled, disabledTitle, onToggle, size = 14,
}: {
  published: boolean
  busy: boolean
  /** Niente da pubblicare (un Reportage senza racconto scritto) — mostra solo lo stato, non tocca. */
  disabled?: boolean
  disabledTitle?: string
  onToggle: () => void
  size?: number
}) {
  if (disabled) {
    return (
      <span title={disabledTitle} className="shrink-0 inline-flex">
        <Lock className="text-stone-200" style={{ width: size, height: size }} />
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle() }}
      disabled={busy}
      title={published ? 'Pubblicato — tocca per disattivare' : 'Non pubblicato — tocca per pubblicare'}
      aria-label={published ? 'Disattiva la pubblicazione' : 'Pubblica'}
      className={`shrink-0 p-1 -m-1 disabled:opacity-50 ${published ? 'text-forest-600' : 'text-stone-300'}`}
    >
      {busy
        ? <Loader2 className="animate-spin" style={{ width: size, height: size }} />
        : published ? <Globe2 style={{ width: size, height: size }} /> : <Lock style={{ width: size, height: size }} />}
    </button>
  )
}
