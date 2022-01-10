import {createElement as $, FC} from 'react'
import {$TeamCreateCurrent} from '../endpoints/Team'
import {TTeam} from '../schemas/ioTeam'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {SIMPLE_COLORS} from '../utils/colors'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputSimpleColor} from './Input/InputSimpleColor'
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
  const $create = useEndpoint($TeamCreateCurrent)
  const form = useForm({
    name: '',
    color: SIMPLE_COLORS[0].string(),
  })
  return $(Modal, {
    width: theme.fib[12],
    children: addkeys([
      $(TopBar, {
        title: 'New Team',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $(Form, {
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
          $(FormBadge, {
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
