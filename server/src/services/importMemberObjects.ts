import {badRequestError} from '@shared/errors'
import {normalizeUserGender} from '@shared/schemas/ioUserGender'
import {$Member} from '../tables/$Member'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import mongo from '../utils/mongo'
import {random} from '../utils/random'
import {regex} from '../utils/regex'
import {userEmail} from '../endpoints/userEmail'

const EMAIL_COLLATION = {locale: 'en', strength: 2 as const}

export interface TMemberImportSummary {
  rowsImported: number
  teamsCreated: number
  usersCreated: number
  membersCreated: number
}

export const importMemberObjects = async (
  objects: Record<string, string>[],
  seasonId: string,
): Promise<TMemberImportSummary> => {
  let teamsCreated = 0
  let usersCreated = 0
  let membersCreated = 0

  await mongo.transaction(async () => {
    teamsCreated = await createTeamsFromObjects(objects, seasonId)
    const userSummary = await createUsersFromObjects(objects, seasonId)
    usersCreated = userSummary.usersCreated
    membersCreated = userSummary.membersCreated
  })

  return {
    rowsImported: objects.length,
    teamsCreated,
    usersCreated,
    membersCreated,
  }
}

const createTeamsFromObjects = async (
  objects: Record<string, string>[],
  seasonId: string,
) => {
  const teamCSVEntries: Array<[
    string,
    {
      seasonId: string
      name: string
      division: number
      color: string
    },
  ]> = []

  for (const object of objects) {
    const teamName = object.team_name.trim()
    if (!teamName) continue
    const div = object.team_division && parseInt(object.team_division)
    teamCSVEntries.push([
      teamName,
      {
        seasonId,
        name: teamName,
        division: !div || isNaN(div) ? 1 : div,
        color: 'hsla(0, 0%, 100%, 1)',
      },
    ])
  }

  const teamCSVMap = new Map(teamCSVEntries)
  const teamCSVList = [...teamCSVMap.values()]
  const teamCSVNameList = [...teamCSVMap.keys()]
  if (!teamCSVNameList.length) return 0
  const teamDBList = await $Team.getMany({
    seasonId,
    name: {$in: teamCSVNameList.map(regex.normalize)},
  })
  const teamDBNameList = teamDBList.map((i) => i.name.toLowerCase().trim())
  const teamCSVNewList = teamCSVList.filter((i) => {
    return !teamDBNameList.includes(i.name.toLowerCase().trim())
  })
  if (teamCSVNewList.length) await $Team.createMany(teamCSVNewList)
  return teamCSVNewList.length
}

const createUsersFromObjects = async (
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
    ? await $User.getMany(
        {
          'emails.value': {$in: csvEmailList},
        },
        {collation: EMAIL_COLLATION},
      )
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

  const importedUserIds = [
    ...new Set(
      userCSVList.map((i) => {
        return i.emailKey
          ? (userIdByEmail.get(i.emailKey) ?? i.userId)
          : i.userId
      }),
    ),
  ]
  const teamDBList = await $Team.getMany({seasonId})
  const memberCSVList = userCSVList
    .map((i) => {
      const userId = i.emailKey
        ? (userIdByEmail.get(i.emailKey) ?? i.userId)
        : i.userId
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
    .filter(
      (i): i is {
        seasonId: string
        teamId: string
        userId: string
        captain: boolean
        pending: false
      } => !!i,
    )

  const memberDBList = importedUserIds.length
    ? await $Member.getMany({
        seasonId,
        userId: {$in: importedUserIds},
      })
    : []
  const memberDBUserIdList = memberDBList.map((i) => i.userId)
  const memberCSVNewList = memberCSVList.filter((i) => {
    return !memberDBUserIdList.includes(i.userId)
  })
  if (memberCSVNewList.length) await $Member.createMany(memberCSVNewList)

  return {
    usersCreated: userCSVNewList.length,
    membersCreated: memberCSVNewList.length,
  }
}
