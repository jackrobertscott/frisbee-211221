import {RequestHandler} from 'micro'
import puppeteer from 'puppeteer'
import {io} from 'torva'
import {ioFixtureGame} from '../../../shared/src/schemas/ioFixture'
import config from '../config'
import {$Fixture} from '../tables/$Fixture'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {createEndpoint} from '../utils/endpoints'
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
        return $Fixture.getMany({seasonId}, {limit, sort: {createdOn: -1}})
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
