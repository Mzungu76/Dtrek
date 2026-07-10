'use client'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Loader2, Search, Crosshair, AlertTriangle, Trash2 } from 'lucide-react'
import { invalidateUserStartingPoint } from '@/lib/drivingInfo'
import { getUserSettingsCached, updateUserSettings } from '@/lib/sync/userSettingsStore'

const LocationPickerMap = dynamic(() => import('@/components/LocationPickerMap'), { ssr: false })

interface GeocodeResult {
  display_name: string
  lat: string
  lon: string
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept': 'application/json' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    return data?.display_name ?? null
  } catch {
    return null
  }
}

async function geocodeAddress(q: string): Promise<GeocodeResult[]> {
  // Query Nominatim directly from the browser first — more reliable than routing through
  // our server, since Nominatim's usage policy throttles/blocks many cloud/server IPs
  // (including typical Vercel deployments), while direct browser requests are unaffected
  // and Nominatim's public instance allows CORS.
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`,
      { headers: { 'Accept': 'application/json' } },
    )
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) return data
    }
  } catch {}
  // Fallback to our own server-side proxy (edge route) in case the direct call is blocked
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** Indirizzo di partenza per il calcolo di distanza/tempo di guida. Piano di ristrutturazione, Parte 2.4. */
export default function SectionIndirizzo() {
  const [address,   setAddress]   = useState('')
  const [savedAddr, setSavedAddr] = useState<string | null>(null)
  const [coords,    setCoords]    = useState<{ lat: number; lon: number } | null>(null)
  const [results,   setResults]   = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched,  setSearched]  = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [status,    setStatus]    = useState<{ ok: boolean; msg: string } | null>(null)
  const [showMap,   setShowMap]   = useState(false)
  const [reverseLoading, setReverseLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getUserSettingsCached()
      .then(d => {
        if (d.startingAddress) { setAddress(d.startingAddress); setSavedAddr(d.startingAddress) }
        if (d.startingLat != null && d.startingLon != null) setCoords({ lat: d.startingLat, lon: d.startingLon })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function runSearch(v: string) {
    if (v.trim().length < 3) { setResults([]); setSearched(false); return }
    setSearching(true); setSearched(false)
    const found = await geocodeAddress(v.trim())
    setResults(found)
    setSearching(false)
    setSearched(true)
  }

  function handleInput(v: string) {
    setAddress(v)
    setStatus(null)
    setCoords(null)
    setSearched(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 3) { setResults([]); return }
    debounceRef.current = setTimeout(() => runSearch(v), 500)
  }

  function selectResult(r: GeocodeResult) {
    setAddress(r.display_name)
    setCoords({ lat: parseFloat(r.lat), lon: parseFloat(r.lon) })
    setResults([])
    setSearched(false)
    setShowMap(false)
  }

  async function handleMapPick(lat: number, lon: number) {
    setCoords({ lat, lon })
    setStatus(null)
    // Best-effort: se il campo indirizzo è vuoto, prova a compilarlo automaticamente
    // col nome del luogo selezionato (reverse geocoding); se fallisce non blocca nulla,
    // le coordinate sono comunque già salvate e sufficienti per i calcoli.
    if (!address.trim()) {
      setReverseLoading(true)
      const name = await reverseGeocode(lat, lon)
      setReverseLoading(false)
      if (name) setAddress(name)
    }
  }

  async function handleSave() {
    if (!address.trim() && !coords) {
      setStatus({ ok: false, msg: 'Inserisci un indirizzo o seleziona un punto sulla mappa.' })
      return
    }
    setSaving(true); setStatus(null)
    await updateUserSettings({
      startingAddress: address.trim() || null,
      startingLat: coords?.lat ?? null,
      startingLon: coords?.lon ?? null,
    })
    setSaving(false)
    setSavedAddr(address)
    // Senza questo, ogni schermata che ha già chiamato getUserStartingPoint() in questa
    // sessione (gallerie Guida/Resoconto) continuerebbe a usare il vecchio indirizzo finché
    // non si ricarica la pagina — vedi lib/drivingInfo.ts.
    invalidateUserStartingPoint()
    setStatus({
      ok: true,
      msg: coords
        ? 'Indirizzo di partenza salvato.'
        : 'Indirizzo salvato, ma senza posizione geografica: distanza e tempo di guida non saranno calcolati finché non selezioni un punto sulla mappa.',
    })
  }

  async function handleClear() {
    setSaving(true); setStatus(null)
    await updateUserSettings({ startingAddress: null, startingLat: null, startingLon: null })
    setSaving(false)
    setAddress(''); setSavedAddr(null); setCoords(null); setShowMap(false)
    invalidateUserStartingPoint()
    setStatus({ ok: true, msg: 'Indirizzo rimosso.' })
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-3">
      <div className="flex items-center gap-2.5">
        <MapPin className="w-5 h-5 text-forest-600 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Indirizzo di partenza</h2>
          <p className="text-xs text-stone-400">Da dove parti di solito per le tue escursioni (in auto)</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : (
        <>
          <div className="relative">
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={address}
                  onChange={e => handleInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (debounceRef.current) clearTimeout(debounceRef.current); runSearch(address) } }}
                  placeholder="es. Via Roma 1, Milano"
                  className="w-full rounded-lg border border-stone-300 pl-3 pr-9 py-2.5 text-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </span>
              </div>
              <button
                type="button"
                onClick={() => { if (debounceRef.current) clearTimeout(debounceRef.current); runSearch(address) }}
                disabled={searching || address.trim().length < 3}
                className="shrink-0 px-3 py-2.5 rounded-lg border border-stone-300 text-stone-600 hover:border-forest-400 hover:text-forest-700 disabled:opacity-40 text-xs font-medium transition"
              >
                Cerca
              </button>
            </div>
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-stone-200 shadow-lg overflow-hidden">
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => selectResult(r)}
                    className="w-full text-left px-3 py-2 text-xs text-stone-600 hover:bg-forest-50 transition-colors border-b border-stone-100 last:border-0"
                  >
                    {r.display_name}
                  </button>
                ))}
              </div>
            )}
            {!searching && searched && results.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600">
                Nessun indirizzo trovato. Prova con un formato più semplice (es. solo via e città, senza numero civico), oppure{' '}
                <button type="button" onClick={() => setShowMap(true)} className="underline font-medium hover:text-amber-700">
                  indica il punto direttamente sulla mappa
                </button>.
              </p>
            )}
          </div>

          {!showMap && (
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="flex items-center gap-1.5 text-xs text-forest-600 hover:text-forest-700 font-medium"
            >
              <Crosshair className="w-3.5 h-3.5" />
              {coords ? 'Correggi il punto sulla mappa' : 'Non trovi il tuo indirizzo? Selezionalo sulla mappa'}
            </button>
          )}

          {showMap && (
            <div className="space-y-2">
              <p className="text-xs text-stone-500">
                Clicca sulla mappa (o trascina il segnaposto) nel punto esatto da cui parti di solito.
              </p>
              <LocationPickerMap
                lat={coords?.lat}
                lon={coords?.lon}
                onPick={handleMapPick}
              />
              <div className="flex items-center justify-between">
                {reverseLoading ? (
                  <span className="flex items-center gap-1.5 text-xs text-stone-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Recupero nome del luogo…
                  </span>
                ) : coords ? (
                  <span className="text-xs text-forest-600 font-medium">✓ Punto selezionato ({coords.lat.toFixed(5)}, {coords.lon.toFixed(5)})</span>
                ) : <span />}
                <button type="button" onClick={() => setShowMap(false)} className="text-xs text-stone-400 hover:text-stone-600">
                  Chiudi mappa
                </button>
              </div>
            </div>
          )}

          {address.trim() && !coords && !showMap && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Nessuna posizione geografica associata a questo indirizzo: distanza e tempo di guida non verranno calcolati finché non selezioni un punto sulla mappa o un suggerimento dalla ricerca.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || (!address.trim() && !coords)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salva indirizzo
            </button>
            {savedAddr && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Rimuovi
              </button>
            )}
          </div>
        </>
      )}

      {status && (
        <p className={`text-xs font-medium ${status.ok ? 'text-forest-600' : 'text-red-600'}`}>
          {status.ok ? '✓ ' : '✗ '}{status.msg}
        </p>
      )}
    </div>
  )
}
