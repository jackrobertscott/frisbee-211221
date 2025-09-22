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
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    ...FixtureListOfSeasonDef,
    handler:
      ({seasonId, limit}) =>
      async () => {
        return $Fixture.getMany({seasonId}, {limit, sort: {date: 1}})
      },
  }),
  /**
   *
   */
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
  /**
   *
   */
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
  /**
   *
   */
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
  /**
   *
   */
  createEndpoint({
    ...FixtureDeleteDef,
    handler:
      ({fixtureId}) =>
      async (req) => {
        await requireUserAdmin(req)
        await $Fixture.deleteOne({id: fixtureId})
      },
  }),
  /**
   *
   */
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
        throw new Error('Fixture snapshot is disabled')
      },
  }),
  /**
   *
   */
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
  /**
   *
   */
  createEndpoint({
    ...FixtureGenerateDef,
    handler: (body) => async (req) => {
      const [user] = await requireUserAdmin(req)
      const season = await $Season.getOne({id: body.seasonId})
      const teams = await $Team.getMany({seasonId: season.id})
      const teamsInvalid = teams.filter((i) => typeof i.division !== 'number')
      if (teamsInvalid.length)
        throw new Error('Every team needs a division number')
      if (body.slots.length * 2 < teams.length - 1)
        throw new Error('Not enough slots have been added')
      type TPartialFixture = Omit<TFixture, 'id' | 'createdOn' | 'updatedOn'>
      const newFixtures: TPartialFixture[] = []
      const divisions = new Map<number, string[]>()
      teams.forEach((team) => {
        const divisionTeams = divisions.get(team.division!) ?? []
        divisionTeams.push(team.id)
        divisions.set(team.division!, divisionTeams)
      })
      divisions.forEach((divisionTeams, division) => {
        divisions.set(division, shuffleArray(divisionTeams))
      })
      for (let r = 0; r < body.roundCount; r++) {
        const gameDate = new Date(body.startingDate)
        gameDate.setDate(gameDate.getDate() + r * 7)
        const fixture: TPartialFixture = {
          seasonId: season.id,
          userId: user.id,
          title: `Round ${r + 1}`,
          date: gameDate.toISOString(),
          games: [],
          grading: false,
        }
        newFixtures.push(fixture)

        // Gather all the game pairings from all divisions
        let allPairings: Array<string[]> = []
        divisions.forEach((divisionTeams) => {
          let roundPairings = getRoundRobinPairings(divisionTeams, r)
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
/**
 *
 */
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
/**
 *
 */
function getRoundRobinPairings(teams: string[], round: number): string[][] {
  if (teams.length % 2 !== 0) {
    throw new Error('Number of teams must be even')
  }
  // Calculate the total number of matchups in a full cycle
  const totalRounds = teams.length - 1
  const currentCycle = Math.floor(round / totalRounds)
  const currentRoundInCycle = round % totalRounds
  // Adjust teams array for the current round in the cycle
  let adjustedTeams = [...teams]
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
    pairings.push([homeTeam, awayTeam])
  }
  return pairings
}
/**
 *
 */
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
      throw new Error(
        'Unable to schedule restricted team without a 6 in the time slot. Please add a slot without 6 or adjust other games.'
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
