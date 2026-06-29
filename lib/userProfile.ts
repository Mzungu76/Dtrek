const KEY = 'dtrek_user_profile'

export interface UserProfile {
  hikerFaceDataUrl?: string   // base64 data URL
  displayName?:     string
}

export function getProfile(): UserProfile {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

export function saveProfile(patch: Partial<UserProfile>): void {
  const current = getProfile()
  localStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dtrek:profile-updated', { detail: patch }))
  }
}
