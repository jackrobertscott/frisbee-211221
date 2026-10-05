import {AsyncLocalStorage} from 'node:async_hooks'
import {ClientSession, MongoClient, ObjectId} from 'mongodb'
import config from '../config'

let cachedClient: Promise<MongoClient> | undefined
let cachedTransactionSupport: Promise<boolean> | undefined
const sessionStore = new AsyncLocalStorage<ClientSession>()

export default {
  async database(db: string = config.MONGODB_DB) {
    return (await this.client()).db(db)
  },

  async collection(name: string, db: string = config.MONGODB_DB) {
    return (await this.client()).db(db).collection(name)
  },

  async client() {
    // cache the promise so concurrent first requests share one connection pool
    cachedClient ??= MongoClient.connect(config.MONGODB_URI).catch((error) => {
      cachedClient = undefined
      throw error
    })
    return cachedClient
  },

  async supportsTransactions() {
    cachedTransactionSupport ??= this._detectTransactionSupport().catch(
      (error) => {
        cachedTransactionSupport = undefined
        throw error
      },
    )
    return cachedTransactionSupport
  },

  async _detectTransactionSupport() {
    const client = await this.client()
    if (client.options.loadBalanced) return true
    const hello = await (await this.database('admin')).command({hello: 1})
    return Boolean(typeof hello.setName === 'string' || hello.msg === 'isdbgrid')
  },

  options() {
    const session = sessionStore.getStore()
    return session ? {session} : undefined
  },

  async transaction(cb: () => Promise<void>) {
    if (!(await this.supportsTransactions())) {
      await cb()
      return
    }
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
