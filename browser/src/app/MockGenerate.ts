import {createElement as $, FC} from 'react'
import {$PortMockGenerate} from '../endpoints/Port'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputNumber} from './Input/InputNumber'
import {Modal} from './Modal'
import {Poster} from './Poster'
import {useToaster} from './Toaster/useToaster'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'

export const MockGenerate: FC<{
  seasonId: string
  close: () => void
  done: () => void
}> = ({seasonId, close, done}) => {
  const toaster = useToaster()
  const $generate = useEndpoint($PortMockGenerate)
  const form = useForm<{
    teams?: number
    usersPerTeam?: number
  }>({})

  return $(Modal, {
    width: theme.fib[12],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Generate Mock Data',
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
          $(Poster, {
            icon: 'exclamation-triangle',
            title: 'Warning',
            description:
              'Generating mock data is not reversible. This will create teams and users.',
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Number of Teams'}),
              $(InputNumber, {
                value: form.data.teams,
                valueSet: form.link('teams'),
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Users Per Team'}),
              $(InputNumber, {
                value: form.data.usersPerTeam,
                valueSet: form.link('usersPerTeam'),
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: $generate.loading,
            label: $generate.loading ? 'Generating...' : 'Generate',
            click: () => {
              const {teams, usersPerTeam} = form.data
              if (typeof teams !== 'number' || teams < 1)
                return toaster.error('Please enter a valid number of teams')
              if (typeof usersPerTeam !== 'number' || usersPerTeam < 1)
                return toaster.error(
                  'Please enter a valid number of users per team'
                )
              $generate.fetch({seasonId, teams, usersPerTeam}).then(() => {
                toaster.notify('Mock data generated successfully')
                done()
              })
            },
          }),
        ]),
      }),
    ]),
  })
}
