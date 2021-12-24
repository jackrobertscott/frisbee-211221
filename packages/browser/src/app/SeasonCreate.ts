import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {$SeasonCreate} from '../endpoints/Season'
import {TSeason} from '../schemas/Season'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormColumn} from './Form/FormColumn'
import {FormHelp} from './Form/FormHelp'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputBoolean} from './Input/InputBoolean'
import {InputString} from './Input/InputString'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
export const SeasonCreate: FC<{
  seasonSet: (season: TSeason) => void
}> = ({seasonSet}) => {
  const $seasonCreate = useEndpoint($SeasonCreate)
  const form = useForm({
    name: '',
    signUpOpen: false,
  })
  return $(Form, {
    background: theme.adminColor,
    children: addkeys([
      $('div', {
        children: `A season contains a fixed number of games. A single team will be determined the winner at the end of the season.`,
        className: css({
          color: theme.labelColor,
          margin: `-${theme.fontInset}px 0`,
        }),
      }),
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
              $(FormLabel, {label: 'Sign Up Open'}),
              $(InputBoolean, {
                value: form.data.signUpOpen,
                valueSet: form.link('signUpOpen'),
              }),
            ]),
          }),
          $(FormHelp, {
            value:
              'Teams may be registered in the season while this is active.',
          }),
        ]),
      }),
      $(FormButton, {
        label: 'Create',
        click: () => $seasonCreate.fetch(form.data).then(seasonSet),
      }),
    ]),
  })
}
