import {createElement as $, FC} from 'react'
import {$TeamCreate} from '../endpoints/Team'
import {TTeam} from '../schemas/Team'
import {addkeys} from '../utils/addkeys'
import {SIMPLE_COLORS} from '../utils/colors'
import {hsla} from '../utils/hsla'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
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
  const $create = useEndpoint($TeamCreate)
  const form = useForm({
    name: '',
    color: hsla.render(SIMPLE_COLORS[0]),
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
              $(InputSimpleColor, {
                value: form.data.color,
                valueSet: form.link('color'),
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
