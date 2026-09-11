'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import HubNavBar from '@/components/routehub/HubNavBar'
import DiarioSommarioContent from '@/components/diario/DiarioSommarioContent'

// Rotta standalone del Sommario — raggiunta da un link diretto (es. la riga di un volume in
// /raccolte/[id]) invece che dal gesto di trascinamento su /diario. Copertina e modifica di
// titolo/sottotitolo/immagine vivono ora sulla copertina a schermo intero di /diario (si arriva lì
// scorrendo fino a QUESTO Diario) — qui solo un'intestazione minima sopra lo stesso contenuto, con
// la stessa identità scura (HubNavBar, non il Navbar chiaro) del corpo del Sommario sotto.
export default function DiarioSommarioPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="min-h-screen bg-[#0b1a24]">
      <HubNavBar />
      <Link href="/diario" className="max-w-2xl mx-auto px-4 sm:px-8 flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 mt-4 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Diari
      </Link>
      <DiarioSommarioContent diaryId={params.id} />
    </div>
  )
}
