// Impostazioni di pubblicazione a livello di Raccolta — supabase/migrations/add_collections_config.sql.
// Guscio minimo attorno a `DiaryPublicSections` (lib/diaryConfig.ts): una Raccolta non ha un
// proprio "libro" da configurare, solo l'unica cosa che ha senso condividere fra tutti i Diari che
// contiene — cosa mostrare sul sito. `null` (mai un oggetto con valori di default) è lo stato
// "nessuna impostazione qui": va distinto da un oggetto valorizzato, perché un Diario dentro una
// Raccolta senza `config` resta autonomo esattamente come prima che questa colonna esistesse.
import { DEFAULT_DIARY_CONFIG, type DiaryPublicSections } from './diaryConfig'

export interface RaccoltaConfig {
  publicSections: DiaryPublicSections
}

export function normalizeRaccoltaConfig(raw: unknown): RaccoltaConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<RaccoltaConfig>
  if (!r.publicSections || typeof r.publicSections !== 'object') return null
  return {
    publicSections: { ...DEFAULT_DIARY_CONFIG.publicSections, ...r.publicSections },
  }
}
