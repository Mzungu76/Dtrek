import { META_TYPE_CONFIG, SITE_TYPE_CONFIG, type MetaType, type SiteType } from '@/lib/metaTypes'

interface Props {
  metaType?: MetaType
  siteType?: SiteType | null
  /** Diametro del cerchio in px. */
  size?: number
  className?: string
}

/** Badge icona+colore per la tipologia di una Meta (Sentiero/Borgo-Città/Sito) — stessa fonte
 *  icona/colore dei pin mappa (lib/metaTypes.ts's META_TYPE_CONFIG/SITE_TYPE_CONFIG), riusato qui
 *  sovrapposto alle miniature di galleria/card per distinguerle a colpo d'occhio senza dover aprire
 *  la scheda. Un Sito con sottotipo noto mostra l'icona più specifica del sottotipo (stesso
 *  ripiego di GalleryMapThumb), ma sempre col colore della tipologia madre, non un colore per
 *  sottotipo (che non esiste — un solo posto per icona+colore, vedi il commento su
 *  MetaTypeConfig.color).
 */
export default function MetaTypeBadge({ metaType, siteType, size = 20, className = '' }: Props) {
  const type = metaType ?? 'sentiero'
  const Icon = siteType ? SITE_TYPE_CONFIG[siteType].icon : META_TYPE_CONFIG[type].icon
  const color = META_TYPE_CONFIG[type].color
  return (
    <div
      title={META_TYPE_CONFIG[type].label}
      className={`flex items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 ${className}`}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: size * 0.56, height: size * 0.56, color }} strokeWidth={2.25} />
    </div>
  )
}
