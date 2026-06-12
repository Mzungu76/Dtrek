'use client'

interface Props {
  section: string
  onGuideLink: (section: string) => void
}

export default function InfoButton({ section, onGuideLink }: Props) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onGuideLink(section) }}
      className="w-4 h-4 rounded-full bg-stone-200 text-stone-600 text-[10px] font-bold hover:bg-forest-100 hover:text-forest-700 transition-colors inline-flex items-center justify-center shrink-0"
      title="Scopri di più nella Guida"
      aria-label="Vai alla guida"
    >
      i
    </button>
  )
}
