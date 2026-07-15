'use client'
import { forwardRef, type ReactNode } from 'react'
import { Volume2, Sparkles, ChevronRight, Loader2 } from 'lucide-react'
import MagazineBody from './MagazineBody'

interface Props {
  title: string
  /** Riga statica sotto il titolo che spiega cosa contiene la sezione — vedi lib/guideSections.ts. */
  subtitle?: string
  icon: ReactNode
  color: string
  body?: string
  widget?: ReactNode
  sectionPhoto?: string
  twoColumns?: boolean
  isVoiceActive?: boolean
  onSpeak?: () => void
  /** True once la guida esiste ma questa sezione non ha ancora testo AI (tier Breve, o
   *  approfondimento non ancora richiesto) — pilota il footer discreto / la riga compatta. */
  showApprofondisciHint?: boolean
  onApprofondisci?: () => void
  /** True mentre è in corso "Approfondisci" proprio SU QUESTA sezione — mostra uno spinner al
   *  posto del pulsante invece di lasciarlo cliccabile una seconda volta. */
  approfondendo?: boolean
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
  { title, subtitle, icon, color, body, widget, sectionPhoto, twoColumns, isVoiceActive, onSpeak, showApprofondisciHint, onApprofondisci, approfondendo },
  ref,
) {
  const hasBody = !!body?.trim()
  const hasWidget = widget != null

  if (!hasWidget && !hasBody) {
    return (
      <article ref={ref} className="scroll-mt-16 flex items-center gap-3 px-4 py-3 border border-stone-200 rounded-xl bg-white mb-2.5">
        <span className="[&>svg]:w-4 [&>svg]:h-4 shrink-0" style={{ color }}>{icon}</span>
        <span className="flex-1 text-[13px] font-semibold text-stone-800">{title}</span>
        {approfondendo ? (
          <span className="flex items-center gap-1 text-[11.5px] font-medium text-stone-400 shrink-0">
            <Loader2 className="w-3 h-3 animate-spin" /> Approfondimento…
          </span>
        ) : onApprofondisci && (
          <button onClick={onApprofondisci} className="flex items-center gap-0.5 text-[11.5px] font-bold text-terra-600 hover:text-terra-700 shrink-0">
            Approfondisci con Giulia (AI) <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </article>
    )
  }

  return (
    <article
      ref={ref}
      className={`scroll-mt-16 bg-white rounded-2xl mb-4 overflow-hidden shadow-sm transition-shadow ${
        isVoiceActive ? 'ring-2 ring-terra-300 shadow-terra-100 shadow-md' : 'hover:shadow-md'
      }`}
    >
      <div className="px-5 pt-5 pb-1 sm:px-7 sm:pt-6 md:px-8 md:pt-7">
        <div className="flex items-center gap-2">
          <span className="[&>svg]:w-3.5 [&>svg]:h-3.5" style={{ color }}>{icon}</span>
          <p className="font-barlow font-bold uppercase tracking-wide text-[11px]" style={{ color }}>{title}</p>
          <div className="flex-1" />
          {hasBody && onSpeak && (
            <button onClick={onSpeak} className="text-stone-300 hover:text-stone-500 transition-colors" title="Ascolta questa sezione">
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <h2 className="font-display text-[22px] sm:text-[26px] font-semibold text-stone-800 mt-1.5 leading-tight" style={{ textWrap: 'balance' as const }}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-[12.5px] text-stone-400 mt-1 leading-snug">{subtitle}</p>
        )}
        <div className="mt-3 h-[2px] w-10 rounded-full" style={{ background: color }} />
      </div>

      <div className="px-5 py-5 sm:px-7 md:px-8 md:pb-7">
        {widget}
        {hasBody && (
          <div className={hasWidget ? 'mt-5 pt-5 border-t' : ''} style={hasWidget ? { borderColor: '#dcd8cc' } : undefined}>
            <MagazineBody body={body!} color={color} sectionPhoto={sectionPhoto} twoColumns={twoColumns} />
          </div>
        )}
        {!hasBody && approfondendo && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-stone-100 text-[11.5px] text-stone-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Giulia sta approfondendo questa sezione…
          </div>
        )}
        {!hasBody && !approfondendo && showApprofondisciHint && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-stone-100 text-[11.5px] text-stone-400">
            <Sparkles className="w-3.5 h-3.5" />
            Testo narrato non ancora generato —{' '}
            <button onClick={onApprofondisci} className="text-terra-600 font-bold hover:text-terra-700">Approfondisci con Giulia (AI)</button>
          </div>
        )}
      </div>
    </article>
  )
})

export default SectionCard
