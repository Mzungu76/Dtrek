'use client'
import { useEffect, useRef } from 'react'
import { X, Volume2 } from 'lucide-react'
import { speak, isSpeechSupported } from '@/lib/navigation/speech'
import SafeImg from '@/components/ui/SafeImg'

interface Props {
  title: string
  extract?: string
  imageUrl?: string
  onClose: () => void
}

/**
 * Scheda di un punto di interesse, in stile Guida: titolo in serif, foto in testa quando c'è, testo
 * a paragrafi leggibile per intero scorrendo (niente più "Leggi tutto" che nascondeva il resto).
 * `extract` è il testo più ricco disponibile per il luogo — nota curata della guida, altrimenti
 * paragrafi della guida che lo citano, altrimenti l'incipit Wikipedia (vedi
 * ActiveNavigationView.resolvePoiCallout): tutti già sul dispositivo, quindi anche offline.
 * Non bloccante: si chiude con X o toccando la mappa fuori dalla scheda non serve, resta sopra il
 * pannello inferiore finché non la chiudi.
 */
export default function PoiCalloutSheet({ title, extract, imageUrl, onClose }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  // Un nuovo luogo riparte dall'inizio del testo, non dalla posizione di scorrimento del precedente.
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }) }, [title, extract])

  const canSpeak = isSpeechSupported() && !!extract
  const paragraphs = extract ? extract.split(/\n{2,}|\n(?=[-•])/).map((p) => p.trim()).filter(Boolean) : []

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1200] px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md max-h-[68vh] flex flex-col rounded-t-3xl bg-[#fdfcfa] shadow-2xl border border-stone-200 overflow-hidden">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <SafeImg src={imageUrl} alt="" className="w-full h-36 object-cover shrink-0" fallback={null} />
        )}
        <div className="flex items-start gap-2 px-5 pt-4 pb-2 shrink-0">
          <h2 className="flex-1 min-w-0 font-display font-semibold text-[22px] leading-tight text-stone-900 text-balance">{title}</h2>
          {canSpeak && (
            <button
              onClick={() => speak(`${title}. ${extract}`)}
              className="w-11 h-11 rounded-full bg-forest-50 text-forest-700 flex items-center justify-center shrink-0"
              aria-label="Ascolta"
            >
              <Volume2 size={20} />
            </button>
          )}
          <button onClick={onClose} className="w-11 h-11 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center shrink-0" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>
        <div ref={bodyRef} className="overflow-y-auto px-5 pb-5 space-y-3">
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-stone-700 font-body whitespace-pre-line">{p}</p>
            ))
          ) : (
            <p className="text-sm text-stone-500 font-body italic">
              Per questo luogo non c&apos;è ancora una descrizione salvata sul telefono. Genera o aggiorna la guida del
              percorso prima di partire: i testi vengono scaricati con il percorso e restano disponibili offline.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
