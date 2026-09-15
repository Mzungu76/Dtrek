'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { MobileNavBar, DesktopNav } from '@/components/Navbar'
import DiarioSommarioContent from '@/components/diario/DiarioSommarioContent'

// Rotta standalone del Sommario — raggiunta da un link diretto (es. la riga di un volume in
// /raccolte/[id]) invece che dal gesto di trascinamento su /diario. Copertina e modifica di
// titolo/sottotitolo/immagine vivono ora sulla copertina a schermo intero di /diario (si arriva lì
// scorrendo fino a QUESTO Diario) — qui solo un'intestazione minima sopra lo stesso contenuto, con
// la stessa identità scura (MobileNavBar, non il Navbar chiaro) del corpo del Sommario sotto.
// La barra intera (link + profilo insieme) resta in cima qui, non divisa fra cima e fondo come
// nelle pagine "magazine" con galleria/freccetta di scorrimento (HubNavBar/HubProfileButton) —
// questa pagina di gestione non ha quel meccanismo. Da md: in su la MobileNavBar scura lascia
// posto alla testata chiara DesktopNav (sticky: pagina "normale" con scroll reale, non a schermo
// intero come Bacheca/Guida/Resoconto/Diario libro — vedi il commento su `position` in Navbar.tsx).
export default function DiarioSommarioPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="min-h-screen bg-[#0b1a24]">
      <DesktopNav />
      <MobileNavBar className="md:hidden" />
      <Link href="/diario" className="max-w-2xl mx-auto px-4 sm:px-8 flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 mt-4 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Diari
      </Link>
      <DiarioSommarioContent diaryId={params.id} />
    </div>
  )
}
