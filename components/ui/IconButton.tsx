import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

// Fase 2 del riordino UI/UX (docs/diario-valutazione-ux-piano.md): tre taglie di bersaglio
// tattile, per sostituire la varietà odierna di icone/bottoni dimensionati a mano (h-3/h-3.5/h-4
// dentro padding minimi, spesso sotto i 24px di area cliccabile). `md` è il default — 44px è il
// minimo Apple HIG/Material per un controllo isolato; `sm` resta per i casi davvero densi (chip di
// filtro, azioni dentro una riga di lista) dove 44px per elemento non ci sta; `lg` per l'azione
// primaria di una schermata o per la navigazione attiva (usata camminando, spesso con un solo
// sguardo).
//
// Perché un componente e non solo classi Tailwind copiate a mano: le classi sbagliate falliscono
// in silenzio (un `w-9` scritto per sbaglio invece di `w-11` non dà nessun errore, si nota solo a
// schermo) — un componente con tre varianti tipizzate rende l'errore impossibile da scrivere.
// Adozione incrementale: non sostituisce i 655 bottoni esistenti in un colpo solo (motivato in
// docs/diario-valutazione-ux-piano.md, Fase 2) — è lo standard per il codice nuovo e per i punti
// a più alto traffico riscritti uno alla volta, a partire dalla barra di navigazione globale
// (components/Navbar.tsx).
const SIZES = {
  sm: { box: 'w-9 h-9', icon: 18 },   // 36px — controlli densi, chip, azioni di riga
  md: { box: 'w-11 h-11', icon: 20 }, // 44px — il default: qualunque bottone isolato
  lg: { box: 'w-[52px] h-[52px]', icon: 24 }, // 52px — azione primaria, navigazione attiva
} as const

export type IconButtonSize = keyof typeof SIZES

/** Dimensione dell'icona raccomandata per una taglia — da passare a `<Icon size={...}>` quando il
 *  contenuto non è children di IconButton (es. un'icona lucide-react usata altrove ma allineata
 *  alla stessa scala). */
export function iconSizeFor(size: IconButtonSize): number {
  return SIZES[size].icon
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  size?: IconButtonSize
  /** Forma del bersaglio — `full` (cerchio, il default e la convenzione dominante nell'app per i
   *  controlli solo-icona) o `rounded` (angoli smussati, per allinearsi a un gruppo di controlli
   *  rettangolari vicini). */
  shape?: 'full' | 'rounded'
  children: ReactNode
  className?: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = 'md', shape = 'full', children, className = '', ...rest },
  ref,
) {
  const { box } = SIZES[size]
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center shrink-0 transition-colors active:scale-95 ${box} ${shape === 'full' ? 'rounded-full' : 'rounded-xl'} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
})

export default IconButton
