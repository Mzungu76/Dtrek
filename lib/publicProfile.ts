// Lettura pubblica (non autenticata) del profilo di un utente — Fase 3 del piano di pubblicazione
// (docs/raccolte-pubblicazione-piano.md): non un quarto documento pubblicato, ma l'INDICE di ciò
// che l'utente ha già reso pubblico ai tre livelli esistenti (Raccolta/Diario/Reportage, ciascuno
// con il proprio token indipendente). Niente qui decide cosa è pubblico — legge solo cosa lo è già.
import { supabase } from './supabase'
import { normalizeSlug } from './profileSlug'

export interface PublicProfileCollection {
  token: string
  title: string
  subtitle: string
  coverUrl: string | null
}
export interface PublicProfileDiary {
  token: string
  title: string
  subtitle: string
  coverUrl: string | null
}
export interface PublicProfileReport {
  token: string
  title: string
  createdAt: string
}

export interface PublicProfile {
  displayName: string
  collections: PublicProfileCollection[]
  diaries: PublicProfileDiary[]
  reports: PublicProfileReport[]
}

export async function fetchPublicProfile(rawSlug: string): Promise<PublicProfile | null> {
  const slug = normalizeSlug(rawSlug)
  if (!slug) return null

  const { data: settings } = await supabase
    .from('user_settings')
    .select('user_id, display_name, profile_enabled')
    .eq('profile_slug', slug)
    .maybeSingle()
  if (!settings || !settings.profile_enabled) return null

  const userId = settings.user_id as string

  // Ogni livello resta indipendente (docs/raccolte-pubblicazione-piano.md: "pubblicare una
  // raccolta NON pubblica i Diari singoli") — qui si elenca semplicemente tutto ciò che ha GIÀ un
  // proprio token, senza dedurre appartenenza o dedurre esclusioni fra un livello e l'altro.
  const [{ data: collections }, { data: diaries }, { data: reports }] = await Promise.all([
    supabase.from('collections').select('title, subtitle, cover_url, share_token, position')
      .eq('user_id', userId).not('share_token', 'is', null).order('position', { ascending: true }),
    supabase.from('diaries').select('title, subtitle, cover_url, share_token')
      .eq('user_id', userId).not('share_token', 'is', null).order('title', { ascending: true }),
    supabase.from('hike_reports').select('title, share_token, created_at')
      .eq('user_id', userId).not('share_token', 'is', null).order('created_at', { ascending: false }),
  ])

  return {
    displayName: (settings.display_name as string) || 'Escursionista',
    collections: (collections ?? []).map(c => ({
      token: c.share_token as string, title: c.title as string,
      subtitle: (c.subtitle as string) ?? '', coverUrl: (c.cover_url as string) ?? null,
    })),
    diaries: (diaries ?? []).map(d => ({
      token: d.share_token as string, title: d.title as string,
      subtitle: (d.subtitle as string) ?? '', coverUrl: (d.cover_url as string) ?? null,
    })),
    reports: (reports ?? []).map(r => ({
      token: r.share_token as string, title: (r.title as string) || 'Escursione',
      createdAt: r.created_at as string,
    })),
  }
}
