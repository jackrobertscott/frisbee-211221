import {afterAll} from 'vitest'
import mongo from '../src/db/mongo'

/**
 * For unit tests that use the tables directly: drops the test file's database
 * and closes the shared client once the file has finished.
 */
export function useTestDatabase() {
  afterAll(async () => {
    const db = await mongo.database()
    await db.dropDatabase()
    await (await mongo.client()).close()
  })
}
