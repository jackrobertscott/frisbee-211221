import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
// import noiseUrl from '../assets/noise.png'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Dashboard} from './Dashboard/Dashboard'
import {FixtureView} from './FixtureView'
import {Router} from './Router/Router'
import {useRouter} from './Router/useRouter'
import {SeasonSetup} from './SeasonSetup'
import {Security} from './Security/Security'
import {Spinner} from './Spinner'
import {useReload} from './useReload'

export const App: FC = () => {
  useReload()
  const router = useRouter()
  if (router.query.fixtureId) {
    return $(FixtureView, {
      fixtureId: router.query.fixtureId,
    })
  }
  return $('div', {
    children: $(_AppGuard),
    className: css({
      width: '100%',
      height: '100%',
      // backgroundImage: `url(${noiseUrl})`,
      // backgroundPosition: 'center',
      // backgroundRepeat: 'repeat',
      // backgroundSize: 25,
    }),
  })
}

const _AppGuard: FC = () => {
  const auth = useAuth()
  const router = useRouter()
  const pathname = router.location?.pathname ?? ''
  if (!auth.loaded) return $(_AppLoading)
  if (!auth.season && !auth.current) return $(Security)
  return $(Router, {
    fallback: '/',
    routes: [
      (!auth.current || pathname.startsWith('/auth')) && {
        path: '/auth',
        render: () => $(Security),
      },
      {
        path: '/',
        render: () => {
          return auth.season ? $(Dashboard) : $(SeasonSetup)
        },
      },
    ],
  })
}

const _AppLoading: FC = () => {
  return $(Center, {
    breakpoint: 0,
    children: $(Spinner),
  })
}
