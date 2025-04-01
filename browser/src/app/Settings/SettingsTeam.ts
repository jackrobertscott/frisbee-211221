import {createElement as $, FC} from 'react'
import {$TeamCurrentUpdate} from '../../endpoints/Team'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
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
  const $teamUpdate = useEndpoint($TeamCurrentUpdate)
  const form = useForm({
    name: '',
    color: '',
    phone: '',
    email: '',
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
          $(FormLabel, {label: 'Color'}),
          $(InputSimpleColor, {
            value: form.data.color,
            valueSet: form.link('color'),
          }),
        ]),
      }),
      $(FormBadge, {
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
