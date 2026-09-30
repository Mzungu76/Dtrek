'use client'
import { useRef } from 'react'
import { Library, BookMarked, BookOpen, Pencil, Loader2 } from 'lucide-react'
import SafeImg from '@/components/ui/SafeImg'

// Copertina in miniatura per una riga dell'albero — la stessa icona di riferimento del livello
// (Library/BookMarked/BookOpen, le stesse di components/Navbar.tsx) mostrata finché non c'è
// un'immagine di copertina vera, poi sostituita da quella non appena caricata. Il badge a penna
// (solo se editable) è l'unico modo per cambiarla — un tap apre il selettore file nativo.
const ICON_BY_KIND = { raccolta: Library, diario: BookMarked, reportage: BookOpen } as const
const GRADIENT_BY_KIND: Record<keyof typeof ICON_BY_KIND, [string, string]> = {
  raccolta: ['#8cc894', '#277134'],
  diario: ['#e9ab64', '#9f4315'],
  reportage: ['#9db8c4', '#3f6577'],
}

interface CoverThumbProps {
  kind: keyof typeof ICON_BY_KIND
  coverUrl?: string | null
  size: number
  editable?: boolean
  uploading?: boolean
  onPickImage?: (file: File) => void
}

export default function CoverThumb({ kind, coverUrl, size, editable, uploading, onPickImage }: CoverThumbProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const Icon = ICON_BY_KIND[kind]
  const [from, to] = GRADIENT_BY_KIND[kind]
  const badgeSize = Math.max(11, Math.round(size / 2))

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-[28%] flex items-center justify-center overflow-hidden"
        style={{ background: coverUrl ? undefined : `linear-gradient(160deg, ${from}, ${to})` }}
      >
        {coverUrl ? (
          <SafeImg
            src={coverUrl} alt="" className="w-full h-full object-cover"
            fallback={<Icon className="text-white" style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2.2} />}
          />
        ) : (
          <Icon className="text-white" style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2.2} />
        )}
      </div>
      {editable && (
        <>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
            disabled={uploading}
            aria-label="Cambia immagine di copertina"
            className="absolute flex items-center justify-center rounded-full bg-white shadow disabled:opacity-70"
            style={{ width: badgeSize, height: badgeSize, bottom: -3, right: -3, border: '1.5px solid #f8f7f4' }}
          >
            {uploading
              ? <Loader2 className="animate-spin text-stone-500" style={{ width: badgeSize * 0.55, height: badgeSize * 0.55 }} />
              : <Pencil className="text-stone-600" style={{ width: badgeSize * 0.5, height: badgeSize * 0.5 }} />}
          </button>
          <input
            ref={inputRef} type="file" accept="image/*" className="hidden"
            onClick={e => e.stopPropagation()}
            onChange={e => { const f = e.target.files?.[0]; if (f) onPickImage?.(f); e.target.value = '' }}
          />
        </>
      )}
    </div>
  )
}
