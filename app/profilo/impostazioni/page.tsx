'use client'
import Navbar from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import Kicker from '@/components/ui/Kicker'
import SectionIdentita from '@/components/profilo/SectionIdentita'
import SectionIndirizzo from '@/components/profilo/SectionIndirizzo'
import SectionBiometria from '@/components/profilo/SectionBiometria'
import SectionComfortTrailScore from '@/components/profilo/SectionComfortTrailScore'
import SectionAvanzate from '@/components/profilo/SectionAvanzate'

export default function ImpostazioniPage() {
  return (
    <div className="min-h-screen bg-stone-50 pb-28 md:pb-8">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <BackLink className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition mb-1" />
        <div className="mb-2">
          <h1 className="font-display text-2xl font-bold text-forest-900 mb-1">Impostazioni</h1>
          <p className="text-stone-400 text-sm">Identità, punto di partenza, dati biometrici e comfort score.</p>
        </div>

        <SectionIdentita />

        <div className="pt-2">
          <Kicker className="mb-3">Punto di partenza</Kicker>
          <SectionIndirizzo />
        </div>

        <div className="pt-2">
          <Kicker className="mb-3">Dati biometrici</Kicker>
          <SectionBiometria />
        </div>

        <div className="pt-2">
          <Kicker className="mb-3">Comfort TrailScore</Kicker>
          <SectionComfortTrailScore />
        </div>

        <div className="pt-2">
          <SectionAvanzate />
        </div>
      </div>
    </div>
  )
}
