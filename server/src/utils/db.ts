import {notFoundError} from '@shared/errors'
import {CollationOptions, Document, Filter, FindOptions, WithId} from 'mongodb'
import {TypeIoAll, TypeIoValue} from '@shared/torva'
import mongo from './mongo'
import {Simplify} from './types'

export interface TQueryOptions<T> {
  sort?: {[key in keyof T]?: 1 | -1}
  limit?: number
  skip?: number
  collation?: CollationOptions
}

export type TTableIndex = {
  key: Record<string, 1 | -1>
  name?: string
  unique?: boolean
  sparse?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Document
  collation?: CollationOptions
}

export type TCompiledTableIndex = TTableIndex & {
  name: string
}

export const db = {
  table<T extends TypeIoAll, P extends Partial<TypeIoValue<T>>>(options: {
    key: string
    indexes: TTableIndex[]
    schema: T
    defaults?: {[K in keyof P]?: () => P[K]}
  }) {
    type V = TypeIoValue<T>
    const indexes = options.indexes.map(_compileTableIndex)
    const duplicateIndex = indexes.find(
      (index, current) =>
        indexes.findIndex((other) => other.name === index.name) !== current,
    )
    if (duplicateIndex)
      throw new Error(
        `Duplicate index name "${duplicateIndex.name}" on table "${options.key}".`,
      )
    return {
      validator() {
        return options.schema
      },

      key() {
        return options.key
      },

      indexes() {
        return indexes
      },

      async count(query: Filter<V>): Promise<number> {
        const collection = await mongo.collection(options.key)
        return collection.countDocuments(
          query as Filter<Document>,
          mongo.options(),
        ) as Promise<number>
      },

      async maybeOne(
        query: Filter<V>,
        queryOptions?: TQueryOptions<V>,
      ): Promise<V | undefined> {
        const collection = await mongo.collection(options.key)
        const result = await collection.findOne(
          query as Filter<Document>,
          {...(queryOptions as FindOptions), ...mongo.options()},
        )
        return result ? this._clean(result as any) : undefined
      },

      async getOne(query: Filter<V>): Promise<V> {
        const data = await this.maybeOne(query)
        if (!data)
          throw notFoundError(`Failed to get ${options.key}.`, {
            errorCode: 'db.record_not_found',
            meta: {table: options.key},
          })
        return data
      },

      async getMany(
        query: Filter<V>,
        queryOptions?: TQueryOptions<V>,
      ): Promise<V[]> {
        const collection = await mongo.collection(options.key)
        let chain = collection.find(query as Filter<Document>, mongo.options())
        if (queryOptions?.collation)
          chain = chain.collation(queryOptions.collation)
        // cursor.sort() replaces any previous sort, so pass every key at once
        if (queryOptions?.sort && Object.keys(queryOptions.sort).length)
          chain = chain.sort(queryOptions.sort as Record<string, 1 | -1>)
        if (queryOptions?.skip) chain = chain.skip(queryOptions.skip)
        if (queryOptions?.limit) chain = chain.limit(queryOptions.limit)
        const result = await chain.toArray()
        return result.map((i) => this._clean(i as any))
      },

      async scanStored(
        callback: (value: unknown) => Promise<void> | void,
        query: Filter<V> = {},
      ): Promise<number> {
        const collection = await mongo.collection(options.key)
        const cursor = collection.find(query as Filter<Document>, mongo.options())
        let count = 0
        for await (const result of cursor) {
          await callback(this._clean(result as any) as unknown)
          count += 1
        }
        return count
      },

      async createOne(
        value: Simplify<Omit<V, keyof P> & Partial<P>>,
      ): Promise<V> {
        const defaults = this._compileDefaults()
        const i = options.schema.validate({...defaults, ...value})
        if (!i.ok) throw i.error
        const collection = await mongo.collection(options.key)
        const result = await collection.insertOne(i.value, mongo.options())
        return this.getOne({_id: result.insertedId} as any)
      },

      async createMany(
        value: Simplify<Omit<V, keyof P> & Partial<P>>[],
      ): Promise<number> {
        const all = []
        for (let x = 0; x < value.length; x++) {
          const defaults = this._compileDefaults()
          const i = options.schema.validate({...defaults, ...value[x]})
          if (!i.ok) throw i.error
          all.push(i.value)
        }
        const collection = await mongo.collection(options.key)
        await collection.insertMany(all, mongo.options())
        return all.length
      },

      async updateOne(query: Filter<V>, value: Partial<V>): Promise<V> {
        const current = await this.maybeOne(query)
        if (!current)
          throw notFoundError('Failed to find document.', {
            errorCode: 'db.record_not_found',
            meta: {table: options.key},
          })
        const i = options.schema.validate({...current, ...value})
        if (!i.ok) throw i.error
        const update = _changedFieldsUpdate(i.value, value)
        if (update) {
          const collection = await mongo.collection(options.key)
          await collection.updateOne(
            query as Filter<Document>,
            update,
            mongo.options(),
          )
        }
        return i.value as V
      },

      async updateMany(query: Filter<V>, value: Partial<V>): Promise<number> {
        const collection = await mongo.collection(options.key)
        const $set = {...(value as Record<string, unknown>)}
        delete $set.id
        delete $set._id
        const $unset = Object.fromEntries(
          Object.entries($set)
            .filter(([, item]) => item === undefined)
            .map(([key]) => [key, '']),
        )
        const nextSet = Object.fromEntries(
          Object.entries($set).filter(([, item]) => item !== undefined),
        )
        if (!Object.keys(nextSet).length && !Object.keys($unset).length) return 0
        const result = await collection.updateMany(
          query as Filter<Document>,
          {
            ...(Object.keys(nextSet).length ? {$set: nextSet} : {}),
            ...(Object.keys($unset).length ? {$unset} : {}),
          },
          mongo.options(),
        )
        return result.modifiedCount
      },

      async updateBulk(tasks: Array<{query: Filter<V>; value: Partial<V>}>) {
        const operations = [] as Array<{
          updateOne: {
            filter: Filter<Document>
            update: Document
          }
        }>
        for (const task of tasks) {
          const current = await this.maybeOne(task.query)
          if (!current)
            throw notFoundError('Failed to find document.', {
              errorCode: 'db.record_not_found',
              meta: {table: options.key},
            })
          const validated = options.schema.validate({...current, ...task.value})
          if (!validated.ok) throw validated.error
          const update = _changedFieldsUpdate(validated.value, task.value)
          if (!update) continue
          operations.push({
            updateOne: {
              filter: task.query as Filter<Document>,
              update,
            },
          })
        }
        const collection = await mongo.collection(options.key)
        if (operations.length)
          await collection.bulkWrite(operations, mongo.options())
      },

      /**
       * Atomic single-document update (operators or an aggregation pipeline)
       * that returns the document after (or before) the write. It skips schema validation,
       * so callers must write every field the schema requires.
       */
      async updateAtomic(
        query: Filter<V>,
        update: Document | Document[],
        updateOptions?: {upsert?: boolean; returnDocument?: 'before' | 'after'},
      ): Promise<V | undefined> {
        const collection = await mongo.collection(options.key)
        const result = await collection.findOneAndUpdate(
          query as Filter<Document>,
          update,
          {
            ...mongo.options(),
            upsert: updateOptions?.upsert ?? false,
            returnDocument: updateOptions?.returnDocument ?? 'after',
          },
        )
        return result ? this._clean(result as unknown as WithId<V>) : undefined
      },

      async aggregate<T = V>(pipeline: Document[]): Promise<T[]> {
        const collection = await mongo.collection(options.key)
        const result = await collection
          .aggregate(pipeline, mongo.options())
          .toArray()
        return result.map((i) => this._clean(i as any)) as T[]
      },

      async deleteOne(query: Filter<V>): Promise<number> {
        const collection = await mongo.collection(options.key)
        const result = await collection.deleteOne(
          query as Filter<Document>,
          mongo.options(),
        )
        return result.deletedCount
      },

      async deleteMany(query: Filter<V>): Promise<number> {
        const collection = await mongo.collection(options.key)
        const result = await collection.deleteMany(
          query as Filter<Document>,
          mongo.options(),
        )
        return result.deletedCount
      },

      _clean(value: WithId<V>): V {
        const {_id, ...result} = value
        return result as any
      },

      _compileDefaults() {
        if (!options.defaults) return {}
        return Object.entries(options.defaults).reduce(
          (all, next) => {
            const [key, data] = next as [string, () => any]
            all[key] = data()
            return all
          },
          {} as Record<string, any>,
        )
      },
    }
  },
}

/**
 * Build an update that only touches the fields the caller changed, so
 * concurrent writes to other fields of the same document are not clobbered.
 * Values come from the validated document so schema normalisation applies.
 */
function _changedFieldsUpdate(validated: unknown, value: unknown) {
  const next = validated as Record<string, unknown>
  const $set: Record<string, unknown> = {}
  const $unset: Record<string, ''> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === '_id' || key === 'id') continue
    if (item === undefined) $unset[key] = ''
    else $set[key] = next[key]
  }
  const update: Document = {}
  if (Object.keys($set).length) update.$set = $set
  if (Object.keys($unset).length) update.$unset = $unset
  return Object.keys(update).length ? update : undefined
}

function _compileTableIndex(index: TTableIndex): TCompiledTableIndex {
  const entries = Object.entries(index.key)
  if (!entries.length) throw new Error('Mongo index requires at least one field.')
  return {
    ...index,
    name:
      index.name ??
      entries
        .map(([field, direction]) => `${field}_${direction === 1 ? 'asc' : 'desc'}`)
        .join('__'),
  }
}
