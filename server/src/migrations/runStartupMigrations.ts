import {randomUUID} from 'crypto'
import {Collection, MongoServerError} from 'mongodb'
import mongo from '../utils/mongo'
import {runLegacyUserEmailMigration} from './legacyUserEmailMigration'

const MIGRATION_COLLECTION = 'migration'
const LOCK_TIMEOUT_MS = 60 * 60 * 1000
const WAIT_TIMEOUT_MS = LOCK_TIMEOUT_MS + 5 * 60 * 1000
const WAIT_INTERVAL_MS = 1000

type TMigrationRecord = {
  _id: string
  status: 'running' | 'completed' | 'failed'
  owner?: string
  error?: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  lockExpiresAt?: string
}

const STARTUP_MIGRATIONS = [
  {
    key: 'legacy-user-email-to-emails-v1',
    run: runLegacyUserEmailMigration,
  },
] as const

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isDuplicateKeyError(error: unknown) {
  return error instanceof MongoServerError && error.code === 11000
}

function isExpired(record: TMigrationRecord) {
  return Boolean(
    record.status === 'running' &&
      record.lockExpiresAt &&
      new Date(record.lockExpiresAt).getTime() <= Date.now()
  )
}

async function tryAcquireMigrationLock(
  collection: Collection<TMigrationRecord>,
  key: string,
  current?: TMigrationRecord | null
) {
  const now = new Date().toISOString()
  const owner = randomUUID()
  const lockExpiresAt = new Date(Date.now() + LOCK_TIMEOUT_MS).toISOString()

  if (!current) {
    try {
      await collection.insertOne({
        _id: key,
        status: 'running',
        owner,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        lockExpiresAt,
      })
      return owner
    } catch (error) {
      if (isDuplicateKeyError(error)) return undefined
      throw error
    }
  }

  if (current.status === 'completed') return undefined
  if (current.status === 'running' && !isExpired(current)) return undefined

  const result =
    current.status === 'failed'
      ? await collection.updateOne(
          {_id: key, status: 'failed', updatedAt: current.updatedAt},
          {
            $set: {
              status: 'running',
              owner,
              updatedAt: now,
              startedAt: now,
              lockExpiresAt,
            },
            $unset: {
              error: '',
              completedAt: '',
            },
          }
        )
      : await collection.updateOne(
          {
            _id: key,
            status: 'running',
            owner: current.owner,
            lockExpiresAt: current.lockExpiresAt,
          },
          {
            $set: {
              status: 'running',
              owner,
              updatedAt: now,
              startedAt: now,
              lockExpiresAt,
            },
            $unset: {
              error: '',
              completedAt: '',
            },
          }
        )

  return result.modifiedCount === 1 ? owner : undefined
}

async function runOneTimeMigration(options: {
  key: string
  run: () => Promise<number>
}) {
  const collection = (await mongo.database()).collection<TMigrationRecord>(
    MIGRATION_COLLECTION
  )
  const waitStartedAt = Date.now()
  let waitingLogged = false

  while (true) {
    const current = await collection.findOne({_id: options.key})
    if (current?.status === 'completed') return

    const owner = await tryAcquireMigrationLock(collection, options.key, current)
    if (owner) {
      console.log(`[migration] running ${options.key}`)
      try {
        const migratedCount = await options.run()
        const completedAt = new Date().toISOString()
        const result = await collection.updateOne(
          {_id: options.key, status: 'running', owner},
          {
            $set: {
              status: 'completed',
              updatedAt: completedAt,
              completedAt,
            },
            $unset: {
              owner: '',
              lockExpiresAt: '',
              error: '',
            },
          }
        )

        if (result.modifiedCount !== 1) {
          throw new Error(`Migration ${options.key} lost its execution lock.`)
        }

        console.log(`[migration] completed ${options.key} (${migratedCount} users)`)
        return
      } catch (error) {
        const failedAt = new Date().toISOString()
        await collection.updateOne(
          {_id: options.key, status: 'running', owner},
          {
            $set: {
              status: 'failed',
              updatedAt: failedAt,
              error: error instanceof Error ? error.stack ?? error.message : String(error),
            },
            $unset: {
              owner: '',
              lockExpiresAt: '',
            },
          }
        )
        throw error
      }
    }

    if (!waitingLogged) {
      console.log(`[migration] waiting for ${options.key} to finish on another instance`)
      waitingLogged = true
    }

    if (Date.now() - waitStartedAt > WAIT_TIMEOUT_MS) {
      throw new Error(`Timed out waiting for migration ${options.key} to complete.`)
    }

    await sleep(WAIT_INTERVAL_MS)
  }
}

export async function runStartupMigrations() {
  for (const migration of STARTUP_MIGRATIONS) {
    await runOneTimeMigration(migration)
  }
}
