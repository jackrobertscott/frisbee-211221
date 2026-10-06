import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason} from '../../test/fixtures'
import {mockServer} from '../../test/server'
import {renderScreen, userError} from '../common/screenTesting'
import {ExportDialog, ImportCsvDialog, MockDeleteDialog, MockGenerateDialog} from './PortDialogs'

const admin = () => makeAuth({user: {admin: true}})

describe('ImportCsvDialog', () => {
  it('uploads the chosen CSV with the season id', async () => {
    const season = makeSeason({name: 'Winter 2026'})
    const server = mockServer({'/PortImport': () => undefined})
    const onOpenChange = vi.fn()
    const onDone = vi.fn()
    const {user} = renderScreen(
      <ImportCsvDialog open onOpenChange={onOpenChange} season={season} onDone={onDone} />,
      {auth: admin(), context: {season}},
    )
    const dialog = screen.getByRole('dialog', {name: 'Import CSV'})
    expect(dialog).toHaveAccessibleDescription('Members are imported into Winter 2026.')
    expect(within(dialog).getByText('team_division')).toBeInTheDocument()
    const upload = within(dialog).getByRole('button', {name: 'Upload'})
    expect(upload).toBeDisabled()

    const input = dialog.querySelector<HTMLInputElement>('input[type=file]')
    if (!input) throw new Error('file input missing')
    const first = new File(['team_name\nRed'], 'old.csv', {type: 'text/csv'})
    await user.upload(input, first)
    expect(within(dialog).getByText('old.csv')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', {name: 'Remove old.csv'}))
    expect(within(dialog).queryByText('old.csv')).not.toBeInTheDocument()

    const csv = new File(['team_name\nBlue'], 'members.csv', {type: 'text/csv'})
    const again = dialog.querySelector<HTMLInputElement>('input[type=file]')
    if (!again) throw new Error('file input missing')
    await user.upload(again, csv)
    expect(within(dialog).getByText('Ready to upload')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', {name: 'Upload'}))

    expect(await screen.findByText('Import finished.')).toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onDone).toHaveBeenCalled()
    const [payload] = server.payloads('/PortImport')
    if (!(payload instanceof FormData)) throw new Error('expected multipart payload')
    expect(payload.get('seasonId')).toBe(season.id)
    const sent = payload.get('csv')
    expect(sent instanceof File && sent.name).toBe('members.csv')
  })

  it('reports a failed import and stays open', async () => {
    const season = makeSeason()
    mockServer({
      '/PortImport': () => {
        throw userError(400, 'Row 3 is missing an email address.')
      },
    })
    const onOpenChange = vi.fn()
    const {user} = renderScreen(
      <ImportCsvDialog open onOpenChange={onOpenChange} season={season} onDone={vi.fn()} />,
      {auth: admin(), context: {season}},
    )
    const dialog = screen.getByRole('dialog', {name: 'Import CSV'})
    const input = dialog.querySelector<HTMLInputElement>('input[type=file]')
    if (!input) throw new Error('file input missing')
    await user.upload(input, new File(['x'], 'bad.csv', {type: 'text/csv'}))
    await user.click(within(dialog).getByRole('button', {name: 'Upload'}))
    expect(await screen.findByText('Row 3 is missing an email address.')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})

describe('ExportDialog', () => {
  it('downloads the chosen file type as a zip', async () => {
    const server = mockServer()
    server.fetch.mockResolvedValueOnce(
      new Response(new Blob(['zip']), {status: 200, headers: {'Content-Type': 'application/zip'}}),
    )
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:export')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(window.URL, 'createObjectURL', {value: createObjectURL, configurable: true})
    Object.defineProperty(window.URL, 'revokeObjectURL', {value: revokeObjectURL, configurable: true})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onOpenChange = vi.fn()
    const {user} = renderScreen(<ExportDialog open onOpenChange={onOpenChange} />, {auth: admin()})
    const dialog = screen.getByRole('dialog', {name: 'Export data'})
    expect(within(dialog).getByRole('radio', {name: /CSV/})).toBeChecked()
    await user.click(within(dialog).getByRole('radio', {name: /JSON/}))
    await user.click(within(dialog).getByRole('button', {name: 'Export'}))

    expect(await screen.findByText('Export downloaded.')).toBeInTheDocument()
    const [url, init] = server.fetch.mock.calls[0]
    expect(String(url)).toMatch(/\/PortExport$/)
    expect(JSON.parse(String(init?.body)).payload).toEqual({fileType: 'json'})
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('complains when the server does not return a file', async () => {
    mockServer({'/PortExport': () => ({not: 'a file'})})
    const onOpenChange = vi.fn()
    const {user} = renderScreen(<ExportDialog open onOpenChange={onOpenChange} />, {auth: admin()})
    await user.click(screen.getByRole('button', {name: 'Export'}))
    expect(await screen.findByText('Export did not return a file.')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})

describe('MockGenerateDialog', () => {
  it('validates the counts and generates mock data', async () => {
    const season = makeSeason({name: 'Winter 2026'})
    const server = mockServer({'/PortMockGenerate': () => undefined})
    const onOpenChange = vi.fn()
    const onDone = vi.fn()
    const {user} = renderScreen(
      <MockGenerateDialog open onOpenChange={onOpenChange} season={season} onDone={onDone} />,
      {auth: admin(), context: {season}},
    )
    const dialog = screen.getByRole('dialog', {name: 'Generate mock data'})
    await user.click(within(dialog).getByRole('button', {name: 'Generate'}))
    expect(within(dialog).getByText('Please enter a valid number of teams.')).toBeInTheDocument()
    expect(within(dialog).getByText('Please enter a valid number of users per team.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('spinbutton', {name: /Number of teams/}), '6{Enter}')
    await user.click(within(dialog).getByRole('button', {name: 'Generate'}))
    expect(within(dialog).queryByText('Please enter a valid number of teams.')).not.toBeInTheDocument()
    expect(server.payloads('/PortMockGenerate')).toHaveLength(0)

    await user.type(within(dialog).getByRole('spinbutton', {name: /Users per team/}), '12{Enter}')
    await user.click(within(dialog).getByRole('button', {name: 'Generate'}))
    expect(await screen.findByText('Mock data generated successfully')).toBeInTheDocument()
    expect(server.payloads('/PortMockGenerate')).toEqual([
      {seasonId: season.id, teams: 6, usersPerTeam: 12},
    ])
    expect(onDone).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('MockDeleteDialog', () => {
  it('deletes all mock data after confirmation', async () => {
    const server = mockServer({'/PortDeleteAllMockData': () => undefined})
    const onDone = vi.fn()
    const onOpenChange = vi.fn()
    const {user} = renderScreen(
      <MockDeleteDialog open onOpenChange={onOpenChange} onDone={onDone} />,
      {auth: admin()},
    )
    await user.click(screen.getByRole('button', {name: 'Delete all mock data'}))
    expect(await screen.findByText('All mock data has been deleted successfully')).toBeInTheDocument()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onDone).toHaveBeenCalled()
    expect(server.payloads('/PortDeleteAllMockData')).toHaveLength(1)
  })
})
