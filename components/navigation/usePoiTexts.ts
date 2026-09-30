'use client'
import { useEffect, useState } from 'react'
import { loadPoiTexts } from '@/lib/offline/poiTextStore'

/** Testi estesi per POI salvati sul dispositivo allo scarico del pacchetto offline (guida +
 *  Wikipedia). Vuoto se il pacchetto non è stato scaricato: i chiamanti ricadono sul calcolo al volo. */
export function usePoiTexts(hikeId: string): Map<number, string> {
  const [texts, setTexts] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    let cancelled = false
    loadPoiTexts(hikeId).then((m) => { if (!cancelled && m) setTexts(m) }).catch(() => {})
    return () => { cancelled = true }
  }, [hikeId])
  return texts
}
