import {badRequestError} from '@shared/errors'
import type {TMember} from '@shared/schemas/ioMember'
import type {TTeam} from '@shared/schemas/ioTeam'
import type {TUser, TUserEmail} from '@shared/schemas/ioUser'
import {normalizeUserGender} from '@shared/schemas/ioUserGender'
import type {TUserGender} from '@shared/schemas/ioUserGender'
import {$Member} from '../tables/$Member'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import mongo from '../utils/mongo'
import {random} from '../utils/random'
import {userEmail} from '../endpoints/userEmail'

const EMAIL_COLLATION = {locale: 'en', strength: 2 as const}

export interface TMemberImportSummary {
  rowsImported: number
  teamsCreated: number
  usersCreated: number
  membersCreated: number
}

interface TMemberImportUserCreate {
  id: string
  firstName: string
  lastName: string
  gender: TUserGender
  termsAccepted: false
  emails: TUserEmail[]
}

interface TPreparedMemberImportRow {
  teamName: string
  captain: boolean
  email?: string
  emailKey?: string
  noEmailIdentityKey: string
  noEmailSeasonIdentityKey: string
  userId: string
  user: TMemberImportUserCreate
}

const IMPORT_IDENTITY_SEPARATOR = '\u0000'

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
): Promise<number> => {
  const teamCSVMap = new Map<
    string,
    {
      seasonId: string
      name: string
      division: number
      color: string
    }
  >()

  for (const object of objects) {
    const teamName = object.team_name.trim()
    if (!teamName) continue
    const teamKey = normalizeImportIdentityValue(teamName)
    if (teamCSVMap.has(teamKey)) continue
    const div = object.team_division && parseInt(object.team_division)
    teamCSVMap.set(teamKey, {
      seasonId,
      name: teamName,
      division: !div || isNaN(div) ? 1 : div,
      color: 'hsla(0, 0%, 100%, 1)',
    })
  }

  const teamCSVList = [...teamCSVMap.values()]
  if (!teamCSVList.length) return 0
  const teamDBList = await $Team.getMany({seasonId})
  const teamDBNameSet = new Set(
    teamDBList.map((team) => normalizeImportIdentityValue(team.name)),
  )
  const teamCSVNewList = teamCSVList.filter((i) => {
    return !teamDBNameSet.has(normalizeImportIdentityValue(i.name))
  })
  if (teamCSVNewList.length) await $Team.createMany(teamCSVNewList)
  return teamCSVNewList.length
}

const createUsersFromObjects = async (
  objects: Record<string, string>[],
  seasonId: string,
): Promise<{usersCreated: number; membersCreated: number}> => {
  const userCSVList = dedupePreparedImportRows(
    objects.map((i, index) => prepareImportRow(i, index)),
  )

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

  const teamDBList = await $Team.getMany({seasonId})
  const userIdByNoEmailIdentity = await getExistingNoEmailUserIds(
    userCSVList,
    teamDBList,
    seasonId,
  )

  const existingUserIdForImportRow = (
    row: TPreparedMemberImportRow,
  ): string | undefined => {
    if (row.emailKey) return userIdByEmail.get(row.emailKey)
    return userIdByNoEmailIdentity.get(row.noEmailIdentityKey)
  }

  // Member imports are intentionally additive. Imported GameDay/CSV field values
  // are only used when a team, user, or membership does not already exist; this
  // path never updates names, genders, emails, teams, or captain flags on
  // existing records.
  const userCSVNewList = userCSVList.filter((i) => !existingUserIdForImportRow(i))
  if (userCSVNewList.length)
    await $User.createMany(userCSVNewList.map((i) => i.user))

  const importedUserIds = [
    ...new Set(
      userCSVList.map((i) => {
        return existingUserIdForImportRow(i) ?? i.userId
      }),
    ),
  ]
  const memberCSVList = userCSVList
    .map((i) => {
      const userId = existingUserIdForImportRow(i) ?? i.userId
      const userCSVTeamName = normalizeImportIdentityValue(i.teamName)
      const teamDBOfUser = teamDBList.find((team) => {
        return normalizeImportIdentityValue(team.name) === userCSVTeamName
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

const prepareImportRow = (
  object: Record<string, string>,
  index: number,
): TPreparedMemberImportRow => {
  const gender = normalizeUserGender(object.gender)
  if (!gender)
    throw badRequestError(
      `Failed: row ${index + 2} has invalid gender "${object.gender}".`,
      {errorCode: 'upload.invalid_gender'},
    )

  const email = userEmail.sanitizeValue(object.email_address)
  const userId = random.generateId()
  const teamName = object.team_name
  const firstName = object.first_name
  const lastName = object.last_name

  return {
    teamName,
    captain: object.type === 'team',
    email,
    emailKey: email?.toLowerCase(),
    noEmailIdentityKey: readImportIdentityKey(teamName, firstName, lastName),
    noEmailSeasonIdentityKey: readImportIdentityKey(firstName, lastName),
    userId,
    user: {
      id: userId,
      firstName,
      lastName,
      gender,
      termsAccepted: false,
      emails: email ? [userEmail.create(email, true)] : [],
    },
  }
}

const dedupePreparedImportRows = (
  rows: TPreparedMemberImportRow[],
): TPreparedMemberImportRow[] => {
  const seenKeys = new Set<string>()
  return rows.filter((row) => {
    const key = row.emailKey
      ? `email:${row.emailKey}`
      : `name:${row.noEmailIdentityKey}`
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
}

const getExistingNoEmailUserIds = async (
  rows: TPreparedMemberImportRow[],
  teamDBList: TTeam[],
  seasonId: string,
): Promise<Map<string, string>> => {
  const rowsWithoutEmail = rows.filter((row) => !row.emailKey)
  const userIdByNoEmailIdentity = new Map<string, string>()
  if (!rowsWithoutEmail.length) return userIdByNoEmailIdentity

  const memberDBList = await $Member.getMany({seasonId})
  if (!memberDBList.length) return userIdByNoEmailIdentity

  const userDBList = await getUsersForMembers(memberDBList)
  const userById = new Map(userDBList.map((user) => [user.id, user]))
  const teamById = new Map(teamDBList.map((team) => [team.id, team]))
  const userIdsByTeamIdentity = new Map<string, Set<string>>()
  const userIdsBySeasonIdentity = new Map<string, Set<string>>()

  for (const member of memberDBList) {
    const user = userById.get(member.userId)
    if (!user) continue

    addMapSet(
      userIdsBySeasonIdentity,
      readImportIdentityKey(user.firstName, user.lastName),
      user.id,
    )

    const team = teamById.get(member.teamId)
    if (!team) continue
    addMapSet(
      userIdsByTeamIdentity,
      readImportIdentityKey(team.name, user.firstName, user.lastName),
      user.id,
    )
  }

  for (const row of rowsWithoutEmail) {
    const userId =
      readSingleSetValue(userIdsByTeamIdentity.get(row.noEmailIdentityKey)) ??
      readSingleSetValue(
        userIdsBySeasonIdentity.get(row.noEmailSeasonIdentityKey),
      )
    if (userId) userIdByNoEmailIdentity.set(row.noEmailIdentityKey, userId)
  }

  return userIdByNoEmailIdentity
}

const getUsersForMembers = async (members: TMember[]): Promise<TUser[]> => {
  const userIds = [...new Set(members.map((member) => member.userId))]
  return userIds.length ? await $User.getMany({id: {$in: userIds}}) : []
}

const addMapSet = <TKey, TValue>(
  map: Map<TKey, Set<TValue>>,
  key: TKey,
  value: TValue,
): void => {
  const existing = map.get(key)
  if (existing) {
    existing.add(value)
    return
  }
  map.set(key, new Set([value]))
}

const readSingleSetValue = <TValue>(
  values?: Set<TValue>,
): TValue | undefined => {
  if (!values || values.size !== 1) return undefined
  return [...values][0]
}

const readImportIdentityKey = (...values: string[]): string => {
  return values.map(normalizeImportIdentityValue).join(IMPORT_IDENTITY_SEPARATOR)
}

const normalizeImportIdentityValue = (value: string): string => {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
