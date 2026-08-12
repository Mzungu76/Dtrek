import { Capacitor } from '@capacitor/core'
import { AdaptiveGpsTracker } from '@/lib/navigation/gpsTracker'
import type { GeoFix } from '@/lib/navigation/types'
import NativeLocation, { type NativeFix, type NativeLocationMode } from './nativeLocationPlugin'

export type LocationMode = NativeLocationMode

/** Mirrors GeolocationPositionError's shape so existing handlers (NavigationEngine.handleGpsError checks `err?.code === 1`) don't need to special-case which source produced the error. */
export interface LocationSourceError {
  code: 1 | 2 | 3 // 1 = permission denied, 2 = position unavailable, 3 = timeout
  message: string
}

/**
 * The contract NavigationEngine actually depends on — never the Android/
 * Capacitor plugin or `navigator.geolocation` directly. `LocationSource`
 * below is the real (native/web) implementation; lib/navigation/simulation/
 * simulationLocationProvider.ts is a second implementation (GPX replay,
 * scripted scenarios) that NavigationEngine can't tell apart from the real
 * one — same reasoning as the pure/mockable/replayable design already
 * documented on NavigationEngine itself, just formalized as a type so a
 * caller can swap the source in without reaching into the engine's
 * internals.
 */
export interface LocationProvider {
  start(mode?: LocationMode): Promise<void>
  stop(): void
  setMode(mode: LocationMode): Promise<void>
  catchUp(): Promise<void>
}

/** Constructs a LocationProvider already wired to the given callbacks — NavigationEngine calls this once, at construction, instead of hard-coding `new LocationSource(...)` itself. */
export type LocationProviderFactory = (
  onFix: (fix: GeoFix) => void,
  onError: (err: LocationSourceError) => void,
) => LocationProvider

function nativeFixToGeoFix(fix: NativeFix): GeoFix {
  return {
    lat: fix.latitude,
    lon: fix.longitude,
    altitudeM: fix.altitude ?? null,
    accuracyM: fix.accuracy ?? null,
    speedMs: fix.speed ?? null,
    ts: fix.timestamp,
    bearingDeg: fix.bearing ?? null,
    verticalAccuracyM: fix.verticalAccuracy ?? null,
    speedAccuracyMs: fix.speedAccuracy ?? null,
    source: 'native',
    mock: fix.mock ?? false,
  }
}

/**
 * Unifies the native Android Location Engine (Capacitor plugin backed by a
 * foreground service — keeps acquiring fixes with the screen off, the app
 * backgrounded, or the WebView suspended) and the plain
 * `navigator.geolocation` fallback (desktop browsers, iOS Safari, and the
 * web PWA running outside the Capacitor shell) behind a single interface.
 * Callers (NavigationEngine) only ever see GeoFix events — which Location
 * Engine produced them is an implementation detail, not something the
 * Navigation/Position Engines above this needs to branch on. This is the
 * "Capacitor Bridge → Native Location Service" boundary from spec §14.
 */
export class LocationSource implements LocationProvider {
  private webTracker: AdaptiveGpsTracker | null = null
  private nativeListenerHandles: Array<{ remove: () => void }> = []
  private readonly isNative: boolean

  constructor(
    private readonly onFix: (fix: GeoFix) => void,
    private readonly onError: (err: LocationSourceError) => void,
  ) {
    this.isNative = Capacitor.isNativePlatform()
  }

  async start(mode: LocationMode = 'trekking'): Promise<void> {
    if (this.isNative) {
      await this.startNative(mode)
    } else {
      this.startWeb()
    }
  }

  stop(): void {
    if (this.isNative) {
      NativeLocation.stop().catch(() => {})
      this.nativeListenerHandles.forEach((h) => h.remove())
      this.nativeListenerHandles = []
    } else {
      this.webTracker?.stop()
      this.webTracker = null
    }
  }

  /** No-op on web — AdaptiveGpsTracker already self-throttles by observed speed. Battery-aware profiles (spec §12) only change anything through the native service. */
  async setMode(mode: LocationMode): Promise<void> {
    if (this.isNative) await NativeLocation.setMode({ mode }).catch(() => {})
  }

  /**
   * Replays fixes the native service buffered while nothing was listening
   * (WebView paused/killed and later resumed) — the resume/catch-up path
   * required by spec §13. Call this when the app/tab regains visibility.
   * No-op on web: a suspended tab can't buffer anything to replay.
   */
  async catchUp(): Promise<void> {
    if (!this.isNative) return
    try {
      const { fixes } = await NativeLocation.getPendingFixes()
      for (const fix of fixes) this.onFix(nativeFixToGeoFix(fix))
    } catch {
      // Best-effort: a failed catch-up just means we resume from the next live fix instead.
    }
  }

  private async startNative(mode: LocationMode): Promise<void> {
    const perms = await NativeLocation.checkPermissions().catch(() => null)
    if (!perms || perms.location !== 'granted') {
      const requested = await NativeLocation.requestPermissions().catch(() => null)
      if (!requested || requested.location !== 'granted') {
        this.onError({ code: 1, message: 'Location permission denied' })
        return
      }
    }

    const fixHandle = await NativeLocation.addListener('fix', (fix) => this.onFix(nativeFixToGeoFix(fix)))
    const errorHandle = await NativeLocation.addListener('error', (err) => this.onError({ code: 2, message: err.message }))
    this.nativeListenerHandles = [fixHandle, errorHandle]

    try {
      await NativeLocation.start({ mode })
    } catch (e) {
      this.onError({ code: 2, message: e instanceof Error ? e.message : 'Failed to start native location' })
    }
  }

  private startWeb(): void {
    this.webTracker = new AdaptiveGpsTracker(
      (fix) => this.onFix({ ...fix, source: 'web' }),
      (err) => this.onError({ code: (err.code as 1 | 2 | 3) ?? 2, message: err.message }),
    )
    this.webTracker.start()
  }
}
