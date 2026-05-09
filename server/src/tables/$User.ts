import {ioUser} from '@shared/schemas/ioUser'
import {db} from '../utils/db'
import {random} from '../utils/random'

const EMAIL_COLLATION = {locale: 'en', strength: 2 as const}

export const $User = db.table({
  key: 'user',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {'emails.value': 1}, collation: EMAIL_COLLATION},
    {key: {firstName: 1, lastName: 1}},
    {key: {lastName: 1, firstName: 1}},
    {key: {gender: 1, lastName: 1, firstName: 1}},
    {key: {createdOn: -1}},
  ],
  schema: ioUser,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
