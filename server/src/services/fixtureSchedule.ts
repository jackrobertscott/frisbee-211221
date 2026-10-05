import {badRequestError} from '@shared/errors'
import {
  FixtureAdjustMultipleDef,
  FixtureGenerateDef,
} from '@shared/endpoints/FixtureDef'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {TypeIoValue} from '@shared/torva'
import {random} from '../utils/random'
import {
  extractRoundNumber,
  getDivisionRoundGames,
  getRoundRobinPairings,
  reconstructDivisionTeamOrder,
  TPairing,
  unevenDivisionError,
} from './roundRobin'

type TAdjustMultiplePayload = TypeIoValue<
  typeof FixtureAdjustMultipleDef.payload
>
type TGeneratePayload = TypeIoValue<typeof FixtureGenerateDef.payload>

export type TDateAdjustment = Pick<
  TAdjustMultiplePayload,
  'amount' | 'unit' | 'direction'
>
export type TFixtureSlot = TGeneratePayload['slots'][number]
export type TGeneratedFixture = Omit<TFixture, 'id' | 'createdOn' | 'updatedOn'>

/** Reorders items (in place) and returns them. */
export type TShuffle = <T>(items: T[]) => T[]

/** Fisher-Yates shuffle using Math.random; mutates and returns the array. */
export const shuffleInPlace: TShuffle = (items) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/**
 * Moves an ISO date by whole days, weeks or calendar months, keeping the local
 * time of day. Month moves stay within the target month.
 */
export function shiftFixtureDate(
  date: string,
  {amount, unit, direction}: TDateAdjustment,
): string {
  const signedAmount = direction === 'backward' ? -amount : amount
  const currentDate = new Date(date)
  const newDate = new Date(currentDate)
  if (unit === 'month') {
    // clamp to the last day of a shorter month (31 Jan + 1 month -> 28 Feb)
    newDate.setDate(1)
    newDate.setMonth(currentDate.getMonth() + signedAmount)
    const lastDay = new Date(
      newDate.getFullYear(),
      newDate.getMonth() + 1,
      0,
    ).getDate()
    newDate.setDate(Math.min(currentDate.getDate(), lastDay))
  } else if (unit === 'week') {
    newDate.setDate(currentDate.getDate() + signedAmount * 7)
  } else {
    newDate.setDate(currentDate.getDate() + signedAmount)
  }
  return newDate.toISOString()
}

/** Throws unless every team has a division and there are enough slots. */
export function assertTeamsCanBeScheduled(
  teams: Pick<TTeam, 'division'>[],
  slotCount: number,
): void {
  if (teams.some((team) => typeof team.division !== 'number'))
    throw badRequestError('Every team needs a division number', {
      errorCode: 'fixture.division_missing',
    })
  if (slotCount * 2 < teams.length - 1)
    throw badRequestError('Not enough slots have been added', {
      errorCode: 'fixture.slots_insufficient',
    })
}

/** Team ids per division number, in team order. */
export function groupTeamIdsByDivision(
  teams: Pick<TTeam, 'id' | 'division'>[],
): Map<number, string[]> {
  const divisions = new Map<number, string[]>()
  teams.forEach((team) => {
    if (typeof team.division !== 'number') return
    const divisionTeams = divisions.get(team.division) ?? []
    divisionTeams.push(team.id)
    divisions.set(team.division, divisionTeams)
  })
  return divisions
}

/** The highest "Round N" among the fixtures, or undefined if none. */
export function getHighestRoundNumber(
  fixtures: Pick<TFixture, 'title'>[],
): number | undefined {
  const roundNumbers = fixtures
    .map((fixture) => extractRoundNumber(fixture.title))
    .filter((n): n is number => n !== null)
  return roundNumbers.length ? Math.max(...roundNumbers) : undefined
}

/**
 * The rotation order per division. Divisions that already have round games
 * continue their existing rotation; the rest get a fresh shuffled order.
 */
export function resolveDivisionTeamOrders(
  divisions: Map<number, string[]>,
  existingFixtures: TFixture[],
  roundCount: number,
  shuffle: TShuffle,
): Map<number, string[]> {
  const teamOrder = new Map<number, string[]>()

  if (getHighestRoundNumber(existingFixtures) !== undefined) {
    for (const [division, divisionTeams] of divisions.entries()) {
      const roundGames = getDivisionRoundGames(
        existingFixtures,
        new Set(divisionTeams),
      )
      if (roundGames.size > 0) {
        teamOrder.set(
          division,
          reconstructDivisionTeamOrder(divisionTeams, roundGames, roundCount),
        )
      }
    }
  }

  divisions.forEach((divisionTeams, division) => {
    if (!teamOrder.has(division)) {
      teamOrder.set(division, shuffle([...divisionTeams]))
    }
  })

  return teamOrder
}

export type TRoundPlanInput = {
  seasonId: string
  userId: string
  startingDate: string
  roundCount: number
  slots: TFixtureSlot[]
  teams: Pick<TTeam, 'id' | 'division'>[]
  existingFixtures: TFixture[]
}

export type TRoundPlanOptions = {
  shuffle?: TShuffle
  createGameId?: () => string
}

/**
 * Builds the next `roundCount` weekly "Round N" fixtures, continuing on from
 * the highest existing round. Each round's games come from every division's
 * round-robin pairings, shuffled across the slots.
 */
export function planFixtureRounds(
  input: TRoundPlanInput,
  {
    shuffle = shuffleInPlace,
    createGameId = () => random.randomString(),
  }: TRoundPlanOptions = {},
): TGeneratedFixture[] {
  const {seasonId, userId, startingDate, roundCount, slots} = input
  const startingRound = getHighestRoundNumber(input.existingFixtures) ?? 0
  const teamOrder = resolveDivisionTeamOrders(
    groupTeamIdsByDivision(input.teams),
    input.existingFixtures,
    roundCount,
    shuffle,
  )

  const fixtures: TGeneratedFixture[] = []
  for (let r = 0; r < roundCount; r++) {
    const roundIndex = startingRound + r
    const gameDate = new Date(startingDate)
    gameDate.setDate(gameDate.getDate() + r * 7)

    let pairings: TPairing[] = []
    teamOrder.forEach((divisionTeams) => {
      if (divisionTeams.length % 2 !== 0) throw unevenDivisionError()
      pairings = pairings.concat(
        getRoundRobinPairings(divisionTeams, roundIndex),
      )
    })

    fixtures.push({
      seasonId,
      userId,
      title: `Round ${roundIndex + 1}`,
      date: gameDate.toISOString(),
      games: shuffle(pairings).map((pair, index) => {
        const slot = slots[index % slots.length]
        return {
          id: createGameId(),
          team1Id: pair[0],
          team2Id: pair[1],
          place: slot.place,
          time: slot.time,
        }
      }),
      grading: false,
    })
  }
  return fixtures
}
