// Profilo escursionista raccolto dal wizard di onboarding (components/onboarding/OnboardingWizard.tsx)
// e modificabile in components/profilo/SectionProfiloEscursionista.tsx — condiviso con l'endpoint
// di ricerca AI (app/api/route-search/route.ts) che lo usa per scrivere la valutazione di comfort.
// Tutto facoltativo: un utente che salta il wizard ha semplicemente array/valore vuoti.

export type HikerExperienceLevel = 'principiante' | 'intermedio' | 'esperto'

export const EXPERIENCE_LEVELS: { key: HikerExperienceLevel; label: string; description: string }[] = [
  { key: 'principiante', label: 'Principiante', description: 'Cammino qualche volta, preferisco percorsi semplici e ben segnalati.' },
  { key: 'intermedio',   label: 'Intermedio',   description: 'Esco regolarmente, gestisco dislivelli e distanze medie senza problemi.' },
  { key: 'esperto',      label: 'Esperto',      description: 'Uscite frequenti anche impegnative, dislivelli importanti e terreni tecnici.' },
]

export function isHikerExperienceLevel(v: unknown): v is HikerExperienceLevel {
  return v === 'principiante' || v === 'intermedio' || v === 'esperto'
}

// Elenco volutamente ampio: copre limitazioni tipiche sia di escursionisti giovani (poca
// esperienza, gruppi con bambini) sia meno giovani (articolazioni, cuore, orientamento) — vedi
// richiesta esplicita dell'utente di avere "un quadro completo" in fase di implementazione.
export const HIKER_CONCERNS = [
  { key: 'vertigini',        label: 'Soffro di vertigini, evito creste esposte' },
  { key: 'ginocchia',        label: 'Ginocchia/articolazioni delicate in discesa' },
  { key: 'salite_ripide',    label: 'Fatico con salite ripide o dislivelli elevati' },
  { key: 'cuore_pressione',  label: 'Problemi cardiaci o di pressione, evito sforzi intensi prolungati' },
  { key: 'caldo',            label: 'Fatico con il caldo e il sole diretto' },
  { key: 'freddo',           label: 'Fatico con il freddo intenso' },
  { key: 'respiro_quota',    label: 'Asma o difficoltà respiratorie in quota' },
  { key: 'bambini',          label: 'Cammino spesso con bambini piccoli al seguito' },
  { key: 'animali',          label: 'Cammino con il cane' },
  { key: 'orientamento',     label: 'Poca esperienza con l\'orientamento, preferisco sentieri ben segnalati' },
  { key: 'terreno_instabile',label: 'Difficoltà su terreno instabile o molto pietroso' },
  { key: 'insetti',          label: 'Sensibilità a insetti o punture' },
  { key: 'gravidanza',       label: 'Gravidanza o condizione che richiede uno sforzo leggero' },
] as const

export type HikerConcernKey = typeof HIKER_CONCERNS[number]['key']

export function isHikerConcernKey(v: unknown): v is HikerConcernKey {
  return typeof v === 'string' && HIKER_CONCERNS.some(c => c.key === v)
}

export function sanitizeHikerConcerns(v: unknown): HikerConcernKey[] {
  if (!Array.isArray(v)) return []
  return v.filter(isHikerConcernKey)
}

export const HIKER_ENVIRONMENT_PREFS = [
  { key: 'ombra',      label: 'Ombra nei mesi caldi' },
  { key: 'acqua',      label: 'Vicino all\'acqua per rinfrescarsi' },
  { key: 'poca_folla', label: 'Evito la folla nei weekend' },
  { key: 'cani',       label: 'Percorsi adatti a cani' },
  { key: 'bambini',    label: 'Percorsi adatti a bambini' },
] as const

export type HikerEnvironmentPrefKey = typeof HIKER_ENVIRONMENT_PREFS[number]['key']

export function isHikerEnvironmentPrefKey(v: unknown): v is HikerEnvironmentPrefKey {
  return typeof v === 'string' && HIKER_ENVIRONMENT_PREFS.some(p => p.key === v)
}

export function sanitizeHikerEnvironmentPrefs(v: unknown): HikerEnvironmentPrefKey[] {
  if (!Array.isArray(v)) return []
  return v.filter(isHikerEnvironmentPrefKey)
}

export function concernLabel(key: string): string {
  return HIKER_CONCERNS.find(c => c.key === key)?.label ?? key
}

export function environmentPrefLabel(key: string): string {
  return HIKER_ENVIRONMENT_PREFS.find(p => p.key === key)?.label ?? key
}
