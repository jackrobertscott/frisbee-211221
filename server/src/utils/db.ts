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

export const db = {
  table<T extends TypeIoAll, P extends Partial<TypeIoValue<T>>>(options: {
    key: string
    index: string[]
    schema: T
    defaults?: {[K in keyof P]?: () => P[K]}
  }) {
    type V = TypeIoValue<T>
    return {
      validator() {
        return options.schema
      },

      key() {
        return options.key
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
        for (const i of Object.entries(queryOptions?.sort ?? {})) {
          chain = chain.sort(i[0], i[1])
        }
        chain = chain
          .skip(queryOptions?.skip ?? 0)
          .limit(queryOptions?.limit ?? Number.MAX_SAFE_INTEGER)
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
        const collection = await mongo.collection(options.key)
        const {_id, id, ...$set} = i.value as Record<string, any>
        const $unset = Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item === undefined)
            .map(([key]) => [key, '']),
        )
        await collection.updateOne(
          query as Filter<Document>,
          {
            $set,
            ...(Object.keys($unset).length ? {$unset} : {}),
          },
          mongo.options(),
        )
        return i.value as V
      },

      async updateBulk(tasks: Array<{query: Filter<V>; value: Partial<V>}>) {
        const operations = [] as Array<{
          updateOne: {
            filter: Filter<Document>
            update: {$set: Record<string, any>}
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
          const {_id, id, ...$set} = validated.value as Record<string, any>
          const $unset = Object.fromEntries(
            Object.entries(task.value as Record<string, unknown>)
              .filter(([, item]) => item === undefined)
              .map(([key]) => [key, '']),
          )
          operations.push({
            updateOne: {
              filter: task.query as Filter<Document>,
              update: {
                $set,
                ...(Object.keys($unset).length ? {$unset} : {}),
              },
            },
          })
        }
        const collection = await mongo.collection(options.key)
        if (operations.length)
          await collection.bulkWrite(operations, mongo.options())
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
