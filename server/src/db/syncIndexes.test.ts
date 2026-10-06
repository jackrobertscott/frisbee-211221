import {Collection} from 'mongodb'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useTestDatabase} from '../../test/database'
import {allTables} from '../tables'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import mongo from './mongo'
import {runStartupIndexSync} from './syncIndexes'

useTestDatabase()

const logLines = () =>
  vi.mocked(console.log).mock.calls.map((call) => String(call[0]))

const indexNames = async (key: string) => {
  const collection = await mongo.collection(key)
  const indexes = await collection.listIndexes().toArray()
  return indexes.map((index) => String(index.name)).sort()
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('runStartupIndexSync', () => {
  it('creates every declared index on an empty database', async () => {
    await runStartupIndexSync()

    for (const table of allTables) {
      expect(await indexNames(table.key())).toEqual(
        ['_id_', ...table.indexes().map((index) => index.name)].sort(),
      )
    }
    expect(logLines()[0]).toBe('Syncing Mongo indexes...')
    expect(logLines().at(-1)).toBe('Mongo indexes synced.')
    expect(logLines()).toContain(
      `- team | created: ${$Team.indexes().map((index) => index.name).join(', ')}`,
    )

    // the collation is applied to the created index
    const userCollection = await mongo.collection($User.key())
    const emailIndex = (await userCollection.listIndexes().toArray()).find(
      (index) => index.name === 'emails.value_asc',
    )
    expect(emailIndex?.collation).toMatchObject({locale: 'en', strength: 2})
  })

  it('changes nothing when the indexes already match', async () => {
    await runStartupIndexSync()
    vi.mocked(console.log).mockClear()

    await runStartupIndexSync()

    // collations reported back with server defaults (version, strength 3, ...)
    // still match their declared definitions
    expect(logLines()).toEqual(['Syncing Mongo indexes...', 'Mongo indexes synced.'])
  })

  it('drops unknown indexes and recreates changed ones', async () => {
    await runStartupIndexSync()
    const teams = await mongo.collection($Team.key())
    await teams.createIndex({phone: 1}, {name: 'stray_index'})
    // same name as a declared index but no longer matching its definition
    await teams.dropIndex('createdOn_asc')
    await teams.createIndex({createdOn: 1}, {name: 'createdOn_asc', unique: true})
    vi.mocked(console.log).mockClear()

    await runStartupIndexSync()

    expect(logLines()).toContain(
      '- team | dropped: stray_index, createdOn_asc | created: createdOn_asc',
    )
    expect(await indexNames($Team.key())).toEqual(
      ['_id_', ...$Team.indexes().map((index) => index.name)].sort(),
    )
    const createdOn = (await teams.listIndexes().toArray()).find(
      (index) => index.name === 'createdOn_asc',
    )
    expect(createdOn?.unique).toBeUndefined()
  })

  it('rethrows errors other than a missing collection', async () => {
    const failure = Object.assign(new Error('not authorized'), {code: 13})
    vi.spyOn(Collection.prototype, 'listIndexes').mockImplementation(() => {
      throw failure
    })
    await expect(runStartupIndexSync()).rejects.toBe(failure)
  })

  it.each([
    ['code 26', Object.assign(new Error('missing'), {code: 26})],
    ['the message', new Error('ns does not exist: db.coll')],
  ])('treats a missing namespace (%s) as having no indexes', async (_label, error) => {
    const created: string[] = []
    vi.spyOn(Collection.prototype, 'listIndexes').mockImplementation(() => {
      throw error
    })
    vi.spyOn(Collection.prototype, 'createIndex').mockImplementation(
      async (_key, options) => {
        created.push(options?.name ?? '')
        return options?.name ?? ''
      },
    )
    await runStartupIndexSync()
    expect(created).toEqual(
      allTables.flatMap((table) => table.indexes().map((index) => index.name)),
    )
  })
})
