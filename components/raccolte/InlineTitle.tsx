'use client'
import { useEffect, useRef, useState } from 'react'

// Titolo modificabile in linea (Diario, Reportage) — un tap entra in modifica, Invio/uscire dal
// campo conferma, Esc annulla. La Raccolta non usa questo componente: la sua rinomina resta nel
// menù ••• (Rinomina), coerente con l'ultimo mockup approvato.
export default function InlineTitle({
  value, onCommit, className, inputClassName,
}: { value: string; onCommit: (next: string) => void; className?: string; inputClassName?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select() } }, [editing])

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onCommit(trimmed)
    else setDraft(value)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onClick={e => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        className={inputClassName}
      />
    )
  }
  return (
    <p onClick={e => { e.stopPropagation(); setEditing(true) }} className={className}>
      {value}
    </p>
  )
}
