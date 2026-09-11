'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import DiarioSommarioContent from '@/components/diario/DiarioSommarioContent'

// Rotta standalone del Sommario — raggiunta da un link diretto (es. la riga di un volume in
// /raccolte/[id]) invece che dal gesto di trascinamento su /diario. Copertina e modifica di
// titolo/sottotitolo/immagine vivono ora sulla copertina a schermo intero di /diario (si arriva lì
// scorrendo fino a QUESTO Diario) — qui solo un'intestazione minima sopra lo stesso contenuto.
export default function DiarioSommarioPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <Link href="/diario" className="max-w-2xl mx-auto px-4 sm:px-8 flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mt-3 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Diari
      </Link>
      <DiarioSommarioContent diaryId={params.id} />
    </div>
  )
}
