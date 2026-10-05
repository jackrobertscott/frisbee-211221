import {badRequestError} from '@shared/errors'
import {
  PortDeleteAllMockDataDef,
  PortExportDef,
  PortGamedayImportDef,
  PortGamedayImportLoadDef,
  PortGamedayImportSaveDef,
  PortImportDef,
  PortMockGenerateDef,
} from '@shared/endpoints/PortDef'
import {RequestHandler} from 'micro'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {blob} from '../http/uploads'
import {parseCSVString} from '../utils/csv'
import {createEndpoint} from '../http/createEndpoint'
import mongo from '../db/mongo'
import {requireAccess} from '../auth/requireAccess'
import {assertMemberImportHeadings} from '../services/csvImport'
import {createExportArchive} from '../services/exportArchive'
import {
  loadGamedayImportState,
  runManualGamedayImport,
  saveGamedayImportConfig,
} from '../services/gamedayImportConfig'
import {importMemberObjects} from '../services/memberImport'
import {generateMockSeasonData} from '../services/mockData'

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...PortImportDef,
    handler: (_, access) => async (req) => {
      await requireAccess(req, access)
      const [rawFiles, fields] = await blob.digestRequest(req)
      const seasonId = fields.get('seasonId')
      if (!seasonId?.trim())
        throw badRequestError('Season id missing from request.', {
          errorCode: 'season.id_missing',
        })
      const season = await $Season.getOne({id: seasonId})
      if (!rawFiles[0])
        throw badRequestError('No file was present on the request.', {
          errorCode: 'upload.file_missing',
        })
      if (!['text/csv'].includes(rawFiles[0].mimetype))
        throw badRequestError('Failed: import file type must be a CSV.', {
          errorCode: 'upload.invalid_file_type',
        })
      const csvBuffer = await blob.filepathBuffer(rawFiles[0].filepath)
      const objects = parseCSVString(csvBuffer.toString())
      assertMemberImportHeadings(objects)
      await importMemberObjects(objects, season.id)
    },
  }),

  createEndpoint({
    ...PortExportDef,
    handler: (body, access) => async (req, res) => {
      await requireAccess(req, access)
      const {buffer, filename} = await createExportArchive(body.fileType)
      res.statusCode = 200
      res.setHeader('Cache-Control', 'no-store, max-age=0')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      )
      res.setHeader('Content-Length', String(buffer.byteLength))
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.end(buffer)
      return null
    },
  }),

  createEndpoint({
    ...PortGamedayImportLoadDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      return await loadGamedayImportState(body.seasonId)
    },
  }),

  createEndpoint({
    ...PortGamedayImportSaveDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      return await saveGamedayImportConfig(body)
    },
  }),

  createEndpoint({
    ...PortGamedayImportDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      return await runManualGamedayImport(body.seasonId)
    },
  }),

  createEndpoint({
    ...PortMockGenerateDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      if (!body.seasonId?.trim())
        throw badRequestError('Season id missing from request.', {
          errorCode: 'season.id_missing',
        })
      const season = await $Season.getOne({id: body.seasonId})
      const {teams, users, members} = generateMockSeasonData(
        season.id,
        body.teams,
        body.usersPerTeam,
      )
      await mongo.transaction(async () => {
        await $Member.createMany(members)
        await $Team.createMany(teams)
        await $User.createMany(users)
      })
    },
  }),

  createEndpoint({
    ...PortDeleteAllMockDataDef,
    handler: (_, access) => async (req) => {
      await requireAccess(req, access)
      const mockTeams = await $Team.getMany({isMock: true})
      const mockTeamIds = mockTeams.map((i) => i.id)
      await mongo.transaction(async () => {
        await $Member.deleteMany({isMock: true})
        await $Team.deleteMany({isMock: true})
        await $User.deleteMany({isMock: true})
        await $Report.deleteMany({
          $or: [
            {teamId: {$in: mockTeamIds}},
            {teamAgainstId: {$in: mockTeamIds}},
          ],
        })
      })
    },
  }),
])
