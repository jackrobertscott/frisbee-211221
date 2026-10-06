import {describe, expect, it} from 'vitest'
import {runUserGenderMatchingMigration} from '../../src/migrations/userGenderMatching'
import {$Report} from '../../src/tables/$Report'
import {$User} from '../../src/tables/$User'
import {random} from '../../src/utils/random'
import {useTestServer} from '../harness'

useTestServer()

/** Stores a user the way they looked before gender matching existed. */
const legacyUser = async (gender: string) => {
  const user = await $User.createOne({
    firstName: 'Legacy',
    lastName: gender,
    genderMatching: 'male',
    termsAccepted: true,
    emails: [],
  })
  await $User.updateAtomic(
    {id: user.id},
    {$set: {gender}, $unset: {genderMatching: ''}},
  )
  return user.id
}

const mvpReport = (picks: {
  mvpMale?: string
  mvpMale2?: string
  mvpFemale?: string
  mvpFemale2?: string
}) =>
  $Report.createOne({
    teamId: random.generateId(),
    teamAgainstId: random.generateId(),
    fixtureId: random.generateId(),
    scoreFor: 1,
    scoreAgainst: 0,
    spiritComment: '',
    ...picks,
  })

const stored = async (id: string) => {
  // read without the schema type so a leftover legacy field would show up
  const user: unknown = await $User.maybeOne({id})
  return user as Record<string, unknown>
}

describe('runUserGenderMatchingMigration', () => {
  it('backfills gender matching from gender, then MVP picks, then the fallback', async () => {
    const male = await legacyUser('male')
    const female = await legacyUser('female')
    const votedMale = await legacyUser('non-binary')
    const votedFemale = await legacyUser('other')
    const tied = await legacyUser('non-binary')
    const unvoted = await legacyUser('other')
    const current = (
      await $User.createOne({
        firstName: 'Current',
        lastName: 'User',
        genderMatching: 'male',
        termsAccepted: true,
        emails: [],
      })
    ).id

    await mvpReport({mvpMale: votedMale, mvpFemale: votedFemale})
    await mvpReport({mvpMale2: votedMale, mvpFemale2: tied})
    await mvpReport({mvpFemale: votedMale, mvpMale: tied})

    await runUserGenderMatchingMigration()

    const expected: Array<[string, string]> = [
      [male, 'male'],
      [female, 'female'],
      [votedMale, 'male'],
      [votedFemale, 'female'],
      [tied, 'female'],
      [unvoted, 'female'],
      [current, 'male'],
    ]
    for (const [id, genderMatching] of expected) {
      const user = await stored(id)
      expect(user.genderMatching, id).toBe(genderMatching)
      expect(user, id).not.toHaveProperty('gender')
    }

    // a second run finds nothing left to change
    const before = await $User.getOne({id: votedMale})
    await runUserGenderMatchingMigration()
    expect(await $User.getOne({id: votedMale})).toEqual(before)
  })
})
