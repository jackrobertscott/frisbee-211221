import {Location} from 'history'
import {createContext, ReactNode} from 'react'
/**
 *
 */
export interface TRoute {
  path: string
  exact?: boolean
  label?: string
  hide?: boolean
  render: (
    paramSet: Record<string, string>,
    querySet: Record<string, string>
  ) => ReactNode
}
/**
 *
 */
export interface TRouterContext {
  parents: TRoute[]
  location?: Location
}
/**
 *
 */
export const RouterContext = createContext<TRouterContext>({
  parents: [],
})
