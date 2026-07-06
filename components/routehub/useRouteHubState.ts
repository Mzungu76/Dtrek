import { useReducer } from 'react'
import type { SectionKind } from './types'

export type SheetSnap = 'peek' | 'half' | 'full'

export interface RouteHubState {
  index: number
  dragging: boolean
  dragDeltaPx: number
  /** Non-null ⇒ Screen 2 (RouteSheet) is open, showing this tab. */
  openSection: SectionKind | null
  /** Meaningful only while openSection is set. */
  snap: SheetSnap
}

export type RouteHubAction =
  | { type: 'DRAG_START' }
  | { type: 'DRAG_MOVE'; deltaPx: number }
  | { type: 'DRAG_END'; count: number }
  | { type: 'JUMP_TO'; index: number }
  | { type: 'OPEN_SECTION'; section: SectionKind; snap: SheetSnap }
  | { type: 'SELECT_TAB'; section: SectionKind }
  | { type: 'SET_SNAP'; snap: SheetSnap }
  | { type: 'CLOSE_SECTION' }

function clampIndex(i: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i))
}

function reducer(state: RouteHubState, action: RouteHubAction): RouteHubState {
  switch (action.type) {
    case 'DRAG_START':
      return { ...state, dragging: true, dragDeltaPx: 0 }
    case 'DRAG_MOVE':
      return state.dragging ? { ...state, dragDeltaPx: action.deltaPx } : state
    case 'DRAG_END': {
      const SNAP_THRESHOLD_PX = 60
      let next = state.index
      if (state.dragDeltaPx < -SNAP_THRESHOLD_PX) next = clampIndex(state.index + 1, action.count)
      else if (state.dragDeltaPx > SNAP_THRESHOLD_PX) next = clampIndex(state.index - 1, action.count)
      return { ...state, dragging: false, dragDeltaPx: 0, index: next }
    }
    case 'JUMP_TO':
      return { ...state, index: action.index, openSection: null }
    case 'OPEN_SECTION':
      return { ...state, openSection: action.section, snap: action.snap }
    case 'SELECT_TAB':
      return { ...state, openSection: action.section, snap: state.snap === 'peek' ? 'half' : state.snap }
    case 'SET_SNAP':
      return { ...state, snap: action.snap }
    case 'CLOSE_SECTION':
      return { ...state, openSection: null, snap: 'peek' }
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
    snap: 'peek',
  })
}
