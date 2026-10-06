import {Readable} from 'node:stream'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {TGamedayExportInput, TGamedayExportOutput} from './types'

// a shared mock, since every run re-imports the CLI and its mocked exporter
const {exportMock} = vi.hoisted(() => ({
  exportMock: vi.fn<(input: TGamedayExportInput) => Promise<TGamedayExportOutput>>(),
}))

vi.mock('./exporter', () => ({exportGamedayMembers: exportMock}))

const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin')

const output: TGamedayExportOutput = {
  members: [
    {
      teamName: 'Team',
      firstName: 'First',
      lastName: 'Last',
      email: 'first@example.com',
      gender: 'Male',
    },
  ],
}

/** Runs the CLI module against `stdin` and resolves once it has finished. */
const runCli = async (stdin: string[]) => {
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: Readable.from(stdin.map((chunk) => Buffer.from(chunk, 'utf8'))),
  })
  const written: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    written.push(String(chunk))
    return true
  })
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.resetModules()
  await import('./exportCli')
  await vi.waitFor(() => {
    expect(written.length + errors.mock.calls.length).toBeGreaterThan(0)
  })
  vi.mocked(process.stdout.write).mockRestore()
  return {written, errors}
}

beforeEach(() => {
  process.exitCode = undefined
})

afterEach(() => {
  if (stdinDescriptor) Object.defineProperty(process, 'stdin', stdinDescriptor)
  process.exitCode = undefined
  exportMock.mockReset()
  vi.restoreAllMocks()
})

describe('exportCli', () => {
  it('reads the input from stdin and writes the export as JSON', async () => {
    exportMock.mockResolvedValue(output)
    const input = {
      startingUrl: ' https://example.com/ ',
      username: 'user',
      password: ' pass ',
      association: 'Assoc',
      competition: 'Comp',
      headless: false,
    }
    const text = JSON.stringify(input)

    const {written, errors} = await runCli([text.slice(0, 7), text.slice(7)])

    expect(exportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startingUrl: 'https://example.com/',
        password: ' pass ',
        headless: false,
      }),
    )
    expect(written).toEqual([JSON.stringify(output)])
    expect(errors).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('fails with exit code 1 for input that is not JSON', async () => {
    const {written, errors} = await runCli(['not json'])
    expect(written).toEqual([])
    expect(String(errors.mock.calls[0][0])).toMatch(/^GameDay export failed: /)
    expect(process.exitCode).toBe(1)
    expect(exportMock).not.toHaveBeenCalled()
  })

  it('fails with the validation message for invalid input', async () => {
    const {errors} = await runCli([JSON.stringify({startingUrl: 'x', username: ' '})])
    expect(errors).toHaveBeenCalledWith(
      'GameDay export failed: username is required.',
    )
    expect(process.exitCode).toBe(1)
  })

  it('reports non-Error failures from the exporter', async () => {
    exportMock.mockRejectedValue('browser crashed')
    const {errors} = await runCli([
      JSON.stringify({
        startingUrl: 'x',
        username: 'u',
        password: 'p',
        association: 'a',
        competition: 'c',
      }),
    ])
    expect(errors).toHaveBeenCalledWith('GameDay export failed: browser crashed')
    expect(process.exitCode).toBe(1)
  })
})
