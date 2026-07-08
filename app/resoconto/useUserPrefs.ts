'use client'
import { useEffect, useState } from 'react'

export interface UserPrefs {
  prefsLoaded: boolean
  prefSforzo: number
  prefDurata: number
  hrRest: number | undefined
  hrMax: number | undefined
}

export function useUserPrefs(): UserPrefs {
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [prefSforzo,  setPrefSforzo]  = useState(50)
  const [prefDurata,  setPrefDurata]  = useState(270)
  const [hrRest,      setHrRest]      = useState<number | undefined>(undefined)
  const [hrMax,       setHrMax]       = useState<number | undefined>(undefined)

  useEffect(() => {
    fetch('/api/user-settings').then(r => r.json()).then(d => {
      if (d.prefSforzo != null) setPrefSforzo(d.prefSforzo)
      if (d.prefDurata != null) setPrefDurata(d.prefDurata)
      if (d.hrRest != null) setHrRest(d.hrRest)
      if (d.hrMax != null) setHrMax(d.hrMax)
    }).catch(() => {}).finally(() => setPrefsLoaded(true))
  }, [])

  return { prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax }
}
