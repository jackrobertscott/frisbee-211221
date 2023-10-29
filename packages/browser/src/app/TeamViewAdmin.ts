import {css} from '@emotion/css'
import dayjs from 'dayjs'
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
import {InputNumber} from './Input/InputNumber'
import {InputSimpleColor} from './Input/InputSimpleColor'
import {InputString} from './Input/InputString'
import {useMedia} from './Media/useMedia'
import {MenuBar, MenuBarOption, MenuBarShadow, MenuBarSpacer} from './MenuBar'
import {Modal} from './Modal'
import {Question} from './Question'
import {TeamMembersView} from './TeamMembersView'
import {TopBar, TopBarBadge} from './TopBar'
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
  const media = useMedia()
  const bpSmall = theme.fib[13]
  const isSmall = media.width < bpSmall
  const [open, openSet] = useState(false)
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
            children: addkeys([
              $(Fragment, {
                children:
                  isSmall &&
                  $(TopBarBadge, {
                    icon: 'bars',
                    click: () => openSet((i) => !i),
                  }),
              }),
              $(TopBarBadge, {
                grow: true,
                label: 'Team',
              }),
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
              position: 'relative',
            }),
            children: addkeys([
              (open || !isSmall) &&
                $(MenuBarShadow, {
                  click: () => openSet(false),
                  deactivated: !isSmall,
                  children: $(MenuBar, {
                    width: theme.fib[11] - theme.fib[8],
                    children: addkeys([
                      $(Fragment, {
                        children: router.routes.map((i) => {
                          return $(MenuBarOption, {
                            key: i.path,
                            label: i.title,
                            click: () => {
                              router.go(i.path)
                              if (open) openSet(false)
                            },
                            active: i.path === router.current.path,
                          })
                        }),
                      }),
                      $(MenuBarSpacer),
                    ]),
                  }),
                }),
              $('div', {
                children: router.render(),
                className: css({
                  overflow: 'hidden',
                  background: theme.bgMinor.string(),
                  flexGrow: 1,
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
                label: $teamDelete.loading ? 'Loading' : 'Delete',
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
  const isDifferent = !objectify.compareKeys(team, form.data, [
    'name',
    'color',
    'phone',
    'email',
    'division',
  ])
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
          $(FormLabel, {
            label: 'Public Contact Details',
            background: theme.bgMinor,
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Phone'}),
              $(InputString, {
                value: form.data.phone,
                valueSet: form.link('phone'),
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Email'}),
              $(InputString, {
                value: form.data.email,
                valueSet: form.link('email'),
              }),
            ]),
          }),
        ]),
      }),
      $(FormColumn, {
        children: addkeys([
          $(FormLabel, {label: 'Division'}),
          $(InputNumber, {
            value: form.data.division,
            valueSet: form.link('division'),
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
            label: dayjs(team.createdOn).format('DD/MM/YY h:mma'),
            background: theme.bgDisabled,
            grow: true,
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Last Updated'}),
          $(FormLabel, {
            label: dayjs(team.updatedOn).format('DD/MM/YY h:mma'),
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
