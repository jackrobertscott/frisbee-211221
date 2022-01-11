import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC} from 'react'
import {$TeamUpdate} from '../endpoints/Team'
import {TTeam} from '../schemas/ioTeam'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {objectify} from '../utils/objectify'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputSimpleColor} from './Input/InputSimpleColor'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {SideBar} from './SideBar'
import {TeamMembersView} from './TeamMembersView'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
import {useLocalRouter} from './useLocalRouter'
/**
 *
 */
export const TeamViewAdmin: FC<{
  team: TTeam
  teamSet: (team: TTeam) => void
  close: () => void
}> = ({team, teamSet, close}) => {
  const router = useLocalRouter('/edit', [
    {
      path: '/edit',
      title: 'View & Edit',
      render: () =>
        $(_TeamViewAdminEdit, {
          team,
          teamSet,
        }),
    },
    {
      path: '/members',
      title: 'Team Members',
      render: () =>
        $(TeamMembersView, {
          team,
        }),
    },
  ])
  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        title: 'Team',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $('div', {
        className: css({
          display: 'flex',
        }),
        children: addkeys([
          $(SideBar, {
            width: theme.fib[11] - theme.fib[8],
            options: router.routes.map((i) => ({
              key: i.path,
              label: i.title,
              click: () => router.go(i.path),
              active: i.path === router.current.path,
            })),
          }),
          $('div', {
            children: router.render(),
            className: css({
              flexGrow: 1,
              background: theme.bgMinor.string(),
            }),
          }),
        ]),
      }),
    ]),
  })
}
/**
 *
 */
export const _TeamViewAdminEdit: FC<{
  team: TTeam
  teamSet: (team: TTeam) => void
}> = ({team, teamSet}) => {
  const $teamUpdate = useEndpoint($TeamUpdate)
  const form = useForm({
    ...team,
  })
  const isDifferent = !objectify.compareKeys(team, form.data, ['name', 'color'])
  return $(Form, {
    background: theme.bgMinor,
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Name'}),
          $(InputString, {
            value: form.data.name,
            valueSet: form.link('name'),
          }),
        ]),
      }),
      $(FormColumn, {
        children: addkeys([
          $(FormLabel, {label: 'Color'}),
          $(InputSimpleColor, {
            value: form.data.color,
            valueSet: form.link('color'),
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Created'}),
          $(FormLabel, {
            label: dayjs(team.createdOn).format(theme.dateFormat),
            background: theme.bgDisabled,
            grow: true,
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Last Updated'}),
          $(FormLabel, {
            label: dayjs(team.updatedOn).format(theme.dateFormat),
            background: theme.bgDisabled,
            grow: true,
          }),
        ]),
      }),
      isDifferent &&
        $(FormBadge, {
          disabled: $teamUpdate.loading,
          label: $teamUpdate.loading ? 'Loading' : 'Save Changes',
          click: () =>
            $teamUpdate.fetch({...form.data, teamId: team.id}).then(teamSet),
        }),
    ]),
  })
}
