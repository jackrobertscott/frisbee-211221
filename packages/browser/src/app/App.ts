import backgroundSVG from '../assets/noise.svg'
import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Dashboard} from './Dashboard/Dashboard'
import {SeasonSetup} from './SeasonSetup'
import {Spinner} from './Spinner'
import {useReload} from './useReload'
import {useRouter} from './Router/useRouter'
import {FixtureView} from './FixtureView'
import {Router} from './Router/Router'
import {Security} from './Security/Security'
/**
 *
 */
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
      backgroundImage: `url(${backgroundSVG})`,
      backgroundPosition: 'center',
      backgroundRepeat: 'repeat',
      backgroundSize: 50,
    }),
  })
}
/**
 *
 */
const _AppGuard: FC = () => {
  const auth = useAuth()
  if (!auth.loaded) return $(_AppLoading)
  if (!auth.season && !auth.current) return $(Security)
  return $(Router, {
    fallback: '/',
    routes: [
      !auth.current && {
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
/**
 *
 */
const _AppLoading: FC = () => {
  return $(Center, {
    breakpoint: 0,
    children: $(Spinner),
  })
}
