import {createElement as $, FC, ReactNode, useEffect, useState} from 'react'
import {pathToRegexp, Key} from 'path-to-regexp'
import {useMountedRef} from '../useMountedRef'
import {TRoute, TRouteParams, TRouteQuery} from './RouterContext'
import {RouterProvider} from './RouterProvider'
import {useRouter} from './useRouter'
/**
 *
 */
interface TRouterRenderContext {
  current: TRoute
  routes: TRoute[]
  params: TRouteParams
  query: TRouteQuery
  go: (path: string) => void
}
/**
 *
 */
export const Router: FC<{
  prefix?: string
  fallback: TRoute['path']
  routes: Array<TRoute | false>
  render?: (children: ReactNode, context: TRouterRenderContext) => ReactNode
}> = ({prefix, fallback, routes: _routes, render}) => {
  const router = useRouter()
  const mountedRef = useMountedRef()
  const location = router.location
  if (!location) throw new Error('Router context is not setup.')
  const routes = _routes.filter(Boolean) as TRoute[]
  if (routes.length < 1) throw new Error('Router must have at least one route.')
  // ...
  const _getCurrent = () => {
    for (const route of routes) {
      const routePath = `${prefix ?? ''}${route.path}`
      const i = _parseRoute(routePath, route.exact)
      if (!i.ok) continue
      return {
        current: route,
        pathname: location.pathname,
        params: i.params,
      }
    }
    const routeFallback = `${prefix ?? ''}${fallback}`
    if (location.pathname !== routeFallback) {
      router.go(routeFallback)
    }
  }
  // ...
  const [state, stateSet] = useState(() => _getCurrent())
  // ...
  useEffect(() => {
    if (!mountedRef.current) return
    if (!state || state?.pathname !== location?.pathname)
      stateSet(() => _getCurrent())
  }, [location, routes.map((i) => i.path).join()])
  // ...
  if (state?.current) {
    const children = state.current.render(state.params)
    return $(RouterProvider, {
      children: render
        ? render(children, {...router, ...state, routes})
        : children,
      parents: [...router.parents, state.current],
      current: state.current,
      location,
    })
  }
  return $(RouterProvider, {
    children: null,
    parents: router.parents,
    location,
  })
}
/**
 *
 */
const _parseRoute = (
  path: string,
  exact?: boolean
): {ok: false} | {ok: true; params: TRouteParams} => {
  const keys: Key[] = []
  const regex = pathToRegexp(path, keys, {end: exact ?? false})
  const result = regex.exec(location.pathname)
  if (result === null) return {ok: false}
  const values = result.slice(1)
  const params = keys.reduce((all, key, index) => {
    all[key.name] = values[index]
    return all
  }, {} as Record<string, string>)
  return {ok: true, params}
}
