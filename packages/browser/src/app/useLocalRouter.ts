import {createElement as $, Fragment, ReactNode, useState} from 'react'
/**
 *
 */
export interface TRoute {
  path: string
  render: () => ReactNode
}
/**
 *
 */
export const useLocalRouter = <T extends TRoute>(
  fallback: string,
  routes: T[]
) => {
  if (routes.length < 1) throw new Error('Router must have at least one route.')
  const [pathCurrent, pathCurrentSet] = useState(fallback)
  const current = routes.find((i) => i.path === pathCurrent) ?? routes[0]
  const go = (path: string) => {
    const next = routes.find((i) => i.path === path)
    if (next) pathCurrentSet(next.path)
  }
  return {
    go,
    current,
    routes,
    render: () =>
      $(Fragment, {
        children: current.render(),
      }),
  }
}
