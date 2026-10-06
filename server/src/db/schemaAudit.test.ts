import {describe, expect, it, vi} from 'vitest'
import {useTestDatabase} from '../../test/database'
import {allTables} from '../tables'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {random} from '../utils/random'
import mongo from './mongo'
import {runStartupSchemaAudit} from './schemaAudit'

useTestDatabase()

/** Writes a document without validation, the way legacy data ends up stored. */
const insertRaw = async (key: string, document: Record<string, unknown>) => {
  const now = new Date().toISOString()
  const collection = await mongo.collection(key)
  await collection.insertOne({
    id: random.generateId(),
    createdOn: now,
    updatedOn: now,
    ...document,
  })
}

describe('runStartupSchemaAudit', () => {
  it('reports invalid stored documents per table and property', async () => {
    const season = await $Season.createOne({name: 'Valid season'})
    await $Team.createOne({
      seasonId: season.id,
      name: 'Valid team',
      color: 'hsla(0, 0%, 100%, 1)',
    })
    await insertRaw($Team.key(), {seasonId: season.id, color: 'red'})
    await insertRaw($Team.key(), {seasonId: season.id, name: 'Bad colour', color: 'blue'})
    await insertRaw($Team.key(), {
      seasonId: season.id,
      name: 'Bad division',
      color: 'hsla(0, 0%, 100%, 1)',
      division: 'one',
    })
    await insertRaw($Season.key(), {
      name: 'Results',
      signUpOpen: false,
      finalResults: [
        {teamId: random.generateId(), position: null},
        {teamId: 5, position: 'first'},
        {teamId: random.generateId(), position: 'second'},
      ],
    })
    await insertRaw($Season.key(), {
      name: 'Not an array',
      signUpOpen: false,
      finalResults: 'none',
    })
    await insertRaw($User.key(), {
      firstName: 'A',
      lastName: 'B',
      genderMatching: 'female',
      termsAccepted: true,
      emails: [{value: 'not-an-email', verified: false, code: 'c', createdOn: 'x', primary: true}],
    })

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await runStartupSchemaAudit()

    expect(log.mock.calls[0][0]).toBe('Running Mongo schema audit...')
    const lines = String(log.mock.calls[1][0]).split('\n')
    expect(lines[0]).toBe('Mongo schema audit results:')

    const section = (key: string) => {
      const start = lines.findIndex((line) => line.startsWith(`- ${key}:`))
      const end = lines.findIndex(
        (line, index) => index > start && line.startsWith('- '),
      )
      return lines.slice(start, end === -1 ? undefined : end)
    }

    expect(section('team')).toEqual([
      '- team: 3 invalid of 4',
      '  - color: 2',
      '  - division: 1',
      '  - name: 1',
    ])
    // array indexes are folded into one property path, counted once per document
    expect(section('season')).toEqual([
      '- season: 2 invalid of 3',
      '  - finalResults: 1',
      '  - finalResults.position: 1',
      '  - finalResults.teamId: 1',
    ])
    expect(section('user')).toEqual([
      '- user: 1 invalid of 1',
      '  - emails.createdOn: 1',
      '  - emails.value: 1',
    ])
    for (const table of allTables) {
      if ([$Team.key(), $Season.key(), $User.key()].includes(table.key())) continue
      expect(section(table.key())).toEqual([`- ${table.key()}: ✓`])
    }
  })
})
