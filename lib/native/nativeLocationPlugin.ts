import { registerPlugin } from '@capacitor/core'

/**
 * TS surface of the Android `NativeLocation` Capacitor plugin
 * (android/app/src/main/java/com/dtrek/app/nativelocation). Only exists on
 * native platforms — on web `registerPlugin` returns a proxy whose methods
 * reject, which is why nothing outside `lib/native/locationSource.ts`
 * should import this directly (see that file for the web-safe facade).
 */
export type NativeLocationMode = 'battery_save' | 'trekking' | 'navigation' | 'emergency'

export interface NativeFix {
  latitude: number
  longitude: number
  altitude?: number
  accuracy?: number
  verticalAccuracy?: number
  speed?: number
  speedAccuracy?: number
  bearing?: number
  bearingAccuracy?: number
  timestamp: number
  provider?: string
  mock?: boolean
}

export type NativePermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

export interface NativeLocationPermissionStatus {
  location: NativePermissionState
  backgroundLocation: NativePermissionState
  notifications: NativePermissionState
}

export interface NativeLocationStatus {
  isRunning: boolean
  mode: NativeLocationMode
  sessionId: string | null
}

export interface NativeLocationPlugin {
  checkPermissions(): Promise<NativeLocationPermissionStatus>
  /** Requests only foreground (fine/coarse) location — Android 10+ rejects a combined foreground+background prompt. */
  requestPermissions(): Promise<NativeLocationPermissionStatus>
  /** Separate follow-up step, per Android's own two-request requirement; call after explaining to the user why background tracking is needed. */
  requestBackgroundLocationPermission(): Promise<NativeLocationPermissionStatus>
  start(options: { mode: NativeLocationMode; sessionId?: string }): Promise<{ sessionId: string }>
  setMode(options: { mode: NativeLocationMode }): Promise<void>
  stop(): Promise<void>
  getStatus(): Promise<NativeLocationStatus>
  getLastFix(): Promise<{ fix: NativeFix | null }>
  /** Drains fixes recorded while no listener was attached (WebView suspended/killed mid-hike). */
  getPendingFixes(): Promise<{ fixes: NativeFix[] }>
  addListener(eventName: 'fix', listenerFunc: (fix: NativeFix) => void): Promise<{ remove: () => void }>
  addListener(eventName: 'error', listenerFunc: (err: { message: string }) => void): Promise<{ remove: () => void }>
  removeAllListeners(): Promise<void>
}

const NativeLocation = registerPlugin<NativeLocationPlugin>('NativeLocation')

export default NativeLocation
