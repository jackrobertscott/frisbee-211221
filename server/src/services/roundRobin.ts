import {badRequestError} from '@shared/errors'
import {TFixture} from '@shared/schemas/ioFixture'

/** A pair of team ids playing each other: [team1Id, team2Id]. */
export type TPairing = string[]

/** Division games keyed by their round number (from "Round N" titles). */
export type TRoundGames = Map<number, TPairing[]>

const ROUND_TITLE_PATTERN = /Round\s+(\d+)/i
const BYE_ID = '__BYE__'

/** Parses the round number out of a fixture title such as "Round 3". */
export function extractRoundNumber(title: string): number | null {
  const match = title.match(ROUND_TITLE_PATTERN)
  if (!match) return null
  return parseInt(match[1], 10)
}

export function unevenDivisionError() {
  return badRequestError(
    'Fixture generation failed: each division must contain an even number of teams to create valid round-robin matchups. Please add or remove a team in the affected division.',
    {errorCode: 'fixture.uneven_division'},
  )
}

function roundRobinInvalidError(reason: string) {
  return badRequestError(`Fixture generation failed: ${reason}`, {
    errorCode: 'fixture.round_robin_invalid',
  })
}

/**
 * Circle-method round robin: the first team stays fixed and the rest rotate
 * once per round. Home and away swap on every alternate full cycle.
 */
export function getRoundRobinPairings(
  teams: string[],
  round: number,
): TPairing[] {
  // Support odd team counts by adding a bye placeholder.
  const workingTeams = teams.length % 2 !== 0 ? [...teams, BYE_ID] : [...teams]

  const totalRounds = workingTeams.length - 1
  const currentCycle = Math.floor(round / totalRounds)
  const currentRoundInCycle = round % totalRounds

  const [fixedTeam, ...rotatingTeams] = workingTeams
  for (let i = 0; i < currentRoundInCycle; i++) {
    rotatingTeams.push(rotatingTeams.shift()!)
  }
  const adjustedTeams = [fixedTeam, ...rotatingTeams]

  const pairings: TPairing[] = []
  for (let i = 0; i < adjustedTeams.length / 2; i++) {
    let homeTeam = adjustedTeams[i]
    let awayTeam = adjustedTeams[adjustedTeams.length - 1 - i]
    if (currentCycle % 2 === 1) {
      ;[homeTeam, awayTeam] = [awayTeam, homeTeam]
    }
    if (homeTeam === BYE_ID || awayTeam === BYE_ID) continue
    pairings.push([homeTeam, awayTeam])
  }
  return pairings
}

/** Collects the games played purely within a division, grouped by round. */
export function getDivisionRoundGames(
  fixtures: TFixture[],
  divisionTeamSet: Set<string>,
): TRoundGames {
  const roundGames: TRoundGames = new Map()

  fixtures.forEach((fixture) => {
    const roundNumber = extractRoundNumber(fixture.title)
    if (roundNumber === null) return

    const divisionGames = fixture.games
      .filter(
        (game) =>
          divisionTeamSet.has(game.team1Id) &&
          divisionTeamSet.has(game.team2Id),
      )
      .map((game) => [game.team1Id, game.team2Id])

    if (divisionGames.length === 0) return
    const existingGames = roundGames.get(roundNumber) ?? []
    roundGames.set(roundNumber, existingGames.concat(divisionGames))
  })

  return roundGames
}

function normalizePairing([team1Id, team2Id]: TPairing): string {
  return [team1Id, team2Id].sort().join('::')
}

function serializePairings(pairings: TPairing[]): string {
  return pairings.map(normalizePairing).sort().join('|')
}

function buildCanonicalOrderFromRoundPairings(pairings: TPairing[]): string[] {
  const normalizedPairings = pairings
    .map(([team1Id, team2Id]) => [team1Id, team2Id].sort())
    .sort((pairA, pairB) =>
      normalizePairing(pairA).localeCompare(normalizePairing(pairB)),
    )

  const leftTeams = normalizedPairings.map(([team1Id]) => team1Id)
  const rightTeams = normalizedPairings.map(([, team2Id]) => team2Id).reverse()

  return leftTeams.concat(rightTeams)
}

function getRoundOpponentMap(pairings: TPairing[]): Map<string, string> {
  const opponents = new Map<string, string>()
  pairings.forEach(([team1Id, team2Id]) => {
    opponents.set(team1Id, team2Id)
    opponents.set(team2Id, team1Id)
  })
  return opponents
}

function setOrderPosition(
  order: Array<string | undefined>,
  index: number,
  teamId: string,
  usedTeams: Set<string>,
): boolean {
  const existing = order[index]
  if (existing !== undefined) return existing === teamId
  if (usedTeams.has(teamId)) return false
  order[index] = teamId
  usedTeams.add(teamId)
  return true
}

function reconstructOrderFromFirstTwoRounds(
  fixedTeamId: string,
  roundOneOpponents: Map<string, string>,
  roundTwoOpponents: Map<string, string>,
  teamCount: number,
): string[] | null {
  const order = new Array<string | undefined>(teamCount)
  const usedTeams = new Set<string>()

  if (!setOrderPosition(order, 0, fixedTeamId, usedTeams)) return null
  const roundTwoOpponent = roundTwoOpponents.get(fixedTeamId)
  const roundOneOpponent = roundOneOpponents.get(fixedTeamId)
  if (!roundTwoOpponent || !roundOneOpponent) return null
  if (!setOrderPosition(order, 1, roundTwoOpponent, usedTeams)) return null
  if (!setOrderPosition(order, teamCount - 1, roundOneOpponent, usedTeams))
    return null

  for (let i = 1; i < teamCount / 2; i++) {
    const leftTeam = order[i]
    const rightSourceTeam = order[teamCount - i]
    if (!leftTeam || !rightSourceTeam) return null

    const mirroredTeam = roundOneOpponents.get(leftTeam)
    if (!mirroredTeam) return null
    if (!setOrderPosition(order, teamCount - 1 - i, mirroredTeam, usedTeams))
      return null

    const nextTeam = roundTwoOpponents.get(rightSourceTeam)
    if (!nextTeam) return null
    if (i + 1 < teamCount) {
      if (!setOrderPosition(order, i + 1, nextTeam, usedTeams)) return null
    }
  }

  if (usedTeams.size !== teamCount) return null
  const resolved = order.filter(
    (teamId): teamId is string => teamId !== undefined,
  )
  if (resolved.length !== teamCount) return null

  return resolved
}

/** Throws unless every existing round is a complete, valid division round. */
function validateRoundGames(
  divisionTeams: string[],
  roundGames: TRoundGames,
  roundNumbers: number[],
) {
  if (roundNumbers[0] !== 1) {
    throw roundRobinInvalidError(
      'existing round-robin fixtures must start at Round 1.',
    )
  }

  const highestRound = roundNumbers[roundNumbers.length - 1]
  for (let roundNumber = 1; roundNumber <= highestRound; roundNumber++) {
    if (!roundGames.has(roundNumber)) {
      throw roundRobinInvalidError(
        `existing round-robin fixtures are missing Round ${roundNumber}.`,
      )
    }
  }

  const divisionTeamSet = new Set(divisionTeams)
  const expectedGamesPerRound = divisionTeams.length / 2

  roundGames.forEach((pairings, roundNumber) => {
    if (pairings.length !== expectedGamesPerRound) {
      throw roundRobinInvalidError(
        `Round ${roundNumber} does not contain the expected number of division games.`,
      )
    }

    const teamsInRound = new Set<string>()
    pairings.forEach(([team1Id, team2Id]) => {
      if (!divisionTeamSet.has(team1Id) || !divisionTeamSet.has(team2Id)) {
        throw roundRobinInvalidError(
          `Round ${roundNumber} includes a team outside the current division.`,
        )
      }
      if (team1Id === team2Id) {
        throw roundRobinInvalidError(
          `Round ${roundNumber} includes a team playing itself.`,
        )
      }
      if (teamsInRound.has(team1Id) || teamsInRound.has(team2Id)) {
        throw roundRobinInvalidError(
          `Round ${roundNumber} schedules the same team more than once in this division.`,
        )
      }
      teamsInRound.add(team1Id)
      teamsInRound.add(team2Id)
    })

    if (teamsInRound.size !== divisionTeams.length) {
      throw roundRobinInvalidError(
        `Round ${roundNumber} is missing division teams.`,
      )
    }
  })
}

/**
 * Recovers the team order that `getRoundRobinPairings` must have been given
 * to produce the existing rounds, so new rounds continue the same rotation.
 * When several orders fit, the one with the lexicographically smallest
 * upcoming rounds (then order) wins, so the result is deterministic.
 */
export function reconstructDivisionTeamOrder(
  divisionTeams: string[],
  roundGames: TRoundGames,
  futureRoundCount: number,
): string[] {
  if (divisionTeams.length % 2 !== 0) throw unevenDivisionError()

  const roundNumbers = Array.from(roundGames.keys()).sort((a, b) => a - b)
  validateRoundGames(divisionTeams, roundGames, roundNumbers)
  const highestRound = roundNumbers[roundNumbers.length - 1]

  const observedRounds = new Map<number, string>()
  const opponentMaps = new Map<number, Map<string, string>>()
  roundGames.forEach((pairings, roundNumber) => {
    observedRounds.set(roundNumber, serializePairings(pairings))
    opponentMaps.set(roundNumber, getRoundOpponentMap(pairings))
  })

  const roundOnePairings = roundGames.get(1)
  const roundOneOpponents = opponentMaps.get(1)
  if (!roundOnePairings || !roundOneOpponents) {
    throw roundRobinInvalidError(
      'existing round-robin fixtures must include Round 1.',
    )
  }

  const roundsToValidate = Math.max(1, futureRoundCount)
  const buildFutureSignature = (order: string[]): string => {
    const futureRounds: string[] = []
    for (
      let roundIndex = highestRound;
      roundIndex < highestRound + roundsToValidate;
      roundIndex++
    ) {
      futureRounds.push(
        serializePairings(getRoundRobinPairings(order, roundIndex)),
      )
    }
    return futureRounds.join('||')
  }

  const matchesObservedRounds = (order: string[]): boolean => {
    for (const [roundNumber, signature] of observedRounds.entries()) {
      const candidate = serializePairings(
        getRoundRobinPairings(order, roundNumber - 1),
      )
      if (candidate !== signature) return false
    }
    return true
  }

  let best: {order: string[]; signature: string; orderKey: string} | undefined
  const registerCandidate = (order: string[]) => {
    if (!matchesObservedRounds(order)) return
    const signature = buildFutureSignature(order)
    const orderKey = order.join('::')
    if (
      !best ||
      signature < best.signature ||
      (signature === best.signature && orderKey < best.orderKey)
    ) {
      best = {order, signature, orderKey}
    }
  }

  if (divisionTeams.length === 2) {
    const [team1Id, team2Id] = roundOnePairings[0]
    registerCandidate([team1Id, team2Id])
  } else if (highestRound === 1) {
    registerCandidate(buildCanonicalOrderFromRoundPairings(roundOnePairings))
  } else {
    const roundTwoOpponents = opponentMaps.get(2)
    if (!roundTwoOpponents) {
      throw roundRobinInvalidError(
        'existing round-robin fixtures are missing Round 2.',
      )
    }

    divisionTeams.forEach((fixedTeamId) => {
      const candidateOrder = reconstructOrderFromFirstTwoRounds(
        fixedTeamId,
        roundOneOpponents,
        roundTwoOpponents,
        divisionTeams.length,
      )
      if (candidateOrder) registerCandidate(candidateOrder)
    })
  }

  if (!best) {
    throw roundRobinInvalidError(
      'existing fixtures do not match the expected round-robin pattern.',
    )
  }

  return best.order
}
