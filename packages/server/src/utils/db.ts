import {Document, Filter, FindOptions, WithId} from 'mongodb'
import {TypeIoAll, TypeIoValue} from 'torva'
import mongo from './mongo'
import {Simplify} from './types'
/**
 *
 */
export interface TQueryOptions<T> {
  sort?: {[key in keyof T]?: 1 | -1}
  limit?: number
  skip?: number
}
/**
 *
 */
export const db = {
  /**
   *
   */
  table<T extends TypeIoAll, P extends Partial<TypeIoValue<T>>>(options: {
    key: string
    index: string[]
    schema: T
    defaults?: {[K in keyof P]?: () => P[K]}
  }) {
    type V = TypeIoValue<T>
    return {
      /**
       *
       */
      validator() {
        return options.schema
      },
      /**
       *
       */
      async count(query: Filter<V>): Promise<number> {
        const collection = await mongo.collection(options.key)
        return collection.countDocuments(
          query as Filter<Document>
        ) as Promise<number>
      },
      /**
       *
       */
      async maybeOne(
        query: Filter<V>,
        queryOptions?: TQueryOptions<V>
      ): Promise<V | undefined> {
        const collection = await mongo.collection(options.key)
        const result = await collection.findOne(
          query as Filter<Document>,
          queryOptions as FindOptions
        )
        return result ? this._clean(result as any) : undefined
      },
      /**
       *
       */
      async getOne(query: Filter<V>): Promise<V> {
        const data = await this.maybeOne(query)
        if (!data) throw new Error(`Failed to get ${options.key}.`)
        return data
      },
      /**
       *
       */
      async getMany(
        query: Filter<V>,
        queryOptions?: TQueryOptions<V>
      ): Promise<V[]> {
        const collection = await mongo.collection(options.key)
        let chain = collection
          .find(query as Filter<Document>)
          .limit(queryOptions?.limit ?? Number.MAX_SAFE_INTEGER)
          .skip(queryOptions?.skip ?? 0)
        for (const i of Object.entries(queryOptions?.sort ?? {})) {
          chain = chain.sort(i[0], i[1])
        }
        const result = await chain.toArray()
        return result.map((i) => this._clean(i as any))
      },
      /**
       *
       */
      async createOne(
        value: Simplify<Omit<V, keyof P> & Partial<P>>
      ): Promise<V> {
        const defaults = this._compileDefaults()
        const i = options.schema.validate({...defaults, ...value})
        if (!i.ok) throw i.error
        const collection = await mongo.collection(options.key)
        const result = await collection.insertOne(i.value)
        return this.getOne({_id: result.insertedId} as any)
      },
      /**
       *
       */
      async createMany(
        value: Simplify<Omit<V, keyof P> & Partial<P>>[]
      ): Promise<number> {
        const all = []
        for (let x = 0; x < value.length; x++) {
          const defaults = this._compileDefaults()
          const i = options.schema.validate({...defaults, ...value[x]})
          if (!i.ok) throw i.error
          all.push(i.value)
        }
        const collection = await mongo.collection(options.key)
        await collection.insertMany(all)
        return all.length
      },
      /**
       *
       */
      async updateOne(query: Filter<V>, value: Partial<V>): Promise<V> {
        const current = await this.maybeOne(query)
        if (!current) throw Error('Failed to find document.')
        const i = options.schema.validate({...current, ...value})
        if (!i.ok) throw i.error
        const collection = await mongo.collection(options.key)
        const {_id, id, ...$set} = i.value as Record<string, any>
        await collection.updateOne(query as Filter<Document>, {$set})
        return i.value as V
      },
      /**
       *
       */
      async updateBulk(tasks: Array<{query: Filter<V>; value: Partial<V>}>) {
        const collection = await mongo.collection(options.key)
        const operations = tasks.map((i) => ({
          updateOne: {
            filter: i.query as Filter<Document>,
            update: {$set: i.value},
          },
        }))
        if (operations.length) await collection.bulkWrite(operations)
      },
      /**
       *
       */
      async deleteOne(query: Filter<V>): Promise<number> {
        const collection = await mongo.collection(options.key)
        const result = await collection.deleteOne(query as Filter<Document>)
        return result.deletedCount
      },
      /**
       *
       */
      async deleteMany(query: Filter<V>): Promise<number> {
        const collection = await mongo.collection(options.key)
        const result = await collection.deleteMany(query as Filter<Document>)
        return result.deletedCount
      },
      /**
       *
       */
      _clean(value: WithId<V>): V {
        const {_id, ...result} = value
        return result as any
      },
      /**
       *
       */
      _compileDefaults() {
        if (!options.defaults) return {}
        return Object.entries(options.defaults).reduce((all, next) => {
          const [key, data] = next as [string, () => any]
          all[key] = data()
          return all
        }, {} as Record<string, any>)
      },
    }
  },
}
