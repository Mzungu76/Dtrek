'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { List, MapPinned, Upload, ArrowRight, LogOut } from 'lucide-react'
import Sheet from '@/components/ui/Sheet'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { lsClearAll } from '@/lib/localStore'
import { clearProfile } from '@/lib/userProfile'
import { useEntitlement, activateDtrek } from '@/lib/useEntitlement'

interface Props {
  open: boolean
  onClose: () => void
}

// Dove atterra chi entra in Dtrek da Navigator — sia al primo "Passa a Dtrek" sia da lì in poi:
// la sezione di apertura dell'app (vedi commento in app/bacheca/page.tsx), non una pagina di
// dettaglio. Da qui la navbar di Dtrek stessa porta a Diario/Guida/Profilo — Navigator non
// duplica quella navigazione nel proprio menu.
const DTREK_HOME_PATH = '/bacheca'

/**
 * The standalone Navigator app's menu — everything that isn't "navigate right now" lives behind
 * this, reached from the map-first home (app/navigatore/page.tsx). Kept as one small, shared
 * component rather than duplicating this list per screen.
 *
 * Confine Navigator/Dtrek, modello "un'icona sola" (docs/navigator-dtrek-boundary.md): finché
 * l'utente non ha mai toccato "Passa a Dtrek", l'ultima voce resta un invito discreto (mai un
 * funnel di vendita — Navigator non deve mostrare linguaggio di acquisto). Una volta attivato,
 * quella stessa voce naviga la STESSA WebView dentro Dtrek — mai il browser di sistema (quello
 * resta riservato solo al checkout, vedi /prezzi, per vincolo store).
 */
export default function NavigatorMenu({ open, onClose }: Props) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [confirmingActivation, setConfirmingActivation] = useState(false)
  const [activating, setActivating] = useState(false)
  const entitlement = useEntitlement()

  async function handleSignOut() {
    setSigningOut(true)
    await getBrowserSupabase().auth.signOut()
    await lsClearAll()
    clearProfile()
    router.push('/login')
    router.refresh()
  }

  async function handleActivate() {
    setActivating(true)
    const ok = await activateDtrek()
    setActivating(false)
    if (!ok) return // resta nella conferma — l'utente può ritentare
    setConfirmingActivation(false)
    onClose()
    router.push(DTREK_HOME_PATH)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Menu">
      <div className="space-y-2">
        <button
          onClick={() => { onClose(); router.push('/navigatore/percorsi') }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <List className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-sm text-stone-800">Percorsi pianificati</span>
        </button>

        <button
          onClick={() => { onClose(); router.push('/navigatore/importa') }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Upload className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-sm text-stone-800">Importa un percorso</span>
        </button>

        <button
          onClick={() => { onClose(); router.push('/navigatore/traccia') }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-forest-100 text-forest-700 flex items-center justify-center shrink-0">
            <MapPinned className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-sm text-stone-800">Registra senza pianificazione</span>
        </button>

        {entitlement.dtrekActivated ? (
          <button
            onClick={() => { onClose(); router.push(DTREK_HOME_PATH) }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ArrowRight className="w-4.5 h-4.5" />
            </div>
            <span className="font-semibold text-sm text-stone-800">Apri Dtrek — Diario, statistiche, pianificazione</span>
          </button>
        ) : confirmingActivation ? (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
            <p className="text-sm text-stone-700">
              Passerai a Dtrek: diario, statistiche e pianificazione si apriranno direttamente da qui, dentro Navigator. Non si torna indietro.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleActivate}
                disabled={activating}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 disabled:opacity-60"
              >
                {activating ? 'Attivazione…' : 'Conferma'}
              </button>
              <button
                onClick={() => setConfirmingActivation(false)}
                disabled={activating}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-600 font-semibold text-sm hover:bg-stone-100 disabled:opacity-60"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingActivation(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ArrowRight className="w-4.5 h-4.5" />
            </div>
            <span className="font-semibold text-sm text-stone-800">Passa a Dtrek — sblocca guide, diario, statistiche</span>
          </button>
        )}

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left disabled:opacity-50"
        >
          <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <LogOut className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-sm text-stone-800">Esci</span>
        </button>
      </div>
    </Sheet>
  )
}
