import type {CSSObject} from '@emotion/css/dist/declarations/src/create-instance'
import {TFixture} from '@shared/schemas/ioFixture'
import {createElement as $, FC, useState} from 'react'
import {$FixtureAdjustMultiple} from '../endpoints/Fixture'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputNumber} from './Input/InputNumber'
import {InputSelect, TSelectOption} from './Input/InputSelect'
import {Modal} from './Modal'
import {useToaster} from './Toaster/useToaster'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'

const FIXTURE_ADJUST_LABEL_BP = theme.fib[12]
const FIXTURE_ADJUST_LABEL_STYLE: CSSObject = {
  [theme.ltMedia(FIXTURE_ADJUST_LABEL_BP)]: {
    width: 'auto',
  },
}

// Form for adjusting multiple fixtures based on a reference fixture
export const FixtureAdjustForm: FC<{
  fixtures: TFixture[]
  seasonId: string
  close: () => void
  done: () => void
}> = ({fixtures, seasonId, close, done}) => {
  const $adjustFixtures = useEndpoint($FixtureAdjustMultiple)
  const toaster = useToaster()
  const [referenceFixtureId, referenceFixtureIdSet] = useState<string>('')
  const [amount, amountSet] = useState<number | undefined>(1)
  const [unit, unitSet] = useState<string>('week')
  const [direction, directionSet] = useState<string>('forward')
  const [loading, loadingSet] = useState(false)

  const onSubmit = async () => {
    if (!referenceFixtureId) {
      toaster.error('Please select a reference fixture.')
      return
    }
    if (!amount || amount <= 0) {
      toaster.error('Please enter an amount greater than 0.')
      return
    }

    loadingSet(true)

    try {
      const result = await $adjustFixtures.fetch({
        seasonId,
        referenceFixtureId,
        amount,
        unit,
        direction,
      })

      if (result.count > 0) {
        toaster.notify(`Successfully adjusted ${result.count} fixtures`)
      }

      done()
    } catch (err) {
      // Error is already handled by useEndpoint
      loadingSet(false)
    }
  }

  const fixtureOptions: TSelectOption[] = fixtures.map((fixture) => ({
    key: fixture.id,
    label: `${fixture.title} (${new Date(fixture.date).toLocaleDateString()})`,
  }))

  const unitOptions: TSelectOption[] = [
    {key: 'day', label: 'Day(s)'},
    {key: 'week', label: 'Week(s)'},
    {key: 'month', label: 'Month(s)'},
  ]

  const directionOptions: TSelectOption[] = [
    {key: 'forward', label: 'Forward (Into Future)'},
    {key: 'backward', label: 'Backward (Into Past)'},
  ]

  const labelWidth = theme.fib[11] - theme.fib[8]

  return $(Modal, {
    close,
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Adjust Multiple Fixtures',
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
          $(FormColumn, {
            children: addkeys([
              $(FormRow, {
                bpColumn: FIXTURE_ADJUST_LABEL_BP,
                children: addkeys([
                  $(FormLabel, {
                    label: 'After and Including',
                    width: labelWidth,
                    wrap: true,
                    style: FIXTURE_ADJUST_LABEL_STYLE,
                  }),
                  $(InputSelect, {
                    value: referenceFixtureId,
                    valueSet: referenceFixtureIdSet,
                    options: fixtureOptions,
                    placeholder: 'Select a fixture',
                    disabled: loading || $adjustFixtures.loading,
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: FIXTURE_ADJUST_LABEL_BP,
                children: addkeys([
                  $(FormLabel, {
                    label: 'Adjustment Amount',
                    width: labelWidth,
                    wrap: true,
                    style: FIXTURE_ADJUST_LABEL_STYLE,
                  }),
                  $(InputNumber, {
                    value: amount,
                    valueSet: amountSet,
                    min: 1,
                    disabled: loading || $adjustFixtures.loading,
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: FIXTURE_ADJUST_LABEL_BP,
                children: addkeys([
                  $(FormLabel, {
                    label: 'Unit',
                    width: labelWidth,
                    wrap: true,
                    style: FIXTURE_ADJUST_LABEL_STYLE,
                  }),
                  $(InputSelect, {
                    value: unit,
                    valueSet: unitSet,
                    options: unitOptions,
                    disabled: loading || $adjustFixtures.loading,
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: FIXTURE_ADJUST_LABEL_BP,
                children: addkeys([
                  $(FormLabel, {
                    label: 'Direction',
                    width: labelWidth,
                    wrap: true,
                    style: FIXTURE_ADJUST_LABEL_STYLE,
                  }),
                  $(InputSelect, {
                    value: direction,
                    valueSet: directionSet,
                    options: directionOptions,
                    disabled: loading || $adjustFixtures.loading,
                  }),
                ]),
              }),
            ]),
          }), //
          $(FormBadge, {
            label:
              loading || $adjustFixtures.loading
                ? 'Loading'
                : 'Adjust Fixtures',
            click: onSubmit,
            disabled: loading || $adjustFixtures.loading,
          }),
        ]),
      }),
    ]),
  })
}
