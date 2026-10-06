import {TUserEmail} from '@shared/schemas/ioUser'
import {TUserGenderMatching} from '@shared/schemas/ioUserGenderMatching'
import {random} from '../utils/random'

export interface TMockTeamCreate {
  id: string
  seasonId: string
  isMock: boolean
  name: string
  color: string
  division: number
}

export interface TMockUserCreate {
  id: string
  isMock: boolean
  firstName: string
  lastName: string
  termsAccepted: boolean
  genderMatching: TUserGenderMatching
  emails: TUserEmail[]
}

export interface TMockMemberCreate {
  seasonId: string
  teamId: string
  userId: string
  isMock: boolean
  captain: boolean
  pending: boolean
}

export interface TMockSeasonData {
  teams: TMockTeamCreate[]
  users: TMockUserCreate[]
  members: TMockMemberCreate[]
}

/**
 * Random mock teams for a season, each with `usersPerTeam` confirmed members
 * whose first member is captain.
 */
export const generateMockSeasonData = (
  seasonId: string,
  teamCount: number,
  usersPerTeam: number,
): TMockSeasonData => {
  const teams: TMockTeamCreate[] = []
  const teamNames = generateMockTeamNames(teamCount)
  while (teams.length < teamCount) {
    teams.push({
      id: random.generateId(),
      isMock: true,
      seasonId,
      name: teamNames[teams.length],
      color: `hsla(${Math.floor(Math.random() * 36) * 10}, 100%, 65%, 1)`,
      division: 1,
    })
  }

  const users: TMockUserCreate[] = []
  const members: TMockMemberCreate[] = []
  for (const team of teams) {
    const teamUsers: TMockUserCreate[] = []
    while (teamUsers.length < usersPerTeam) {
      const firstName = pick(MOCK_FIRST_NAMES)
      const lastName = pick(MOCK_LAST_NAMES)
      const email = mockEmail(firstName, lastName)
      if (teamUsers.some((u) => u.emails[0].value === email)) continue
      const genderMatching: TUserGenderMatching =
        Math.random() > 0.5 ? 'male' : 'female'
      const user: TMockUserCreate = {
        id: random.generateId(),
        isMock: true,
        firstName,
        lastName,
        genderMatching,
        termsAccepted: true,
        emails: [
          {
            value: email,
            verified: true,
            code: '0000',
            createdOn: new Date().toISOString(),
            primary: true,
          },
        ],
      }
      teamUsers.push(user)
      members.push({
        seasonId: team.seasonId,
        teamId: team.id,
        userId: user.id,
        isMock: true,
        captain: teamUsers.length === 1,
        pending: false,
      })
    }
    users.push(...teamUsers)
  }

  return {teams, users, members}
}

/**
 * `count` distinct team names in random order. Once the name pool runs out the
 * names repeat with a cycle number suffix.
 */
export const generateMockTeamNames = (count: number): string[] => {
  const pool = new Set<string>()
  for (const district of MOCK_TEAM_DISTRICTS)
    for (const mascot of MOCK_TEAM_MASCOTS) pool.add(`${district} ${mascot}`)
  for (const modifier of MOCK_TEAM_MODIFIERS)
    for (const mascot of MOCK_TEAM_MASCOTS) pool.add(`${modifier} ${mascot}`)

  const names = shuffle([...pool])
  if (names.length >= count) return names.slice(0, count)

  const extras: string[] = []
  while (names.length + extras.length < count) {
    const base = names[(names.length + extras.length) % names.length]
    const cycle = Math.floor((names.length + extras.length) / names.length) + 1
    extras.push(`${base} ${cycle}`)
  }
  return [...names, ...extras]
}

const pick = (values: string[]) =>
  values[Math.floor(Math.random() * values.length)]

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '.')

const shuffle = <T>(values: T[]): T[] => {
  const copy = [...values]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const mockEmail = (firstName: string, lastName: string) => {
  return `${slugify(firstName)}.${slugify(lastName)}.${random.randomString(6).toLowerCase()}@example.com`
}

const MOCK_TEAM_DISTRICTS = [
  'North Coast',
  'South Bay',
  'River City',
  'Red Rock',
  'High Plains',
  'Twin Pines',
  'Harbor Point',
  'East Ridge',
  'West End',
  'Gold Valley',
  'Cedar Grove',
  'Silver Lake',
  'Blue Summit',
  'Iron Range',
  'Desert Run',
  'Pine Harbor',
  'Storm Creek',
  'Sunset Hills',
  'Lakeview',
  'Granite Point',
  'Shadow Ridge',
  'Wild Coast',
  'Copper Canyon',
  'Frost Hollow',
]

const MOCK_TEAM_MODIFIERS = [
  'Crimson',
  'Electric',
  'Iron',
  'Midnight',
  'Solar',
  'Rapid',
  'Storm',
  'Golden',
  'Steel',
  'Wildfire',
  'Shadow',
  'Arctic',
  'Coastal',
  'Thunder',
  'Neon',
  'Granite',
  'Blackwater',
  'Velocity',
  'Royal',
  'Fireline',
]

const MOCK_TEAM_MASCOTS = [
  'Falcons',
  'Cyclones',
  'Wolves',
  'Breakers',
  'Vipers',
  'Rangers',
  'Titans',
  'Barracudas',
  'Comets',
  'Outlaws',
  'Raiders',
  'Rhinos',
  'Stags',
  'Coyotes',
  'Ravens',
  'Mavericks',
  'Chargers',
  'Firebirds',
  'Hawks',
  'Griffins',
  'Pirates',
  'Sentinels',
  'Royals',
  'Stormhawks',
]

const MOCK_FIRST_NAMES = [
  'Alex',
  'Taylor',
  'Jordan',
  'Sam',
  'Casey',
  'Riley',
  'Jamie',
  'Cameron',
  'Morgan',
  'Avery',
  'Quinn',
  'Parker',
]

const MOCK_LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Miller',
  'Davis',
  'Wilson',
  'Taylor',
  'Clark',
  'Evans',
  'Hall',
]
