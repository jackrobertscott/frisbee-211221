import {Document, Filter, WithId} from 'mongodb'
import {TioValue, TioAll} from 'torva'
import {Simplify} from './types'
import mongo from './mongo'
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
  table<T extends TioAll, P extends Partial<TioValue<T>>>(options: {
    key: string
    index: string[]
    schema: T
    defaults?: {[K in keyof P]?: () => P[K]}
  }) {
    type V = TioValue<T>
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
      async maybeOne(query: Filter<V>): Promise<V | undefined> {
        const collection = await mongo.collection(options.key)
        const result = (await collection.findOne(
          query as Filter<Document>
        )) as WithId<V>
        return result ? this._clean(result) : undefined
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
        return result.map((i) => this._clean(i as WithId<V>))
      },
      /**
       *
       */
      async createOne(
        value: Simplify<Omit<V, keyof P> & Partial<P>>
      ): Promise<V> {
        const compiledDefaults = Object.entries(options.defaults ?? {}).reduce(
          (all: any, [key, data]: any) => {
            all[key] = data()
            return all
          },
          {}
        )
        const i = options.schema.validate({...compiledDefaults, ...value})
        if (!i.ok) throw i.error
        const collection = await mongo.collection(options.key)
        const result = await collection.insertOne(i.value)
        return this.getOne({_id: result.insertedId})
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
      async deleteOne(query: Filter<V>): Promise<Boolean> {
        const collection = await mongo.collection(options.key)
        const result = await collection.deleteOne(query as Filter<Document>)
        return result.deletedCount === 1
      },
      /**
       *
       */
      _clean(value: WithId<V>): V {
        const {_id, ...result} = value
        return result as any
      },
    }
  },
}
