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
      const cache = new Map<string, string[]>()
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
        const teamsShuffled = [...teams].sort(() => Math.random() - 0.5)
        for (let s = 0; s < body.slots.length; s++) {
          const slot = body.slots[s]
          const team1 = teamsShuffled.find((t) => {
            return !fixture.games.some(
              (g) => g.team1Id === t.id || g.team2Id === t.id
            )
          })
          if (!team1) {
            console.log('Team 1 Failure')
            console.log(`Round: ${r + 1}/${body.roundCount}`)
            console.log(`Slot: ${s + 1}/${body.slots.length} (${slot.time})`)
            console.log(teamsShuffled.map((i) => `${i.name} (D${i.division})`))
            throw new Error('Failed to get team 1')
          }
          const teamsInDivShuffled = teamsShuffled.filter((t) => {
            return t.division === team1.division
          })
          const teams1AlreadyPlayed = cache.get(team1.id) ?? []
          const team2 = teamsInDivShuffled.find((t) => {
            return (
              team1.id !== t.id &&
              !fixture.games.some(
                (g) => g.team1Id === t.id || g.team2Id === t.id
              ) &&
              !teams1AlreadyPlayed.includes(t.id)
            )
          })
          if (!team2) {
            console.log('Team 2 Failure')
            console.log(`Round: ${r + 1}/${body.roundCount}`)
            console.log(`Slot: ${s + 1}/${body.slots.length} (${slot.time})`)
            console.log(teamsShuffled.map((i) => `${i.name} (D${i.division})`))
            console.log(team1.id + ':', teams1AlreadyPlayed.join(','))
            throw new Error('Failed to get team 2')
          }
          const game = {
            id: random.randomString(),
            team1Id: team1.id,
            team2Id: team2.id,
            place: slot.place,
            time: slot.time,
          }
          fixture.games.push(game)
          cache.set(team1.id, (cache.get(team1.id) ?? []).concat(team2.id))
          cache.set(team2.id, (cache.get(team2.id) ?? []).concat(team1.id))
        }
        teams.forEach((team) => {
          const teamsInDiv = teams.filter((t) => t.division === team.division)
          if (cache.get(team.id)!.length >= teamsInDiv.length - 1) {
            cache.set(team.id, [])
          }
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
