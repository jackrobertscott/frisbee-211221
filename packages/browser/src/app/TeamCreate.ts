import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {$TeamCreate} from '../endpoints/Team'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {Icon} from './Icon'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
export const TeamCreate: FC<{
  seasonId: string
  close: () => void
  done: (team: TTeam) => void
}> = ({seasonId, close, done}) => {
  const auth = useAuth()
  const $create = useEndpoint($TeamCreate)
  const form = useForm({
    name: '',
    color: hsla.render(TEAM_COLORS[0]),
  })
  return $(Modal, {
    width: 377,
    children: addkeys([
      $(TopBar, {
        title: 'New Team',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $(Form, {
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
              $('div', {
                className: css({
                  display: 'flex',
                  flexWrap: 'wrap',
                  border: theme.border,
                  paddingTop: theme.inputPadding,
                  paddingLeft: theme.inputPadding,
                  '& > *': {
                    marginRight: theme.inputPadding,
                    marginBottom: theme.inputPadding,
                  },
                }),
                children: TEAM_COLORS.map((i) => {
                  const color = hsla.render(i)
                  return $('div', {
                    key: color,
                    onClick: () => form.patch({color}),
                    className: css({
                      width: 34,
                      height: 40,
                      flexGrow: 1,
                      border: theme.border,
                      background: color,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      color:
                        i.l > 50
                          ? hsla.string(0, 0, 0)
                          : hsla.string(0, 0, 100),
                      '&:hover': {
                        background: hsla.render(hsla.darken(20, i)),
                      },
                      '&:active': {
                        background: hsla.render(hsla.darken(25, i)),
                      },
                    }),
                    children:
                      color === form.data.color &&
                      $(Icon, {
                        icon: 'check',
                        multiple: 1,
                      }),
                  })
                }),
              }),
            ]),
          }),
          $(FormButton, {
            disabled: $create.loading,
            label: $create.loading ? 'Loading' : 'Submit',
            click: () =>
              $create
                .fetch({...form.data, seasonId})
                .then(({team}) => done(team)),
          }),
        ]),
      }),
    ]),
  })
}
/**
 *
 */
const TEAM_COLORS = [
  hsla.object(0, 100, 65),
  hsla.object(30, 100, 65),
  hsla.object(60, 100, 65),
  hsla.object(90, 100, 65),
  hsla.object(120, 100, 65),
  hsla.object(150, 100, 65),
  hsla.object(180, 100, 65),
  hsla.object(210, 100, 70),
  hsla.object(240, 100, 70),
  hsla.object(270, 100, 70),
  hsla.object(300, 100, 70),
  hsla.object(330, 100, 70),
  hsla.object(0, 0, 100),
  hsla.object(0, 0, 0),
]
