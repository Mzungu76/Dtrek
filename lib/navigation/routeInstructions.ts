import { haversineM } from '@/lib/geoUtils'
import { bearingDeg } from './orientation'
import type { NavInstruction, TurnType } from './types'

const MIN_GAP_BETWEEN_INSTRUCTIONS_M = 60 // ignore noisy back-to-back turns on a wiggly trail
const LOOKBACK_M = 25 // bearing measured over a short local window, not single noisy vertices

function turnTypeForDelta(deltaDeg: number): TurnType {
  const abs = Math.abs(deltaDeg)
  if (abs < 20) return 'straight'
  if (abs < 45) return deltaDeg > 0 ? 'slight-right' : 'slight-left'
  if (abs < 100) return deltaDeg > 0 ? 'right' : 'left'
  return deltaDeg > 0 ? 'sharp-right' : 'sharp-left'
}

const TURN_LABEL: Record<TurnType, string> = {
  start: 'Si parte!',
  straight: 'Prosegui dritto',
  'slight-left': 'Tieni la sinistra',
  left: 'Svolta a sinistra',
  'sharp-left': 'Svolta decisa a sinistra',
  'slight-right': 'Tieni la destra',
  right: 'Svolta a destra',
  'sharp-right': 'Svolta decisa a destra',
  arrive: 'Sei arrivato!',
}

/**
 * Turn-by-turn cues derived purely from the route polyline geometry — no
 * road network to snap to on a trail, so "turns" here just mean a
 * significant bearing change between the incoming and outgoing direction at
 * a point, smoothed over a short lookback/lookahead window to ignore GPS-
 * trace noise. Computed once when a hike is loaded (not per GPS fix); the
 * engine only matches live progress against this precomputed list.
 */
export function buildRouteInstructions(track: [number, number][]): NavInstruction[] {
  if (track.length < 2) return []

  const cumulativeM: number[] = [0]
  for (let i = 1; i < track.length; i++) {
    cumulativeM.push(cumulativeM[i - 1] + haversineM(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1]))
  }
  const totalM = cumulativeM[cumulativeM.length - 1]

  const instructions: NavInstruction[] = [
    { id: 'start', distanceAlongRouteM: 0, turn: 'start', text: TURN_LABEL.start },
  ]
  let lastInstructionM = 0

  for (let i = 1; i < track.length - 1; i++) {
    const here = cumulativeM[i]
    if (here - lastInstructionM < MIN_GAP_BETWEEN_INSTRUCTIONS_M) continue

    // Find a point ~LOOKBACK_M behind and ~LOOKBACK_M ahead to get a de-noised in/out bearing.
    let back = i
    while (back > 0 && here - cumulativeM[back] < LOOKBACK_M) back--
    let ahead = i
    while (ahead < track.length - 1 && cumulativeM[ahead] - here < LOOKBACK_M) ahead++
    if (back === i || ahead === i) continue

    const bearingIn = bearingDeg(track[back][0], track[back][1], track[i][0], track[i][1])
    const bearingOut = bearingDeg(track[i][0], track[i][1], track[ahead][0], track[ahead][1])
    const delta = ((bearingOut - bearingIn + 540) % 360) - 180 // signed, -180..180

    const turn = turnTypeForDelta(delta)
    if (turn === 'straight') continue // only surface actual direction changes, not every wiggle

    instructions.push({
      id: `turn-${i}`,
      distanceAlongRouteM: here,
      turn,
      text: TURN_LABEL[turn],
    })
    lastInstructionM = here
  }

  instructions.push({ id: 'arrive', distanceAlongRouteM: totalM, turn: 'arrive', text: TURN_LABEL.arrive })
  return instructions
}
