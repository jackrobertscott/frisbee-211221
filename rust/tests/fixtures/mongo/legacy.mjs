// legacy shapes the TS tables would no longer write: inserted raw after the TS server ran
import {MongoClient, ObjectId} from '../../../../server/node_modules/mongodb/lib/index.js'
const [uri, dbName, idsJson] = process.argv.slice(2)
const ids = JSON.parse(idsJson)
const client = await MongoClient.connect(uri)
const db = client.db(dbName)
const created = new Date('2021-06-01T09:30:00.250Z')
// pre gender-matching user (non-binary), voted into female MVP slots twice
await db.collection('user').insertOne({id: 'legacySam00000000000000', createdOn: created, updatedOn: created, firstName: ' Sam ', lastName: 'Legacy', gender: 'non-binary', termsAccepted: true, emails: [{value: 'sam@example.com', verified: false, code: 'x', createdOn: created, primary: true}], nickname: 'Sammy'})
await db.collection('report').insertMany([
  {id: 'legacyReport0000000000001', createdOn: created, updatedOn: created, teamId: ids.owls, teamAgainstId: ids.hawks, fixtureId: ids.fixture, scoreFor: 11, scoreAgainst: 13, mvpFemale: 'legacySam00000000000000', spiritComment: '', spirit: 10.5},
  {id: 'legacyReport0000000000002', createdOn: created.toISOString(), updatedOn: created.toISOString(), teamId: ids.owls, teamAgainstId: ids.hawks, fixtureId: ids.fixture, scoreFor: 11, scoreAgainst: 13, mvpFemale2: 'legacySam00000000000000', spiritComment: '', userId: null},
])
await db.collection('member').insertOne({id: 'legacyMember000000000001', createdOn: created, updatedOn: created, userId: 'legacySam00000000000000', seasonId: ids.winter, teamId: ids.owls, pending: 'no'})
await db.collection('notes').insertOne({text: 'not a frisbee collection'})
await client.close()
