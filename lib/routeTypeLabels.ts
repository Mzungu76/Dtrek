import { RotateCw, ArrowLeftRight, ArrowRight, type LucideIcon } from 'lucide-react'

export type RouteType = 'loop' | 'out_and_back' | 'point_to_point'

export const ROUTE_TYPE_LABEL: Record<RouteType, string> = {
  loop: 'Anello',
  out_and_back: 'Andata e ritorno',
  point_to_point: 'Punto a punto',
}

export const ROUTE_TYPE_ICON: Record<RouteType, LucideIcon> = {
  loop: RotateCw,
  out_and_back: ArrowLeftRight,
  point_to_point: ArrowRight,
}
