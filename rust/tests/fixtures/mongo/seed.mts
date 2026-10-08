// Seeds the fixture database through the TS table layer (exactly what the TS
// server writes). See tests/integration/migrate_mongo.rs for how the fixture was made.
import {$Fixture} from '../../../../server/src/tables/$Fixture'
import {$GamedayImportConfig} from '../../../../server/src/tables/$GamedayImportConfig'
import {$GamedayImportRun} from '../../../../server/src/tables/$GamedayImportRun'
import {$Member} from '../../../../server/src/tables/$Member'
import {$Report} from '../../../../server/src/tables/$Report'
import {$Season} from '../../../../server/src/tables/$Season'
import {$Team} from '../../../../server/src/tables/$Team'
import {$User} from '../../../../server/src/tables/$User'
import hash from '../../../../server/src/auth/hash'
import mongo from '../../../../server/src/db/mongo'

const now = new Date().toISOString()
const email = (value: string, primary = true) => ({value, verified: true, code: 'abc123', createdOn: now, primary})
const password = await hash.encrypt('password1')

const ada = await $User.createOne({firstName: 'Ada', lastName: 'Lovelace', genderMatching: 'female', termsAccepted: true, admin: true, password, emails: [email('ada@example.com'), email('ada.alt@example.com', false)]})
const ben = await $User.createOne({firstName: 'Ben', lastName: 'Brown', genderMatching: 'male', termsAccepted: true, password, emails: [email('ben@example.com')], bio: 'Handler'})
const winter = await $Season.createOne({name: 'Winter 2024', signUpOpen: true, genderDivision: 'mixed'})
const summer = await $Season.createOne({name: 'Summer 2023', signUpOpen: false, finalResults: []})
const hawks = await $Team.createOne({seasonId: winter.id, name: 'Hawks', color: 'hsla(10, 60%, 50%, 1)', division: 1, phone: '021 555', email: 'hawks@example.com'})
const owls = await $Team.createOne({seasonId: winter.id, name: 'Owls', color: 'hsla(200, 60%, 50%, 1)'})
await $Season.updateOne({id: summer.id}, {finalResults: [{teamId: hawks.id, position: 1}, {teamId: owls.id, position: null}]})
await $Member.createOne({userId: ada.id, seasonId: winter.id, teamId: hawks.id, pending: false, captain: true})
await $Member.createOne({userId: ben.id, seasonId: winter.id, teamId: hawks.id, pending: true})
const fixture = await $Fixture.createOne({seasonId: winter.id, userId: ada.id, title: 'Round 1', date: '2024-05-04T00:00:00.000Z', games: [{id: 'game000000000000000000001', team1Id: hawks.id, team2Id: owls.id, place: 'Field 1', time: '6:00pm', team1Score: 13, team2Score: 11}], grading: false})
await $Report.createOne({teamId: hawks.id, teamAgainstId: owls.id, fixtureId: fixture.id, userId: ada.id, scoreFor: 13, scoreAgainst: 11, mvpMale: ben.id, spiritComment: 'Great', spiritP1: 2, spiritP2: 2, spiritP3: 2, spiritP4: 3, spiritP5: 2.5})
const config = await $GamedayImportConfig.createOne({seasonId: winter.id, username: 'user', passwordEncrypted: 'v1:abc', association: 'assoc', competition: 'comp', scheduleEnabled: true, scheduleStartOn: now})
await $GamedayImportRun.createOne({configId: config.id, seasonId: winter.id, trigger: 'scheduled', status: 'succeeded', association: 'assoc', competition: 'comp', startedOn: now, finishedOn: now, rowsImported: 12, teamsCreated: 0, usersCreated: 1, membersCreated: 1, note: ''})
console.log(JSON.stringify({ada: ada.id, ben: ben.id, winter: winter.id, hawks: hawks.id, owls: owls.id, fixture: fixture.id}))
await (await mongo.client()).close()
