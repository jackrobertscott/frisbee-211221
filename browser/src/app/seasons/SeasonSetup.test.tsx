import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {makeAuth, makeSeason} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer} from '../../test/server'
import {findDialog, setupUser} from './screenTestUtils'
import {SeasonSetup} from './SeasonSetup'

describe('SeasonSetup', () => {
  it('asks signed out visitors to come back later', () => {
    renderApp(<SeasonSetup />, {context: {season: undefined}})
    expect(screen.getByText('Season not ready')).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Create season'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Log out'})).not.toBeInTheDocument()
  })

  it('lets players log out but not create a season', async () => {
    const user = setupUser()
    const {context} = renderApp(<SeasonSetup />, {
      auth: makeAuth(),
      context: {season: undefined},
    })
    expect(screen.getByText('Season not ready')).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Log out'}))
    const confirm = await findDialog('Log out?')
    await user.click(within(confirm).getByRole('button', {name: 'Log out'}))
    expect(context.logout).toHaveBeenCalled()
  })

  it('lets admins create the first season and switches to it', async () => {
    const user = setupUser()
    const created = makeSeason({name: 'Opening'})
    mockServer({'/SeasonCreate': () => created})
    const {context} = renderApp(<SeasonSetup />, {
      auth: makeAuth({user: {admin: true}}),
      context: {season: undefined},
    })
    expect(screen.getByText('Start a new season')).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Create season'}))
    const modal = await findDialog('New season')
    await user.type(within(modal).getByLabelText('Name'), 'Opening')
    await user.click(within(modal).getByRole('button', {name: 'Create season'}))
    await waitFor(() => expect(context.seasonSet).toHaveBeenCalledWith(created))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'New season'})).not.toBeInTheDocument(),
    )
  })
})
