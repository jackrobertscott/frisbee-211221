import {normalizeUserGender} from '@shared/schemas/ioUserGender'
import {ObjectId} from 'mongodb'
import mongo from '../utils/mongo'

interface TUserEnumRecord {
  _id: ObjectId
  gender?: unknown
}

export async function backfillUserEnumValues() {
  const collection = await mongo.collection('user')
  const users = await collection
    .find<TUserEnumRecord>({}, {projection: {_id: 1, gender: 1}})
    .toArray()

  const updatedOn = new Date().toISOString()
  const invalidValues = new Set<string>()
  const operations = users.reduce<Array<{
    updateOne: {
      filter: {_id: ObjectId}
      update: {$set: {gender: string; updatedOn: string}}
    }
  }>>((all, user) => {
    if (typeof user.gender !== 'string') return all
    const normalizedGender = normalizeUserGender(user.gender)
    if (!normalizedGender) {
      invalidValues.add(user.gender)
      return all
    }
    if (normalizedGender === user.gender) return all
    all.push({
      updateOne: {
        filter: {_id: user._id},
        update: {$set: {gender: normalizedGender, updatedOn}},
      },
    })
    return all
  }, [])

  if (operations.length) await collection.bulkWrite(operations)
  console.log(
    `User enum backfill complete: scanned ${users.length}, updated ${operations.length}, invalid ${invalidValues.size}.`
  )
  if (invalidValues.size) {
    console.warn(
      `User enum backfill found unmapped gender values: ${[...invalidValues]
        .slice(0, 10)
        .join(', ')}`
    )
  }
}
