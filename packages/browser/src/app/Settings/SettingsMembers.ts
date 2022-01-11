import {createElement as $, FC} from 'react'
import {useAuth} from '../Auth/useAuth'
import {TeamMembersView} from '../TeamMembersView'
/**
 *
 */
export const SettingsMembers: FC = () => {
  const auth = useAuth()
  if (!auth.current?.team) return null
  return $(TeamMembersView, {
    team: auth.current.team,
  })
}
