import {createElement as $, FC} from 'react'
import {TTeam} from '../../../shared/src/schemas/ioTeam'
import {$TeamCurrentCreate} from '../endpoints/Team'
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
import {TopBar, TopBarBadge} from './TopBar'
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
  const $create = useEndpoint($TeamCurrentCreate)
  const form = useForm({
    name: '',
    color: SIMPLE_COLORS[0].string(),
  })
  return $(Modal, {
    width: theme.fib[12],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'New Team',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
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
