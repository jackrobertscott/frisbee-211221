import {Location} from 'history'
import {createElement as $, FC, ReactNode, useEffect, useState} from 'react'
import {history} from '../../utils/history'
import {useMountedRef} from '../useMountedRef'
import {RouterContext, TRoute} from './RouterContext'
/**
 *
 */
export const RouterProvider: FC<{
  children: ReactNode
  parents?: TRoute[]
  current?: TRoute
  location?: Location
}> = ({children, location: _location, parents = [], current}) => {
  const mountedRef = useMountedRef()
  const [xyz, xyzSet] = useState(_location ?? history.location)
  const location = _location ?? xyz
  useEffect(() => {
    if (_location) return
    xyzSet(history.location) // required
    return history.listen((data) => {
      if (!mountedRef.current) return
      setTimeout(() => xyzSet(data.location))
    })
  }, [])
  return $(RouterContext.Provider, {
    children,
    value: {
      parents,
      current,
      location,
    },
  })
}
