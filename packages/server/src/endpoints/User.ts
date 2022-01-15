import {RequestHandler} from 'micro'
import {io} from 'torva'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {$User} from '../tables/$User'
import hash from '../utils/hash'
import {requireUserAdmin} from './requireUserAdmin'
import {regex} from '../utils/regex'
import {blob} from '../utils/blob'
import {$Team} from '../tables/$Team'
import {$Season} from '../tables/$Season'
import {TTeam} from '../schemas/ioTeam'
import {$Member} from '../tables/$Member'
import mongo from '../utils/mongo'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/UserCurrentUpdate',
    payload: io.object({
      firstName: io.optional(io.string()),
      lastName: io.optional(io.string()),
      gender: io.optional(io.enum(['male', 'female'])),
      avatarUrl: io.optional(io.string()),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      return $User.updateOne(
        {id: user.id},
        {
          ...body,
          updatedOn: new Date().toISOString(),
        }
      )
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserCurrentChangePassword',
    payload: io.object({
      oldPassword: io.string(),
      newPassword: io.string(),
    }),
    handler: (body) => async (req) => {
      let [user] = await requireUser(req)
      if (!user.password) throw new Error('User does not have a password.')
      if (!(await hash.compare(body.oldPassword, user.password)))
        throw new Error('Old password is incorrect.')
      return $User.updateOne(
        {id: user.id},
        {password: await hash.encrypt(body.newPassword)}
      )
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserList',
    payload: io.object({
      search: io.optional(io.string().emptyok()),
      limit: io.optional(io.number()),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      const regexSearch = regex.from(body.search ?? '')
      const [count, users] = await Promise.all([
        $User.count({}),
        $User.getMany(
          {
            $or: [
              {firstName: regexSearch},
              {lastName: regexSearch},
              {email: regexSearch},
            ],
          },
          {limit: body.limit}
        ),
      ])
      return {count, users}
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserCreate',
    payload: io.object({
      email: io.string().email().trim(),
      firstName: io.string(),
      lastName: io.string(),
      gender: io.enum(['male', 'female']),
      termsAccepted: io.boolean(),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      if (!body.termsAccepted)
        throw new Error('The user must accept the terms and conditions.')
      if (await $User.count({email: regex.normalize(body.email)}))
        throw new Error(`User already exists with email "${body.email}".`)
      return $User.createOne(body)
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserUpdate',
    payload: io.object({
      userId: io.string(),
      firstName: io.optional(io.string()),
      lastName: io.optional(io.string()),
      gender: io.optional(io.enum(['male', 'female'])),
      avatarUrl: io.optional(io.string()),
    }),
    handler:
      ({userId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        const user = await $User.getOne({id: userId})
        return $User.updateOne(
          {id: user.id},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserToggleAdmin',
    payload: io.object({
      userId: io.string(),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      const user = await $User.getOne({id: body.userId})
      return $User.updateOne({id: user.id}, {admin: !user.admin})
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserImport',
    multipart: true,
    handler: () => async (req) => {
      await requireUserAdmin(req)
      const [rawFiles, fields] = await blob.digestRequest(req)
      const seasonId = fields.get('seasonId')
      if (!seasonId?.trim()) throw new Error('Season id missing from request.')
      const season = await $Season.getOne({id: seasonId})
      if (!rawFiles[0]) throw new Error('No file was present on the request.')
      if (!['text/csv'].includes(rawFiles[0].mimetype))
        throw new Error('Failed: import file type must be a CSV.')
      const csvBuffer = await blob.filepathBuffer(rawFiles[0].filepath)
      const content = csvBuffer.toString()
      const objects = _parseCSVString(content)
      await mongo.transaction(async () => {
        const teams = await _createTeamsFromObjects(objects, season.id)
        await _createUsersFromObjects(objects, teams)
      })
    },
  }),
])
/**
 *
 */
const _createTeamsFromObjects = async (
  objects: Record<string, string>[],
  seasonId: string
) => {
  const rawTeamNames = [] as string[]
  let rawTeams = objects
    .filter((i) => i.type === 'team')
    .map((i) => ({
      seasonId: seasonId,
      name: i.team_name,
      color: 'hsla(0, 0%, 100%, 1)',
    }))
    .filter((i) => {
      if (rawTeamNames.includes(i.name)) return false
      rawTeamNames.push(i.name)
      return true
    })
  const dbTeams = await $Team.getMany(
    {name: {$in: rawTeamNames.map(regex.normalize)}},
    {limit: 1000}
  )
  const dbTeamNames = dbTeams.map((i) => i.name.toLowerCase().trim())
  rawTeams = rawTeams.filter((i) => {
    return !dbTeamNames.includes(i.name.toLowerCase().trim())
  })
  if (rawTeams.length) await $Team.createMany(rawTeams)
  return $Team.getMany({seasonId}, {limit: 1000})
}
/**
 *
 */
const _createUsersFromObjects = async (
  objects: Record<string, string>[],
  teams: TTeam[]
) => {
  const rawUserEmails = [] as string[]
  let rawUsers = objects
    .map((i) => ({
      _team: i.team_name,
      _captain: i.type === 'team',
      firstName: i.first_name,
      lastName: i.last_name,
      email: i.email_address,
      gender: i.gender as any,
      termsAccepted: false,
    }))
    .filter((i) => {
      if (rawUserEmails.includes(i.email)) return false
      rawUserEmails.push(i.email)
      return true
    })
  const dbUsers = await $User.getMany(
    {email: {$in: rawUserEmails.map(regex.normalize)}},
    {limit: 1000}
  )
  const dbUserEmails = dbUsers.map((i) => i.email.toLowerCase().trim())
  rawUsers = rawUsers.filter((i) => {
    return !dbUserEmails.includes(i.email.toLowerCase().trim())
  })
  if (rawUsers.length) await $User.createMany(rawUsers)
  const users = await $User.getMany(
    {email: {$in: rawUserEmails.map(regex.normalize)}},
    {limit: 1000}
  )
  const rawMemberships = users
    .map((user) => {
      const userEmail = user.email.toLowerCase().trim()
      const rawUser = rawUsers.find((i) => {
        return i.email.toLowerCase().trim() === userEmail
      })
      if (!rawUser) return undefined
      const team = teams.find((i) => i.name === rawUser?._team)
      if (!team) return undefined
      return {
        seasonId: team.seasonId,
        userId: user.id,
        teamId: team.id,
        captain: rawUser._captain,
        pending: false,
      }
    })
    .filter((i) => !!i)
    .map((i) => i!)
  if (rawMemberships.length) await $Member.createMany(rawMemberships)
}
/**
 *
 */
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
/**
 *
 */
const _tokenify = (text: string) => {
  let tokens = [] as string[]
  for (let i = 0, quotes = false, token = ''; i < text.length; i++) {
    if (text[i] === '"' && !(i > 0 && text[i - 1] === '\\')) {
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
  return tokens
}
