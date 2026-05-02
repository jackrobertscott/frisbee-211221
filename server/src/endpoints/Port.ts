import {badRequestError} from '@shared/errors'
import {random} from '@server/utils/random'
import {
  PortDeleteAllMockDataDef,
  PortExportDef,
  PortImportDef,
  PortMockGenerateDef,
} from '@shared/endpoints/PortDef'
import {TMember} from '@shared/schemas/ioMember'
import {TSeason} from '@shared/schemas/ioSeason'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUser, TUserEmail} from '@shared/schemas/ioUser'
import AdmZip from 'adm-zip'
import {RequestHandler} from 'micro'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {blob} from '../utils/blob'
import {createEndpoint} from '../utils/endpoints'
import mongo from '../utils/mongo'
import {regex} from '../utils/regex'
import {requireUserAdmin} from './requireUserAdmin'
import {userEmail} from './userEmail'

type TExportRecord = Record<string, unknown>

type TExportDataset = {
  name: string
  filename: string
  description: string
  sensitivity: string
  records: TExportRecord[]
  csvRecords?: TExportRecord[]
}

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...PortImportDef,
    handler: () => async (req) => {
      await requireUserAdmin(req)
      const [rawFiles, fields] = await blob.digestRequest(req)
      const seasonId = fields.get('seasonId')
      if (!seasonId?.trim())
        throw badRequestError('Season id missing from request.', {
          errorCode: 'season.id_missing',
        })
      const season = await $Season.getOne({id: seasonId})
      if (!rawFiles[0])
        throw badRequestError('No file was present on the request.', {
          errorCode: 'upload.file_missing',
        })
      if (!['text/csv'].includes(rawFiles[0].mimetype))
        throw badRequestError('Failed: import file type must be a CSV.', {
          errorCode: 'upload.invalid_file_type',
        })
      const csvBuffer = await blob.filepathBuffer(rawFiles[0].filepath)
      const content = csvBuffer.toString()
      const objects = _parseCSVString(content)
      const requiredHeadings = [
        'team_name',
        'email_address',
        'first_name',
        'last_name',
      ]
      const providedHeadings = objects.length > 0 ? Object.keys(objects[0]) : []
      const missingHeadings = requiredHeadings.filter(
        (h) => !providedHeadings.includes(h)
      )
      if (missingHeadings.length > 0) {
        throw badRequestError(
          `Missing required headings: ${missingHeadings.join(', ')}`
        )
      }
      const allowedHeadings = [
        'team_name',
        'team_division',
        'type',
        'email_address',
        'first_name',
        'last_name',
        'gender',
      ]
      const unexpectedHeadings = providedHeadings.filter(
        (h) => !allowedHeadings.includes(h)
      )
      if (unexpectedHeadings.length > 0) {
        throw badRequestError(
          `Unexpected headings found: ${unexpectedHeadings.join(', ')}`
        )
      }
      await mongo.transaction(async () => {
        await _createTeamsFromObjects(objects, season.id)
        await _createUsersFromObjects(objects, season.id)
      })
    },
  }),

  createEndpoint({
    ...PortExportDef,
    handler: () => async (req, res) => {
      const [user] = await requireUserAdmin(req)
      const generatedOn = new Date().toISOString()
      const datasets = await _loadExportDatasets()
      const generatedByEmail = _primaryEmail(user)
      const manifest = {
        formatVersion: 3,
        generatedOn,
        generatedBy: {
          name: _userName(user),
          email: generatedByEmail,
        },
        summary: {
          collections: datasets.length,
          records: datasets.reduce((all, dataset) => all + dataset.records.length, 0),
        },
        includedCollections: datasets.map((dataset) => ({
          name: dataset.name,
          filename: dataset.filename,
          records: dataset.records.length,
          sensitivity: dataset.sensitivity,
          description: dataset.description,
        })),
      }

      const zip = new AdmZip()
      zip.addFile('README.txt', Buffer.from(_exportReadme(manifest), 'utf8'))
      zip.addFile('manifest.json', Buffer.from(_jsonify(manifest), 'utf8'))

      for (const dataset of datasets) {
        zip.addFile(
          `json/${dataset.filename}.json`,
          Buffer.from(_jsonify(dataset.records), 'utf8')
        )
        zip.addFile(
          `csv/${dataset.filename}.csv`,
          Buffer.from(_csvify(dataset.csvRecords ?? dataset.records), 'utf8')
        )
      }

      const zipBuffer = zip.toBuffer()
      const filename = _exportFilename(generatedOn)
      res.statusCode = 200
      res.setHeader('Cache-Control', 'no-store, max-age=0')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      )
      res.setHeader('Content-Length', String(zipBuffer.byteLength))
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.end(zipBuffer)
      return null
    },
  }),

  createEndpoint({
    ...PortMockGenerateDef,
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      if (!body.seasonId?.trim())
        throw badRequestError('Season id missing from request.', {
          errorCode: 'season.id_missing',
        })
      const season = await $Season.getOne({id: body.seasonId})

      const teams = [] as {
        id: string
        seasonId: string
        isMock: boolean
        name: string
        color: string
        division: number
      }[]

      const teamNames = _mockTeamNames(body.teams)

      while (teams.length < body.teams) {
        teams.push({
          id: random.generateId(),
          isMock: true,
          seasonId: season.id,
          name: teamNames[teams.length],
          color: `hsla(${Math.floor(Math.random() * 36) * 10}, 100%, 65%, 1)`,
          division: 1,
        })
      }

      const users = [] as {
        id: string
        isMock: boolean
        firstName: string
        lastName: string
        termsAccepted: boolean
        gender: string
        emails: TUserEmail[]
      }[]

      const members = [] as {
        seasonId: string
        teamId: string
        userId: string
        isMock: boolean
        captain: boolean
        pending: boolean
      }[]

      for (const team of teams) {
        const teamUsers = [] as typeof users
        while (teamUsers.length < body.usersPerTeam) {
          const firstName = _randFirstName()
          const lastName = _randLastName()
          const email = _randEmail(firstName, lastName)
          if (!teamUsers.some((u) => u.emails[0].value === email)) {
            const user = {
              id: random.generateId(),
              isMock: true,
              firstName,
              lastName,
              gender: Math.random() > 0.5 ? 'male' : 'female',
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
        }
        users.push(...teamUsers)
      }

      await mongo.transaction(async () => {
        await $Member.createMany(members)
        await $Team.createMany(teams)
        await $User.createMany(users)
      })
    },
  }),

  createEndpoint({
    ...PortDeleteAllMockDataDef,
    handler: () => async (req) => {
      await requireUserAdmin(req)

      const mockTeams = await $Team.getMany({isMock: true})

      await mongo.transaction(async () => {
        await $Member.deleteMany({isMock: true})
        await $Team.deleteMany({isMock: true})
        await $User.deleteMany({isMock: true})
        await $Report.deleteMany({
          $or: [
            {teamId: {$in: mockTeams.map((i) => i.id)}},
            {teamAgainstId: {$in: mockTeams.map((i) => i.id)}},
          ],
        })
      })
    },
  }),
])

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

const _pick = (values: string[]) => values[Math.floor(Math.random() * values.length)]

const _slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '.')

const _shuffle = <T>(values: T[]) => {
  const copy = [...values]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const _mockTeamNames = (count: number) => {
  const pool = new Set<string>()

  for (const district of MOCK_TEAM_DISTRICTS) {
    for (const mascot of MOCK_TEAM_MASCOTS) {
      pool.add(`${district} ${mascot}`)
    }
  }

  for (const modifier of MOCK_TEAM_MODIFIERS) {
    for (const mascot of MOCK_TEAM_MASCOTS) {
      pool.add(`${modifier} ${mascot}`)
    }
  }

  for (const district of MOCK_TEAM_DISTRICTS) {
    for (const modifier of MOCK_TEAM_MODIFIERS) {
      for (const mascot of MOCK_TEAM_MASCOTS) {
        pool.add(`${district} ${modifier} ${mascot}`)
      }
    }
  }

  const names = _shuffle([...pool])
  if (names.length >= count) return names.slice(0, count)

  const extras = [] as string[]
  while (names.length + extras.length < count) {
    const base = names[(names.length + extras.length) % names.length]
    const cycle = Math.floor((names.length + extras.length) / names.length) + 1
    extras.push(`${base} ${cycle}`)
  }
  return [...names, ...extras]
}

const _randFirstName = () => _pick(MOCK_FIRST_NAMES)

const _randLastName = () => _pick(MOCK_LAST_NAMES)

const _randEmail = (firstName: string, lastName: string) => {
  return `${_slugify(firstName)}.${_slugify(lastName)}.${random.randomString(6).toLowerCase()}@example.com`
}

const _createTeamsFromObjects = async (
  objects: Record<string, string>[],
  seasonId: string
) => {
  const teamCSVMap = new Map(
    objects.map((i) => {
      const div = i.team_division && parseInt(i.team_division)
      return [
        i.team_name,
        {
          seasonId: seasonId,
          name: i.team_name,
          division: !div || isNaN(div) ? 1 : div,
          color: 'hsla(0, 0%, 100%, 1)',
        },
      ]
    })
  )
  const teamCSVList = [...teamCSVMap.values()]
  const teamCSVNameList = [...teamCSVMap.keys()]
  const teamDBList = await $Team.getMany({
    seasonId: seasonId,
    name: {$in: teamCSVNameList.map(regex.normalize)},
  })
  const teamDBNameList = teamDBList.map((i) => i.name.toLowerCase().trim())
  const teamCSVNewList = teamCSVList.filter((i) => {
    return !teamDBNameList.includes(i.name.toLowerCase().trim())
  })
  if (teamCSVNewList.length) await $Team.createMany(teamCSVNewList)
}

const _createUsersFromObjects = async (
  objects: Record<string, string>[],
  seasonId: string
) => {
  const userCSVEmailList = [] as string[]
  let userCSVList = objects
    .map((i) => ({
      _team: i.team_name,
      _captain: i.type === 'team',
      _email: i.email_address,
      firstName: i.first_name,
      lastName: i.last_name,
      gender: i.gender,
      termsAccepted: false,
      emails: [userEmail.create(i.email_address, true)],
    }))
    .filter((i) => {
      if (userCSVEmailList.includes(i._email)) return false
      userCSVEmailList.push(i._email)
      return true
    })
  const loadDBUsers = () => {
    const csvEmails = userCSVEmailList.map(regex.normalize)
    return $User.getMany({
      'emails.value': {$in: csvEmails},
    })
  }
  let userDBList = await loadDBUsers()
  const allUserEmails = (user: TUser) =>
    user.emails.map((i) => i.value.toLowerCase().trim())
  const userDBEmailList = userDBList.flatMap(allUserEmails)
  const userCSVNewList = userCSVList.filter((i) => {
    return !userDBEmailList.includes(i._email.toLowerCase().trim())
  })
  if (userCSVNewList.length) await $User.createMany(userCSVNewList)
  userDBList = await loadDBUsers()
  const teamDBList = await $Team.getMany({seasonId})
  const memberCSVList = userDBList
    .map((i) => {
      const userCSV = userCSVList.find((x) => {
        return allUserEmails(i).includes(x._email.toLowerCase().trim())
      })
      if (!userCSV) return undefined
      const userCSVTeamName = userCSV?._team.toLowerCase().trim()
      const teamDBOfUser = teamDBList.find((i) => {
        return i.name.toLowerCase().trim() === userCSVTeamName
      })
      if (!teamDBOfUser) return undefined
      return {
        seasonId: teamDBOfUser.seasonId,
        teamId: teamDBOfUser.id,
        userId: i.id,
        captain: userCSV._captain,
        pending: false,
      }
    })
    .filter((i) => !!i)
    .map((i) => i!)
  const memberDBList = await $Member.getMany({
    seasonId,
    userId: {$in: userDBList.map((i) => i.id)},
  })
  const memberDBUserIdList = memberDBList.map((i) => i.userId)
  const memberCSVNewList = memberCSVList.filter((i) => {
    return !memberDBUserIdList.includes(i.userId)
  })
  if (memberCSVNewList.length) await $Member.createMany(memberCSVNewList)
}

const _parseCSVString = (csv: string) => {
  const data = []
  const body = csv.split('\n').filter((i) => i.trim())
  const head = body.splice(0, 1)[0]
  const cols = _tokenify(head)
  for (const row of body) {
    const tokens = _tokenify(row)
    const insert = cols.reduce((all, key, index) => {
      all[key] = tokens[index]
      return all
    }, {} as Record<string, string>)
    data.push(insert)
  }
  return data
}

const _tokenify = (text: string) => {
  let tokens = [] as string[]
  let token = ''
  for (let i = 0, quotes = false; i < text.length; i++) {
    const escaped =
      i > 0 && text[i - 1] === '\\' && !(i > 1 && text[i - 2] === '\\')
    if (text[i] === '"' && !escaped) {
      quotes = !quotes
      continue
    }
    if (text[i] === ',' && !quotes) {
      tokens.push(token.trim())
      token = ''
      continue
    }
    token += text[i]
  }
  tokens.push(token.trim())
  return tokens
}

const _csvify = (objects: any[]) => {
  const headings = [...new Set(objects.flatMap((obj) => Object.keys(obj ?? {})))].sort()
  if (!headings.length) return ''
  const rows = objects.map((obj) =>
    headings.map((heading) => _csvEscape(_csvValue(obj?.[heading]))).join(',')
  )
  return [headings.map(_csvEscape).join(','), ...rows].join('\n').concat('\n')
}

const _jsonify = (value: unknown) => JSON.stringify(value, null, 2).concat('\n')

const _csvValue = (value: unknown) => {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value) ?? ''
}

const _csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`

const _exportFilename = (generatedOn: string) => {
  const stamp = generatedOn.replace(/[:.]/g, '-')
  return `frisbee-export-${stamp}.zip`
}

const _exportReadme = (manifest: {
  formatVersion: number
  generatedOn: string
  generatedBy: {
    name: string
    email?: string
  }
  summary: {
    collections: number
    records: number
  }
  includedCollections: Array<{
    name: string
    filename: string
    records: number
    sensitivity: string
    description: string
  }>
}) => {
  const lines = [
    'Frisbee export package',
    '',
    `Generated on: ${manifest.generatedOn}`,
    `Generated by: ${manifest.generatedBy.name}${manifest.generatedBy.email ? ` (${manifest.generatedBy.email})` : ''}`,
    `Format version: ${manifest.formatVersion}`,
    `Collections exported: ${manifest.summary.collections}`,
    `Records exported: ${manifest.summary.records}`,
    '',
    'Contents:',
    ...manifest.includedCollections.map(
      (collection) =>
        `- ${collection.name}: ${collection.records} records (${collection.filename}.json, ${collection.filename}.csv)`
    ),
  ]
  lines.push(
    '',
    'Excluded by design: comments and posts.',
    '',
    'JSON files are the authoritative backup format.',
    'CSV files are included as convenience exports for spreadsheet use.'
  )
  return lines.join('\n').concat('\n')
}

const _loadExportDatasets = async (): Promise<TExportDataset[]> => {
  const sort = {createdOn: 1 as const, id: 1 as const}
  const [
    fixtures,
    members,
    reports,
    seasons,
    teams,
    users,
  ] = await Promise.all([
    $Fixture.getMany({}, {sort}),
    $Member.getMany({}, {sort}),
    $Report.getMany({}, {sort}),
    $Season.getMany({}, {sort}),
    $Team.getMany({}, {sort}),
    $User.getMany({}, {sort}),
  ])

  const seasonsById = new Map(seasons.map((season) => [season.id, season]))
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]))
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  const usersById = new Map(users.map((user) => [user.id, user]))

  const teamMembersByTeam = new Map<string, TMember[]>()
  const teamMembersByUser = new Map<string, TMember[]>()
  for (const member of members) {
    const teamList = teamMembersByTeam.get(member.teamId) ?? []
    teamList.push(member)
    teamMembersByTeam.set(member.teamId, teamList)

    const userList = teamMembersByUser.get(member.userId) ?? []
    userList.push(member)
    teamMembersByUser.set(member.userId, userList)
  }

  const exportSeasons = seasons.map((season) => {
    const seasonTeams = teams
      .filter((team) => team.seasonId === season.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((team) => team.name)

    return _compactRecord({
      name: season.name,
      signUpOpen: season.signUpOpen,
      isHidden: season.isHidden,
      useOfficialScoring: season.useOfficialScoring,
      teams: seasonTeams,
      finalResults: season.finalResults
        ?.map((result) => ({
          teamName: _teamLabel(teamsById.get(result.teamId)),
          position: result.position,
        }))
        .sort((a, b) => {
          const aPosition = a.position ?? Number.MAX_SAFE_INTEGER
          const bPosition = b.position ?? Number.MAX_SAFE_INTEGER
          return aPosition - bPosition || a.teamName.localeCompare(b.teamName)
        }),
    })
  })
  const exportSeasonsCsv = exportSeasons.map((season) =>
    _compactRecord({
      ...season,
      teams: _joinHumanList(season.teams as string[] | undefined),
      finalResults: _joinHumanList(
        (season.finalResults as
          | Array<{teamName: string; position?: number | null}>
          | undefined)?.map((result) =>
          result.position === undefined || result.position === null
            ? result.teamName
            : `${result.position}. ${result.teamName}`
        )
      ),
    })
  )

  const exportUsers = users.map((user) => {
    const memberships = (teamMembersByUser.get(user.id) ?? [])
      .map((member) => {
        const team = teamsById.get(member.teamId)
        const season = seasonsById.get(member.seasonId) ?? (team ? seasonsById.get(team.seasonId) : undefined)
        return {
          seasonName: _seasonLabel(season),
          teamName: _teamLabel(team),
          captain: !!member.captain,
          pending: member.pending,
        }
      })
      .sort((a, b) => {
        return (
          a.seasonName.localeCompare(b.seasonName) ||
          a.teamName.localeCompare(b.teamName)
        )
      })

    return _compactRecord({
      name: _userName(user),
      firstName: user.firstName,
      lastName: user.lastName,
      primaryEmail: _primaryEmail(user),
      emails: _sortUserEmails(user.emails).map((email) => email.value),
      gender: user.gender,
      admin: user.admin,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      termsAccepted: user.termsAccepted,
      lastSeasonName: user.lastSeasonId
        ? _seasonLabel(seasonsById.get(user.lastSeasonId))
        : undefined,
      memberships,
    })
  })
  const exportUsersCsv = exportUsers.map((user) =>
    _compactRecord({
      ...user,
      emails: _joinHumanList(user.emails as string[] | undefined),
      memberships: _joinHumanList(
        (user.memberships as
          | Array<{
              seasonName: string
              teamName: string
              captain: boolean
              pending: boolean
            }>
          | undefined)?.map((membership) =>
          _appendFlags(`${membership.seasonName} / ${membership.teamName}`, [
            membership.captain ? 'captain' : undefined,
            membership.pending ? 'pending' : undefined,
          ])
        )
      ),
    })
  )

  const exportTeams = teams.map((team) => {
    const season = seasonsById.get(team.seasonId)
    const members = (teamMembersByTeam.get(team.id) ?? [])
      .map((member) => {
        const user = usersById.get(member.userId)
        return {
          userName: _userLabel(user),
          userEmail: _primaryEmail(user),
          captain: !!member.captain,
          pending: member.pending,
        }
      })
      .sort((a, b) => {
        return (
          (a.userName ?? '').localeCompare(b.userName ?? '') ||
          (a.userEmail ?? '').localeCompare(b.userEmail ?? '')
        )
      })

    return _compactRecord({
      seasonName: _seasonLabel(season),
      name: team.name,
      division: team.division,
      color: team.color,
      phone: team.phone,
      email: team.email,
      members,
    })
  })
  const exportTeamsCsv = exportTeams.map((team) =>
    _compactRecord({
      ...team,
      members: _joinHumanList(
        (team.members as
          | Array<{
              userName: string
              userEmail?: string
              captain: boolean
              pending: boolean
            }>
          | undefined)?.map((member) =>
          _appendFlags(_personLabel(member.userName, member.userEmail), [
            member.captain ? 'captain' : undefined,
            member.pending ? 'pending' : undefined,
          ])
        )
      ),
    })
  )

  const exportMemberships = members
    .map((member) => {
      const team = teamsById.get(member.teamId)
      const season = seasonsById.get(member.seasonId) ?? (team ? seasonsById.get(team.seasonId) : undefined)
      const user = usersById.get(member.userId)
      return _compactRecord({
        seasonName: _seasonLabel(season),
        teamName: _teamLabel(team),
        userName: user ? _userLabel(user) : undefined,
        userEmail: _primaryEmail(user),
        captain: !!member.captain,
        pending: member.pending,
      })
    })
    .sort((a, b) => {
      return (
        (a.seasonName ?? '').localeCompare(b.seasonName ?? '') ||
        (a.teamName ?? '').localeCompare(b.teamName ?? '') ||
        (a.userName ?? '').localeCompare(b.userName ?? '') ||
        (a.userEmail ?? '').localeCompare(b.userEmail ?? '')
      )
    })

  const exportFixtureGames = fixtures.flatMap((fixture) => {
    const season = seasonsById.get(fixture.seasonId)
    const createdBy = usersById.get(fixture.userId)
    return fixture.games.map((game) =>
      _compactRecord({
        seasonName: _seasonLabel(season),
        fixtureTitle: fixture.title,
        fixtureDate: fixture.date,
        fixtureCreatedByName: _userLabel(createdBy),
        fixtureCreatedByEmail: _primaryEmail(createdBy),
        grading: fixture.grading,
        gameTime: game.time,
        gamePlace: game.place,
        team1Name: _teamLabel(teamsById.get(game.team1Id)),
        team2Name: _teamLabel(teamsById.get(game.team2Id)),
        team1Score: game.team1Score,
        team2Score: game.team2Score,
      })
    )
  })

  const exportReports = reports.map((report) => {
    const fixture = fixturesById.get(report.fixtureId)
    const team = teamsById.get(report.teamId)
    const againstTeam = teamsById.get(report.teamAgainstId)
    const submittedBy = report.userId ? usersById.get(report.userId) : undefined
    const season =
      (fixture ? seasonsById.get(fixture.seasonId) : undefined) ??
      (team ? seasonsById.get(team.seasonId) : undefined)

    return _compactRecord({
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
      spiritComment: report.spiritComment,
      spiritP1: report.spiritP1,
      spiritP2: report.spiritP2,
      spiritP3: report.spiritP3,
      spiritP4: report.spiritP4,
      spiritP5: report.spiritP5,
    })
  })

  return [
    {
      name: 'fixture games',
      filename: 'fixture-games',
      description:
        'Fixture game rows with season, user, and team relationships represented by names and email addresses.',
      sensitivity: 'standard',
      records: exportFixtureGames,
    },
    {
      name: 'seasons',
      filename: 'seasons',
      description: 'Season records with teams and final results represented by team names.',
      sensitivity: 'standard',
      records: exportSeasons,
      csvRecords: exportSeasonsCsv,
    },
    {
      name: 'reports',
      filename: 'reports',
      description:
        'Match reports with season, fixture, team, submitter, and MVP relationships represented by names and email addresses.',
      sensitivity: 'standard',
      records: exportReports,
    },
    {
      name: 'memberships',
      filename: 'memberships',
      description:
        'User-to-team membership records with season, team, and user relationships represented by names and email addresses.',
      sensitivity: 'standard',
      records: exportMemberships,
    },
    {
      name: 'teams',
      filename: 'teams',
      description: 'Team records with season and membership relationships represented by names and email addresses.',
      sensitivity: 'standard',
      records: exportTeams,
      csvRecords: exportTeamsCsv,
    },
    {
      name: 'users',
      filename: 'users',
      description: 'User records with season and team memberships represented by names and email addresses.',
      sensitivity: 'standard',
      records: exportUsers,
      csvRecords: exportUsersCsv,
    },
  ]
}

const _compactRecord = <T extends Record<string, unknown>>(record: T) => {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  ) as T
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

const _joinHumanList = (values?: Array<string | undefined>) => {
  const items = (values ?? [])
    .map((value) => value?.trim())
    .filter((value): value is string => !!value)
  return items.length ? items.join('; ') : undefined
}

const _appendFlags = (label: string, flags: Array<string | undefined>) => {
  const activeFlags = flags.filter((flag): flag is string => !!flag)
  return activeFlags.length ? `${label} (${activeFlags.join(', ')})` : label
}

const _personLabel = (name: string, email?: string) => {
  return email ? `${name} <${email}>` : name
}

const _seasonLabel = (season?: TSeason) => season?.name ?? 'Unknown season'

const _teamLabel = (team?: TTeam) => team?.name ?? 'Unknown team'
