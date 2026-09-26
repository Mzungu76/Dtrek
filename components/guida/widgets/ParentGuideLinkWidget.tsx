import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CornerUpLeft } from 'lucide-react'

interface Props {
  /** planned_hikes.parent_meta_id di questa Guida — sempre valorizzato quando montato (il
   *  chiamante monta solo per una Guida Sito nested, piano §51.4). */
  parentMetaId: string
}

/**
 * Richiamo di provenienza per una Guida Sito nata dentro la Guida di un Borgo/Città (piano
 * §52.5) — quella Guida non compare mai nella lista top-level "Siti" (app/guida/GuidaHub.tsx),
 * quindi chi ci arriva da altrove (ricerca, deep link) deve poter risalire al Borgo. Fetch
 * minimale del solo titolo del genitore; silenzioso (null) se non è più raggiungibile — una Meta
 * cancellata azzera parentMetaId (ON DELETE SET NULL) solo lato database, questo componente
 * smette comunque di montarsi al successivo caricamento della Guida.
 */
export default function ParentGuideLinkWidget({ parentMetaId }: Props) {
  const [parentTitle, setParentTitle] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/planned?id=${encodeURIComponent(parentMetaId)}`)
      .then(res => res.ok ? res.json() : null)
      .then((data: { title?: string } | null) => { if (!cancelled && data?.title) setParentTitle(data.title) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [parentMetaId])

  if (!parentTitle) return null

  return (
    <Link
      href={`/guida/${encodeURIComponent(parentMetaId)}`}
      className="flex items-center gap-2 px-5 sm:px-8 md:px-10 py-3 border-b border-stone-200 text-[12.5px] text-stone-500 hover:text-terra-600 transition-colors"
    >
      <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />
      Fa parte della Guida di <span className="font-semibold">{parentTitle}</span>
    </Link>
  )
}
