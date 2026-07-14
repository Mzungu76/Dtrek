'use client'
import { Leaf, PawPrint } from 'lucide-react'
import { FloraPanel } from '@/components/FloraPanel'
import type { FloraResult } from '@/lib/floraTypes'
import { glassTile, glassTileHover, textPrimary } from '@/components/routehub/overlayTheme'

interface Props {
  hasGps: boolean
  flora?: FloraResult | null
  floraLoading: boolean
  onOpenFloraGallery: () => void
  onOpenAnimalGallery: () => void
}

/** Flora + gallerie verde/animali — spostati dalla vecchia tab "Natura" nella
 *  sezione "La natura intorno a te" della guida magazine. */
export default function NaturaWidget({
  hasGps, flora, floraLoading, onOpenFloraGallery, onOpenAnimalGallery,
}: Props) {
  return (
    <div className="space-y-5">
      {hasGps && <FloraPanel flora={flora ?? null} floraLoading={floraLoading} />}
      <div className="flex gap-2">
        <button onClick={onOpenFloraGallery} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${glassTile} ${glassTileHover} ${textPrimary}`}>
          <Leaf className="w-4 h-4 text-emerald-400" /> Galleria Verde
        </button>
        <button onClick={onOpenAnimalGallery} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${glassTile} ${glassTileHover} ${textPrimary}`}>
          <PawPrint className="w-4 h-4 text-amber-500" /> Galleria Animali
        </button>
      </div>
    </div>
  )
}
