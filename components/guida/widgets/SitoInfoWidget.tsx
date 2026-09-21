import { Clock, Ticket, Car, Phone, Mail } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  openingHours?: string | null
  /** official_url ?? website (stessa precedenza ovunque nell'app, vedi app/api/borgo-itinerary/
   *  route.ts e app/mete/[id]/page.tsx) — unico link "sito ufficiale" mostrato, mai i due insieme. */
  officialLink?: string | null
  wikipediaUrl?: string | null
  address?: string | null
  // PlaceDetail.phone/email (app/api/places/[id]/route.ts) — null finché
  // supabase/migrations/add_places_contacts.sql non è applicata, o quando la fonte non li fornisce.
  phone?: string | null
  email?: string | null
}

function Cell({ icon, value, label, href }: { icon: ReactNode; value: string; label: string; href?: string }) {
  const content = (
    <>
      <span className="text-terra-600">{icon}</span>
      <p className="font-semibold text-[13px] text-stone-800 mt-1.5 leading-snug">{value}</p>
      <p className="text-[10.5px] text-stone-400 mt-0.5">{label}</p>
    </>
  )
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:opacity-75 transition-opacity">
      {content}
    </a>
  ) : (
    <div>{content}</div>
  )
}

/**
 * Pannello "Informazioni pratiche" per un Sito famiglia 'scheda_pratica' (lib/guideCardVariant.ts)
 * — subito sotto la copertina, prima di ogni narrazione (piano della discussione "Guida Borgo/
 * Città e Sito"). Nessuna fonte della pipeline fornisce oggi orari/biglietti strutturati per la
 * maggior parte delle Mete (scripts/places/osm/fetch.ts li legge da OSM dove presenti —
 * copertura parziale): quando manca il dato, la cella diventa un link al posto giusto invece di
 * sparire silenziosamente o di un valore inventato — cascata dal più diretto al più generico:
 * sito ufficiale (official_url ?? website) → voce Wikipedia → cella omessa. Mai un
 * orario/prezzo fabbricato.
 */
export default function SitoInfoWidget({ openingHours, officialLink, wikipediaUrl, address, phone, email }: Props) {
  const infoLink = officialLink ?? wikipediaUrl ?? null
  const infoLinkLabel = officialLink ? 'Sito ufficiale' : 'Wikipedia'

  const cells: ReactNode[] = []

  if (openingHours) {
    cells.push(<Cell key="hours" icon={<Clock className="w-4 h-4" />} value={openingHours} label="Orario" />)
  } else if (infoLink) {
    cells.push(<Cell key="hours-link" icon={<Clock className="w-4 h-4" />} value="Vedi orari" label={infoLinkLabel} href={infoLink} />)
  }

  // Mai un prezzo inventato: nessuna fonte lo fornisce oggi — solo il rimando, quando c'è un link.
  if (infoLink) {
    cells.push(<Cell key="tickets" icon={<Ticket className="w-4 h-4" />} value="Biglietti" label={infoLinkLabel} href={infoLink} />)
  }

  if (address) {
    cells.push(<Cell key="address" icon={<Car className="w-4 h-4" />} value={address} label="Indirizzo" />)
  }

  if (phone) {
    cells.push(<Cell key="phone" icon={<Phone className="w-4 h-4" />} value={phone} label="Telefono" href={`tel:${phone}`} />)
  }

  if (email) {
    cells.push(<Cell key="email" icon={<Mail className="w-4 h-4" />} value={email} label="Email" href={`mailto:${email}`} />)
  }

  if (cells.length === 0) return null

  return (
    <div className="bg-stone-100 border-b border-stone-200 px-5 sm:px-8 md:px-10 py-4">
      <p className="font-barlow font-bold uppercase tracking-wide text-[10px] text-stone-400 mb-3">Informazioni pratiche</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        {cells}
      </div>
    </div>
  )
}
