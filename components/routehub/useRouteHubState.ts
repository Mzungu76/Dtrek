import { useReducer } from 'react'
import type { SectionKind } from './types'

export interface RouteHubState {
  index: number
  dragging: boolean
  dragDeltaPx: number
  /** Non-null ⇒ Screen 2 (RoutePage) is open, showing this tab. */
  openSection: SectionKind | null
  /** True only right after a RESYNC_INDEX — RouteCarousel skips its slide transition for that
   *  one render, since the route on screen hasn't actually changed (same id, just relocated in
   *  the sorted list), so animating a slide through every route in between would be wrong. */
  instant: boolean
}

export type RouteHubAction =
  | { type: 'DRAG_START' }
  | { type: 'DRAG_MOVE'; deltaPx: number }
  | { type: 'DRAG_END'; count: number }
  | { type: 'JUMP_TO'; index: number }
  /** Silent counterpart to JUMP_TO — re-derived index after `visibleItems` reorders under the
   *  currently-viewed route (e.g. its own Trail Score settling while sorted by TS). Unlike
   *  JUMP_TO it neither animates the carousel nor closes an open Screen 2, since nothing the
   *  user is looking at actually changed. */
  | { type: 'RESYNC_INDEX'; index: number }
  | { type: 'OPEN_SECTION'; section: SectionKind }
  | { type: 'SELECT_TAB'; section: SectionKind }
  | { type: 'CLOSE_SECTION' }

function clampIndex(i: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i))
}

function reducer(state: RouteHubState, action: RouteHubAction): RouteHubState {
  switch (action.type) {
    case 'DRAG_START':
      return { ...state, dragging: true, dragDeltaPx: 0, instant: false }
    case 'DRAG_MOVE':
      return state.dragging ? { ...state, dragDeltaPx: action.deltaPx } : state
    case 'DRAG_END': {
      const SNAP_THRESHOLD_PX = 60
      let next = state.index
      if (state.dragDeltaPx < -SNAP_THRESHOLD_PX) next = clampIndex(state.index + 1, action.count)
      else if (state.dragDeltaPx > SNAP_THRESHOLD_PX) next = clampIndex(state.index - 1, action.count)
      return { ...state, dragging: false, dragDeltaPx: 0, index: next, instant: false }
    }
    case 'JUMP_TO':
      return { ...state, index: action.index, openSection: null, instant: false }
    case 'RESYNC_INDEX':
      return { ...state, index: action.index, instant: true }
    case 'OPEN_SECTION':
      return { ...state, openSection: action.section }
    case 'SELECT_TAB':
      return { ...state, openSection: action.section }
    case 'CLOSE_SECTION':
      return { ...state, openSection: null }
    default:
      return state
  }
}

export function useRouteHubState(initialIndex: number) {
  return useReducer(reducer, {
    index: initialIndex,
    dragging: false,
    dragDeltaPx: 0,
    openSection: null,
    instant: false,
  })
}
