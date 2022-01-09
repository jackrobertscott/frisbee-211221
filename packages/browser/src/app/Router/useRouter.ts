import {createElement as $, useEffect, useState} from 'react'
import {useContext} from 'react'
import * as queryString from 'query-string'
import {pathToRegexp, Key} from 'path-to-regexp'
import {RouterContext, TRoute} from './RouterContext'
import {RouterProvider} from './RouterProvider'
import {useMountedRef} from '../useMountedRef'
import {go} from '../../utils/go'
/**
 *
 */
export const useRouter = <T extends TRoute>(
  fallback: string,
  _routes: (T | false)[]
) => {
  const routes = _routes.filter(Boolean) as T[]
  if (routes.length < 1) throw new Error('Router must have at least one route.')
  const _parseRoute = (path: string, exact?: boolean) => {
    const keys: Key[] = []
    const regex = pathToRegexp(path, keys, {end: exact})
    return [regex, keys] as const
  }
  const _getCurrent = () => {
    if (!location) throw new Error('Router context is not correctly setup.')
    for (const route of routes) {
      const [regex, keys] = _parseRoute(route.path, route.exact)
      const result = regex.exec(location.pathname)
      if (result === null) continue
      const values = result.slice(1)
      const querySet = queryString.parse(location.search)
      const paramSet = keys.reduce((all, key, index) => {
        all[key.name] = values[index]
        return all
      }, {} as Record<string, string>)
      return {
        ...route,
        querySet: querySet as Record<string, string>,
        paramSet,
        pathname: location.pathname,
      }
    }
    if (location.pathname !== fallback) {
      go.to(fallback)
    }
  }
  const mountedRef = useMountedRef()
  const {parents, location} = useContext(RouterContext)
  const [current, currentSet] = useState(() => _getCurrent())
  useEffect(() => {
    if (!mountedRef.current) return
    if (!current || current?.pathname !== location?.pathname)
      currentSet(() => _getCurrent())
  }, [location, routes.map((i) => i.path).join()])
  return {
    routes,
    current,
    query: current?.querySet,
    param: current?.paramSet,
    render: () =>
      current
        ? $(RouterProvider, {
            children: current.render(current.paramSet, current.querySet),
            parents: [...parents, current],
            location,
          })
        : null,
  }
}
