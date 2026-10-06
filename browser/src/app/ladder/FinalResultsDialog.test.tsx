import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam} from '../../test/fixtures'
import {mockServer, serverError} from '../../test/server'
import {renderScreen} from '../common/screenTesting'
import {FinalResultsDialog} from './FinalResultsDialog'

describe('FinalResultsDialog', () => {
  it('edits existing positions and clears one back to no position', async () => {
    const red = makeTeam({name: 'Red Rockets', division: 1})
    const blue = makeTeam({name: 'Blue Bolts', division: 1})
    const season = makeSeason({
      genderDivision: 'mixed',
      isHidden: false,
      finalResults: [
        {teamId: red.id, position: 1},
        {teamId: blue.id, position: 2},
      ],
    })
    const server = mockServer({'/SeasonUpdate': (payload) => ({...season, ...(payload as object)})})
    const onSaved = vi.fn()
    const {user} = renderScreen(
      <FinalResultsDialog
        open
        onOpenChange={vi.fn()}
        season={season}
        teams={[red, blue]}
        divisions={[1]}
        onSaved={onSaved}
      />,
      {auth: makeAuth({user: {admin: true}}), context: {season}},
    )
    const dialog = screen.getByRole('dialog', {name: 'Final results'})
    expect(within(dialog).getByRole('spinbutton', {name: 'Red Rockets position'})).toHaveValue('1')
    await user.clear(within(dialog).getByRole('spinbutton', {name: 'Blue Bolts position'}))
    await user.type(within(dialog).getByRole('spinbutton', {name: 'Blue Bolts position'}), '{Enter}')
    await user.click(within(dialog).getByRole('button', {name: 'Save results'}))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(server.payloads('/SeasonUpdate')).toEqual([
      {
        seasonId: season.id,
        name: season.name,
        isHidden: false,
        signUpOpen: true,
        genderDivision: 'mixed',
        finalResults: [
          {teamId: red.id, position: 1},
          {teamId: blue.id, position: null},
        ],
      },
    ])
  })

  it('asks for divisions first and reports save errors', async () => {
    const season = makeSeason()
    mockServer({
      '/SeasonUpdate': () => {
        throw serverError(403, 'Only admins can change seasons.')
      },
    })
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    const {user} = renderScreen(
      <FinalResultsDialog
        open
        onOpenChange={onOpenChange}
        season={season}
        teams={[]}
        divisions={[]}
        onSaved={onSaved}
      />,
      {auth: makeAuth({user: {admin: true}}), context: {season}},
    )
    expect(
      screen.getByText('Assign teams to divisions before entering final results.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Save results'}))
    expect(await screen.findByText('Only admins can change seasons.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', {name: 'Cancel'}))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
