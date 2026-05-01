import {badRequestError} from '@shared/errors'
import {random} from '@server/utils/random'
import {
  PortDeleteAllMockDataDef,
  PortExportDef,
  PortImportDef,
  PortMockGenerateDef,
} from '@shared/endpoints/PortDef'
import {TUser, TUserEmail} from '@shared/schemas/ioUser'
import AdmZip from 'adm-zip'
import {RequestHandler} from 'micro'
import {$Comment} from '../tables/$Comment'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Post} from '../tables/$Post'
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
      const manifest = {
        formatVersion: 2,
        generatedOn,
        generatedBy: {
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        includedCollections: datasets.map((dataset) => ({
          name: dataset.name,
          filename: dataset.filename,
          records: dataset.records.length,
          sensitivity: dataset.sensitivity,
          description: dataset.description,
        })),
        excludedCollections: [
          {
            name: 'sessions',
            reason:
              'Authentication sessions are intentionally excluded because they are ephemeral credentials, not durable application data.',
          },
        ],
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
          Buffer.from(_csvify(dataset.records), 'utf8')
        )
      }

      const zipBuffer = zip.toBuffer()
      const filename = _exportFilename(generatedOn)
      res.statusCode = 200
      res.setHeader('Cache-Control', 'no-store, max-age=0')
      res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`)
      res.setHeader('Content-Length', String(zipBuffer.byteLength))
      res.setHeader('Content-Type', 'application/zip')
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

      while (teams.length < body.teams) {
        teams.push({
          id: random.generateId(),
          isMock: true,
          seasonId: season.id,
          name: _mockTeamName(teams.length),
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

const MOCK_ANIMALS = [
  'Falcon',
  'Otter',
  'Puma',
  'Shark',
  'Wolf',
  'Eagle',
  'Panther',
  'Fox',
  'Raven',
  'Lynx',
  'Tiger',
  'Bear',
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


const _mockTeamName = (index: number) => {
  const animal = MOCK_ANIMALS[index % MOCK_ANIMALS.length]
  const base = `${animal}s`
  const cycle = Math.floor(index / MOCK_ANIMALS.length)
  return cycle > 0 ? `${base} ${cycle + 1}` : base
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
      $or: [{email: {$in: csvEmails}}, {'emails.value': {$in: csvEmails}}],
    })
  }
  let userDBList = await loadDBUsers()
  const allUserEmails = (user: TUser) =>
    [user.email, ...(user.emails ?? []).map((i) => i.value)]
      .filter((x) => x?.trim())
      .map((i) => i?.toLowerCase().trim()) as string[]
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
    userId: string
    firstName: string
    lastName: string
  }
  includedCollections: Array<{
    name: string
    filename: string
    records: number
    sensitivity: string
    description: string
  }>
  excludedCollections: Array<{
    name: string
    reason: string
  }>
}) => {
  const lines = [
    'Frisbee export package',
    '',
    `Generated on: ${manifest.generatedOn}`,
    `Generated by: ${manifest.generatedBy.firstName} ${manifest.generatedBy.lastName} (${manifest.generatedBy.userId})`,
    `Format version: ${manifest.formatVersion}`,
    '',
    'Contents:',
    ...manifest.includedCollections.map(
      (collection) =>
        `- ${collection.name}: ${collection.records} records (${collection.filename}.json, ${collection.filename}.csv)`
    ),
  ]
  if (manifest.excludedCollections.length) {
    lines.push('', 'Excluded:')
    lines.push(
      ...manifest.excludedCollections.map(
        (collection) => `- ${collection.name}: ${collection.reason}`
      )
    )
  }
  lines.push(
    '',
    'JSON files are the authoritative backup format.',
    'CSV files are included as convenience exports for spreadsheet use.'
  )
  return lines.join('\n').concat('\n')
}

const _loadExportDatasets = async () => {
  const sort = {createdOn: 1 as const, id: 1 as const}
  const [
    comments,
    fixtures,
    members,
    posts,
    reports,
    seasons,
    teams,
    users,
  ] = await Promise.all([
    $Comment.getMany({}, {sort}),
    $Fixture.getMany({}, {sort}),
    $Member.getMany({}, {sort}),
    $Post.getMany({}, {sort}),
    $Report.getMany({}, {sort}),
    $Season.getMany({}, {sort}),
    $Team.getMany({}, {sort}),
    $User.getMany({}, {sort}),
  ])

  return [
    {
      name: 'comments',
      filename: 'comments',
      description: 'Forum comments and replies.',
      sensitivity: 'standard',
      records: comments,
    },
    {
      name: 'fixtures',
      filename: 'fixtures',
      description: 'Scheduled fixtures and embedded game slots.',
      sensitivity: 'standard',
      records: fixtures,
    },
    {
      name: 'members',
      filename: 'members',
      description: 'User-to-team membership records.',
      sensitivity: 'standard',
      records: members,
    },
    {
      name: 'posts',
      filename: 'posts',
      description: 'Forum posts.',
      sensitivity: 'standard',
      records: posts,
    },
    {
      name: 'reports',
      filename: 'reports',
      description: 'Match reports, including scoring and spirit data.',
      sensitivity: 'standard',
      records: reports,
    },
    {
      name: 'seasons',
      filename: 'seasons',
      description: 'Season configuration and final results.',
      sensitivity: 'standard',
      records: seasons,
    },
    {
      name: 'teams',
      filename: 'teams',
      description: 'Team records and contact details.',
      sensitivity: 'standard',
      records: teams,
    },
    {
      name: 'users',
      filename: 'users.private',
      description: 'User accounts, including password hashes and email verification state.',
      sensitivity: 'sensitive',
      records: users,
    },
  ]
}
