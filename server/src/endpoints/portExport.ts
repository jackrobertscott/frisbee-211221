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
  sortRecords?: boolean
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
      'fixtureDate',
      'fixtureTitle',
      'gameTime',
      'gamePlace',
      'team1Name',
      'team1Score',
      'team2Name',
      'team2Score',
      'grading',
      'fixtureCreatedByName',
      'fixtureCreatedByEmail',
    ],
    build: ({fixtures, seasonsById, teamsById, usersById}) => {
      return fixtures.flatMap((fixture) => {
        const season = seasonsById.get(fixture.seasonId)
        const createdBy = usersById.get(fixture.userId)
        return fixture.games.map((game) => ({
          seasonName: _seasonLabel(season),
          fixtureTitle: fixture.title,
          fixtureDate: _humanReadableDate(fixture.date),
          grading: fixture.grading ? 'Yes' : '',
          fixtureCreatedByName: _userLabel(createdBy),
          fixtureCreatedByEmail: _primaryEmail(createdBy),
          gameTime: game.time,
          gamePlace: game.place,
          team1Name: _teamLabel(teamsById.get(game.team1Id)),
          team1Score: game.team1Score,
          team2Name: _teamLabel(teamsById.get(game.team2Id)),
          team2Score: game.team2Score,
        }))
      }).sort((a, b) => {
        const seasonDiff = a.seasonName.localeCompare(b.seasonName)
        if (seasonDiff) return seasonDiff
        const dateDiff = String(a.fixtureDate ?? '').localeCompare(
          String(b.fixtureDate ?? ''),
        )
        if (dateDiff) return dateDiff
        const fixtureDiff = String(a.fixtureTitle ?? '').localeCompare(
          String(b.fixtureTitle ?? ''),
        )
        if (fixtureDiff) return fixtureDiff
        const team1Diff = String(a.team1Name ?? '').localeCompare(
          String(b.team1Name ?? ''),
        )
        if (team1Diff) return team1Diff
        const team2Diff = String(a.team2Name ?? '').localeCompare(
          String(b.team2Name ?? ''),
        )
        if (team2Diff) return team2Diff
        return 0
      })
    },
  },
  {
    filename: 'season-final-results',
    sortRecords: true,
    fields: ['seasonName', 'position', 'teamName'],
    build: ({seasons, teamsById}) => {
      return seasons.flatMap((season) =>
        (season.finalResults ?? []).map((result) => ({
          seasonName: season.name,
          position: result.position,
          teamName: _teamLabel(teamsById.get(result.teamId)),
        })),
      ).sort((a, b) => {
        const seasonDiff = a.seasonName.localeCompare(b.seasonName)
        if (seasonDiff) return seasonDiff
        const teamDiff = String(a.teamName ?? '').localeCompare(String(b.teamName ?? ''))
        if (teamDiff) return teamDiff
        return 0
      })
    },
  },
  {
    filename: 'seasons',
    fields: ['name', 'signUpOpen', 'scoringSystem', 'isHidden'],
    build: ({seasons}) => {
      return seasons.map((season) => ({
        name: season.name,
        signUpOpen: season.signUpOpen ? 'Yes' : '',
        isHidden: season.isHidden ? 'Yes' : '',
        scoringSystem: season.useOfficialScoring ? 'Official' : 'Simple',
      })).sort((a, b) => a.name.localeCompare(b.name))
    },
  },
  {
    filename: 'reports',
    fields: [
      'seasonName',
      'fixtureDate',
      'fixtureTitle',
      'teamName',
      'againstTeamName',
      'scoreFor',
      'scoreAgainst',
      'spiritSimple',
      'spiritP1',
      'spiritP2',
      'spiritP3',
      'spiritP4',
      'spiritP5',
      'spiritComment',
      'mvpMaleName',
      'mvpMaleEmail',
      'mvpMale2Name',
      'mvpMale2Email',
      'mvpFemaleName',
      'mvpFemaleEmail',
      'mvpFemale2Name',
      'mvpFemale2Email',
      'submittedByName',
      'submittedByEmail',
    ],
    build: ({fixturesById, reports, seasonsById, teamsById, usersById}) => {
      return reports.map((report) => {
        const fixture = fixturesById.get(report.fixtureId)
        const team = teamsById.get(report.teamId)
        const againstTeam = teamsById.get(report.teamAgainstId)
        const submittedBy = report.userId
          ? usersById.get(report.userId)
          : undefined
        const season =
          (fixture ? seasonsById.get(fixture.seasonId) : undefined) ??
          (team ? seasonsById.get(team.seasonId) : undefined)

        return {
          seasonName: _seasonLabel(season),
          fixtureTitle: fixture?.title,
          fixtureDate: _humanReadableDate(fixture?.date),
          teamName: _teamLabel(team),
          againstTeamName: _teamLabel(againstTeam),
          submittedByName: submittedBy ? _userLabel(submittedBy) : undefined,
          submittedByEmail: _primaryEmail(submittedBy),
          scoreFor: report.scoreFor,
          scoreAgainst: report.scoreAgainst,
          mvpMaleName: report.mvpMale
            ? _userLabel(usersById.get(report.mvpMale))
            : undefined,
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
          mvpFemale2Email: _primaryEmail(
            usersById.get(report.mvpFemale2 ?? ''),
          ),
          spiritSimple: report.spirit,
          spiritP1: report.spiritP1,
          spiritP2: report.spiritP2,
          spiritP3: report.spiritP3,
          spiritP4: report.spiritP4,
          spiritP5: report.spiritP5,
          spiritComment: report.spiritComment,
        }
      }).sort((a, b) => {
        const seasonDiff = a.seasonName.localeCompare(b.seasonName)
        if (seasonDiff) return seasonDiff
        const dateDiff = String(a.fixtureDate ?? '').localeCompare(
          String(b.fixtureDate ?? ''),
        )
        if (dateDiff) return dateDiff
        const fixtureDiff = String(a.fixtureTitle ?? '').localeCompare(
          String(b.fixtureTitle ?? ''),
        )
        if (fixtureDiff) return fixtureDiff
        const teamDiff = String(a.teamName ?? '').localeCompare(
          String(b.teamName ?? ''),
        )
        if (teamDiff) return teamDiff
        return String(a.againstTeamName ?? '').localeCompare(
          String(b.againstTeamName ?? ''),
        )
      })
    },
  },
  {
    filename: 'memberships',
    sortRecords: true,
    fields: [
      'seasonName',
      'teamName',
      'userName',
      'userEmail',
      'captain',
      'pending',
    ],
    build: ({members, seasonsById, teamsById, usersById}) => {
      return members.map((member) => {
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
          captain: member.captain ? 'Yes' : '',
          pending: member.pending ? 'Pending' : '',
        }
      }).sort((a, b) => {
        const seasonDiff = a.seasonName.localeCompare(b.seasonName)
        if (seasonDiff) return seasonDiff
        const teamDiff = String(a.teamName ?? '').localeCompare(String(b.teamName ?? ''))
        if (teamDiff) return teamDiff
        const userDiff = String(a.userName ?? '').localeCompare(String(b.userName ?? ''))
        if (userDiff) return userDiff
        return String(a.userEmail ?? '').localeCompare(String(b.userEmail ?? ''))
      })
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
      })).sort((a, b) => {
        const seasonDiff = a.seasonName.localeCompare(b.seasonName)
        if (seasonDiff) return seasonDiff
        const divisionDiff = String(a.division ?? '').localeCompare(String(b.division ?? ''))
        if (divisionDiff) return divisionDiff
        return a.name.localeCompare(b.name)
      })
    },
  },
  {
    filename: 'user-emails',
    sortRecords: true,
    fields: [
      'userName',
      'email',
      'primary',
      'verified',
      'createdOn',
      'userPrimaryEmail',
    ],
    build: ({users}) => {
      return users.flatMap((user) =>
        _sortUserEmails(user.emails).map((email) => ({
          userName: _userName(user),
          userPrimaryEmail: _primaryEmail(user),
          email: email.value,
          verified: email.verified ? 'Yes' : '',
          primary: email.primary ? 'Yes' : '',
          createdOn: _humanReadableDate(email.createdOn),
        })),
      ).sort((a, b) => {
        const userDiff = String(a.userName ?? '').localeCompare(String(b.userName ?? ''))
        if (userDiff) return userDiff
        const emailDiff = String(a.email ?? '').localeCompare(String(b.email ?? ''))
        if (emailDiff) return emailDiff
        return 0
    })
    },
  },
  {
    filename: 'users',
    fields: [
      'firstName',
      'lastName',
      'primaryEmail',
      'gender',
      'admin',
      'termsAccepted',
      'createdOn',
    ],
    build: ({users}) => {
      return users.map((user) => ({
        firstName: user.firstName,
        lastName: user.lastName,
        primaryEmail: _primaryEmail(user),
        primaryEmailVerified: _primaryEmailVerified(user),
        gender: user.gender,
        admin: user.admin ? 'Yes' : '',
        termsAccepted: user.termsAccepted ? 'Yes' : '',
        createdOn: _humanReadableDate(user.createdOn),
      })).sort((a, b) => {
        const nameDiff = String(a.firstName ?? '').localeCompare(String(b.firstName ?? ''))
        if (nameDiff) return nameDiff
        return String(a.lastName ?? '').localeCompare(String(b.lastName ?? ''))
      })
    },
  },
] satisfies readonly TExportDatasetDef[]

export const createExportArchive = async (fileType: TExportFileType) => {
  const generatedOn = new Date().toISOString()
  const context = await _loadExportContext()
  const zip = new AdmZip()

  for (const dataset of EXPORT_DATASETS) {
    const records = dataset.sortRecords
      ? _sortExportRecords(dataset.build(context), dataset.fields)
      : dataset.build(context)
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
  fileType: TExportFileType,
) => {
  return fileType === 'json'
    ? _jsonify(records, fields)
    : _csvify(records, fields)
}

const _csvify = (records: TExportRecord[], fields: readonly string[]) => {
  const headings = _orderedHeadings(records, fields)
  if (!headings.length) return ''
  const rows = records.map((record) =>
    headings
      .map((heading) =>
        _csvEscape(_csvValue(heading in record ? record[heading] : undefined)),
      )
      .join(','),
  )
  return [headings.map(_csvHeading).map(_csvEscape).join(','), ...rows]
    .join('\n')
    .concat('\n')
}

const _jsonify = (records: TExportRecord[], fields: readonly string[]) => {
  const headings = _orderedHeadings(records, fields)
  const orderedRecords = records.map((record) =>
    Object.fromEntries(
      headings.map((heading) => [
        heading,
        heading in record && record[heading] !== undefined
          ? record[heading]
          : null,
      ]),
    ),
  )
  return JSON.stringify(orderedRecords, null, 2).concat('\n')
}

const _orderedHeadings = (
  records: TExportRecord[],
  fields: readonly string[],
) => {
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
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return JSON.stringify(value) ?? ''
}

const _csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`

const _csvHeading = (value: string) =>
  value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z\d]+/g, '_')
    .toUpperCase()

const _exportFilename = (generatedOn: string, fileType: TExportFileType) => {
  const stamp = generatedOn.replace(/[:.]/g, '-')
  return `frisbee-export-${fileType}-${stamp}.zip`
}

const _loadExportContext = async (): Promise<TExportContext> => {
  const sort = {createdOn: 1 as const, id: 1 as const}
  const [fixtures, members, reports, seasons, teams, users] = await Promise.all(
    [
      $Fixture.getMany({}, {sort}),
      $Member.getMany({}, {sort}),
      $Report.getMany({}, {sort}),
      $Season.getMany({}, {sort}),
      $Team.getMany({}, {sort}),
      $User.getMany({}, {sort}),
    ],
  )

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

const _sortExportRecords = (
  records: TExportRecord[],
  fields: readonly string[],
) => {
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
    const rightValue =
      typeof right === 'number' ? right : Number.MAX_SAFE_INTEGER
    return leftValue - rightValue
  }

  return String(left ?? '').localeCompare(String(right ?? ''))
}

const _userName = (user?: Pick<TUser, 'firstName' | 'lastName'>) => {
  const name = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  return name || 'Unknown user'
}

const _userLabel = (user?: TUser) => _userName(user)

const _primaryEmail = (user?: TUser) => {
  if (!user) return undefined
  return userEmail.primary(user)?.value
}

const _primaryEmailVerified = (user?: TUser) => {
  if (!user) return undefined
  return userEmail.primary(user)?.verified
}

const _sortUserEmails = (emails: TUserEmail[]) => {
  return [...emails].sort((a, b) => {
    if (a.primary === b.primary) return a.value.localeCompare(b.value)
    return a.primary ? -1 : 1
  })
}

const _seasonLabel = (season?: TSeason) => season?.name ?? 'Unknown season'

const _teamLabel = (team?: TTeam) => team?.name ?? 'Unknown team'

const _humanReadableDate = (dateStr?: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('en-AU')
}
