'use client'
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import { Volume2, Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import type { GuideTextLength } from '@/lib/guideSections'
import MagazineBody, { type ExtraPhoto } from './MagazineBody'
import { truncateBody } from './textTruncate'

export interface LengthOption {
  key: GuideTextLength
  label: string
  description: string
  disabled?: boolean
  disabledReason?: string
}

/** Bottone "Approfondisci con Giulia" — con `lengthOptions` apre un piccolo menu per scegliere la
 *  lunghezza (Essenziale/Approfondita/Molto approfondita, con la loro descrizione) invece di
 *  mostrare sempre le tre pillole accanto al link; la scelta stessa avvia l'approfondimento invece
 *  di essere un passo separato. Senza `lengthOptions` (es. "Verificato online", che non usa il
 *  concetto di lunghezza) resta un tap solo. */
export function ApprofondisciTrigger({ onApprofondisci, lengthOptions }: {
  onApprofondisci?: (length?: GuideTextLength) => void
  lengthOptions?: LengthOption[]
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open])

  if (!onApprofondisci) return null
  const hasOptions = !!lengthOptions?.length

  return (
    <div ref={wrapRef} className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={() => (hasOptions ? setOpen(o => !o) : onApprofondisci())}
        className="inline-flex items-center gap-1 text-[12px] font-bold text-stone-700 hover:text-stone-900 underline underline-offset-2 whitespace-nowrap"
      >
        Approfondisci con Giulia <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && hasOptions && (
        // Ancorato SOPRA il bottone, non sotto: il trigger nel footer discreto sta in fondo a
        // una card con `overflow-hidden` (per gli angoli arrotondati delle foto), quindi un menu
        // che si apre verso il basso verrebbe tagliato dal bordo della card.
        <div className="absolute right-0 bottom-full mb-1.5 w-64 bg-white rounded-2xl border border-stone-200 shadow-xl z-20 overflow-hidden text-left">
          <p className="font-barlow font-semibold text-[10px] uppercase tracking-wide text-stone-400 px-3.5 pt-3 pb-1.5">Scegli la lunghezza</p>
          {lengthOptions!.map(opt => (
            <button
              key={opt.key}
              type="button"
              disabled={opt.disabled}
              title={opt.disabledReason}
              onClick={() => { setOpen(false); onApprofondisci(opt.key) }}
              className="block w-full text-left px-3.5 py-2.5 border-t border-stone-100 first:border-t-0 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <p className="text-[12.5px] font-bold text-stone-800">{opt.label}</p>
              <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">{opt.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  title: string
  /** Riga statica sotto il titolo che spiega cosa contiene la sezione — vedi lib/guideSections.ts. */
  subtitle?: string
  icon: ReactNode
  color: string
  body?: string
  widget?: ReactNode
  sectionPhoto?: string
  photoCaption?: string
  extraFloatNode?: ReactNode
  photoIndexBadge?: number
  extraPhotos?: ExtraPhoto[]
  twoColumns?: boolean
  isVoiceActive?: boolean
  onSpeak?: () => void
  /** True once la guida esiste ma questa sezione non ha ancora testo AI (tier Breve, o
   *  approfondimento non ancora richiesto) — pilota il footer discreto / la riga compatta. */
  showApprofondisciHint?: boolean
  onApprofondisci?: (length?: GuideTextLength) => void
  /** True mentre è in corso "Approfondisci" proprio SU QUESTA sezione — mostra uno spinner al
   *  posto del pulsante invece di lasciarlo cliccabile una seconda volta. */
  approfondendo?: boolean
  /** Opzioni "Essenziale/Approfondita/Molto approfondita" per questa sezione, mostrate in un
   *  menu a comparsa dietro al bottone "Approfondisci con Giulia" invece che come pillole sempre
   *  visibili — vedi components/guida/GuideReader.tsx. Assente quando il bottone stesso non è
   *  mostrato, o quando l'approfondimento non usa il concetto di lunghezza (es. "Verificato online"). */
  lengthOptions?: LengthOption[]
  /** Il corpo parte troncato a poche parole ("Leggi tutto"/"Riduci"), per dare subito più spazio
   *  a foto/mappa/dati invece di un lungo muro di testo. Il PDF/stampa (HiddenPdfRoot) non passa
   *  da qui, quindi resta sempre integrale a prescindere da questo stato. */
  collapsible?: boolean
  /** Soglia di parole dell'anteprima quando `collapsible` — default di `truncateBody` (26,
   *  pensato per Resoconto). La Guida usa una soglia più larga: l'utente ci è arrivato apposta
   *  per leggere, non solo per scorrere. */
  truncateWords?: number
}

/**
 * Una sezione della guida. Tre stati, decisi da cosa c'è davvero (non un template unico che
 * mostra sempre un hint quando manca il testo, vedi piano redesign):
 *  - **piena**: c'è un widget e/o del testo AI — card bianca con header editoriale.
 *  - **widget con footer discreto**: c'è il widget ma non ancora il testo — stesso layout, un
 *    footer sobrio al posto del corpo mancante.
 *  - **riga compatta**: né widget né testo (es. Sapori/Consigli in tier Breve) — non una card
 *    vuota, una riga in stile lista "altre sezioni disponibili", ma con lo stesso ref/ancora DOM
 *    così la nav e lo scroll-to-section continuano a funzionare anche per lei.
 */
const SectionCard = forwardRef<HTMLElement, Props>(function SectionCard(
  {
    title, subtitle, icon, color, body, widget, sectionPhoto, photoCaption, extraFloatNode, photoIndexBadge, extraPhotos,
    twoColumns, isVoiceActive, onSpeak, showApprofondisciHint, onApprofondisci, approfondendo, collapsible, truncateWords, lengthOptions,
  },
  ref,
) {
  const hasBody = !!body?.trim()
  const hasWidget = widget != null
  const [expanded, setExpanded] = useState(false)
  const { preview, isTruncated } = collapsible && body ? truncateBody(body, truncateWords) : { preview: '', isTruncated: false }
  // Se il corpo sta già tutto nelle 20-30 parole, non c'è nulla da troncare — va dritto al testo
  // formattato (foto/curiosità inclusi), altrimenti l'utente resterebbe bloccato sull'anteprima
  // piana senza mai vedere l'impaginazione vera e senza un modo per espanderla.
  const showCollapsedPreview = !!collapsible && !expanded && isTruncated

  if (!hasWidget && !hasBody) {
    return (
      <article ref={ref} className="scroll-mt-16 flex flex-col gap-2 px-4 py-3 border border-stone-200 rounded-xl bg-white mb-2.5">
        <div className="flex items-center gap-3">
          <span className="[&>svg]:w-4 [&>svg]:h-4 shrink-0" style={{ color }}>{icon}</span>
          <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-stone-800">{title}</span>
          {approfondendo && (
            <span className="flex items-center gap-1 text-[11.5px] font-medium text-stone-400 shrink-0">
              <Loader2 className="w-3 h-3 animate-spin" /> Approfondimento…
            </span>
          )}
        </div>
        {!approfondendo && onApprofondisci && (
          <div className="flex items-center justify-end">
            <ApprofondisciTrigger onApprofondisci={onApprofondisci} lengthOptions={lengthOptions} />
          </div>
        )}
      </article>
    )
  }

  return (
    <article
      ref={ref}
      className={`scroll-mt-16 bg-white rounded-2xl border border-stone-100 mb-6 overflow-hidden shadow-[0_5px_16px_-6px_rgba(43,36,25,0.14)] transition-shadow ${
        isVoiceActive ? 'ring-2 ring-terra-300 shadow-terra-100 shadow-md' : 'hover:shadow-md'
      }`}
    >
      {/* Header editoriale — un solo elemento "acceso" per sezione: il badge tondo pieno porta il
          colore, eyebrow/titolo tornano a inchiostro neutro invece di gridare anche loro (piano
          "semplificazione visiva" — vedi i mockup discussi, direzione C1: card vera + badge). */}
      <div className="px-5 pt-5 pb-3 sm:px-7 sm:pt-6 md:px-8 md:pt-7">
        <div className="flex items-start gap-3">
          <span
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white [&>svg]:w-[18px] [&>svg]:h-[18px]"
            style={{ background: color }}
          >
            {icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-barlow font-semibold uppercase tracking-wide text-[11px] text-stone-400">{title}</p>
              <div className="flex-1" />
              {hasBody && onSpeak && (
                <button onClick={onSpeak} className="text-stone-300 hover:text-stone-500 transition-colors shrink-0" title="Ascolta questa sezione">
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <h2 className="font-display text-[22px] sm:text-[26px] font-semibold text-stone-800 mt-1 leading-tight" style={{ textWrap: 'balance' as const }}>
              {title}
            </h2>
            {subtitle && (
              <p className="text-[12.5px] text-stone-400 mt-1 leading-snug">{subtitle}</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-7 md:px-8 md:pb-7">
        {widget}
        {hasBody && (
          <div className={hasWidget ? 'mt-5 pt-5 border-t' : ''} style={hasWidget ? { borderColor: '#dcd8cc' } : undefined}>
            {showCollapsedPreview ? (
              <div>
                <p className="text-[15px] sm:text-[16px] leading-7 text-stone-600">
                  {preview}{' '}
                  {isTruncated && (
                    <button
                      onClick={() => setExpanded(true)}
                      className="inline-flex items-center gap-0.5 font-bold text-[13px] align-baseline whitespace-nowrap text-stone-700 hover:text-stone-900 underline underline-offset-2"
                    >
                      Leggi tutto <ChevronDown className="w-3 h-3" />
                    </button>
                  )}
                </p>
              </div>
            ) : (
              <>
                <MagazineBody
                  body={body!} sectionPhoto={sectionPhoto} twoColumns={twoColumns}
                  photoCaption={photoCaption} extraFloatNode={extraFloatNode} photoIndexBadge={photoIndexBadge}
                  extraPhotos={extraPhotos}
                />
                {collapsible && isTruncated && (
                  <button
                    onClick={() => setExpanded(false)}
                    className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5" /> Riduci
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {!hasBody && approfondendo && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-stone-100 text-[11.5px] text-stone-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Giulia sta approfondendo questa sezione…
          </div>
        )}
        {!hasBody && !approfondendo && showApprofondisciHint && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-stone-100 text-[11.5px] text-stone-400">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Testo narrato non ancora generato —</span>
            <ApprofondisciTrigger onApprofondisci={onApprofondisci} lengthOptions={lengthOptions} />
          </div>
        )}
      </div>
    </article>
  )
})

export default SectionCard
