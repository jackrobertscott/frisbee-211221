import {TGamedayImportConfig} from '@shared/schemas/ioGamedayImport'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useTestDatabase} from '../../test/database'
import {$GamedayImportConfig} from '../tables/$GamedayImportConfig'
import {$GamedayImportRun} from '../tables/$GamedayImportRun'
import {$Member} from '../tables/$Member'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {encryptGamedayPassword} from './credentials'
import {runGamedayImportWithHistory} from './importMembers'
import {runGamedayExportProcess} from './runExportProcess'
import type {TGamedayExportMember} from './types'

vi.mock('./runExportProcess', () => ({runGamedayExportProcess: vi.fn()}))

useTestDatabase()

const exportMock = vi.mocked(runGamedayExportProcess)

let counter = 0

const createConfig = async (): Promise<TGamedayImportConfig> => {
  counter += 1
  const season = await $Season.createOne({
    name: `GameDay ${counter}`,
    genderDivision: 'mixed',
  })
  return $GamedayImportConfig.createOne({
    seasonId: season.id,
    username: 'gd-user',
    passwordEncrypted: encryptGamedayPassword('gd-pass'),
    association: 'Assoc',
    competition: 'Comp',
  })
}

const member = (
  overrides: Partial<TGamedayExportMember> = {},
): TGamedayExportMember => {
  counter += 1
  return {
    teamName: 'Alpha',
    firstName: `First${counter}`,
    lastName: `Last${counter}`,
    email: `gd.${counter}@example.com`,
    gender: 'Female',
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  exportMock.mockReset()
  vi.restoreAllMocks()
})

describe('runGamedayImportWithHistory', () => {
  it('exports with the decrypted password, imports members and records the run', async () => {
    const config = await createConfig()
    const male = member({gender: 'M', teamName: 'Beta'})
    const female = member({gender: ' female '})
    const blank = member({gender: ''})
    exportMock.mockResolvedValue({members: [male, female, blank]})

    const summary = await runGamedayImportWithHistory(config, 'manual')

    expect(exportMock).toHaveBeenCalledWith({
      startingUrl: 'https://membership.mygameday.app/',
      username: 'gd-user',
      password: 'gd-pass',
      association: 'Assoc',
      competition: 'Comp',
    })
    expect(summary).toEqual({
      rowsImported: 3,
      teamsCreated: 2,
      usersCreated: 3,
      membersCreated: 3,
      note: undefined,
    })

    const teams = await $Team.getMany({seasonId: config.seasonId}, {sort: {name: 1}})
    expect(teams.map((team) => team.name)).toEqual(['Alpha', 'Beta'])
    const genderOf = async (email: string) =>
      (await $User.getOne({'emails.value': email})).genderMatching
    expect(await genderOf(male.email)).toBe('male')
    expect(await genderOf(female.email)).toBe('female')
    // a blank GameDay gender uses the fallback without a note
    expect(await genderOf(blank.email)).toBe('female')
    expect(await $Member.count({seasonId: config.seasonId})).toBe(3)

    const runs = await $GamedayImportRun.getMany({configId: config.id})
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      seasonId: config.seasonId,
      trigger: 'manual',
      status: 'succeeded',
      association: 'Assoc',
      competition: 'Comp',
      rowsImported: 3,
      teamsCreated: 2,
      usersCreated: 3,
      membersCreated: 3,
    })
    expect(runs[0].note).toBeUndefined()
    expect(Date.parse(runs[0].finishedOn ?? '')).toBeGreaterThanOrEqual(
      Date.parse(runs[0].startedOn),
    )
  })

  it('skips invalid rows and notes them with unrecognised genders', async () => {
    const config = await createConfig()
    const valid = member({gender: 'Prefer not to say'})
    const other = member({gender: 'Other'})
    const repeated = member({gender: 'Other'})
    exportMock.mockResolvedValue({
      members: [
        valid,
        member({teamName: '  ', firstName: 'Ann', lastName: ' ', email: ''}),
        other,
        member({firstName: '', email: 'x@example.com'}),
        repeated,
      ],
    })

    const summary = await runGamedayImportWithHistory(config, 'scheduled')

    expect(summary.rowsImported).toBe(3)
    expect(summary.usersCreated).toBe(3)
    expect(summary.note).toBe(
      [
        'Skipped 2 invalid GameDay member rows.',
        '',
        'Rows skipped:',
        '- Row 3',
        '  Problems: missing team name; missing last name',
        '  Team: <blank>',
        '  First: "Ann"',
        '  Last: <blank>',
        '  Email: <blank>',
        '- Row 5',
        '  Problem: missing first name',
        '  Team: "Alpha"',
        '  First: <blank>',
        `  Last: "Last${counter}"`,
        '  Email: "x@example.com"',
        '',
        'Imported 2 unrecognised GameDay gender values as female gender matching:',
        '- "Other"',
        '- "Prefer not to say"',
      ].join('\n'),
    )
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(await $User.maybeOne({'emails.value': 'x@example.com'})).toBeUndefined()

    const [run] = await $GamedayImportRun.getMany({configId: config.id})
    expect(run).toMatchObject({
      trigger: 'scheduled',
      status: 'succeeded',
      rowsImported: 3,
      note: summary.note,
    })
  })

  it('limits the invalid row details in the note', async () => {
    const config = await createConfig()
    const invalid = Array.from({length: 27}, () => member({teamName: ''}))
    exportMock.mockResolvedValue({members: invalid})

    const summary = await runGamedayImportWithHistory(config, 'manual')

    expect(summary.rowsImported).toBe(0)
    const note = summary.note ?? ''
    expect(note.startsWith('Skipped 27 invalid GameDay member rows.')).toBe(true)
    expect(note).toContain('- Row 26\n')
    expect(note).not.toContain('- Row 27\n')
    expect(note.endsWith('- 2 additional rows omitted from this note.')).toBe(true)
  })

  it('uses singular wording for one invalid row, one omitted row and one gender', async () => {
    const config = await createConfig()
    exportMock.mockResolvedValue({
      members: [
        ...Array.from({length: 26}, () => member({lastName: ''})),
        member({gender: 'Unknown'}),
      ],
    })
    const summary = await runGamedayImportWithHistory(config, 'manual')
    expect(summary.note).toContain('Skipped 26 invalid GameDay member rows.')
    expect(summary.note).toContain('- 1 additional row omitted from this note.')
    expect(summary.note).toContain(
      'Imported 1 unrecognised GameDay gender value as female gender matching:\n- "Unknown"',
    )

    const single = await createConfig()
    exportMock.mockResolvedValue({members: [member({teamName: ''})]})
    const singleSummary = await runGamedayImportWithHistory(single, 'manual')
    expect(singleSummary.note?.split('\n')[0]).toBe(
      'Skipped 1 invalid GameDay member row.',
    )
  })

  it('records a failed run and rethrows the export error', async () => {
    const config = await createConfig()
    const error = new Error('GameDay export failed. Login stayed on the login page.')
    exportMock.mockRejectedValue(error)

    await expect(runGamedayImportWithHistory(config, 'manual')).rejects.toBe(error)

    const [run] = await $GamedayImportRun.getMany({configId: config.id})
    expect(run).toMatchObject({
      status: 'failed',
      errorMessage: 'GameDay export failed. Login stayed on the login page.',
    })
    expect(run.finishedOn).toBeDefined()
    expect(run.rowsImported).toBeUndefined()
    expect(await $Team.count({seasonId: config.seasonId})).toBe(0)
  })

  it('records non-Error failures as text', async () => {
    const config = await createConfig()
    exportMock.mockRejectedValue('plain failure')
    await expect(runGamedayImportWithHistory(config, 'manual')).rejects.toBe(
      'plain failure',
    )
    const [run] = await $GamedayImportRun.getMany({configId: config.id})
    expect(run.errorMessage).toBe('plain failure')
  })

  it('fails the run when the stored password cannot be decrypted', async () => {
    const config = await createConfig()
    const broken = await $GamedayImportConfig.updateOne(
      {id: config.id},
      {passwordEncrypted: 'plain-text'},
    )

    await expect(runGamedayImportWithHistory(broken, 'manual')).rejects.toThrow(
      'Stored GameDay password is not in a supported format.',
    )
    expect(exportMock).not.toHaveBeenCalled()
    const [run] = await $GamedayImportRun.getMany({configId: config.id})
    expect(run.status).toBe('failed')
  })
})
