import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { MetaType, SiteType } from '@/lib/metaTypes'
import type { SafetyPreview } from '@/components/TrailScoreGaugeBadge'
import type { SafetyScore } from '@/lib/safetyScore'

export const dynamic = 'force-dynamic'

export interface AllPercorsiRow {
  id: string
  title: string
  distanceMeters: number
  elevationGain: number
  altitudeMax: number
  estimatedTimeSeconds: number
  routePolyline?: [number, number][]
  createdAt: string
  firstCompletedAt: string | null
  /** 'YYYY-MM-DD' (colonna DATE), null se non programmata — usata dalla card "prossima uscita"
   *  di /diari (lib/diari/prossimaUscita.ts) per scegliere la Meta con la data più vicina. */
  plannedDate: string | null
  diaryId: string | null
  diaryTitle: string | null
  reportageCount: number
  pubblicabile: boolean
  /** planned_hikes.cached_ts_total — già cachato, nessun ricalcolo qui (stessa convenzione di
   *  sola lettura di app/api/diaries/[id]/route.ts). */
  trailScore: number | null
  /** planned_hikes.cached_safety_score — colora l'anello esterno del badge Trail Score
   *  (TrailScoreGaugeBadge, prop `safety`); già cachato, nessun ricalcolo qui. null quando la
   *  Meta non ha ancora una Sicurezza Oggettiva calcolata (mai un colore/etichetta fabbricati). */
  safety: SafetyPreview | null
  favorite: boolean
  metaType: MetaType
  /** Valorizzato solo quando metaType === 'sito' (lib/metaTypes.ts), come su planned_hikes. */
  siteType: SiteType | null
  /** planned_hikes.place_id — presente solo per una Meta borgo_citta/sito collegata a un catalogo
   *  dtrek_places (piano §25/§26, migration add_planned_hikes_place_link.sql). Un sentiero non lo
   *  valorizza mai: la sua posizione resta la traccia, non un punto di catalogo. */
  placeId: string | null
  /** Posizione della Meta per la carta (Fase 3 del piano di restyling). Per un sentiero deriva dal
   *  primo punto della sua routePolyline (nessuna colonna nuova, la traccia È già la posizione);
   *  per borgo_citta/sito viene da planned_hikes.latitude/longitude (piano §25/§26) — mai
   *  fabbricata: assente se davvero manca. */
  latitude: number | null
  longitude: number | null
  /** Comune/regione e immagine di copertina della Meta, letti da dtrek_places via place_id — solo
   *  per una Meta borgo_citta/sito collegata al catalogo. Un sentiero non ha mai queste colonne. */
  municipality: string | null
  region: string | null
  imageUrl: string | null
}

/** planned_hikes.cached_safety_score è l'oggetto SafetyScore intero (5 categorie + overall/label/
 *  color, lib/safetyScore.ts) — il badge in elenco vuole solo il sottoinsieme SafetyPreview
 *  (overall/color/label) che colora l'anello, non le categorie di dettaglio. */
function toSafetyPreview(score: SafetyScore | null | undefined): SafetyPreview | null {
  if (score == null) return null
  return { overall: score.overall, color: score.color, label: score.label }
}

// GET /api/percorsi → "Tutti i Percorsi" — Fase 5 di docs/diario-fulcro-piano.md. Vista trasversale
// di sola consultazione su tutti i Diari dell'utente, ciascun Percorso con l'etichetta del Diario
// di provenienza — non sostituisce app/diari/[id] (che resta il modo di lavorare dentro UN Diario),
// serve a ritrovare un Percorso senza ricordare in quale Diario l'avevi messo.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: planned, error: plannedErr } = await supabase
      .from('planned_hikes')
      .select('id, title, distance_meters, elevation_gain, altitude_max, estimated_time_seconds, route_polyline, created_at, first_completed_at, planned_date, diary_id, archived_at, cached_ts_total, cached_safety_score, favorite, meta_type, site_type, place_id, latitude, longitude')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    if (plannedErr) throw plannedErr

    const { data: diaries, error: diariesErr } = await supabase
      .from('diaries')
      .select('id, title')
      .eq('user_id', user.id)
    if (diariesErr) throw diariesErr
    const diaryTitleById = new Map((diaries ?? []).map(d => [d.id as string, d.title as string]))

    const { data: activities, error: activitiesErr } = await supabase
      .from('activities')
      .select('linked_planned_id')
      .eq('user_id', user.id)
      .not('linked_planned_id', 'is', null)
    if (activitiesErr) throw activitiesErr

    const reportageCounts = new Map<string, number>()
    for (const a of activities ?? []) {
      const id = a.linked_planned_id as string
      reportageCounts.set(id, (reportageCounts.get(id) ?? 0) + 1)
    }

    // Comune/regione/immagine — solo per le Mete borgo_citta/sito collegate a dtrek_places
    // (place_id): un sentiero non ha mai una riga di catalogo, quindi non finisce mai in questa
    // query. Una sola SELECT batch invece di una per riga (place_id è tipicamente <10 su questa
    // vista utente).
    const placeIds = Array.from(new Set((planned ?? [])
      .map(p => p.place_id as string | null)
      .filter((id): id is string => id != null)))
    const placeById = new Map<string, { municipality: string | null; region: string | null; image_url: string | null }>()
    if (placeIds.length > 0) {
      const { data: places, error: placesErr } = await supabase
        .from('dtrek_places')
        .select('id, municipality, region, image_url')
        .in('id', placeIds)
      if (placesErr) throw placesErr
      for (const pl of places ?? []) {
        placeById.set(pl.id as string, {
          municipality: pl.municipality as string | null,
          region:       pl.region as string | null,
          image_url:    pl.image_url as string | null,
        })
      }
    }

    const rows: AllPercorsiRow[] = (planned ?? []).map(p => {
      const reportageCount = reportageCounts.get(p.id as string) ?? 0
      const diaryId = (p.diary_id as string) ?? null
      const routePolyline = p.route_polyline as [number, number][] | undefined
      const placeId = (p.place_id as string | null) ?? null
      const place = placeId ? placeById.get(placeId) : undefined
      // Un sentiero non ha latitude/longitude in colonna (mai valorizzate per quella tipologia,
      // vedi la migration) — la sua posizione è il primo punto della traccia, quando c'è. Per
      // borgo_citta/sito la colonna è la fonte diretta; mai un fallback fabbricato se manca.
      const columnLat = p.latitude as number | null
      const columnLon = p.longitude as number | null
      const trackStart = routePolyline && routePolyline.length > 0 ? routePolyline[0] : null
      return {
        id:                    p.id as string,
        title:                 p.title as string,
        distanceMeters:        p.distance_meters as number,
        elevationGain:         p.elevation_gain as number,
        altitudeMax:           p.altitude_max as number,
        estimatedTimeSeconds:  p.estimated_time_seconds as number,
        routePolyline,
        createdAt:             p.created_at as string,
        firstCompletedAt:      p.first_completed_at as string | null,
        plannedDate:           p.planned_date as string | null,
        diaryId,
        diaryTitle:            diaryId ? (diaryTitleById.get(diaryId) ?? null) : null,
        reportageCount,
        pubblicabile:          reportageCount > 0,
        trailScore:            (p.cached_ts_total as number | null) ?? null,
        safety:                toSafetyPreview(p.cached_safety_score as SafetyScore | null | undefined),
        favorite:              (p.favorite as boolean | null) ?? false,
        metaType:              (p.meta_type as MetaType) ?? 'sentiero',
        siteType:              (p.site_type as SiteType | null) ?? null,
        placeId,
        latitude:              columnLat ?? (trackStart ? trackStart[0] : null),
        longitude:             columnLon ?? (trackStart ? trackStart[1] : null),
        municipality:          place?.municipality ?? null,
        region:                place?.region ?? null,
        imageUrl:              place?.image_url ?? null,
      }
    })

    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
