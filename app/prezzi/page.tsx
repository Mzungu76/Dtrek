import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import UpgradeChoicePanel from '@/components/premium/UpgradeChoicePanel'

export const dynamic = 'force-dynamic'

export default function PrezziPage() {
  return (
    <div className={`min-h-screen bg-stone-50 md:pb-8 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl font-bold text-forest-900 mb-2">Sblocca Dtrek</h1>
          <p className="text-stone-500">
            Percorsi, guide e resoconti generati dall&apos;AI senza limiti di volume né periodo di prova.
          </p>
        </div>

        <UpgradeChoicePanel />
      </main>
    </div>
  )
}
