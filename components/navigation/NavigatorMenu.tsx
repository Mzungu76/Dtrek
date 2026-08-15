'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { List, MapPinned, Upload, ExternalLink, LogOut } from 'lucide-react'
import Sheet from '@/components/ui/Sheet'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { lsClearAll } from '@/lib/localStore'
import { clearProfile } from '@/lib/userProfile'
import { openMainApp } from '@/lib/native/mainAppLinks'
import { useEntitlement, activateDtrek } from '@/lib/useEntitlement'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * The standalone Navigator app's menu — everything that isn't "navigate right now" lives behind
 * this, reached from the map-first home (app/navigatore/page.tsx). Kept as one small, shared
 * component rather than duplicating this list per screen.
 *
 * Confine Navigator/Dtrek (docs/navigator-dtrek-boundary.md): due icone distinte e complementari,
 * non una che "diventa" l'altra — Navigator non naviga mai la propria WebView dentro una pagina
 * Dtrek, prima o dopo l'attivazione. "Passa a Dtrek" apre sempre il browser di sistema
 * (`openMainApp`), dove chi non l'ha ancora fatto può aggiungere la PWA di Dtrek alla schermata
 * Home (prompt già gestito da web, components/InstallPWA.tsx) — Navigator si limita a segnare
 * che l'account ha compiuto quel passaggio (user_settings.dtrek_activated_at), da cui dipendono
 * il tetto di 1 percorso di Navigator (lib/navigatorSlot.ts) e l'icona "Apri Dtrek" nella barra in
 * alto di app/navigatore/page.tsx.
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
    openMainApp()
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
            onClick={() => { onClose(); openMainApp() }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ExternalLink className="w-4.5 h-4.5" />
            </div>
            <span className="font-semibold text-sm text-stone-800">Apri Dtrek — Diario, statistiche, pianificazione</span>
          </button>
        ) : confirmingActivation ? (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
            <p className="text-sm text-stone-700">
              Passerai a Dtrek nel browser, dove potrai aggiungerlo alla schermata Home se vuoi. Non si torna indietro.
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
              <ExternalLink className="w-4.5 h-4.5" />
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
