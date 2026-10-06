import AdmZip from 'adm-zip'
import {beforeAll, describe, expect, it} from 'vitest'
import {useTestDatabase} from '../../test/database'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {random} from '../utils/random'
import {createExportArchive} from './exportArchive'
import {userEmail} from './userEmail'

useTestDatabase()

type TRow = Record<string, unknown>

const COLOR = 'hsla(0, 100%, 50%, 1)'
const missingId = random.generateId()

const readJson = async () => {
  const {buffer, filename} = await createExportArchive('json')
  const zip = new AdmZip(buffer)
  const read = (name: string): TRow[] =>
    JSON.parse(zip.readAsText(`${name}.json`)) as TRow[]
  return {filename, read}
}

const readCsv = async () => {
  const {buffer, filename} = await createExportArchive('csv')
  const zip = new AdmZip(buffer)
  return {filename, read: (name: string) => zip.readAsText(`${name}.csv`)}
}

beforeAll(async () => {
  const season10 = await $Season.createOne({
    name: 'Season 10',
    genderDivision: 'mixed',
    useOfficialScoring: true,
    isHidden: true,
  })
  const season2 = await $Season.createOne({
    name: 'Season 2',
    genderDivision: 'women',
    signUpOpen: true,
  })

  const alpha = await $Team.createOne({seasonId: season10.id, name: 'Alpha', color: COLOR, division: 2})
  const bravo = await $Team.createOne({
    seasonId: season10.id,
    name: 'Bravo',
    color: COLOR,
    division: 1,
    email: 'bravo@example.com',
    phone: '0400',
  })
  const charlie = await $Team.createOne({seasonId: season2.id, name: 'Charlie', color: COLOR})
  const delta = await $Team.createOne({seasonId: season2.id, name: 'Delta', color: COLOR})

  await $Season.updateOne(
    {id: season10.id},
    {
      finalResults: [
        {teamId: missingId, position: null},
        {teamId: bravo.id, position: 2},
        {teamId: alpha.id, position: 1},
      ],
    },
  )

  const male = await $User.createOne({
    firstName: 'Mal',
    lastName: 'Male',
    genderMatching: 'male',
    termsAccepted: true,
    admin: true,
    emails: [
      userEmail.create('b.mal@example.com', false),
      {...userEmail.create('z.mal@example.com', true), verified: true},
    ],
  })
  const female = await $User.createOne({
    firstName: 'Fay',
    lastName: 'Female',
    genderMatching: 'female',
    termsAccepted: false,
    emails: [userEmail.create('fay@example.com', true)],
  })

  const round2 = await $Fixture.createOne({
    seasonId: season10.id,
    userId: male.id,
    title: 'Round 2',
    date: '2024-03-02T00:00:00.000Z',
    grading: true,
    games: [
      {id: random.generateId(), team1Id: bravo.id, team2Id: alpha.id, place: 'Field 1', time: '10:00', team1Score: 3, team2Score: 2},
      {id: random.generateId(), team1Id: alpha.id, team2Id: missingId, place: 'Field 2', time: '09:00'},
    ],
  })
  await $Fixture.createOne({
    seasonId: season10.id,
    userId: missingId,
    title: 'Round 1',
    date: '2024-03-01T00:00:00.000Z',
    games: [{id: random.generateId(), team1Id: alpha.id, team2Id: bravo.id, place: 'Field 1', time: '09:00'}],
  })
  const women1 = await $Fixture.createOne({
    seasonId: season2.id,
    userId: female.id,
    title: 'W1',
    date: '2024-01-01T00:00:00.000Z',
    games: [{id: random.generateId(), team1Id: charlie.id, team2Id: delta.id, place: 'Court', time: '18:00'}],
  })

  await $Report.createOne({
    fixtureId: round2.id,
    teamId: alpha.id,
    teamAgainstId: bravo.id,
    userId: female.id,
    scoreFor: 2,
    scoreAgainst: 3,
    mvpMale: male.id,
    mvpMale2: female.id,
    mvpFemale: female.id,
    mvpFemale2: missingId,
    spiritP1: 2,
    spiritP2: 3,
    spiritP3: 1,
    spiritP4: 2,
    spiritP5: 4,
    spiritComment: '=SUM(A1)',
  })
  await $Report.createOne({
    fixtureId: women1.id,
    teamId: charlie.id,
    teamAgainstId: delta.id,
    userId: male.id,
    scoreFor: 1,
    scoreAgainst: 0,
    mvpMale: male.id,
    mvpFemale: female.id,
    spirit: 8,
    spiritComment: '',
  })
  await $Report.createOne({
    fixtureId: missingId,
    teamId: bravo.id,
    teamAgainstId: alpha.id,
    scoreFor: 0,
    scoreAgainst: 0,
    spiritComment: 'No fixture',
  })

  await $Member.createOne({seasonId: season10.id, teamId: alpha.id, userId: male.id, captain: true, pending: false})
  await $Member.createOne({seasonId: season10.id, teamId: alpha.id, userId: female.id, pending: true})
  await $Member.createOne({seasonId: missingId, teamId: bravo.id, userId: missingId, pending: false})
})

describe('createExportArchive', () => {
  it('names the archive after the file type and time', async () => {
    const {filename} = await readJson()
    expect(filename).toMatch(/^frisbee-export-json-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.zip$/)
  })

  it('lists fixture games by season, date and team, with fallbacks for missing records', async () => {
    const {read} = await readJson()
    expect(
      read('fixture-games').map((row) => [
        row.seasonName,
        row.fixtureTitle,
        row.team1Name,
        row.team2Name,
        row.grading,
        row.fixtureCreatedByName,
        row.fixtureCreatedByEmail,
      ]),
    ).toEqual([
      ['Season 2', 'W1', 'Charlie', 'Delta', '', 'Fay Female', 'fay@example.com'],
      ['Season 10', 'Round 1', 'Alpha', 'Bravo', '', 'Unknown user', null],
      ['Season 10', 'Round 2', 'Alpha', 'Unknown team', 'Yes', 'Mal Male', 'z.mal@example.com'],
      ['Season 10', 'Round 2', 'Bravo', 'Alpha', 'Yes', 'Mal Male', 'z.mal@example.com'],
    ])
    const scored = read('fixture-games')[3]
    expect(scored).toMatchObject({
      team1Score: 3,
      team2Score: 2,
      gameTime: '10:00',
      gamePlace: 'Field 1',
      fixtureDate: new Date('2024-03-02T00:00:00.000Z').toLocaleDateString('en-AU'),
    })
  })

  it('orders final results by numeric season name and position, missing positions last', async () => {
    const {read} = await readJson()
    expect(read('season-final-results')).toEqual([
      {seasonName: 'Season 10', position: 1, teamName: 'Alpha'},
      {seasonName: 'Season 10', position: 2, teamName: 'Bravo'},
      {seasonName: 'Season 10', position: null, teamName: 'Unknown team'},
    ])
  })

  it('describes seasons', async () => {
    const {read} = await readJson()
    expect(read('seasons')).toEqual([
      {name: 'Season 2', signUpOpen: 'Yes', scoringSystem: 'Simple', genderDivision: 'women', isHidden: ''},
      {name: 'Season 10', signUpOpen: '', scoringSystem: 'Official', genderDivision: 'mixed', isHidden: 'Yes'},
    ])
  })

  it('only exports MVPs eligible for slots the season uses', async () => {
    const {read} = await readJson()
    const reports = read('reports')
    expect(reports.map((row) => [row.seasonName, row.teamName, row.fixtureTitle])).toEqual([
      ['Season 2', 'Charlie', 'W1'],
      ['Season 10', 'Bravo', null],
      ['Season 10', 'Alpha', 'Round 2'],
    ])

    // a women's season has no male MVP slot
    expect(reports[0]).toMatchObject({
      mvpMaleName: null,
      mvpFemaleName: 'Fay Female',
      mvpFemaleEmail: 'fay@example.com',
      spiritSimple: 8,
      submittedByName: 'Mal Male',
    })
    // without a fixture the season comes from the team
    expect(reports[1]).toMatchObject({
      againstTeamName: 'Alpha',
      fixtureDate: '',
      submittedByName: null,
      submittedByEmail: null,
      spiritComment: 'No fixture',
    })
    // ineligible and unknown MVPs are left blank
    expect(reports[2]).toMatchObject({
      mvpMaleName: 'Mal Male',
      mvpMaleEmail: 'z.mal@example.com',
      mvpMale2Name: null,
      mvpFemaleName: 'Fay Female',
      mvpFemale2Name: null,
      mvpFemale2Email: null,
      scoreFor: 2,
      scoreAgainst: 3,
      spiritP5: 4,
    })
  })

  it('lists memberships, falling back to the team season', async () => {
    const {read} = await readJson()
    expect(read('memberships')).toEqual([
      {seasonName: 'Season 10', teamName: 'Alpha', userName: 'Fay Female', userEmail: 'fay@example.com', captain: '', pending: 'Pending'},
      {seasonName: 'Season 10', teamName: 'Alpha', userName: 'Mal Male', userEmail: 'z.mal@example.com', captain: 'Yes', pending: ''},
      {seasonName: 'Season 10', teamName: 'Bravo', userName: null, userEmail: null, captain: '', pending: ''},
    ])
  })

  it('orders teams by season, division and name', async () => {
    const {read} = await readJson()
    expect(read('teams').map((row) => [row.seasonName, row.division, row.name])).toEqual([
      ['Season 2', null, 'Charlie'],
      ['Season 2', null, 'Delta'],
      ['Season 10', 1, 'Bravo'],
      ['Season 10', 2, 'Alpha'],
    ])
  })

  it('lists every user email and the primary email per user', async () => {
    const {read} = await readJson()
    expect(read('user-emails').map((row) => [row.userName, row.email, row.primary, row.verified, row.userPrimaryEmail])).toEqual([
      ['Fay Female', 'fay@example.com', 'Yes', '', 'fay@example.com'],
      ['Mal Male', 'b.mal@example.com', '', '', 'z.mal@example.com'],
      ['Mal Male', 'z.mal@example.com', 'Yes', 'Yes', 'z.mal@example.com'],
    ])
    expect(read('users')).toEqual([
      expect.objectContaining({
        firstName: 'Fay',
        primaryEmail: 'fay@example.com',
        primaryEmailVerified: '',
        genderMatching: 'female',
        admin: '',
        termsAccepted: '',
      }),
      expect.objectContaining({
        firstName: 'Mal',
        primaryEmail: 'z.mal@example.com',
        primaryEmailVerified: 'Yes',
        genderMatching: 'male',
        admin: 'Yes',
        termsAccepted: 'Yes',
      }),
    ])
  })

  it('writes CSV with escaped formulas, blank missing values and numbers as text', async () => {
    const {filename, read} = await readCsv()
    expect(filename).toMatch(/^frisbee-export-csv-.+\.zip$/)
    const reports = read('reports').trimEnd().split('\n')
    expect(reports[0].split(',').slice(0, 7)).toEqual([
      '"SEASON_NAME"',
      '"FIXTURE_DATE"',
      '"FIXTURE_TITLE"',
      '"TEAM_NAME"',
      '"AGAINST_TEAM_NAME"',
      '"SCORE_FOR"',
      '"SCORE_AGAINST"',
    ])
    expect(reports[2]).toMatch(/^"Season 10","","","Bravo","Alpha","0","0",/)
    expect(reports[3]).toContain(`"2","3","","2","3","1","2","4","'=SUM(A1)"`)
    expect(read('season-final-results')).toBe(
      [
        '"SEASON_NAME","POSITION","TEAM_NAME"',
        '"Season 10","1","Alpha"',
        '"Season 10","2","Bravo"',
        '"Season 10","","Unknown team"',
        '',
      ].join('\n'),
    )
  })
})
