import {InputSelect} from '@browser/app/Input/InputSelect'
import {css} from '@emotion/css'
import {TSeason} from '@shared/schemas/ioSeason'
import {createElement as $, FC} from 'react'
import {$SeasonCreate} from '../endpoints/Season'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormHelp} from './Form/FormHelp'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputBoolean} from './Input/InputBoolean'
import {InputString} from './Input/InputString'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'

export const SeasonCreate: FC<{
  seasonSet: (season: TSeason) => void
}> = ({seasonSet}) => {
  const $seasonCreate = useEndpoint($SeasonCreate)
  const form = useForm({
    name: '',
    signUpOpen: false,
    scoringSystem: 'simple',
  })
  return $(Form, {
    background: theme.bgAdmin,
    children: addkeys([
      $('div', {
        children: `A season contains a fixed number of games. A single team will be determined the winner at the end of the season.`,
        className: css({
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
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            label: 'Scoring System',
          }),
          $(InputSelect, {
            value: form.data.scoringSystem,
            valueSet: form.link('scoringSystem'),
            options: [
              {
                key: 'simple',
                label: 'Simple Scoring\n1 MVP per gender, 4 spirit points',
              },
              {
                key: 'official',
                label: 'Official Scoring\n2 MVP per gender, 20 spirit points',
              },
            ],
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
      $(FormBadge, {
        disabled: $seasonCreate.loading,
        label: $seasonCreate.loading ? 'Loading' : 'Create',
        click: () => {
          const {scoringSystem, ...fd} = form.data
          $seasonCreate
            .fetch({
              ...fd,
              useOfficialScoring: scoringSystem === 'official',
            })
            .then(seasonSet)
        },
      }),
    ]),
  })
}
