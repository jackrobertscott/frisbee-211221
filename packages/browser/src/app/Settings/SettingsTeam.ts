import {createElement as $, FC} from 'react'
import {$TeamUpdate} from '../../endpoints/Team'
import {addkeys} from '../../utils/addkeys'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormButton} from '../Form/FormButton'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputSimpleColor} from '../Input/InputSimpleColor'
import {InputString} from '../Input/InputString'
import {useToaster} from '../Toaster/useToaster'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const SettingsTeam: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const $teamUpdate = useEndpoint($TeamUpdate)
  const form = useForm({
    name: '',
    color: '',
    ...auth.current?.team,
  })
  return $(Form, {
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
        disabled: $teamUpdate.loading,
        label: $teamUpdate.loading ? 'Loading' : 'Save',
        click: () =>
          auth.current?.team &&
          $teamUpdate
            .fetch({...form.data, teamId: auth.current?.team.id})
            .then((data) => {
              auth.teamSet(data)
              toaster.notify('Team updated.')
            }),
      }),
    ]),
  })
}
