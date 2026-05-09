import {ioReport} from '@shared/schemas/ioReport'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $Report = db.table({
  key: 'report',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {fixtureId: 1, createdOn: -1}},
    {key: {fixtureId: 1, teamId: 1, teamAgainstId: 1}},
    {key: {userId: 1}},
    {key: {mvpMale: 1}},
    {key: {mvpMale2: 1}},
    {key: {mvpFemale: 1}},
    {key: {mvpFemale2: 1}},
    {key: {teamId: 1}},
    {key: {teamAgainstId: 1}},
    {key: {createdOn: 1}},
  ],
  schema: ioReport,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
