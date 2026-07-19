'use client'
import { createContext, useContext } from 'react'

// Permette a Formula/Tip/Note in guideContent.tsx di adattare i propri colori a seconda di dove
// InfoPanel li monta: schede chiare in /statistiche (default) o in sovraimpressione scura su foto
// in Bacheca — senza dover duplicare i contenuti per i due contesti.
export type GuideTheme = 'light' | 'dark'

export const GuideThemeContext = createContext<GuideTheme>('light')

export function useGuideTheme(): GuideTheme {
  return useContext(GuideThemeContext)
}
