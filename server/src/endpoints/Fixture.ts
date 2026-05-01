import {badRequestError, serviceUnavailableError} from '@shared/errors'
import {
  FixtureAdjustMultipleDef,
  FixtureCreateDef,
  FixtureDeleteDef,
  FixtureGenerateDef,
  FixtureGetDef,
  FixtureListOfSeasonDef,
  FixtureSnapshotDef,
  FixtureUpdateDef,
} from '@shared/endpoints/FixtureDef'
import {TFixture} from '@shared/schemas/ioFixture'
import {RequestHandler} from 'micro'
import {$Fixture} from '../tables/$Fixture'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {createEndpoint} from '../utils/endpoints'
import {random} from '../utils/random'
import {requireUserAdmin} from './requireUserAdmin'

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...FixtureListOfSeasonDef,
    handler:
      ({seasonId, limit}) =>
      async () => {
        return $Fixture.getMany({seasonId}, {limit, sort: {date: 1}})
      },
  }),

  createEndpoint({
    ...FixtureGetDef,
    handler:
      ({fixtureId}) =>
      async () => {
        const fixture = await $Fixture.getOne({id: fixtureId})
        const teams = await $Team.getMany({seasonId: fixture.seasonId})
        return {fixture, teams}
      },
  }),

  createEndpoint({
    ...FixtureCreateDef,
    handler: (body) => async (req) => {
      const [user] = await requireUserAdmin(req)
      await $Season.getOne({id: body.seasonId})
      const adjustedGames = enforceRestrictedTeamTimeSlots(body.games)
      return $Fixture.createOne({
        ...body,
        games: adjustedGames,
        userId: user.id,
      })
    },
  }),

  createEndpoint({
    ...FixtureUpdateDef,
    handler:
      ({fixtureId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        const adjustedGames = enforceRestrictedTeamTimeSlots(body.games)
        return $Fixture.updateOne(
          {id: fixtureId},
          {...body, games: adjustedGames, updatedOn: new Date().toISOString()}
        )
      },
  }),

  createEndpoint({
    ...FixtureDeleteDef,
    handler:
      ({fixtureId}) =>
      async (req) => {
        await requireUserAdmin(req)
        await $Fixture.deleteOne({id: fixtureId})
      },
  }),

  createEndpoint({
    ...FixtureSnapshotDef,
    handler:
      ({fixtureId}) =>
      // Puppeteer-based snapshot generation disabled
      // async (req, res) => {
      //   let buffer: Buffer | null
      //   try {
      //     const fixture = await $Fixture.getOne({id: fixtureId})
      //     buffer = await _fixtureScreenshot(fixture.id)
      //     // this method fails if you do not have enough server memory
      //     // for example, it will fail on a "$5" DigitalOcean droplet
      //     res.setHeader('Content-Type', 'image/png')
      //     res.end(buffer)
      //   } catch (e) {
      //     throw e
      //   } finally {
      //     buffer = null
      //   }
      // },
      async () => {
        throw serviceUnavailableError('Fixture snapshot is disabled', {
          errorCode: 'fixture.snapshot_disabled',
        })
      },
  }),

  createEndpoint({
    ...FixtureAdjustMultipleDef,
    handler:
      ({seasonId, referenceFixtureId, amount, unit, direction}) =>
      async (req) => {
        await requireUserAdmin(req)

        // Get the reference fixture to determine the date threshold
        const referenceFixture = await $Fixture.getOne({id: referenceFixtureId})
        const referenceDate = new Date(referenceFixture.date)

        // Get all fixtures after the reference fixture date
        const fixtures = await $Fixture.getMany(
          {
            seasonId,
            date: {$gte: referenceDate.toISOString()},
          },
          {sort: {date: 1}}
        )

        // Apply the direction to the amount
        const adjustmentAmount = direction === 'backward' ? -amount : amount

        // Update each fixture with proper date calculations
        await Promise.all(
          fixtures.map((fixture) => {
            const currentDate = new Date(fixture.date)
            let newDate: Date

            // Handle different time units properly
            if (unit === 'month') {
              // Properly handle month adjustments
              newDate = new Date(currentDate)
              newDate.setMonth(currentDate.getMonth() + adjustmentAmount)
            } else if (unit === 'week') {
              // Week adjustment (7 days)
              newDate = new Date(currentDate)
              newDate.setDate(currentDate.getDate() + adjustmentAmount * 7)
            } else {
              // Default to days
              newDate = new Date(currentDate)
              newDate.setDate(currentDate.getDate() + adjustmentAmount)
            }

            return $Fixture.updateOne(
              {id: fixture.id},
              {
                date: newDate.toISOString(),
                updatedOn: new Date().toISOString(),
              }
            )
          })
        )

        return {count: fixtures.length}
      },
  }),

  createEndpoint({
    ...FixtureGenerateDef,
    handler: (body) => async (req) => {
      const [user] = await requireUserAdmin(req)
      const season = await $Season.getOne({id: body.seasonId})
      const teams = await $Team.getMany({seasonId: season.id})
      const teamsInvalid = teams.filter((i) => typeof i.division !== 'number')
      if (teamsInvalid.length)
        throw badRequestError('Every team needs a division number', {
          errorCode: 'fixture.division_missing',
        })
      if (body.slots.length * 2 < teams.length - 1)
        throw badRequestError('Not enough slots have been added', {
          errorCode: 'fixture.slots_insufficient',
        })

      // Get existing fixtures to determine starting round
      const existingFixtures = await $Fixture.getMany(
        {seasonId: season.id},
        {sort: {date: 1}}
      )

      type TPartialFixture = Omit<TFixture, 'id' | 'createdOn' | 'updatedOn'>
      const newFixtures: TPartialFixture[] = []
      const divisions = new Map<number, string[]>()
      teams.forEach((team) => {
        const divisionTeams = divisions.get(team.division!) ?? []
        divisionTeams.push(team.id)
        divisions.set(team.division!, divisionTeams)
      })

      // Determine starting round number and validate existing fixtures
      let startingRound = 0
      let teamOrder = new Map<number, string[]>()

      if (existingFixtures.length > 0) {
        // Extract round numbers from existing fixtures
        const roundNumbers = existingFixtures
          .map((f) => {
            const match = f.title.match(/Round\s+(\d+)/i)
            return match ? parseInt(match[1], 10) : null
          })
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b)

        if (roundNumbers.length > 0) {
          startingRound = Math.max(...roundNumbers)

          for (const [division, divisionTeams] of divisions.entries()) {
            const roundGames = getDivisionRoundGames(
              existingFixtures,
              new Set(divisionTeams)
            )
            if (roundGames.size > 0) {
              teamOrder.set(
                division,
                reconstructDivisionTeamOrder(
                  divisionTeams,
                  roundGames,
                  body.roundCount
                )
              )
            }
          }
        }
      }

      // If we couldn't determine team order from existing fixtures, shuffle as before
      divisions.forEach((divisionTeams, division) => {
        if (!teamOrder.has(division)) {
          teamOrder.set(division, shuffleArray([...divisionTeams]))
        }
      })

      for (let r = 0; r < body.roundCount; r++) {
        const roundNumber = startingRound + r + 1
        const gameDate = new Date(body.startingDate)
        gameDate.setDate(gameDate.getDate() + r * 7)
        const fixture: TPartialFixture = {
          seasonId: season.id,
          userId: user.id,
          title: `Round ${roundNumber}`,
          date: gameDate.toISOString(),
          games: [],
          grading: false,
        }
        newFixtures.push(fixture)

        // Gather all the game pairings from all divisions
        let allPairings: Array<string[]> = []
        teamOrder.forEach((divisionTeams) => {
          if (divisionTeams.length % 2 !== 0) {
            throw badRequestError(
              'Fixture generation failed: each division must contain an even number of teams to create valid round-robin matchups. Please add or remove a team in the affected division.',
              {
                errorCode: 'fixture.uneven_division',
              }
            )
          }
          // Use the actual round index in the sequence (startingRound + r)
          let roundPairings = getRoundRobinPairings(
            divisionTeams,
            startingRound + r
          )
          allPairings = allPairings.concat(roundPairings)
        })

        // Randomize the order of all pairings
        allPairings = shuffleArray(allPairings)

        // Assign slots to pairings in the randomized order
        allPairings.forEach((pair, index) => {
          const slot = body.slots[index % body.slots.length]
          const game = {
            id: random.randomString(),
            team1Id: pair[0],
            team2Id: pair[1],
            place: slot.place,
            time: slot.time,
          }
          fixture.games.push(game)
        })

        // Enforce restriction per fixture before saving
        fixture.games = enforceRestrictedTeamTimeSlots(fixture.games)
      }
      await Promise.all(
        newFixtures.map((fixture) => $Fixture.createOne(fixture))
      )
    },
  }),
])

// const _fixtureScreenshot = async (fixtureId: string) => {
//   let browser = null
//   let page = null
//   let $clip = null
//
//   // warning: default puppeteer (without args) will not work without >=2 cpu cores
//   try {
//     browser = await puppeteer.launch({
//       executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
//       headless: true,
//       args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//         // following args help run in a low-memory and cpu environment
//         '--disable-dev-shm-usage',
//         '--disable-gpu',
//         '--disable-software-rasterizer',
//       ],
//     })
//     page = await browser.newPage()
//     await page.setViewport({width: 987, height: 987})
//     const url = `${config.urlClient}/?fixtureId=${fixtureId}`
//     await page.goto(url, {
//       waitUntil: ['networkidle0', 'networkidle2'],
//     })
//
//     await page.emulateTimezone('Australia/Perth')
//     await page.evaluateHandle('document.fonts.ready')
//
//     $clip = await page.waitForSelector('#clip')
//     if (!$clip) throw new Error('Could not find #clip element')
//
//     const box = await $clip.boundingBox()
//     if (!box) throw new Error('Could not get bounding box')
//
//     const screenshot = await page.screenshot({
//       clip: {x: 0, y: 0, width: box.width, height: box.height},
//     })
//
//     return screenshot as Buffer
//   } catch (e) {
//     console.log(e)
//     throw e
//   } finally {
//     if ($clip) {
//       await $clip.dispose()
//     }
//     if (page) {
//       await page.close()
//     }
//     if (browser) {
//       await browser.close()
//     }
//   }
// }

export function getRoundRobinPairings(
  teams: string[],
  round: number
): string[][] {
  // Support odd team counts by adding a bye placeholder.
  const hasBye = teams.length % 2 !== 0
  const byeId = '__BYE__'
  const workingTeams = hasBye ? [...teams, byeId] : [...teams]

  // Calculate the total number of matchups in a full cycle
  const totalRounds = workingTeams.length - 1
  const currentCycle = Math.floor(round / totalRounds)
  const currentRoundInCycle = round % totalRounds
  // Adjust teams array for the current round in the cycle
  let adjustedTeams = [...workingTeams]
  const fixedPosition = adjustedTeams.shift() // Remove the first team to keep it fixed
  // Rotate the remaining teams currentRoundInCycle times
  for (let i = 0; i < currentRoundInCycle; i++) {
    adjustedTeams.push(adjustedTeams.shift()!)
  }
  // Re-add the fixed team
  adjustedTeams = [fixedPosition!, ...adjustedTeams]
  // Create pairings for the round
  let pairings: string[][] = []
  for (let i = 0; i < adjustedTeams.length / 2; i++) {
    // Adjust pairings based on the current cycle to avoid repeat matchups
    let homeTeam = adjustedTeams[i]
    let awayTeam = adjustedTeams[adjustedTeams.length - 1 - i]
    if (currentCycle % 2 === 1) {
      // Swap home and away teams every alternate cycle
      ;[homeTeam, awayTeam] = [awayTeam, homeTeam]
    }
    // Skip any pairing that involves the bye placeholder
    if (homeTeam === byeId || awayTeam === byeId) continue
    pairings.push([homeTeam, awayTeam])
  }
  return pairings
}

function extractRoundNumber(title: string): number | null {
  const match = title.match(/Round\s+(\d+)/i)
  if (!match) return null
  return parseInt(match[1], 10)
}

function normalizePairing([team1Id, team2Id]: string[]): string {
  return [team1Id, team2Id].sort().join('::')
}

function serializePairings(pairings: string[][]): string {
  return pairings.map(normalizePairing).sort().join('|')
}

function buildCanonicalOrderFromRoundPairings(pairings: string[][]): string[] {
  const normalizedPairings = pairings
    .map(([team1Id, team2Id]) => [team1Id, team2Id].sort())
    .sort((pairA, pairB) =>
      normalizePairing(pairA).localeCompare(normalizePairing(pairB))
    )

  const leftTeams = normalizedPairings.map(([team1Id]) => team1Id)
  const rightTeams = normalizedPairings
    .map(([, team2Id]) => team2Id)
    .reverse()

  return leftTeams.concat(rightTeams)
}

function getRoundOpponentMap(pairings: string[][]): Map<string, string> {
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
  usedTeams: Set<string>
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
  teamCount: number
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
  if (order.some((teamId) => teamId === undefined)) return null

  return order as string[]
}

export function getDivisionRoundGames(
  fixtures: TFixture[],
  divisionTeamSet: Set<string>
): Map<number, string[][]> {
  const roundGames = new Map<number, string[][]>()

  fixtures.forEach((fixture) => {
    const roundNumber = extractRoundNumber(fixture.title)
    if (roundNumber === null) return

    const divisionGames = fixture.games
      .filter(
        (game) =>
          divisionTeamSet.has(game.team1Id) && divisionTeamSet.has(game.team2Id)
      )
      .map((game) => [game.team1Id, game.team2Id])

    if (divisionGames.length === 0) return
    const existingGames = roundGames.get(roundNumber) ?? []
    roundGames.set(roundNumber, existingGames.concat(divisionGames))
  })

  return roundGames
}

export function reconstructDivisionTeamOrder(
  divisionTeams: string[],
  roundGames: Map<number, string[][]>,
  futureRoundCount: number
): string[] {
  if (divisionTeams.length % 2 !== 0) {
    throw badRequestError(
      'Fixture generation failed: each division must contain an even number of teams to create valid round-robin matchups. Please add or remove a team in the affected division.',
      {
        errorCode: 'fixture.uneven_division',
      }
    )
  }

  const roundNumbers = Array.from(roundGames.keys()).sort((a, b) => a - b)
  if (roundNumbers[0] !== 1) {
    throw badRequestError(
      'Fixture generation failed: existing round-robin fixtures must start at Round 1.',
      {
        errorCode: 'fixture.round_robin_invalid',
      }
    )
  }

  const highestRound = roundNumbers[roundNumbers.length - 1]
  for (let roundNumber = 1; roundNumber <= highestRound; roundNumber++) {
    if (!roundGames.has(roundNumber)) {
      throw badRequestError(
        `Fixture generation failed: existing round-robin fixtures are missing Round ${roundNumber}.`,
        {
          errorCode: 'fixture.round_robin_invalid',
        }
      )
    }
  }

  const divisionTeamSet = new Set(divisionTeams)
  const expectedGamesPerRound = divisionTeams.length / 2
  const observedRounds = new Map<number, string>()
  const opponentMaps = new Map<number, Map<string, string>>()

  roundGames.forEach((pairings, roundNumber) => {
    if (pairings.length !== expectedGamesPerRound) {
      throw badRequestError(
        `Fixture generation failed: Round ${roundNumber} does not contain the expected number of division games.`,
        {
          errorCode: 'fixture.round_robin_invalid',
        }
      )
    }

    const teamsInRound = new Set<string>()
    pairings.forEach(([team1Id, team2Id]) => {
      if (!divisionTeamSet.has(team1Id) || !divisionTeamSet.has(team2Id)) {
        throw badRequestError(
          `Fixture generation failed: Round ${roundNumber} includes a team outside the current division.`,
          {
            errorCode: 'fixture.round_robin_invalid',
          }
        )
      }
      if (team1Id === team2Id) {
        throw badRequestError(
          `Fixture generation failed: Round ${roundNumber} includes a team playing itself.`,
          {
            errorCode: 'fixture.round_robin_invalid',
          }
        )
      }
      if (teamsInRound.has(team1Id) || teamsInRound.has(team2Id)) {
        throw badRequestError(
          `Fixture generation failed: Round ${roundNumber} schedules the same team more than once in this division.`,
          {
            errorCode: 'fixture.round_robin_invalid',
          }
        )
      }
      teamsInRound.add(team1Id)
      teamsInRound.add(team2Id)
    })

    if (teamsInRound.size !== divisionTeams.length) {
      throw badRequestError(
        `Fixture generation failed: Round ${roundNumber} is missing division teams.`,
        {
          errorCode: 'fixture.round_robin_invalid',
        }
      )
    }

    observedRounds.set(roundNumber, serializePairings(pairings))
    opponentMaps.set(roundNumber, getRoundOpponentMap(pairings))
  })

  const roundOnePairings = roundGames.get(1)
  if (!roundOnePairings) {
    throw badRequestError(
      'Fixture generation failed: existing round-robin fixtures must include Round 1.',
      {
        errorCode: 'fixture.round_robin_invalid',
      }
    )
  }
  const roundOneOpponents = opponentMaps.get(1)
  if (!roundOneOpponents) {
    throw badRequestError(
      'Fixture generation failed: existing round-robin fixtures must include Round 1.',
      {
        errorCode: 'fixture.round_robin_invalid',
      }
    )
  }

  let matchCount = 0
  let resolvedOrder: string[] | undefined
  let resolvedSignature: string | undefined
  let resolvedOrderKey: string | undefined
  const roundsToValidate = Math.max(1, futureRoundCount)

  function buildFutureSignature(order: string[]): string {
    const futureRounds: string[] = []
    for (
      let roundIndex = highestRound;
      roundIndex < highestRound + roundsToValidate;
      roundIndex++
    ) {
      futureRounds.push(serializePairings(getRoundRobinPairings(order, roundIndex)))
    }
    return futureRounds.join('||')
  }

  function validateCandidate(order: string[]): boolean {
    for (const [roundNumber, signature] of observedRounds.entries()) {
      const candidate = serializePairings(
        getRoundRobinPairings(order, roundNumber - 1)
      )
      if (candidate !== signature) return false
    }
    return true
  }

  function registerCandidate(order: string[]) {
    if (!validateCandidate(order)) return
    matchCount += 1
    const futureSignature = buildFutureSignature(order)
    const orderKey = order.join('::')
    if (resolvedOrder === undefined) {
      resolvedOrder = order
      resolvedSignature = futureSignature
      resolvedOrderKey = orderKey
      return
    }

    if (!resolvedSignature || !resolvedOrderKey) {
      resolvedOrder = order
      resolvedSignature = futureSignature
      resolvedOrderKey = orderKey
      return
    }

    if (
      futureSignature < resolvedSignature ||
      (futureSignature === resolvedSignature && orderKey < resolvedOrderKey)
    ) {
      resolvedOrder = order
      resolvedSignature = futureSignature
      resolvedOrderKey = orderKey
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
      throw badRequestError(
        'Fixture generation failed: existing round-robin fixtures are missing Round 2.',
        {
          errorCode: 'fixture.round_robin_invalid',
        }
      )
    }

    divisionTeams.forEach((fixedTeamId) => {
      const candidateOrder = reconstructOrderFromFirstTwoRounds(
        fixedTeamId,
        roundOneOpponents,
        roundTwoOpponents,
        divisionTeams.length
      )
      if (candidateOrder) registerCandidate(candidateOrder)
    })
  }

  if (matchCount === 0 || !resolvedOrder) {
    throw badRequestError(
      'Fixture generation failed: existing fixtures do not match the expected round-robin pattern.',
      {
        errorCode: 'fixture.round_robin_invalid',
      }
    )
  }

  return resolvedOrder
}

function shuffleArray(array: any[]): any[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

// Team-time restriction: optionally prevent a specific team from any slot containing '6'
const RESTRICTED_TEAM_ID = process.env.RESTRICTED_TEAM_ID

function containsSix(s?: string) {
  return typeof s === 'string' && s.includes('6')
}

// Ensures the restricted team (if configured) is not scheduled in a slot whose time contains '6'.
// If a violation is found, swaps the entire slot (time + place) with a suitable non-violating game.
function enforceRestrictedTeamTimeSlots(
  games: TFixture['games']
): TFixture['games'] {
  if (!RESTRICTED_TEAM_ID) return games
  if (!Array.isArray(games) || games.length === 0) return games

  // In typical fixtures, a team appears at most once per fixture.
  // Still, handle multiple just in case.
  const result = games.map((g) => ({...g}))

  for (let i = 0; i < result.length; i++) {
    const g = result[i]
    const involvesRestricted =
      g.team1Id === RESTRICTED_TEAM_ID || g.team2Id === RESTRICTED_TEAM_ID
    if (!involvesRestricted) continue

    if (!containsSix(g.time)) continue

    // Find a candidate game that does not involve the restricted team and whose time does not contain '6'
    let swapIndex = -1
    for (let j = 0; j < result.length; j++) {
      if (j === i) continue
      const other = result[j]
      const otherInvolvesRestricted =
        other.team1Id === RESTRICTED_TEAM_ID ||
        other.team2Id === RESTRICTED_TEAM_ID
      if (otherInvolvesRestricted) continue
      if (!containsSix(other.time)) {
        swapIndex = j
        break
      }
    }

    if (swapIndex === -1) {
      throw badRequestError(
        'Unable to schedule restricted team without a 6 in the time slot. Please add a slot without 6 or adjust other games.',
        {
          errorCode: 'fixture.restricted_slot_unavailable',
        }
      )
    }

    // Swap full slot: time + place
    const tmpTime = result[i].time
    const tmpPlace = result[i].place
    result[i].time = result[swapIndex].time
    result[i].place = result[swapIndex].place
    result[swapIndex].time = tmpTime
    result[swapIndex].place = tmpPlace
  }

  return result
}
