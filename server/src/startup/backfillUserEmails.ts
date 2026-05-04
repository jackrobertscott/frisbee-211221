import {ObjectId} from 'mongodb'
import mongo from '../utils/mongo'
import {userEmail} from '../endpoints/userEmail'

interface TUserEmailRecord {
  _id: ObjectId
  emails?: unknown
}

const sameEmails = (left: unknown, right: unknown) => {
  return JSON.stringify(left) === JSON.stringify(right)
}

export async function backfillUserEmails() {
  const collection = await mongo.collection('user')
  const users = await collection
    .find<TUserEmailRecord>({}, {projection: {_id: 1, emails: 1}})
    .toArray()

  const updatedOn = new Date().toISOString()
  const operations = users.reduce<Array<{
    updateOne: {
      filter: {_id: ObjectId}
      update: {$set: {emails: ReturnType<typeof userEmail.sanitize>; updatedOn: string}}
    }
  }>>((all, user) => {
    const emails = Array.isArray(user.emails) ? user.emails : []
    const sanitized = userEmail.sanitize(emails)
    if (Array.isArray(user.emails) && sameEmails(user.emails, sanitized)) return all
    all.push({
      updateOne: {
        filter: {_id: user._id},
        update: {$set: {emails: sanitized, updatedOn}},
      },
    })
    return all
  }, [])

  if (operations.length) await collection.bulkWrite(operations)
  console.log(
    `User email backfill complete: scanned ${users.length}, updated ${operations.length}.`
  )
}
