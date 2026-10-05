import {Location} from 'history'
import {createElement as $, FC, ReactNode, useEffect, useState} from 'react'
import {history} from './history'
import {useMountedRef} from '../hooks/useMountedRef'
import {RouterContext, TRoute} from './RouterContext'

export const RouterProvider: FC<{
  children: ReactNode
  parents?: TRoute[]
  current?: TRoute
  location?: Location
}> = ({children, location: _location, parents = [], current}) => {
  const mountedRef = useMountedRef()
  const [historyLocation, historyLocationSet] = useState(
    _location ?? history.location,
  )
  const location = _location ?? historyLocation
  useEffect(() => {
    if (_location) return
    historyLocationSet(history.location) // required
    return history.listen((data) => {
      if (!mountedRef.current) return
      setTimeout(() => historyLocationSet(data.location))
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
