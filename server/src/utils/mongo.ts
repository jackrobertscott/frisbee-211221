import {AsyncLocalStorage} from 'node:async_hooks'
import {ClientSession, MongoClient, ObjectId} from 'mongodb'
import config from '../config'

let cachedClient: MongoClient
const sessionStore = new AsyncLocalStorage<ClientSession>()

export default {
  async database(db: string = config.MONGODB_DB) {
    return (await this.client()).db(db)
  },

  async collection(name: string, db: string = config.MONGODB_DB) {
    return (await this.client()).db(db).collection(name)
  },

  async client() {
    if (!cachedClient)
      cachedClient = await MongoClient.connect(config.MONGODB_URI)
    return cachedClient
  },

  options() {
    const session = sessionStore.getStore()
    return session ? {session} : undefined
  },

  async transaction(cb: () => Promise<void>) {
    const client = await this.client()
    const session = client.startSession()
    try {
      await session.withTransaction(() => sessionStore.run(session, cb))
    } finally {
      await session.endSession()
    }
  },

  ids: {
    equal(first?: ObjectId, second?: ObjectId) {
      return Boolean(first && second && first.equals(second))
    },
  },
}
