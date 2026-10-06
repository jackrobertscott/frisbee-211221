import {TUserSafe} from '@shared/schemas/ioUser'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeUser} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, serverError, THandler} from '../../test/server'
import {
  findDialog,
  setupUser,
  spyToasts,
} from '../seasons/screenTestUtils'
import {UserMergeDialog} from './UserMergeDialog'

const DATE = '2026-01-01T00:00:00.000Z'
const keep = makeUser({
  firstName: 'Pat',
  lastName: 'Kept',
  emails: [{value: 'pat@example.com', verified: true, primary: true, createdOn: DATE}],
})
const dupe = makeUser({
  firstName: 'Pat',
  lastName: 'Dupe',
  emails: [{value: 'pat@old.com', verified: false, primary: true, createdOn: DATE}],
})
const noEmail = makeUser({firstName: 'Pat', lastName: 'Bare', emails: []})

const renderMerge = (handlers: Record<string, THandler> = {}) => {
  const server = mockServer({
    '/UserList': () => ({count: 3, users: [keep, dupe, noEmail]}),
    ...handlers,
  })
  const onMerged = vi.fn<(user: TUserSafe) => void>()
  const onOpenChange = vi.fn<(open: boolean) => void>()
  renderApp(
    <UserMergeDialog open onOpenChange={onOpenChange} user={keep} onMerged={onMerged} />,
    {auth: makeAuth({user: {admin: true}})},
  )
  return {server, onMerged, onOpenChange}
}

describe('UserMergeDialog', () => {
  it('searches other users by the first name to start with', async () => {
    const {server} = renderMerge()
    const modal = await findDialog('Merge users')
    expect(within(modal).getByText('Pick a duplicate account to merge into Pat Kept.')).toBeInTheDocument()
    expect(within(modal).getByRole('searchbox')).toHaveValue('Pat')
    expect(await within(modal).findByText('Pat Dupe')).toBeInTheDocument()
    expect(within(modal).getByText('[no email]')).toBeInTheDocument()
    expect(within(modal).queryByText('Pat Kept')).not.toBeInTheDocument()
    expect(within(modal).getByRole('button', {name: 'Merge users'})).toBeDisabled()
    expect(server.payloads('/UserList')).toEqual([{search: 'Pat', limit: 10}])
  })

  it('searches again as the admin types', async () => {
    const user = setupUser()
    const {server} = renderMerge()
    const modal = await findDialog('Merge users')
    await within(modal).findByText('Pat Dupe')
    server.on('/UserList', () => ({count: 0, users: []}))
    await user.clear(within(modal).getByRole('searchbox'))
    await user.type(within(modal).getByRole('searchbox'), 'zzz')
    expect(await within(modal).findByText('No matching users')).toBeInTheDocument()
    expect(server.payloads('/UserList').at(-1)).toEqual({search: 'zzz', limit: 10})
  })

  it('merges the picked duplicate after confirming', async () => {
    const user = setupUser()
    const {server, onMerged} = renderMerge({'/UserMerge': () => keep})
    const modal = await findDialog('Merge users')
    await user.click(await within(modal).findByText('Pat Dupe'))
    expect(within(modal).getByText('Keep')).toBeInTheDocument()
    expect(within(modal).getByText('Merge in')).toBeInTheDocument()
    expect(
      within(modal).getByText('pat@old.com will be merged into pat@example.com.'),
    ).toBeInTheDocument()
    await user.click(within(modal).getByRole('button', {name: 'Merge users'}))
    const confirm = await findDialog('Merge')
    expect(
      within(confirm).getByText(
        'Are you sure you wish to merge <pat@old.com> into <pat@example.com>?',
      ),
    ).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', {name: 'Merge'}))
    await waitFor(() => expect(onMerged).toHaveBeenCalledWith(keep))
    expect(server.payloads('/UserMerge')).toEqual([{user1Id: keep.id, user2Id: dupe.id}])
  })

  it('lets the admin pick a different user', async () => {
    const user = setupUser()
    renderMerge()
    const modal = await findDialog('Merge users')
    await user.click(await within(modal).findByText('Pat Dupe'))
    await user.click(within(modal).getByRole('button', {name: 'Choose a different user'}))
    expect(await within(modal).findByRole('searchbox')).toBeInTheDocument()
    expect(within(modal).getByRole('button', {name: 'Merge users'})).toBeDisabled()
  })

  it('keeps the confirmation open when the merge fails', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const {onMerged} = renderMerge({
      '/UserMerge': () => {
        throw serverError(400, 'These users cannot be merged.')
      },
    })
    const modal = await findDialog('Merge users')
    await user.click(await within(modal).findByText('Pat Dupe'))
    await user.click(within(modal).getByRole('button', {name: 'Merge users'}))
    const confirm = await findDialog('Merge')
    await user.click(within(confirm).getByRole('button', {name: 'Merge'}))
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith('These users cannot be merged.'),
    )
    expect(onMerged).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', {name: 'Merge'})).toBeInTheDocument()
  })

  it('cancels', async () => {
    const user = setupUser()
    const {onOpenChange} = renderMerge()
    const modal = await findDialog('Merge users')
    await user.click(within(modal).getByRole('button', {name: 'Cancel'}))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
