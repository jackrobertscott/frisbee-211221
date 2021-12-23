import {createElement as $, FC} from 'react'
import {useAuth} from './Auth/useAuth'
import {Dashboard} from './Dashboard'
import {Security} from './Security/Security'
import {TeamSetup} from './TeamSetup'
/**
 *
 */
export const App: FC = () => {
  const auth = useAuth()
  if (!auth.current) {
    return $(Security)
  }
  if (!auth.current.team) {
    return $(TeamSetup)
  }
  return $(Dashboard)
}
