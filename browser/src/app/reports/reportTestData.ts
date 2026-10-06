/* Fixtures shared by the report screen tests. */
import {TFeatureAgainstOption} from '@shared/endpoints/FeatureDef'
import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {TUserPublic} from '@shared/schemas/ioUser'
import {TUserGenderMatching} from '@shared/schemas/ioUserGenderMatching'
import {makeTeam, testId} from '../../test/fixtures'

const NOW = '2026-01-01T00:00:00.000Z'

export const makeFixture = (patch: Partial<TFixture> = {}): TFixture => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  seasonId: testId(),
  userId: testId(),
  title: 'Round 1',
  date: '2025-06-01T08:00:00.000Z',
  games: [],
  ...patch,
})

export const makePlayer = (
  firstName: string,
  genderMatching: TUserGenderMatching,
): TUserPublic => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  firstName,
  lastName: 'Opp',
  genderMatching,
})

export const makeReport = (patch: Partial<TReport> = {}): TReport => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  teamId: testId(),
  teamAgainstId: testId(),
  fixtureId: testId(),
  scoreFor: 13,
  scoreAgainst: 9,
  spirit: 3,
  spiritComment: '',
  ...patch,
})

/** A small league: two played rounds, one upcoming, our team and two opponents. */
export const makeLeague = () => {
  const round1 = makeFixture({title: 'Round 1', date: '2025-06-01T08:00:00.000Z'})
  const round2 = makeFixture({title: 'Round 2', date: '2025-06-08T08:00:00.000Z'})
  const round3 = makeFixture({title: 'Round 3', date: '2999-06-15T08:00:00.000Z'})
  const ours = makeTeam({name: 'Disc Jockeys'})
  const rivals = makeTeam({name: 'Rivals'})
  const others = makeTeam({name: 'Others'})
  const mia = makePlayer('Mia', 'female')
  const max = makePlayer('Max', 'male')
  const zoe = makePlayer('Zoe', 'female')
  const against: TFeatureAgainstOption[] = [{team: rivals, users: [mia, max, zoe]}]
  return {
    fixtures: [round1, round2, round3],
    round1,
    round2,
    round3,
    teams: [ours, rivals, others],
    ours,
    rivals,
    others,
    mia,
    max,
    zoe,
    against,
  }
}
