import {
  createElement as $,
  createContext,
  Dispatch,
  FC,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {useRouter} from '../Router/useRouter'

type TRouteReadyState = Record<string, boolean | undefined>

const _normalize = (pathname?: string) => pathname || '/'

const DashboardRouteReadyContext = createContext<
  | {
      routeReady: TRouteReadyState
      routeReadySet: Dispatch<SetStateAction<TRouteReadyState>>
    }
  | undefined
>(undefined)

export const DashboardRouteReadyProvider: FC<{
  children: ReactNode
}> = ({children}) => {
  const [routeReady, routeReadySet] = useState<TRouteReadyState>({})
  const value = useMemo(() => ({routeReady, routeReadySet}), [routeReady])
  return $(DashboardRouteReadyContext.Provider, {value, children})
}

const _useDashboardRouteReadyContext = () => {
  const context = useContext(DashboardRouteReadyContext)
  if (!context) throw new Error('Dashboard route ready context missing.')
  return context
}

export const useDashboardRouteReady = (ready: boolean) => {
  const router = useRouter()
  const pathname = _normalize(router.location?.pathname)
  const {routeReadySet} = _useDashboardRouteReadyContext()

  useEffect(() => {
    routeReadySet((state) => {
      if (state[pathname] === ready) return state
      return {
        ...state,
        [pathname]: ready,
      }
    })
  }, [pathname, ready, routeReadySet])

  useEffect(() => {
    return () => {
      routeReadySet((state) => {
        if (!(pathname in state)) return state
        const next = {...state}
        delete next[pathname]
        return next
      })
    }
  }, [pathname, routeReadySet])
}

export const useDashboardRouteReadyState = () => {
  return _useDashboardRouteReadyContext().routeReady
}
