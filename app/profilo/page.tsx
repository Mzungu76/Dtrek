'use client'
import Navbar from '@/components/Navbar'
import Kicker from '@/components/ui/Kicker'
import SectionIdentita from '@/components/profilo/SectionIdentita'
import SectionIndirizzo from '@/components/profilo/SectionIndirizzo'
import SectionBiometria from '@/components/profilo/SectionBiometria'
import SectionComfortTrailScore from '@/components/profilo/SectionComfortTrailScore'
import SectionCronologiaNavigazione from '@/components/profilo/SectionCronologiaNavigazione'
import SectionClaudeKey from '@/components/profilo/SectionClaudeKey'
import SectionAbbonamento from '@/components/profilo/SectionAbbonamento'
import SectionAvanzate from '@/components/profilo/SectionAvanzate'

// ── Profile page ───────────────────────────────────────────────────────────

export default function ProfiloPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-10 space-y-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-stone-900 mb-1">Profilo e impostazioni</h1>
          <p className="text-stone-400 text-sm">Personalizza il tuo account DTrek.</p>
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
          <Kicker className="mb-3">Privacy</Kicker>
          <SectionCronologiaNavigazione />
        </div>

        <div className="pt-2">
          <Kicker className="mb-3">Intelligenza artificiale</Kicker>
          <div className="space-y-3">
            <SectionClaudeKey />
            <SectionAbbonamento />
          </div>
        </div>

        <div className="pt-2">
          <SectionAvanzate />
        </div>
      </div>
    </div>
  )
}
