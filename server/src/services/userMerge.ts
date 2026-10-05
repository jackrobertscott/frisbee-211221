import {badRequestError} from '@shared/errors'
import {TMember} from '@shared/schemas/ioMember'
import {TReport} from '@shared/schemas/ioReport'
import {TUser, TUserEmail} from '@shared/schemas/ioUser'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Session} from '../tables/$Session'
import {$User} from '../tables/$User'
import mongo from '../db/mongo'
import {userEmail} from './userEmail'

export type TMemberMergeStep =
  | {action: 'delete'; memberId: string}
  | {action: 'move'; memberId: string}

export type TReportUserReferences = Pick<
  TReport,
  'userId' | 'mvpMale' | 'mvpMale2' | 'mvpFemale' | 'mvpFemale2' | 'updatedOn'
>

export type TMergedUserFields = Pick<
  TUser,
  | 'admin'
  | 'avatarUrl'
  | 'bio'
  | 'emails'
  | 'lastSeasonId'
  | 'password'
  | 'termsAccepted'
  | 'updatedOn'
  | 'userMergedIds'
>

/**
 * Merges `user2` into `user1`: memberships, fixtures, reports and sessions move
 * to `user1` (the sessions ended), `user2` is deleted and `user1` keeps the
 * combined profile.
 */
export const mergeUsers = async (
  user1Id: string,
  user2Id: string,
): Promise<TUser> => {
  if (user1Id === user2Id)
    throw badRequestError('Cannot merge a user into itself.', {
      errorCode: 'user.merge_invalid',
    })
  let [user1, user2, u1Members, u2Members] = await Promise.all([
    $User.getOne({id: user1Id}),
    $User.getOne({id: user2Id}),
    $Member.getMany({userId: user1Id}),
    $Member.getMany({userId: user2Id}),
  ])
  await mongo.transaction(async () => {
    const updatedOn = new Date().toISOString()
    for (const step of planMemberMerge(u1Members, u2Members)) {
      if (step.action === 'delete') await $Member.deleteOne({id: step.memberId})
      else
        await $Member.updateOne(
          {id: step.memberId},
          {userId: user1.id, updatedOn},
        )
    }
    await $Fixture.updateMany({userId: user2.id}, {userId: user1.id, updatedOn})
    const u2Reports = await $Report.getMany({
      $or: [
        {userId: user2.id},
        {mvpMale: user2.id},
        {mvpMale2: user2.id},
        {mvpFemale: user2.id},
        {mvpFemale2: user2.id},
      ],
    })
    await $Report.updateBulk(
      u2Reports.map((report) => ({
        query: {id: report.id},
        value: mergeReportUserReferences(report, user1.id, user2.id, updatedOn),
      })),
    )
    // user2's tokens name user2, so they can never authenticate as user1
    await $Session.updateMany(
      {userId: user2.id},
      {userId: user1.id, ended: true, endedOn: updatedOn, updatedOn},
    )
    await $User.deleteOne({id: user2.id})
    user1 = await $User.updateOne(
      {id: user1.id},
      mergeUserFields(user1, user2, updatedOn),
    )
  })
  return user1
}

/**
 * The member writes that move `user2`'s memberships to `user1`, in order. When
 * both are on the same team in a season one membership is dropped, keeping
 * `user2`'s only when it is confirmed and `user1`'s is pending.
 */
export const planMemberMerge = (
  u1Members: TMember[],
  u2Members: TMember[],
): TMemberMergeStep[] => {
  const steps: TMemberMergeStep[] = []
  for (const u2m of u2Members) {
    const u1mOverlap = u1Members.find((u1m) => {
      return u1m.seasonId === u2m.seasonId && u1m.teamId === u2m.teamId
    })
    if (!u1mOverlap) steps.push({action: 'move', memberId: u2m.id})
    else if (u1mOverlap.pending && !u2m.pending)
      steps.push(
        {action: 'delete', memberId: u1mOverlap.id},
        {action: 'move', memberId: u2m.id},
      )
    else steps.push({action: 'delete', memberId: u2m.id})
  }
  return steps
}

/** The profile `user1` keeps after absorbing `user2`. */
export const mergeUserFields = (
  user1: TUser,
  user2: TUser,
  updatedOn: string,
): TMergedUserFields => ({
  admin: Boolean(user1.admin || user2.admin),
  avatarUrl: user1.avatarUrl ?? user2.avatarUrl,
  bio: user1.bio ?? user2.bio,
  emails: mergeUserEmails(user1, user2),
  lastSeasonId: user1.lastSeasonId ?? user2.lastSeasonId,
  password: user1.password ?? user2.password,
  termsAccepted: user1.termsAccepted || user2.termsAccepted,
  updatedOn,
  userMergedIds: mergeUserMergedIds(user1, user2),
})

/** Every id ever merged into either user, plus `user2` itself. */
export const mergeUserMergedIds = (user1: TUser, user2: TUser): string[] => {
  return [
    ...new Set([
      ...(user1.userMergedIds ?? []),
      user2.id,
      ...(user2.userMergedIds ?? []),
    ]),
  ].filter((id) => id !== user1.id)
}

/**
 * Both users' emails, deduplicated case-insensitively. A verified copy wins,
 * the earliest creation date is kept, and `user1`'s primary email stays primary.
 */
export const mergeUserEmails = (user1: TUser, user2: TUser): TUserEmail[] => {
  const emails = new Map<string, TUserEmail>()
  const primaryKey = normalizeEmail(
    userEmail.primary(user1)?.value ?? userEmail.primary(user2)?.value ?? '',
  )

  for (const email of [...user1.emails, ...user2.emails]) {
    const key = normalizeEmail(email.value)
    const current = emails.get(key)
    const preferred = current?.verified
      ? current
      : email.verified
        ? email
        : (current ?? email)
    const createdOn = current
      ? new Date(
          Math.min(
            new Date(current.createdOn).getTime(),
            new Date(email.createdOn).getTime(),
          ),
        ).toISOString()
      : preferred.createdOn
    emails.set(key, {
      ...preferred,
      createdOn,
      primary: key === primaryKey,
      value: preferred.value.trim(),
      verified: Boolean(current?.verified || email.verified),
    })
  }

  const merged = [...emails.values()]
  const primaryCount = merged.filter((email) => email.primary).length
  if (primaryCount !== 1 && merged.length) {
    merged.forEach((email, index) => {
      email.primary = index === 0
    })
  }
  return merged
}

/**
 * A report's user references with `sourceUserId` replaced by `targetUserId`,
 * dropping any MVP slot that would now name the same user twice.
 */
export const mergeReportUserReferences = (
  report: TReport,
  targetUserId: string,
  sourceUserId: string,
  updatedOn: string,
): TReportUserReferences => {
  const swap = (userId?: string) =>
    userId === sourceUserId ? targetUserId : userId
  const next: TReportUserReferences = {
    userId: swap(report.userId),
    mvpMale: swap(report.mvpMale),
    mvpMale2: swap(report.mvpMale2),
    mvpFemale: swap(report.mvpFemale),
    mvpFemale2: swap(report.mvpFemale2),
    updatedOn,
  }

  if (next.mvpMale && next.mvpMale === next.mvpMale2) next.mvpMale2 = undefined
  if (next.mvpFemale && next.mvpFemale === next.mvpFemale2)
    next.mvpFemale2 = undefined
  if (next.mvpMale && next.mvpMale === next.mvpFemale)
    next.mvpFemale = undefined

  return next
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()
