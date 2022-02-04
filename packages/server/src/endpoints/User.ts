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
import {$Member} from '../tables/$Member'
import mongo from '../utils/mongo'
import {userEmail} from './userEmail'
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
      gender: io.optional(io.string()),
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
    path: '/UserCurrentEmailAdd',
    payload: io.object({
      email: io.string(),
    }),
    handler:
      ({email}) =>
      async (req) => {
        const [user] = await requireUser(req)
        return userEmail.add(user, email)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserCurrentEmailVerify',
    payload: io.object({
      email: io.string(),
      code: io.string(),
    }),
    handler:
      ({email, code}) =>
      async (req) => {
        const [user] = await requireUser(req)
        if (!userEmail.isCodeEqual(user, email, code))
          throw new Error(`Code is incorrect.`)
        if (userEmail.isCodeExpired(user, email)) {
          await userEmail.codeSendSave(user, email, 'Verify Email')
          const message = `Your code has expired. A new code has been sent to your email.`
          throw new Error(message)
        }
        return userEmail.verify(user, email)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserCurrentEmailCodeResend',
    payload: io.object({
      email: io.string(),
    }),
    handler:
      ({email}) =>
      async (req) => {
        const [user] = await requireUser(req)
        return userEmail.codeSendSave(user, email, 'Verify Email')
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserCurrentEmailPrimarySet',
    payload: io.object({
      email: io.string(),
    }),
    handler:
      ({email}) =>
      async (req) => {
        const [user] = await requireUser(req)
        return userEmail.primarySet(user, email)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserCurrentEmailRemove',
    payload: io.object({
      email: io.string(),
    }),
    handler:
      ({email}) =>
      async (req) => {
        const [user] = await requireUser(req)
        return userEmail.remove(user, email)
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
      skip: io.optional(io.number()),
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
          {
            limit: body.limit,
            skip: body.skip,
          }
        ),
      ])
      return {count, users}
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserListManyById',
    payload: io.object({
      userIds: io.array(io.string()),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      return $User.getMany({id: {$in: body.userIds}})
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
      gender: io.string(),
      termsAccepted: io.boolean(),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      if (await userEmail.maybeUser(body.email))
        throw new Error(`User already exists with email "${body.email}".`)
      return $User.createOne({
        ...body,
        emails: [userEmail.create(body.email)],
      })
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
      gender: io.optional(io.string()),
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
        await _createTeamsFromObjects(objects, season.id)
        await _createUsersFromObjects(objects, season.id)
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
  const teamCSVNameList = [] as string[]
  let teamCSVList = objects
    .filter((i) => i.type === 'team')
    .map((i) => ({
      seasonId: seasonId,
      name: i.team_name,
      color: 'hsla(0, 0%, 100%, 1)',
    }))
    .filter((i) => {
      if (teamCSVNameList.includes(i.name)) return false
      teamCSVNameList.push(i.name)
      return true
    })
  const teamDBList = await $Team.getMany({
    name: {$in: teamCSVNameList.map(regex.normalize)},
  })
  const teamDBNameList = teamDBList.map((i) => i.name.toLowerCase().trim())
  const teamCSVNewList = teamCSVList.filter((i) => {
    return !teamDBNameList.includes(i.name.toLowerCase().trim())
  })
  if (teamCSVNewList.length) await $Team.createMany(teamCSVNewList)
}
/**
 *
 */
const _createUsersFromObjects = async (
  objects: Record<string, string>[],
  seasonId: string
) => {
  const userCSVEmailList = [] as string[]
  let userCSVList = objects
    .map((i) => ({
      _team: i.team_name,
      _captain: i.type === 'team',
      firstName: i.first_name,
      lastName: i.last_name,
      email: i.email_address,
      gender: i.gender as any,
      termsAccepted: false,
      emails: [userEmail.create(i.email_address)],
    }))
    .filter((i) => {
      if (userCSVEmailList.includes(i.email)) return false
      userCSVEmailList.push(i.email)
      return true
    })
  const userDBList = await $User.getMany({
    $or: [
      {email: {$in: userCSVEmailList.map(regex.normalize)}},
      {'emails.value': {$in: userCSVEmailList.map(regex.normalize)}},
    ],
  })
  const userDBEmailList = userDBList
    .flatMap((i) => [
      i.email?.toLowerCase().trim(),
      ...(i.emails ?? []).map((x) => x.value.toLowerCase().trim()),
    ])
    .filter((i) => i)
  const userCSVNewList = userCSVList.filter((i) => {
    return !userDBEmailList.includes(i.email.toLowerCase().trim())
  })
  if (userCSVNewList.length) await $User.createMany(userCSVNewList)
  const teamDBList = await $Team.getMany({seasonId})
  const memberCSVList = userDBList
    .map((i) => {
      const userDBEmails = [
        i.email?.toLowerCase().trim(),
        ...(i.emails ?? []).map((x) => x.value.toLowerCase().trim()),
      ].filter((i) => i)
      const userCSV = userCSVList.find((x) => {
        return userDBEmails.includes(x.email.toLowerCase().trim())
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
