import {FormHelp} from '@browser/app/Form/FormHelp'
import {InputBoolean} from '@browser/app/Input/InputBoolean'
import {$SeasonUpdate} from '@browser/endpoints/Season'
import {theme} from '@browser/theme'
import {createElement as $, FC} from 'react'
import {addkeys} from '../../utils/addkeys'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {useToaster} from '../Toaster/useToaster'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const SettingsSeason: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const $updateSeason = useEndpoint($SeasonUpdate)
  const {finalResults, ...season} = auth.season!
  const form = useForm({
    ...season,
  })
  return $(Form, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Name'}),
          $(InputString, {
            value: form.data.name,
            valueSet: form.link('name'),
            placeholder: 'e.g. Summer 2022',
          }),
        ]),
      }),
      $(FormColumn, {
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Hide From Dashboard'}),
              $(InputBoolean, {
                value: form.data.isHidden,
                valueSet: form.link('isHidden'),
              }),
            ]),
          }),
          $(FormHelp, {
            children:
              'The season will not be shown in the dashboard dropdown menu.',
          }),
        ]),
      }),
      $(FormColumn, {
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Sign Up Open'}),
              $(InputBoolean, {
                value: form.data.signUpOpen,
                valueSet: form.link('signUpOpen'),
              }),
            ]),
          }),
          $(FormHelp, {
            children: 'Teams and players can sign up while this is active.',
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            label: 'Scoring System',
          }),
          $(FormLabel, {
            grow: true,
            label: form.data.useOfficialScoring ? 'Official' : 'Simple',
            background: theme.bgMinor,
          }),
        ]),
      }),
      $(FormBadge, {
        disabled: $updateSeason.loading,
        label: $updateSeason.loading ? 'Loading' : 'Save',
        click: () =>
          $updateSeason
            .fetch({...form.data, seasonId: season.id})
            .then((data) => {
              auth.seasonSet(data, true)
              toaster.notify('Season updated.')
            }),
      }),
    ]),
  })
}
