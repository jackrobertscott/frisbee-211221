import {$AuthAttemptLimit} from '../tables/$AuthAttemptLimit'
import {$Comment} from '../tables/$Comment'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Post} from '../tables/$Post'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Session} from '../tables/$Session'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import mongo from './mongo'
import {TCompiledTableIndex} from './db'

type TIndexedTable = {
  key(): string
  indexes(): TCompiledTableIndex[]
}

const tables: TIndexedTable[] = [
  $AuthAttemptLimit,
  $Comment,
  $Fixture,
  $Member,
  $Post,
  $Report,
  $Season,
  $Session,
  $Team,
  $User,
]

export async function runStartupIndexSync() {
  console.log('Syncing Mongo indexes...')

  for (const table of tables) {
    await syncTableIndexes(table)
  }

  console.log('Mongo indexes synced.')
}

async function syncTableIndexes(table: TIndexedTable) {
  const collection = await mongo.collection(table.key())
  const desiredIndexes = table.indexes()
  const desiredNormalized = new Set(desiredIndexes.map((index) => normalizeIndex(index)))
  const existingIndexes = await listIndexesSafely(collection)
  const dropNames = existingIndexes
    .filter((index) => index.name !== '_id_')
    .filter((index) => !desiredNormalized.has(normalizeIndex(index)))
    .map((index) => index.name)

  for (const name of dropNames) {
    await collection.dropIndex(name)
  }

  const currentNames = new Set(
    (await listIndexesSafely(collection)).map((index) => index.name),
  )
  const createdNames: string[] = []

  for (const index of desiredIndexes) {
    if (currentNames.has(index.name)) continue
    await collection.createIndex(index.key, {
      name: index.name,
      ...(index.unique ? {unique: true} : {}),
      ...(index.sparse ? {sparse: true} : {}),
      ...(typeof index.expireAfterSeconds === 'number'
        ? {expireAfterSeconds: index.expireAfterSeconds}
        : {}),
      ...(index.partialFilterExpression
        ? {partialFilterExpression: index.partialFilterExpression}
        : {}),
      ...(index.collation ? {collation: index.collation} : {}),
    })
    createdNames.push(index.name)
  }

  if (!dropNames.length && !createdNames.length) return

  console.log(
    [
      `- ${table.key()}`,
      dropNames.length ? `dropped: ${dropNames.join(', ')}` : '',
      createdNames.length ? `created: ${createdNames.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
  )
}

async function listIndexesSafely(collection: Awaited<ReturnType<typeof mongo.collection>>) {
  try {
    return await collection.listIndexes().toArray()
  } catch (error) {
    if (isNamespaceMissing(error)) return []
    throw error
  }
}

function isNamespaceMissing(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? error.code : undefined
  const message = 'message' in error ? error.message : undefined
  return (
    code === 26 ||
    (typeof message === 'string' && /ns does not exist/i.test(message))
  )
}

function normalizeIndex(index: Record<string, unknown> | TCompiledTableIndex) {
  return stableStringify({
    name: index.name,
    key: normalizeIndexKey(index.key),
    options: {
      unique: Boolean(index.unique),
      sparse: Boolean(index.sparse),
      expireAfterSeconds:
        typeof index.expireAfterSeconds === 'number'
          ? index.expireAfterSeconds
          : undefined,
      partialFilterExpression: index.partialFilterExpression,
      collation: normalizeCollation(index.collation),
    },
  })
}

function normalizeIndexKey(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return JSON.stringify(value)
  return JSON.stringify(
    Object.entries(value as Record<string, unknown>).map(([key, direction]) => [
      key,
      direction,
    ]),
  )
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  )
}

function normalizeCollation(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const collation = value as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(collation).filter(([key, item]) => {
      if (item === undefined) return false
      if (key === 'version') return false
      if (key === 'caseLevel') return item !== false
      if (key === 'caseFirst') return item !== 'off'
      if (key === 'strength') return item !== 3
      if (key === 'numericOrdering') return item !== false
      if (key === 'alternate') return item !== 'non-ignorable'
      if (key === 'maxVariable') return item !== 'punct'
      if (key === 'normalization') return item !== false
      if (key === 'backwards') return item !== false
      return true
    }),
  )
}
