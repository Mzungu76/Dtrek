'use client'
import { ChevronRight } from 'lucide-react'
import { FloraPanel } from '@/components/FloraPanel'
import type { FloraResult } from '@/lib/floraTypes'

interface Props {
  hasGps: boolean
  flora?: FloraResult | null
  floraLoading: boolean
  onOpenFloraGallery: () => void
  onOpenAnimalGallery: () => void
}

/** Flora + gallerie verde/animali — spostati dalla vecchia tab "Natura" nella sezione "La natura
 *  intorno a te" della guida magazine. I due trigger sono link discreti (stesso trattamento di
 *  "Approfondisci con Giulia"/"Leggi tutto"), non più pillole piene affiancate — il popup che
 *  aprono (components/NatureGallery.tsx) resta comunque dietro un tap esplicito: nessuna
 *  chiamata finché non lo si tocca. */
export default function NaturaWidget({
  hasGps, flora, floraLoading, onOpenFloraGallery, onOpenAnimalGallery,
}: Props) {
  return (
    <div className="space-y-3">
      {hasGps && <FloraPanel flora={flora ?? null} floraLoading={floraLoading} />}
      <div className="flex gap-5">
        <button onClick={onOpenFloraGallery} className="inline-flex items-center gap-0.5 text-[12.5px] font-bold text-stone-700 hover:text-stone-900 underline underline-offset-2">
          Galleria Verde <ChevronRight className="w-3 h-3" />
        </button>
        <button onClick={onOpenAnimalGallery} className="inline-flex items-center gap-0.5 text-[12.5px] font-bold text-stone-700 hover:text-stone-900 underline underline-offset-2">
          Galleria Animali <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
