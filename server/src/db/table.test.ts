import {io} from '@shared/torva'
import {describe, expect, it} from 'vitest'
import {useTestDatabase} from '../../test/database'
import {random} from '../utils/random'
import mongo from './mongo'
import {db} from './table'

useTestDatabase()

const ioWidget = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  name: io.string().trim(),
  size: io.optional(io.number()),
  colour: io.optional(io.string()),
})

const $Widget = db.table({
  key: 'tableTestWidget',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {name: 1, size: -1}},
    {key: {colour: 1}, name: 'by_colour'},
  ],
  schema: ioWidget,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})

describe('db.table', () => {
  it('names indexes from their keys unless named explicitly', () => {
    expect($Widget.key()).toBe('tableTestWidget')
    expect($Widget.validator()).toBe(ioWidget)
    expect($Widget.indexes().map((index) => index.name)).toEqual([
      'id_asc',
      'name_asc__size_desc',
      'by_colour',
    ])
  })

  it('rejects duplicate index names and empty index keys', () => {
    expect(() =>
      db.table({
        key: 'duplicate',
        schema: ioWidget,
        indexes: [{key: {name: 1}}, {key: {size: 1}, name: 'name_asc'}],
      }),
    ).toThrow('Duplicate index name "name_asc" on table "duplicate".')
    expect(() =>
      db.table({key: 'empty', schema: ioWidget, indexes: [{key: {}}]}),
    ).toThrow('Mongo index requires at least one field.')
  })

  it('validates and normalises values on create', async () => {
    const widget = await $Widget.createOne({name: '  Spanner  ', size: 3})
    expect(widget.name).toBe('Spanner')
    expect(widget).not.toHaveProperty('_id')
    // every value is validated before any is written
    await expect($Widget.createMany([{name: 'ok'}, {name: '   '}])).rejects.toBeDefined()
    expect(await $Widget.count({name: 'ok'})).toBe(0)
  })

  it('pages, sorts and collates many', async () => {
    await $Widget.createMany(
      ['b', 'A', 'c', 'D'].map((name) => ({name, colour: 'page'})),
    )
    const page = await $Widget.getMany(
      {colour: 'page'},
      {sort: {name: 1}, skip: 1, limit: 2, collation: {locale: 'en', strength: 2}},
    )
    expect(page.map((widget) => widget.name)).toEqual(['b', 'c'])
    // an empty sort object keeps the natural order
    const unsorted = await $Widget.getMany({colour: 'page'}, {sort: {}})
    expect(unsorted.map((widget) => widget.name)).toEqual(['b', 'A', 'c', 'D'])
  })

  it('only writes the fields an update changes', async () => {
    const widget = await $Widget.createOne({name: 'Partial', size: 1, colour: 'red'})
    const collection = await mongo.collection($Widget.key())
    // a concurrent write to another field survives the update
    await collection.updateOne({id: widget.id}, {$set: {colour: 'blue'}})

    const updated = await $Widget.updateOne(
      {id: widget.id},
      {size: 2, id: 'ignored'},
    )
    expect(updated.size).toBe(2)
    const stored = await $Widget.getOne({id: widget.id})
    expect(stored).toMatchObject({id: widget.id, size: 2, colour: 'blue'})

    // undefined unsets a field, and an empty update writes nothing
    await $Widget.updateOne({id: widget.id}, {size: undefined})
    expect((await $Widget.getOne({id: widget.id})).size).toBeUndefined()
    await $Widget.updateOne({id: widget.id}, {})
    expect(await $Widget.getOne({id: widget.id})).toMatchObject({colour: 'blue'})
  })

  it('rejects updates to missing or into invalid documents', async () => {
    await expect(
      $Widget.updateOne({id: random.generateId()}, {size: 1}),
    ).rejects.toMatchObject({errorCode: 'db.record_not_found'})
    const widget = await $Widget.createOne({name: 'Valid'})
    await expect($Widget.updateOne({id: widget.id}, {name: ''})).rejects.toBeDefined()
    expect((await $Widget.getOne({id: widget.id})).name).toBe('Valid')
  })

  it('updates many with sets and unsets, skipping ids', async () => {
    await $Widget.createMany(
      ['m1', 'm2'].map((name) => ({name, colour: 'many', size: 5})),
    )
    expect(await $Widget.updateMany({colour: 'many'}, {})).toBe(0)
    expect(await $Widget.updateMany({colour: 'many'}, {id: 'x'})).toBe(0)
    expect(await $Widget.updateMany({colour: 'many'}, {size: undefined})).toBe(2)
    expect(await $Widget.updateMany({colour: 'many'}, {size: 9, name: 'same'})).toBe(2)
    const widgets = await $Widget.getMany({colour: 'many'})
    expect(widgets.map((widget) => [widget.name, widget.size])).toEqual([
      ['same', 9],
      ['same', 9],
    ])
    expect(widgets.every((widget) => widget.id !== 'x')).toBe(true)
  })

  it('applies bulk updates after validating every task', async () => {
    const [a, b] = await Promise.all([
      $Widget.createOne({name: 'bulk-a', size: 1}),
      $Widget.createOne({name: 'bulk-b', size: 1}),
    ])
    await $Widget.updateBulk([
      {query: {id: a.id}, value: {size: 10}},
      {query: {id: b.id}, value: {}},
    ])
    expect((await $Widget.getOne({id: a.id})).size).toBe(10)
    expect((await $Widget.getOne({id: b.id})).size).toBe(1)

    await expect(
      $Widget.updateBulk([
        {query: {id: b.id}, value: {size: 20}},
        {query: {id: random.generateId()}, value: {size: 20}},
      ]),
    ).rejects.toMatchObject({errorCode: 'db.record_not_found'})
    // nothing is written when any task fails
    expect((await $Widget.getOne({id: b.id})).size).toBe(1)
    await expect($Widget.updateBulk([])).resolves.toBeUndefined()
  })

  it('updates atomically with upserts and either document version', async () => {
    const id = random.generateId()
    const now = new Date().toISOString()
    expect(
      await $Widget.updateAtomic({id}, {$set: {size: 1}}),
    ).toBeUndefined()
    const created = await $Widget.updateAtomic(
      {id},
      {$setOnInsert: {createdOn: now, updatedOn: now, name: 'upserted'}, $inc: {size: 1}},
      {upsert: true},
    )
    expect(created).toEqual({id, createdOn: now, updatedOn: now, name: 'upserted', size: 1})
    const before = await $Widget.updateAtomic(
      {id},
      {$inc: {size: 1}},
      {returnDocument: 'before'},
    )
    expect(before?.size).toBe(1)
    expect((await $Widget.getOne({id})).size).toBe(2)
  })

  it('aggregates, scans and deletes', async () => {
    await $Widget.createMany(
      [1, 2, 3].map((size) => ({name: `scan-${size}`, size, colour: 'scan'})),
    )
    const totals = await $Widget.aggregate<{total: number}>([
      {$match: {colour: 'scan'}},
      {$group: {_id: null, total: {$sum: '$size'}}},
    ])
    expect(totals).toEqual([{total: 6}])

    const seen: unknown[] = []
    const count = await $Widget.scanStored((value) => {
      seen.push(value)
    }, {colour: 'scan'})
    expect(count).toBe(3)
    expect(seen.every((value) => !Object.hasOwn(Object(value), '_id'))).toBe(true)

    expect(await $Widget.deleteOne({colour: 'scan'})).toBe(1)
    expect(await $Widget.deleteMany({colour: 'scan'})).toBe(2)
    expect(await $Widget.maybeOne({colour: 'scan'})).toBeUndefined()
    await expect($Widget.getOne({colour: 'scan'})).rejects.toMatchObject({
      errorCode: 'db.record_not_found',
      meta: {table: 'tableTestWidget'},
    })
  })
})
