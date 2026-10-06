/* Shared helpers for screen tests in reports, users, auth, settings, seasons and mvp. */
import {TMember} from '@shared/schemas/ioMember'
import {screen, within} from '@testing-library/react'
import userEvent, {type UserEvent} from '@testing-library/user-event'
import {toast} from '@ui'
import {vi} from 'vitest'
import {testId} from '../../test/fixtures'

export const setupUser = (): UserEvent => userEvent.setup()

/** Spies on the toast store (cleared by `vi.restoreAllMocks` after each test). */
export const spyToasts = () => ({
  success: vi.spyOn(toast, 'success'),
  error: vi.spyOn(toast, 'error'),
})

/** Opens an @ui Select by its accessible name and picks an option by label. */
export const chooseOption = async (
  user: UserEvent,
  combobox: string | RegExp | HTMLElement,
  option: string | RegExp,
) => {
  const trigger =
    combobox instanceof HTMLElement
      ? combobox
      : screen.getByRole('combobox', {name: combobox})
  await user.click(trigger)
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByRole('option', {name: option}))
}

/** The open dialog with the given title. */
export const dialog = (name: string | RegExp) =>
  screen.getByRole('dialog', {name})

export const findDialog = (name: string | RegExp) =>
  screen.findByRole('dialog', {name})

const NOW = '2026-01-01T00:00:00.000Z'

/** Team membership record for tests. */
export const makeMember = (patch: Partial<TMember> = {}): TMember => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  userId: testId(),
  seasonId: testId(),
  teamId: testId(),
  pending: false,
  ...patch,
})
