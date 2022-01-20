import {Location} from 'history'
import {createContext, ReactNode} from 'react'
/**
 *
 */
export type TRouteParams = Record<string, string>
/**
 *
 */
export type TRouteQuery = Record<string, string>
/**
 *
 */
export interface TRoute {
  path: string
  exact?: boolean
  hide?: boolean
  label?: string
  description?: string
  render: (params: TRouteParams) => ReactNode
}
/**
 *
 */
export interface TRouterContext {
  parents: TRoute[]
  current?: TRoute
  location?: Location
}
/**
 *
 */
export const RouterContext = createContext<TRouterContext>({
  parents: [],
})
