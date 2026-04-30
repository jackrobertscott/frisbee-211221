import {internalError} from '@shared/errors'
import {createElement as $, FC, ReactNode, useEffect} from 'react'
import {match} from 'path-to-regexp'
import {TRoute, TRouteParams, TRouteQuery} from './RouterContext'
import {RouterProvider} from './RouterProvider'
import {useRouter} from './useRouter'

interface TRouterRenderContext {
  current: TRoute
  routes: TRoute[]
  params: TRouteParams
  query: TRouteQuery
  go: (path: string) => void
}

export const Router: FC<{
  prefix?: string
  fallback: TRoute['path']
  routes: Array<TRoute | false>
  render?: (children: ReactNode, context: TRouterRenderContext) => ReactNode
}> = ({prefix, fallback, routes: _routes, render}) => {
  const router = useRouter()
  const location = router.location
  if (!location)
    throw internalError('Router context is not setup.', {
      errorCode: 'router.context_missing',
    })
  const routes = _routes.filter(Boolean) as TRoute[]
  if (routes.length < 1)
    throw internalError('Router must have at least one route.', {
      errorCode: 'router.routes_missing',
    })

  const state = _getCurrent(location.pathname, routes, prefix)
  const routeFallback = `${prefix ?? ''}${fallback}`

  useEffect(() => {
    if (!state && location.pathname !== routeFallback) {
      router.replace(routeFallback)
    }
  }, [location.pathname, routeFallback, router, state])

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

const _getCurrent = (
  pathname: string,
  routes: TRoute[],
  prefix?: string
) => {
  for (const route of routes) {
    const routePath = `${prefix ?? ''}${route.path}`
    const i = _parseRoute(pathname, routePath, route.exact)
    if (!i.ok) continue
    return {
      current: route,
      pathname,
      params: i.params,
    }
  }
}

const _parseRoute = (
  pathname: string,
  path: string,
  exact?: boolean
): {ok: false} | {ok: true; params: TRouteParams} => {
  // `path-to-regexp` v8 no longer treats `/` as a prefix match, but this
  // router relies on `/` catching all nested app routes.
  if (!exact && path === '/') {
    return pathname.startsWith('/') ? {ok: true, params: {}} : {ok: false}
  }
  const result = match(path, {end: exact ?? false})(pathname)
  if (!result) return {ok: false}
  return {ok: true, params: result.params as TRouteParams}
}
