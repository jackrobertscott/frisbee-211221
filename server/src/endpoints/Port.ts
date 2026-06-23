import {badRequestError} from '@shared/errors'
import {TGamedayImportConfig} from '@shared/schemas/ioGamedayImport'
import {random} from '@server/utils/random'
import {
  PortDeleteAllMockDataDef,
  PortExportDef,
  PortGamedayImportDef,
  PortGamedayImportLoadDef,
  PortGamedayImportSaveDef,
  PortImportDef,
  PortMockGenerateDef,
} from '@shared/endpoints/PortDef'
import {TUserGender} from '@shared/schemas/ioUserGender'
import {TUserEmail} from '@shared/schemas/ioUser'
import {RequestHandler} from 'micro'
import {$GamedayImportConfig} from '../tables/$GamedayImportConfig'
import {$GamedayImportRun} from '../tables/$GamedayImportRun'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {blob} from '../utils/blob'
import {parseCSVString} from '../utils/csv'
import {createEndpoint} from '../utils/endpoints'
import mongo from '../utils/mongo'
import {
  encryptGamedayPassword,
  toSafeGamedayImportConfig,
} from '../gameday/credentials'
import {runGamedayImportWithHistory} from '../gameday/importMembers'
import {importMemberObjects} from '../services/importMemberObjects'
import {createExportArchive} from './portExport'
import {requireAccess} from './requireAccess'

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
      const objects = parseCSVString(content)
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
      await importMemberObjects(objects, season.id)
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
    ...PortGamedayImportLoadDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      return await loadGamedayImportState(body.seasonId)
    },
  }),

  createEndpoint({
    ...PortGamedayImportSaveDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      await $Season.getOne({id: body.seasonId})
      const existing = await $GamedayImportConfig.maybeOne({
        seasonId: body.seasonId,
      })
      const saved = existing
        ? await updateGamedayImportConfig(existing, body)
        : await createGamedayImportConfig(body)
      return toSafeGamedayImportConfig(saved)
    },
  }),

  createEndpoint({
    ...PortGamedayImportDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      const config = await getGamedayImportConfigForSeason(body.seasonId)
      return await runGamedayImportWithHistory(config, 'manual')
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

interface TGamedayImportSavePayload {
  seasonId: string
  username: string
  password?: string
  association: string
  competition: string
  scheduleEnabled: boolean
  scheduleStartOn?: string
  scheduleEndOn?: string
}

interface TGamedayImportScheduleFields {
  scheduleEnabled: boolean
  scheduleStartOn?: string
  scheduleEndOn?: string
}

const GAMEDAY_IMPORT_RUN_HISTORY_LIMIT = 50

const loadGamedayImportState = async (seasonId: string) => {
  await $Season.getOne({id: seasonId})
  const [config, runs] = await Promise.all([
    $GamedayImportConfig.maybeOne({seasonId}),
    $GamedayImportRun.getMany(
      {seasonId},
      {sort: {startedOn: -1}, limit: GAMEDAY_IMPORT_RUN_HISTORY_LIMIT},
    ),
  ])
  return {
    config: config ? toSafeGamedayImportConfig(config) : undefined,
    runs,
  }
}

const getGamedayImportConfigForSeason = async (seasonId: string) => {
  await $Season.getOne({id: seasonId})
  const config = await $GamedayImportConfig.maybeOne({seasonId})
  if (!config)
    throw badRequestError('GameDay credentials have not been saved for this season.', {
      errorCode: 'gameday.credentials_missing',
      userMessage: 'Save GameDay credentials before running the import.',
    })
  return config
}

const createGamedayImportConfig = async (body: TGamedayImportSavePayload) => {
  const password = readNewGamedayPassword(body)
  if (!password)
    throw badRequestError('GameDay password is required.', {
      errorCode: 'gameday.password_missing',
      userMessage: 'Enter the GameDay password before saving credentials.',
    })
  const schedule = readGamedayScheduleFields(body)
  return await $GamedayImportConfig.createOne({
    seasonId: body.seasonId,
    username: body.username,
    passwordEncrypted: encryptGamedayPassword(password),
    association: body.association,
    competition: body.competition,
    ...schedule,
  })
}

const updateGamedayImportConfig = async (
  existing: TGamedayImportConfig,
  body: TGamedayImportSavePayload,
) => {
  const schedule = readGamedayScheduleFields(body)
  const password = readNewGamedayPassword(body)
  const scheduleChanged = hasGamedayScheduleChanged(existing, schedule)
  const update: Partial<TGamedayImportConfig> = {
    username: body.username,
    association: body.association,
    competition: body.competition,
    updatedOn: new Date().toISOString(),
    scheduleEnabled: schedule.scheduleEnabled,
    scheduleStartOn: schedule.scheduleStartOn,
    scheduleEndOn: schedule.scheduleEndOn,
    ...(password ? {passwordEncrypted: encryptGamedayPassword(password)} : {}),
    ...(scheduleChanged ? {lastScheduledRunKey: undefined} : {}),
  }
  return await $GamedayImportConfig.updateOne({id: existing.id}, update)
}

const readNewGamedayPassword = (body: TGamedayImportSavePayload) => {
  if (!body.password?.trim()) return undefined
  return body.password
}

const readGamedayScheduleFields = (
  body: TGamedayImportSavePayload,
): TGamedayImportScheduleFields => {
  if (!body.scheduleEnabled) {
    return {
      scheduleEnabled: false,
      scheduleStartOn: undefined,
      scheduleEndOn: undefined,
    }
  }

  if (!body.scheduleStartOn || !body.scheduleEndOn) {
    throw badRequestError('GameDay schedule date range is required.', {
      errorCode: 'gameday.schedule_dates_missing',
      userMessage: 'Choose schedule start and end dates before enabling the schedule.',
    })
  }

  if (Date.parse(body.scheduleStartOn) > Date.parse(body.scheduleEndOn)) {
    throw badRequestError('GameDay schedule start date must be before the end date.', {
      errorCode: 'gameday.schedule_date_range_invalid',
      userMessage: 'Choose a GameDay schedule start date before the end date.',
    })
  }

  return {
    scheduleEnabled: true,
    scheduleStartOn: body.scheduleStartOn,
    scheduleEndOn: body.scheduleEndOn,
  }
}

const hasGamedayScheduleChanged = (
  existing: TGamedayImportConfig,
  next: TGamedayImportScheduleFields,
) => {
  return (
    existing.scheduleEnabled !== next.scheduleEnabled ||
    existing.scheduleStartOn !== next.scheduleStartOn ||
    existing.scheduleEndOn !== next.scheduleEndOn
  )
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
