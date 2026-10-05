import {TMember} from '@shared/schemas/ioMember'
import {TReport} from '@shared/schemas/ioReport'
import {TUser, TUserEmail} from '@shared/schemas/ioUser'
import {describe, expect, it} from 'vitest'
import {
  mergeReportUserReferences,
  mergeUserEmails,
  mergeUserFields,
  mergeUserMergedIds,
  planMemberMerge,
} from './userMerge'

const NOW = '2026-01-01T00:00:00.000Z'

const makeEmail = (
  value: string,
  overrides: Partial<TUserEmail> = {},
): TUserEmail => ({
  value,
  verified: false,
  code: 'code',
  createdOn: NOW,
  primary: false,
  ...overrides,
})

const makeUser = (id: string, overrides: Partial<TUser> = {}): TUser => ({
  id,
  createdOn: NOW,
  updatedOn: NOW,
  firstName: 'First',
  lastName: 'Last',
  gender: 'other',
  emails: [],
  termsAccepted: false,
  ...overrides,
})

const makeMember = (id: string, teamId: string, pending: boolean): TMember => ({
  id,
  createdOn: NOW,
  updatedOn: NOW,
  userId: 'user',
  seasonId: 'season',
  teamId,
  pending,
})

const makeReport = (overrides: Partial<TReport> = {}): TReport => ({
  id: 'report',
  createdOn: NOW,
  updatedOn: NOW,
  teamId: 'team',
  teamAgainstId: 'against',
  fixtureId: 'fixture',
  scoreFor: 0,
  scoreAgainst: 0,
  spiritComment: '',
  ...overrides,
})

describe('planMemberMerge', () => {
  it('moves memberships that do not overlap', () => {
    expect(planMemberMerge([], [makeMember('m2', 'team', false)])).toEqual([
      {action: 'move', memberId: 'm2'},
    ])
  })

  it('replaces a pending user1 membership with a confirmed user2 one', () => {
    const u1 = [makeMember('m1', 'team', true)]
    const u2 = [makeMember('m2', 'team', false)]
    expect(planMemberMerge(u1, u2)).toEqual([
      {action: 'delete', memberId: 'm1'},
      {action: 'move', memberId: 'm2'},
    ])
  })

  it('otherwise drops the overlapping user2 membership', () => {
    const u1 = [makeMember('m1', 'team', false)]
    expect(planMemberMerge(u1, [makeMember('m2', 'team', true)])).toEqual([
      {action: 'delete', memberId: 'm2'},
    ])
    const pendingU1 = [makeMember('m1', 'team', true)]
    expect(
      planMemberMerge(pendingU1, [makeMember('m2', 'team', true)]),
    ).toEqual([{action: 'delete', memberId: 'm2'}])
  })
})

describe('mergeUserMergedIds', () => {
  it('combines merged ids with user2 and excludes user1', () => {
    const user1 = makeUser('u1', {userMergedIds: ['a', 'u1']})
    const user2 = makeUser('u2', {userMergedIds: ['a', 'b']})
    expect(mergeUserMergedIds(user1, user2)).toEqual(['a', 'u2', 'b'])
  })
})

describe('mergeUserEmails', () => {
  it('deduplicates case-insensitively, preferring the verified copy', () => {
    const user1 = makeUser('u1', {
      emails: [makeEmail('a@x.com', {primary: true, createdOn: NOW})],
    })
    const user2 = makeUser('u2', {
      emails: [
        makeEmail(' A@X.com ', {
          verified: true,
          code: 'verified',
          createdOn: '2025-01-01T00:00:00.000Z',
        }),
      ],
    })
    expect(mergeUserEmails(user1, user2)).toEqual([
      {
        value: 'A@X.com',
        verified: true,
        code: 'verified',
        createdOn: '2025-01-01T00:00:00.000Z',
        primary: true,
      },
    ])
  })

  it("keeps user1's primary email primary", () => {
    const user1 = makeUser('u1', {
      emails: [makeEmail('a@x.com'), makeEmail('b@x.com', {primary: true})],
    })
    const user2 = makeUser('u2', {
      emails: [makeEmail('c@x.com', {primary: true})],
    })
    expect(
      mergeUserEmails(user1, user2).map(({value, primary}) => [value, primary]),
    ).toEqual([
      ['a@x.com', false],
      ['b@x.com', true],
      ['c@x.com', false],
    ])
  })

  it('falls back to the first email when there is no primary', () => {
    const user1 = makeUser('u1')
    const user2 = makeUser('u2', {
      emails: [makeEmail('a@x.com'), makeEmail('b@x.com')],
    })
    expect(mergeUserEmails(user1, user2).map((e) => e.primary)).toEqual([
      true,
      false,
    ])
  })

  it('returns nothing when neither user has an email', () => {
    expect(mergeUserEmails(makeUser('u1'), makeUser('u2'))).toEqual([])
  })
})

describe('mergeUserFields', () => {
  it("prefers user1's values and fills gaps from user2", () => {
    const user1 = makeUser('u1', {bio: 'one', termsAccepted: false})
    const user2 = makeUser('u2', {
      admin: true,
      avatarUrl: 'avatar',
      bio: 'two',
      lastSeasonId: 'season',
      password: 'hash',
      termsAccepted: true,
    })
    expect(mergeUserFields(user1, user2, 'later')).toEqual({
      admin: true,
      avatarUrl: 'avatar',
      bio: 'one',
      emails: [],
      lastSeasonId: 'season',
      password: 'hash',
      termsAccepted: true,
      updatedOn: 'later',
      userMergedIds: ['u2'],
    })
  })
})

describe('mergeReportUserReferences', () => {
  it('replaces every reference to the source user', () => {
    const report = makeReport({
      userId: 'src',
      mvpMale: 'src',
      mvpFemale2: 'src',
    })
    expect(mergeReportUserReferences(report, 'dst', 'src', 'later')).toEqual({
      userId: 'dst',
      mvpMale: 'dst',
      mvpMale2: undefined,
      mvpFemale: undefined,
      mvpFemale2: 'dst',
      updatedOn: 'later',
    })
  })

  it('clears second MVP slots that now repeat the first', () => {
    const report = makeReport({
      mvpMale: 'dst',
      mvpMale2: 'src',
      mvpFemale: 'other',
      mvpFemale2: 'other',
    })
    const next = mergeReportUserReferences(report, 'dst', 'src', 'later')
    expect(next.mvpMale2).toBeUndefined()
    expect(next.mvpFemale).toBe('other')
    expect(next.mvpFemale2).toBeUndefined()
  })

  it('clears the female MVP when it now repeats the male MVP', () => {
    const report = makeReport({mvpMale: 'dst', mvpFemale: 'src'})
    const next = mergeReportUserReferences(report, 'dst', 'src', 'later')
    expect(next.mvpMale).toBe('dst')
    expect(next.mvpFemale).toBeUndefined()
  })
})
