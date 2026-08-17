'use client'
import { useEffect } from 'react'
import { pushBackHandler } from './backHandlerStack'

/**
 * Registra `onClose` come bersaglio del tasto/gesto indietro hardware finché `active` è vero —
 * vedi backHandlerStack.ts e NavigatorBackHandler.tsx. Ogni pannello/popup modale che può
 * restare aperto mentre l'utente preme indietro deve chiamarlo, altrimenti quel tocco scavalca
 * il pannello (vedi il commento in backHandlerStack.ts per il caso peggiore osservato).
 */
export function useModalBackHandler(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    return pushBackHandler(onClose)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
