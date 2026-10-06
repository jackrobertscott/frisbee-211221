import {TSeason} from '@shared/schemas/ioSeason'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer} from '../../test/server'
import {SeasonCreateDialog} from './SeasonCreateDialog'
import {chooseOption, dialog, setupUser, spyToasts, userError} from './screenTestUtils'

const admin = () => makeAuth({user: {admin: true}})

const renderDialog = (props: {switchTo?: boolean} = {}) => {
  const onOpenChange = vi.fn<(open: boolean) => void>()
  const onCreated = vi.fn<(season: TSeason) => void>()
  const view = renderApp(
    <SeasonCreateDialog
      open
      onOpenChange={onOpenChange}
      onCreated={onCreated}
      switchTo={props.switchTo}
    />,
    {auth: admin()},
  )
  return {...view, onOpenChange, onCreated}
}

describe('SeasonCreateDialog', () => {
  it('requires a name before creating', async () => {
    const user = setupUser()
    const server = mockServer()
    renderDialog()
    const modal = dialog('New season')
    await user.click(within(modal).getByRole('button', {name: 'Create season'}))
    expect(within(modal).getByText('Give the season a name.')).toBeInTheDocument()
    expect(server.calls).toHaveLength(0)
    await user.type(within(modal).getByLabelText('Name'), 'W')
    expect(within(modal).queryByText('Give the season a name.')).not.toBeInTheDocument()
  })

  it('sends the chosen options and switches to the new season', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const created = makeSeason({name: 'Winter 2027'})
    const server = mockServer({'/SeasonCreate': () => created})
    const {onCreated, onOpenChange, context} = renderDialog({switchTo: true})
    const modal = dialog('New season')
    await user.type(within(modal).getByLabelText('Name'), '  Winter 2027  ')
    await chooseOption(user, 'Season type', 'Women’s')
    await user.click(within(modal).getByRole('radio', {name: /Official scoring/}))
    await user.click(within(modal).getByRole('switch', {name: 'Sign up open'}))
    await user.click(within(modal).getByRole('button', {name: 'Create season'}))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
    expect(server.payloads('/SeasonCreate')).toEqual([
      {
        name: 'Winter 2027',
        signUpOpen: true,
        genderDivision: 'women',
        useOfficialScoring: true,
      },
    ])
    expect(toasts.success).toHaveBeenCalledWith('Winter 2027 created')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(context.seasonSet).toHaveBeenCalledWith(created)
  })

  it('defaults to a mixed, simple, closed season and does not switch', async () => {
    const user = setupUser()
    const created = makeSeason({name: 'Autumn'})
    const server = mockServer({'/SeasonCreate': () => created})
    const {onCreated, context} = renderDialog()
    await user.type(screen.getByLabelText('Name'), 'Autumn{Enter}')
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(server.payloads('/SeasonCreate')).toEqual([
      {
        name: 'Autumn',
        signUpOpen: false,
        genderDivision: 'mixed',
        useOfficialScoring: false,
      },
    ])
    expect(context.seasonSet).not.toHaveBeenCalled()
  })

  it('keeps the dialog open and shows the server error', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    mockServer({
      '/SeasonCreate': () => {
        throw userError(400, 'Season name already exists.')
      },
    })
    const {onOpenChange, onCreated} = renderDialog()
    await user.type(screen.getByLabelText('Name'), 'Dup')
    await user.click(screen.getByRole('button', {name: 'Create season'}))
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith('Season name already exists.'),
    )
    expect(onCreated).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('closes on cancel', async () => {
    const user = setupUser()
    mockServer()
    const {onOpenChange} = renderDialog()
    await user.click(screen.getByRole('button', {name: 'Cancel'}))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
