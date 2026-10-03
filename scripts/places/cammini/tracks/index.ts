import type { CamminoSpec } from './types'
import { ONDATA_1 } from './ondata-1'
import { ONDATA_2 } from './ondata-2'
import { ONDATA_3 } from './ondata-3'

/** Ondate di import da tracce (una cartella SQL per ondata: supabase/data/cammini-gpx/ondata-N/). */
export const WAVES: Record<number, CamminoSpec[]> = { 1: ONDATA_1, 2: ONDATA_2, 3: ONDATA_3 }
