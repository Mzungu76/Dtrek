'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (popupRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  useEffect(() => {
    if (!open || !btnRef.current) return
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect()
      const width = 224 // w-56
      const margin = 8
      let left = r.left + r.width / 2 - width / 2
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
      const top = Math.max(margin, r.top - 8) // popup anchors above, translated up via CSS
      setPos({ top, left })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="text-stone-300 hover:text-stone-500 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 224, transform: 'translateY(-100%)' }}
          className="z-[1000] rounded-lg bg-stone-800 text-white text-[11px] leading-snug px-2.5 py-2 shadow-lg"
        >
          {text}
        </div>,
        document.body,
      )}
    </span>
  )
}
