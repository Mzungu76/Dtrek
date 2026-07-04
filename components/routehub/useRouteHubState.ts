import { useReducer } from 'react'
import type { PopupKind } from './types'

export interface RouteHubState {
  index: number
  locked: boolean
  dragging: boolean
  dragDeltaPx: number
  openPopup: PopupKind | null
  altimetryOpen: boolean
}

export type RouteHubAction =
  | { type: 'DRAG_START' }
  | { type: 'DRAG_MOVE'; deltaPx: number }
  | { type: 'DRAG_END'; count: number }
  | { type: 'JUMP_TO'; index: number }
  | { type: 'TOGGLE_LOCK' }
  | { type: 'OPEN_POPUP'; popup: PopupKind }
  | { type: 'CLOSE_POPUP' }
  | { type: 'OPEN_ALTIMETRY' }
  | { type: 'CLOSE_ALTIMETRY' }

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
      return { ...state, index: action.index, locked: true, openPopup: null, altimetryOpen: false }
    case 'TOGGLE_LOCK': {
      const locked = !state.locked
      return locked
        ? { ...state, locked }
        : { ...state, locked, openPopup: null, altimetryOpen: false }
    }
    case 'OPEN_POPUP':
      return { ...state, openPopup: action.popup }
    case 'CLOSE_POPUP':
      return { ...state, openPopup: null }
    case 'OPEN_ALTIMETRY':
      return state.locked ? { ...state, openPopup: null, altimetryOpen: true } : state
    case 'CLOSE_ALTIMETRY':
      return { ...state, altimetryOpen: false }
    default:
      return state
  }
}

export function useRouteHubState(initialIndex: number) {
  return useReducer(reducer, {
    index: initialIndex,
    locked: true,
    dragging: false,
    dragDeltaPx: 0,
    openPopup: null,
    altimetryOpen: false,
  })
}
