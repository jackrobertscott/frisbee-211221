import {TUserEmail, ioUserEmail} from '@shared/schemas/ioUser'
import {AnyBulkWriteOperation, Document} from 'mongodb'
import mongo from '../utils/mongo'
import {userEmail} from '../endpoints/userEmail'

const USER_MIGRATION_BATCH_SIZE = 250

type TLegacyUser = Document & {
  id: string
  email?: string | null
  emails?: TUserEmail[] | null
  emailVerified?: boolean
  emailCodeCreatedOn?: string
  emailCode?: string
}

function buildMigratedEmails(user: TLegacyUser) {
  if (Array.isArray(user.emails) && user.emails.length) return user.emails
  if (!user.email)
    throw new Error(
      `User ${user.id} is missing both legacy email data and the new emails array.`
    )

  const fallback = userEmail.create(user.email, true)
  const result = ioUserEmail.validate({
    value: user.email,
    verified: user.emailVerified ?? fallback.verified,
    createdOn: user.emailCodeCreatedOn ?? fallback.createdOn,
    code: user.emailCode ?? fallback.code,
    primary: true,
  })

  if (!result.ok) {
    throw new Error(`User ${user.id} has invalid legacy email data: ${result.error}`)
  }

  return [result.value]
}

export async function runLegacyUserEmailMigration() {
  const users = (await mongo.database()).collection<TLegacyUser>('user')
  const cursor = users.find<TLegacyUser>({
    $or: [
      {email: {$exists: true, $ne: null}},
      {emails: {$exists: false}},
      {emails: null},
      {emails: {$size: 0}},
    ],
  })

  let migratedUsers = 0
  let batch = [] as AnyBulkWriteOperation<TLegacyUser>[]

  for await (const user of cursor) {
    const updatedOn = new Date().toISOString()
    batch.push({
      updateOne: {
        filter: {id: user.id},
        update: {
          $set: {
            email: null,
            emails: buildMigratedEmails(user),
            updatedOn,
          },
          $unset: {
            emailVerified: '',
            emailCodeCreatedOn: '',
            emailCode: '',
          },
        },
      },
    })
    migratedUsers += 1

    if (batch.length >= USER_MIGRATION_BATCH_SIZE) {
      await users.bulkWrite(batch)
      batch = []
    }
  }

  if (batch.length) await users.bulkWrite(batch)

  return migratedUsers
}
