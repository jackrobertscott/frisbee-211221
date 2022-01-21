import backgroundSVG from '../assets/noise.svg'
import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Dashboard} from './Dashboard/Dashboard'
import {SeasonSetup} from './SeasonSetup'
import {Security} from './Security/Security'
import {TeamSetup} from './TeamSetup'
import {Spinner} from './Spinner'
import {useReload} from './useReload'
/**
 *
 */
export const App: FC = () => {
  useReload()
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
  if (!auth.current) return $(Security)
  if (!auth.current.season) return $(SeasonSetup)
  if (!auth.current.team) return $(TeamSetup)
  return $(Dashboard)
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
