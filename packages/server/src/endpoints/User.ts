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
import {$Comment} from '../tables/$Comment'
import {$Post} from '../tables/$Post'
import {$Report} from '../tables/$Report'
import {$Session} from '../tables/$Session'
import {TUser} from '../schemas/ioUser'
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
    handler:
      ({email, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        if (await userEmail.maybeUser(email))
          throw new Error(`User already exists with email "${email}".`)
        return $User.createOne({
          ...body,
          emails: [userEmail.create(email, true)],
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
    path: '/UserMerge',
    payload: io.object({
      user1Id: io.string(),
      user2Id: io.string(),
    }),
    handler:
      ({user1Id, user2Id}) =>
      async (req) => {
        await requireUserAdmin(req)
        let [user1, user2, u1Members, u2Members] = await Promise.all([
          $User.getOne({id: user1Id}),
          $User.getOne({id: user2Id}),
          $Member.getMany({userId: user1Id}),
          $Member.getMany({userId: user2Id}),
        ])
        await mongo.transaction(async () => {
          if (userEmail.isOld(user1)) user1 = await userEmail.migrate(user1)
          if (userEmail.isOld(user2)) user2 = await userEmail.migrate(user2)
          // members
          const taskMembers = u2Members.map(async (u2m) => {
            const u1mOverlap = u1Members.find((u1m) => {
              return u1m.seasonId === u2m.seasonId && u1m.teamId === u2m.teamId
            })
            if (u1mOverlap) {
              if (u1mOverlap.pending && !u2m.pending) {
                return Promise.all([
                  $Member.deleteOne({id: u1mOverlap.id}),
                  $Member.updateOne({id: u2m.id}, {userId: user1.id}),
                ])
              } else return $Member.deleteOne({id: u2m.id})
            } else return $Member.updateOne({id: u2m.id}, {userId: user1.id})
          })
          await Promise.all(taskMembers)
          // comments
          const u2cs = await $Comment.getMany({userId: user2.id})
          const u2csBulk = u2cs.map((u2c) => ({
            query: {id: u2c.id},
            value: {userId: user1.id},
          }))
          await $Comment.updateBulk(u2csBulk)
          // posts
          const u2ps = await $Post.getMany({userId: user2.id})
          const u2psBulk = u2ps.map((u2p) => ({
            query: {id: u2p.id},
            value: {userId: user1.id},
          }))
          await $Post.updateBulk(u2psBulk)
          // reports
          const u2rs = await $Report.getMany({
            $or: [
              {userId: user2.id},
              {mvpMale: user2.id},
              {mvpFemale: user2.id},
            ],
          })
          const u2rsBulk = u2rs
            .map((u2r) => ({
              query: {id: u2r.id},
              value: {
                userId: u2r.userId === user2.id ? user1.id : u2r.userId,
                mvpMale: u2r.mvpMale === user2.id ? user1.id : u2r.mvpMale,
                mvpFemale:
                  u2r.mvpFemale === user2.id ? user1.id : u2r.mvpFemale,
              },
            }))
            .map(({query, value}) => ({
              query,
              value:
                value.mvpMale === value.mvpFemale
                  ? {...value, mvpFemale: ''}
                  : value,
            }))
          await $Report.updateBulk(u2rsBulk)
          // sessions
          const u2ss = await $Session.getMany({userId: user2.id})
          const u2ssBulk = u2ss.map((u2s) => ({
            query: {id: u2s.id},
            value: {userId: user1.id},
          }))
          await $Session.updateBulk(u2ssBulk)
          // users
          const u1Emails = [...(user1.emails ?? []), ...(user2.emails ?? [])]
          const u2MergedIds = [...(user1.userMergedIds ?? []), user2.id]
          await $User.deleteOne({id: user2.id})
          user1 = await $User.updateOne(
            {id: user1.id},
            {emails: u1Emails, userMergedIds: u2MergedIds}
          )
        })
        return user1
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
      _email: i.email_address,
      firstName: i.first_name,
      lastName: i.last_name,
      gender: i.gender as any,
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
