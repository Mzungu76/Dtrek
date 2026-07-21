'use client'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import Kicker from '@/components/ui/Kicker'
import SectionIdentita from '@/components/profilo/SectionIdentita'
import SectionIndirizzo from '@/components/profilo/SectionIndirizzo'
import SectionBiometria from '@/components/profilo/SectionBiometria'
import SectionComfortTrailScore from '@/components/profilo/SectionComfortTrailScore'
import SectionTei from '@/components/profilo/SectionTei'
import SectionProfiloEscursionista from '@/components/profilo/SectionProfiloEscursionista'
import SectionGuida from '@/components/profilo/SectionGuida'
import SectionAvanzate from '@/components/profilo/SectionAvanzate'

export default function ImpostazioniPage() {
  return (
    <div className={`min-h-screen bg-stone-50 md:pb-8 ${MOBILE_TOPBAR_SPACER}`}>
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
          <Kicker className="mb-3">Bellezza del percorso</Kicker>
          <SectionTei />
        </div>

        <div className="pt-2">
          <Kicker className="mb-3">Profilo escursionista</Kicker>
          <SectionProfiloEscursionista />
        </div>

        <div className="pt-2">
          <Kicker className="mb-3">Guida</Kicker>
          <SectionGuida />
        </div>

        <div className="pt-2">
          <SectionAvanzate />
        </div>
      </div>
    </div>
  )
}
