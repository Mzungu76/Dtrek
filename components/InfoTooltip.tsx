'use client'
import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="text-stone-300 hover:text-stone-500 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span className="absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 rounded-lg bg-stone-800 text-white text-[11px] leading-snug px-2.5 py-2 shadow-lg">
          {text}
        </span>
      )}
    </span>
  )
}
