import {badRequestError} from '@shared/errors'
import {random} from '@server/utils/random'
import {
  PortDeleteAllMockDataDef,
  PortExportDef,
  PortImportDef,
  PortMockGenerateDef,
} from '@shared/endpoints/PortDef'
import {normalizeUserGender, TUserGender} from '@shared/schemas/ioUserGender'
import {TUserEmail} from '@shared/schemas/ioUser'
import {RequestHandler} from 'micro'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {blob} from '../utils/blob'
import {createEndpoint} from '../utils/endpoints'
import mongo from '../utils/mongo'
import {regex} from '../utils/regex'
import {createExportArchive} from './portExport'
import {requireAccess} from './requireAccess'
import {userEmail} from './userEmail'

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...PortImportDef,
    handler: (_, access) => async (req) => {
      await requireAccess(req, access)
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
        (h) => !providedHeadings.includes(h),
      )
      if (missingHeadings.length > 0) {
        throw badRequestError(
          `Missing required headings: ${missingHeadings.join(', ')}`,
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
        (h) => !allowedHeadings.includes(h),
      )
      if (unexpectedHeadings.length > 0) {
        throw badRequestError(
          `Unexpected headings found: ${unexpectedHeadings.join(', ')}`,
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
    handler: (body, access) => async (req, res) => {
      await requireAccess(req, access)
      const {buffer, filename} = await createExportArchive(body.fileType)
      res.statusCode = 200
      res.setHeader('Cache-Control', 'no-store, max-age=0')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      )
      res.setHeader('Content-Length', String(buffer.byteLength))
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.end(buffer)
      return null
    },
  }),

  createEndpoint({
    ...PortMockGenerateDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
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
        gender: TUserGender
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
            const gender: TUserGender = Math.random() > 0.5 ? 'male' : 'female'
            const user = {
              id: random.generateId(),
              isMock: true,
              firstName,
              lastName,
              gender,
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
    handler: (_, access) => async (req) => {
      await requireAccess(req, access)

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

const _pick = (values: string[]) =>
  values[Math.floor(Math.random() * values.length)]

const _slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '.')

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
  seasonId: string,
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
    }),
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
  seasonId: string,
) => {
  const userCSVList = objects
    .map((i, index) => {
      const gender = normalizeUserGender(i.gender)
      if (!gender)
        throw badRequestError(
          `Failed: row ${index + 2} has invalid gender "${i.gender}".`,
          {errorCode: 'upload.invalid_gender'},
        )
      const email = userEmail.sanitizeValue(i.email_address)
      const userId = random.generateId()
      return {
        teamName: i.team_name,
        captain: i.type === 'team',
        email,
        emailKey: email?.toLowerCase(),
        userId,
        user: {
          id: userId,
          firstName: i.first_name,
          lastName: i.last_name,
          gender,
          termsAccepted: false,
          emails: email ? [userEmail.create(email, true)] : [],
        },
      }
    })
    .filter((row, index, all) => {
      if (!row.emailKey) return true
      return all.findIndex((i) => i.emailKey === row.emailKey) === index
    })

  const csvEmailList = userCSVList.flatMap((i) => (i.email ? [i.email] : []))
  const userDBList = csvEmailList.length
    ? await $User.getMany({
        'emails.value': {$in: csvEmailList.map(regex.normalize)},
      })
    : []
  const userIdByEmail = new Map<string, string>()
  for (const user of userDBList) {
    for (const email of user.emails) {
      userIdByEmail.set(email.value.toLowerCase().trim(), user.id)
    }
  }

  const userCSVNewList = userCSVList.filter((i) => {
    return !i.emailKey || !userIdByEmail.has(i.emailKey)
  })
  if (userCSVNewList.length)
    await $User.createMany(userCSVNewList.map((i) => i.user))

  const importedUserIds = [...new Set(
    userCSVList.map((i) => {
      return i.emailKey ? (userIdByEmail.get(i.emailKey) ?? i.userId) : i.userId
    }),
  )]
  const teamDBList = await $Team.getMany({seasonId})
  const memberCSVList = userCSVList
    .map((i) => {
      const userId = i.emailKey ? (userIdByEmail.get(i.emailKey) ?? i.userId) : i.userId
      const userCSVTeamName = i.teamName.toLowerCase().trim()
      const teamDBOfUser = teamDBList.find((team) => {
        return team.name.toLowerCase().trim() === userCSVTeamName
      })
      if (!teamDBOfUser) return undefined
      return {
        seasonId: teamDBOfUser.seasonId,
        teamId: teamDBOfUser.id,
        userId,
        captain: i.captain,
        pending: false,
      }
    })
    .filter((i): i is {
      seasonId: string
      teamId: string
      userId: string
      captain: boolean
      pending: false
    } => !!i)

  const memberDBList = await $Member.getMany({
    seasonId,
    userId: {$in: importedUserIds},
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
    const insert = cols.reduce(
      (all, key, index) => {
        all[key] = tokens[index]
        return all
      },
      {} as Record<string, string>,
    )
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
