import {RequestHandler} from 'micro'
import puppeteer from 'puppeteer'
import {io} from 'torva'
import config from '../config'
import {TFixture, ioFixtureGame} from '../schemas/ioFixture'
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
    path: '/FixtureListOfSeason',
    payload: io.object({
      seasonId: io.string(),
      limit: io.optional(io.number()),
    }),
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
    path: '/FixtureGet',
    payload: io.object({
      fixtureId: io.string(),
    }),
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
    path: '/FixtureCreate',
    payload: io.object({
      seasonId: io.string(),
      title: io.string(),
      date: io.date(),
      games: io.array(ioFixtureGame),
      grading: io.optional(io.boolean()),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUserAdmin(req)
      await $Season.getOne({id: body.seasonId})
      return $Fixture.createOne({
        ...body,
        userId: user.id,
      })
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/FixtureUpdate',
    payload: io.object({
      fixtureId: io.string(),
      title: io.string(),
      date: io.date(),
      games: io.array(ioFixtureGame),
      grading: io.optional(io.boolean()),
    }),
    handler:
      ({fixtureId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        return $Fixture.updateOne(
          {id: fixtureId},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/FixtureDelete',
    payload: io.object({
      fixtureId: io.string(),
    }),
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
    path: '/FixtureSnapshot',
    payload: io.object({
      fixtureId: io.string(),
    }),
    handler:
      ({fixtureId}) =>
      async (req, res) => {
        const fixture = await $Fixture.getOne({id: fixtureId})
        const buffer = await _fixtureScreenshot(fixture.id)
        res.setHeader('Content-Type', 'image/png')
        res.end(buffer)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/FixtureGenerate',
    payload: io.object({
      seasonId: io.string(),
      startingDate: io.date(),
      roundCount: io.number(),
      slots: io.array(
        io.object({
          id: io.string(),
          time: io.string(),
          place: io.string(),
        })
      ),
    }),
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
        let slotIndex = 0
        divisions.forEach((divisionTeams) => {
          let roundPairings = getRoundRobinPairings(divisionTeams, r)
          roundPairings = shuffleArray(roundPairings)
          roundPairings.forEach((pair) => {
            const slot = body.slots[slotIndex++]
            const game = {
              id: random.randomString(),
              team1Id: pair[0],
              team2Id: pair[1],
              place: slot.place,
              time: slot.time,
            }
            fixture.games.push(game)
          })
        })
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
const _fixtureScreenshot = async (fixtureId: string) => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({width: 987, height: 987})
  await page.goto(`${config.urlClient}/?fixtureId=${fixtureId}`, {
    waitUntil: 'networkidle0',
  })
  await page.emulateTimezone('Australia/Perth')
  await page.evaluateHandle('document.fonts.ready')
  const $clip = await page.$('#clip')
  const box = await $clip?.boundingBox()
  const screenshot = await page.screenshot({
    clip: box ? {x: 0, y: 0, width: box.width, height: box.height} : undefined,
  })
  await browser.close()
  return screenshot as Buffer
}
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
