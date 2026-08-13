'use client'
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { fetchOnce } from '@/lib/sessionCache'
import Sheet from '@/components/ui/Sheet'
import UnlockedStatusPanel from './UnlockedStatusPanel'
import UpgradeChoicePanel from './UpgradeChoicePanel'

interface EntitlementState {
  unlocked: boolean | null // null = ancora in caricamento, o utente anonimo (401) — badge nascosto
  trialActive: boolean
  trialExpired: boolean
  trialDaysLeft: number
}

function useEntitlement(): EntitlementState {
  const [state, setState] = useState<EntitlementState>({ unlocked: null, trialActive: false, trialExpired: false, trialDaysLeft: 0 })

  useEffect(() => {
    let cancelled = false
    fetchOnce('dtrek-entitlement', () =>
      fetch('/api/dtrek-entitlement').then(r => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      }),
    )
      .then(d => { if (!cancelled) setState({ unlocked: !!d.unlocked, trialActive: !!d.trialActive, trialExpired: !!d.trialExpired, trialDaysLeft: d.trialDaysLeft ?? 0 }) })
      .catch(() => { /* anonimo o rete assente — resta null, badge nascosto */ })
    return () => { cancelled = true }
  }, [])

  return state
}

interface Props {
  variant: 'desktop' | 'mobile'
}

/**
 * Icona/pillola persistente in Navbar (docs/navigator-dtrek-boundary.md) — stesso trattamento
 * riservato all'avatar del Profilo: sempre visibile, un tap apre un pannello senza lasciare la
 * pagina in cui ci si trova. Mostra lo stato anche a chi è già sbloccato (non sparisce dopo
 * l'acquisto), per raggiungere in fretta la gestione dell'abbonamento quando serve.
 */
export default function PremiumBadge({ variant }: Props) {
  const [open, setOpen] = useState(false)
  const entitlement = useEntitlement()

  if (entitlement.unlocked === null) return null

  const { unlocked } = entitlement

  return (
    <>
      {variant === 'desktop' ? (
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            unlocked ? 'text-forest-700 hover:bg-forest-50' : 'text-amber-700 hover:bg-amber-50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>{unlocked ? 'Premium' : 'Sblocca'}</span>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          title={unlocked ? 'Premium' : 'Sblocca Dtrek'}
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.2)] ${
            unlocked ? 'bg-forest-900/95 text-forest-200' : 'bg-amber-500/95 text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={unlocked ? 'Il tuo accesso' : 'Sblocca Dtrek'}>
        {unlocked ? (
          <UnlockedStatusPanel compact />
        ) : (
          <>
            {(entitlement.trialActive || entitlement.trialExpired) && (
              <p className="text-sm text-stone-500 mb-4">
                {entitlement.trialExpired
                  ? 'Il periodo di prova gratuito è terminato.'
                  : `Prova gratuita — ancora ${entitlement.trialDaysLeft} ${entitlement.trialDaysLeft === 1 ? 'giorno' : 'giorni'}.`}
              </p>
            )}
            <UpgradeChoicePanel compact />
          </>
        )}
      </Sheet>
    </>
  )
}
