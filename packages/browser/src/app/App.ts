import backgroundSVG from '../assets/noise.svg'
import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Dashboard} from './Dashboard'
import {SeasonSetup} from './SeasonSetup'
import {Security} from './Security/Security'
import {TeamSetup} from './TeamSetup'
import {Spinner} from './Spinner'
/**
 *
 */
export const App: FC = () => {
  return $('div', {
    children: $(_AppGuard),
    className: css({
      width: '100%',
      height: '100%',
      background: theme.bgApp.string(),
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
    children: $(Spinner),
  })
}
