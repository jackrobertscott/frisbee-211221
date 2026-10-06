/* Test-only helpers for screen tests: renders with the toast stack and a user-event session. */
import {Toaster, toast} from '@ui'
import userEvent from '@testing-library/user-event'
import {screen, within} from '@testing-library/react'
import {ReactElement} from 'react'
import {renderApp, TRenderAppOptions} from '../../test/render'

/** Removes toasts left in the global toast store by earlier tests. */
export const clearToasts = () => {
  const last = Number(toast('clear').replace(/^t/, ''))
  for (let i = 1; i <= last; i++) toast.dismiss(`t${i}`)
}

/** renderApp plus the <Toaster /> (so endpoint errors are visible) and a user-event instance. */
export const renderScreen = (ui: ReactElement, options: TRenderAppOptions = {}) => {
  clearToasts()
  const user = userEvent.setup()
  const result = renderApp(
    <>
      {ui}
      <Toaster />
    </>,
    options,
  )
  return {user, ...result}
}

type TUser = ReturnType<typeof userEvent.setup>

/** Opens a @ui DatePicker and picks today. */
export const pickToday = async (user: TUser, trigger: HTMLElement) => {
  await user.click(trigger)
  const calendar = await screen.findByRole('dialog', {name: 'Choose date'})
  await user.click(within(calendar).getByRole('button', {name: 'Today'}))
}

/** Opens a @ui Select (combobox) and picks the option with this accessible name. */
export const pickOption = async (
  user: TUser,
  combobox: HTMLElement,
  option: string | RegExp,
) => {
  await user.click(combobox)
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByRole('option', {name: option}))
}

