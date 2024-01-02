import {createElement as $, FC, Fragment} from 'react'
import {$FixtureGenerate} from '../endpoints/Fixture'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {random} from '../utils/random'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputDate} from './Input/InputDate'
import {InputNumber} from './Input/InputNumber'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {useToaster} from './Toaster/useToaster'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
type GameSlot = {
  id: string
  time: string
  place: string
}
/**
 *
 */
export const FixtureGenerate: FC<{
  seasonId: string
  close: () => void
  done: () => void
}> = ({seasonId, close, done}) => {
  const toaster = useToaster()
  const $generate = useEndpoint($FixtureGenerate)
  const form = useForm<{
    startingDate?: string
    gradingCount?: number
    roundCount?: number
    slots: Array<GameSlot>
  }>({
    slots: [
      {
        id: random.randomString(),
        time: '',
        place: '',
      },
    ],
  })
  function slotPatch(newData: Partial<GameSlot>) {
    form.patch({
      slots: form.data.slots.map((slot) => {
        return slot.id === newData.id ? {...slot, ...newData} : slot
      }),
    })
  }
  return $(Modal, {
    width: theme.fib[12],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Generate Fixtures',
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
              $(FormLabel, {label: 'Number of Rounds'}),
              $(InputNumber, {
                value: form.data.roundCount,
                valueSet: form.link('roundCount'),
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Starting Date'}),
              $(InputDate, {
                value: form.data.startingDate,
                valueSet: form.link('startingDate'),
              }),
            ]),
          }),
          $(FormColumn, {
            children: addkeys([
              $(Fragment, {
                children: form.data.slots.map((slot) => {
                  return $(FormRow, {
                    key: slot.id,
                    children: addkeys([
                      $(InputString, {
                        value: slot.time,
                        valueSet: (time) => slotPatch({id: slot.id, time}),
                        placeholder: 'Time',
                      }),
                      $(InputString, {
                        value: slot.place,
                        valueSet: (place) => slotPatch({id: slot.id, place}),
                        placeholder: 'Place',
                      }),
                      $(FormBadge, {
                        icon: 'times',
                        click: () =>
                          form.patch({
                            slots: form.data.slots.filter(
                              (i) => i.id !== slot.id
                            ),
                          }),
                      }),
                    ]),
                  })
                }),
              }),
              $(FormBadge, {
                icon: 'plus',
                label: 'Add New Slot',
                click: () =>
                  form.patch({
                    slots: form.data.slots.concat({
                      id: random.randomString(),
                      time: '',
                      place: '',
                    }),
                  }),
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: $generate.loading,
            label: $generate.loading ? 'Loading' : 'Submit',
            click: () => {
              const {roundCount, startingDate, slots} = form.data
              if (typeof roundCount !== 'number' || roundCount < 1)
                return toaster.error('Please enter a valid number of rounds')
              if (!startingDate)
                return toaster.error('Please enter a valid starting date')
              $generate
                .fetch({startingDate, roundCount, slots, seasonId})
                .then(() => done())
            },
          }),
        ]),
      }),
    ]),
  })
}
