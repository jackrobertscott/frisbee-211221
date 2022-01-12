import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useState} from 'react'
import {$TeamDelete, $TeamUpdate} from '../endpoints/Team'
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
import {Question} from './Question'
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
  teamSet: (team?: TTeam) => void
  close: () => void
}> = ({team, teamSet, close}) => {
  const [deleting, deletingSet] = useState(false)
  const $teamDelete = useEndpoint($TeamDelete)
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
  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        width: theme.fib[13],
        children: addkeys([
          $(TopBar, {
            title: 'Team',
            children: addkeys([
              $(TopBarBadge, {
                icon: 'trash-alt',
                label: 'Delete',
                click: () => deletingSet(true),
              }),
              $(TopBarBadge, {
                icon: 'times',
                click: close,
              }),
            ]),
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
      }),
      $(Fragment, {
        children:
          deleting &&
          $(Question, {
            title: 'Delete Team',
            description: `Are you sure you wish to permanently delete this team?`,
            close: () => deletingSet(false),
            options: [
              {label: 'Cancel', click: () => deletingSet(false)},
              {
                label: 'Delete',
                click: () =>
                  $teamDelete.fetch({teamId: team.id}).then(() => {
                    teamSet(undefined)
                    deletingSet(false)
                  }),
              },
            ],
          }),
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
