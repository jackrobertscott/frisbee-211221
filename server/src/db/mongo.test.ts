import {MongoClient} from 'mongodb'
import {MongoMemoryReplSet} from 'mongodb-memory-server'
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest'
import config from '../config'
import {$Season} from '../tables/$Season'
import mongo from './mongo'

// transactions need a replica set, unlike the shared standalone test server
let replSet: MongoMemoryReplSet

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({replSet: {count: 1}})
  config.MONGODB_URI = replSet.getUri()
})

afterAll(async () => {
  const db = await mongo.database()
  await db.dropDatabase()
  await (await mongo.client()).close()
  await replSet.stop()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mongo', () => {
  it('retries the connection after a failed first connect', async () => {
    const failure = new Error('connect ECONNREFUSED')
    const connect = vi.spyOn(MongoClient, 'connect').mockRejectedValueOnce(failure)

    await expect(mongo.client()).rejects.toBe(failure)
    const [first, second] = await Promise.all([mongo.client(), mongo.client()])

    // concurrent callers share one client once connected
    expect(first).toBe(second)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(await mongo.client()).toBe(first)
  })

  it('retries transaction detection after a failure and then caches it', async () => {
    const failure = new Error('hello failed')
    const detect = vi
      .spyOn(mongo, '_detectTransactionSupport')
      .mockRejectedValueOnce(failure)

    await expect(mongo.supportsTransactions()).rejects.toBe(failure)
    expect(await mongo.supportsTransactions()).toBe(true)
    expect(await mongo.supportsTransactions()).toBe(true)
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it('runs work in a session and commits it', async () => {
    expect(mongo.options()).toBeUndefined()
    let insideOptions: ReturnType<typeof mongo.options>

    await mongo.transaction(async () => {
      insideOptions = mongo.options()
      await $Season.createOne({name: 'Committed'})
      // reads in the same transaction see the uncommitted write
      expect(await $Season.count({name: 'Committed'})).toBe(1)
    })

    expect(insideOptions?.session).toBeDefined()
    expect(insideOptions?.session.hasEnded).toBe(true)
    expect(mongo.options()).toBeUndefined()
    expect(await $Season.count({name: 'Committed'})).toBe(1)
  })

  it('rolls back every write when the work fails', async () => {
    const failure = new Error('stop')
    await expect(
      mongo.transaction(async () => {
        await $Season.createOne({name: 'Rolled back 1'})
        await $Season.createOne({name: 'Rolled back 2'})
        throw failure
      }),
    ).rejects.toBe(failure)

    expect(
      await $Season.count({name: {$in: ['Rolled back 1', 'Rolled back 2']}}),
    ).toBe(0)
  })
})
