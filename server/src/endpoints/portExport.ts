import {TFixture} from '@shared/schemas/ioFixture'
import {TMember} from '@shared/schemas/ioMember'
import {TReport} from '@shared/schemas/ioReport'
import {TSeason} from '@shared/schemas/ioSeason'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUser, TUserEmail} from '@shared/schemas/ioUser'
import AdmZip from 'adm-zip'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {userEmail} from './userEmail'

type TExportRecord = Record<string, unknown>

export type TExportFileType = 'csv' | 'json'

type TExportDatasetDef = {
  filename: string
  fields: readonly string[]
  build: (context: TExportContext) => TExportRecord[]
}

type TExportContext = {
  fixtures: TFixture[]
  members: TMember[]
  reports: TReport[]
  seasons: TSeason[]
  teams: TTeam[]
  users: TUser[]
  seasonsById: Map<string, TSeason>
  fixturesById: Map<string, TFixture>
  teamsById: Map<string, TTeam>
  usersById: Map<string, TUser>
}

const EXPORT_DATASETS = [
  {
    filename: 'fixture-games',
    fields: [
      'seasonName',
      'fixtureTitle',
      'fixtureDate',
      'grading',
      'fixtureCreatedByName',
      'fixtureCreatedByEmail',
      'gameTime',
      'gamePlace',
      'team1Name',
      'team1Score',
      'team2Name',
      'team2Score',
    ],
    build: ({fixtures, seasonsById, teamsById, usersById}) => {
      return fixtures.flatMap((fixture) => {
        const season = seasonsById.get(fixture.seasonId)
        const createdBy = usersById.get(fixture.userId)
        return fixture.games.map((game) => ({
          seasonName: _seasonLabel(season),
          fixtureTitle: fixture.title,
          fixtureDate: fixture.date,
          grading: fixture.grading,
          fixtureCreatedByName: _userLabel(createdBy),
          fixtureCreatedByEmail: _primaryEmail(createdBy),
          gameTime: game.time,
          gamePlace: game.place,
          team1Name: _teamLabel(teamsById.get(game.team1Id)),
          team1Score: game.team1Score,
          team2Name: _teamLabel(teamsById.get(game.team2Id)),
          team2Score: game.team2Score,
        }))
      })
    },
  },
  {
    filename: 'season-final-results',
    fields: ['seasonName', 'position', 'teamName'],
    build: ({seasons, teamsById}) => {
      return _sortExportRecords(
        seasons.flatMap((season) =>
          (season.finalResults ?? []).map((result) => ({
            seasonName: season.name,
            position: result.position,
            teamName: _teamLabel(teamsById.get(result.teamId)),
          }))
        ),
        ['seasonName', 'position', 'teamName']
      )
    },
  },
  {
    filename: 'seasons',
    fields: ['name', 'signUpOpen', 'isHidden', 'useOfficialScoring'],
    build: ({seasons}) => {
      return seasons.map((season) => ({
        name: season.name,
        signUpOpen: season.signUpOpen,
        isHidden: season.isHidden,
        useOfficialScoring: season.useOfficialScoring,
      }))
    },
  },
  {
    filename: 'reports',
    fields: [
      'seasonName',
      'fixtureTitle',
      'fixtureDate',
      'teamName',
      'againstTeamName',
      'submittedByName',
      'submittedByEmail',
      'scoreFor',
      'scoreAgainst',
      'mvpMaleName',
      'mvpMaleEmail',
      'mvpMale2Name',
      'mvpMale2Email',
      'mvpFemaleName',
      'mvpFemaleEmail',
      'mvpFemale2Name',
      'mvpFemale2Email',
      'spirit',
      'spiritP1',
      'spiritP2',
      'spiritP3',
      'spiritP4',
      'spiritP5',
      'spiritComment',
    ],
    build: ({fixturesById, reports, seasonsById, teamsById, usersById}) => {
      return reports.map((report) => {
        const fixture = fixturesById.get(report.fixtureId)
        const team = teamsById.get(report.teamId)
        const againstTeam = teamsById.get(report.teamAgainstId)
        const submittedBy = report.userId ? usersById.get(report.userId) : undefined
        const season =
          (fixture ? seasonsById.get(fixture.seasonId) : undefined) ??
          (team ? seasonsById.get(team.seasonId) : undefined)

        return {
          seasonName: _seasonLabel(season),
          fixtureTitle: fixture?.title,
          fixtureDate: fixture?.date,
          teamName: _teamLabel(team),
          againstTeamName: _teamLabel(againstTeam),
          submittedByName: submittedBy ? _userLabel(submittedBy) : undefined,
          submittedByEmail: _primaryEmail(submittedBy),
          scoreFor: report.scoreFor,
          scoreAgainst: report.scoreAgainst,
          mvpMaleName: report.mvpMale ? _userLabel(usersById.get(report.mvpMale)) : undefined,
          mvpMaleEmail: _primaryEmail(usersById.get(report.mvpMale ?? '')),
          mvpMale2Name: report.mvpMale2
            ? _userLabel(usersById.get(report.mvpMale2))
            : undefined,
          mvpMale2Email: _primaryEmail(usersById.get(report.mvpMale2 ?? '')),
          mvpFemaleName: report.mvpFemale
            ? _userLabel(usersById.get(report.mvpFemale))
            : undefined,
          mvpFemaleEmail: _primaryEmail(usersById.get(report.mvpFemale ?? '')),
          mvpFemale2Name: report.mvpFemale2
            ? _userLabel(usersById.get(report.mvpFemale2))
            : undefined,
          mvpFemale2Email: _primaryEmail(usersById.get(report.mvpFemale2 ?? '')),
          spirit: report.spirit,
          spiritP1: report.spiritP1,
          spiritP2: report.spiritP2,
          spiritP3: report.spiritP3,
          spiritP4: report.spiritP4,
          spiritP5: report.spiritP5,
          spiritComment: report.spiritComment,
        }
      })
    },
  },
  {
    filename: 'memberships',
    fields: ['seasonName', 'teamName', 'userName', 'userEmail', 'captain', 'pending'],
    build: ({members, seasonsById, teamsById, usersById}) => {
      return _sortExportRecords(
        members.map((member) => {
          const team = teamsById.get(member.teamId)
          const season =
            seasonsById.get(member.seasonId) ??
            (team ? seasonsById.get(team.seasonId) : undefined)
          const user = usersById.get(member.userId)

          return {
            seasonName: _seasonLabel(season),
            teamName: _teamLabel(team),
            userName: user ? _userLabel(user) : undefined,
            userEmail: _primaryEmail(user),
            captain: !!member.captain,
            pending: member.pending,
          }
        }),
        ['seasonName', 'teamName', 'userName', 'userEmail']
      )
    },
  },
  {
    filename: 'teams',
    fields: ['seasonName', 'name', 'division', 'color', 'email', 'phone'],
    build: ({seasonsById, teams}) => {
      return teams.map((team) => ({
        seasonName: _seasonLabel(seasonsById.get(team.seasonId)),
        name: team.name,
        division: team.division,
        color: team.color,
        email: team.email,
        phone: team.phone,
      }))
    },
  },
  {
    filename: 'user-emails',
    fields: ['userName', 'userPrimaryEmail', 'email', 'verified', 'primary', 'createdOn'],
    build: ({users}) => {
      return _sortExportRecords(
        users.flatMap((user) =>
          _sortUserEmails(user.emails).map((email) => ({
            userName: _userName(user),
            userPrimaryEmail: _primaryEmail(user),
            email: email.value,
            verified: email.verified,
            primary: email.primary,
            createdOn: email.createdOn,
          }))
        ),
        ['userName', 'userPrimaryEmail', 'email']
      )
    },
  },
  {
    filename: 'users',
    fields: [
      'name',
      'firstName',
      'lastName',
      'primaryEmail',
      'gender',
      'admin',
      'termsAccepted',
      'lastSeasonName',
      'avatarUrl',
      'bio',
    ],
    build: ({seasonsById, users}) => {
      return users.map((user) => ({
        name: _userName(user),
        firstName: user.firstName,
        lastName: user.lastName,
        primaryEmail: _primaryEmail(user),
        gender: user.gender,
        admin: user.admin,
        termsAccepted: user.termsAccepted,
        lastSeasonName: user.lastSeasonId
          ? _seasonLabel(seasonsById.get(user.lastSeasonId))
          : undefined,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
      }))
    },
  },
] satisfies readonly TExportDatasetDef[]

export const createExportArchive = async (fileType: TExportFileType) => {
  const generatedOn = new Date().toISOString()
  const context = await _loadExportContext()
  const zip = new AdmZip()

  for (const dataset of EXPORT_DATASETS) {
    const records = dataset.build(context)
    const content = _serializeExportRecords(records, dataset.fields, fileType)
    zip.addFile(`${dataset.filename}.${fileType}`, Buffer.from(content, 'utf8'))
  }

  return {
    buffer: zip.toBuffer(),
    filename: _exportFilename(generatedOn, fileType),
  }
}

const _serializeExportRecords = (
  records: TExportRecord[],
  fields: readonly string[],
  fileType: TExportFileType
) => {
  return fileType === 'json' ? _jsonify(records, fields) : _csvify(records, fields)
}

const _csvify = (records: TExportRecord[], fields: readonly string[]) => {
  const headings = _orderedHeadings(records, fields)
  if (!headings.length) return ''
  const rows = records.map((record) =>
    headings
      .map((heading) =>
        _csvEscape(_csvValue(heading in record ? record[heading] : undefined))
      )
      .join(',')
  )
  return [headings.map(_csvEscape).join(','), ...rows].join('\n').concat('\n')
}

const _jsonify = (records: TExportRecord[], fields: readonly string[]) => {
  const headings = _orderedHeadings(records, fields)
  const orderedRecords = records.map((record) =>
    Object.fromEntries(
      headings.map((heading) => [
        heading,
        heading in record && record[heading] !== undefined ? record[heading] : null,
      ])
    )
  )
  return JSON.stringify(orderedRecords, null, 2).concat('\n')
}

const _orderedHeadings = (records: TExportRecord[], fields: readonly string[]) => {
  const headings = [...fields]
  const seen = new Set(headings)

  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (seen.has(key)) continue
      seen.add(key)
      headings.push(key)
    }
  }

  return headings
}

const _csvValue = (value: unknown) => {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value) ?? ''
}

const _csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`

const _exportFilename = (generatedOn: string, fileType: TExportFileType) => {
  const stamp = generatedOn.replace(/[:.]/g, '-')
  return `frisbee-export-${fileType}-${stamp}.zip`
}

const _loadExportContext = async (): Promise<TExportContext> => {
  const sort = {createdOn: 1 as const, id: 1 as const}
  const [fixtures, members, reports, seasons, teams, users] = await Promise.all([
    $Fixture.getMany({}, {sort}),
    $Member.getMany({}, {sort}),
    $Report.getMany({}, {sort}),
    $Season.getMany({}, {sort}),
    $Team.getMany({}, {sort}),
    $User.getMany({}, {sort}),
  ])

  return {
    fixtures,
    members,
    reports,
    seasons,
    teams,
    users,
    seasonsById: new Map(seasons.map((season) => [season.id, season])),
    fixturesById: new Map(fixtures.map((fixture) => [fixture.id, fixture])),
    teamsById: new Map(teams.map((team) => [team.id, team])),
    usersById: new Map(users.map((user) => [user.id, user])),
  }
}

const _sortExportRecords = (records: TExportRecord[], fields: readonly string[]) => {
  return [...records].sort((left, right) => {
    for (const field of fields) {
      const diff = _compareExportValues(left[field], right[field])
      if (diff) return diff
    }
    return 0
  })
}

const _compareExportValues = (left: unknown, right: unknown) => {
  if (typeof left === 'number' || typeof right === 'number') {
    const leftValue = typeof left === 'number' ? left : Number.MAX_SAFE_INTEGER
    const rightValue = typeof right === 'number' ? right : Number.MAX_SAFE_INTEGER
    return leftValue - rightValue
  }

  return String(left ?? '').localeCompare(String(right ?? ''))
}

const _userName = (user?: Pick<TUser, 'firstName' | 'lastName'>) => {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  return name || 'Unknown user'
}

const _userLabel = (user?: TUser) => _userName(user)

const _primaryEmail = (user?: TUser) => {
  if (!user) return undefined
  return userEmail.primary(user)?.value
}

const _sortUserEmails = (emails: TUserEmail[]) => {
  return [...emails].sort((a, b) => {
    if (a.primary === b.primary) return a.value.localeCompare(b.value)
    return a.primary ? -1 : 1
  })
}

const _seasonLabel = (season?: TSeason) => season?.name ?? 'Unknown season'

const _teamLabel = (team?: TTeam) => team?.name ?? 'Unknown team'
