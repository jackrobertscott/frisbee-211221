import AdmZip from 'adm-zip'
import {RequestHandler} from 'micro'
import {TUser} from '../schemas/ioUser'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {blob} from '../utils/blob'
import {createEndpoint} from '../utils/endpoints'
import {mail} from '../utils/mail'
import mongo from '../utils/mongo'
import {regex} from '../utils/regex'
import {requireUserAdmin} from './requireUserAdmin'
import {userEmail} from './userEmail'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/PortImport',
    multipart: true,
    handler: () => async (req) => {
      await requireUserAdmin(req)
      const [rawFiles, fields] = await blob.digestRequest(req)
      const seasonId = fields.get('seasonId')
      if (!seasonId?.trim()) throw new Error('Season id missing from request.')
      const season = await $Season.getOne({id: seasonId})
      if (!rawFiles[0]) throw new Error('No file was present on the request.')
      if (!['text/csv'].includes(rawFiles[0].mimetype))
        throw new Error('Failed: import file type must be a CSV.')
      const csvBuffer = await blob.filepathBuffer(rawFiles[0].filepath)
      const content = csvBuffer.toString()
      const objects = _parseCSVString(content)
      await mongo.transaction(async () => {
        await _createTeamsFromObjects(objects, season.id)
        await _createUsersFromObjects(objects, season.id)
      })
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/PortExport',
    handler: () => async (req) => {
      const [user] = await requireUserAdmin(req)
      const all = await Promise.all([
        $Fixture.getMany({}),
        $Member.getMany({}),
        $Report.getMany({}),
        $Season.getMany({}),
        $Team.getMany({}),
        $User.getMany({}),
      ])
      const [
        fixturesCsv,
        membersCsv,
        reportsCsv,
        seasonsCsv,
        teamsCsv,
        usersCsv,
      ] = all.map((i) => _csvify(i))
      const zip = new AdmZip()
      zip.addFile('exports/fixtures.csv', Buffer.from(fixturesCsv, 'utf8'))
      zip.addFile('exports/members.csv', Buffer.from(membersCsv, 'utf8'))
      zip.addFile('exports/reports.csv', Buffer.from(reportsCsv, 'utf8'))
      zip.addFile('exports/seasons.csv', Buffer.from(seasonsCsv, 'utf8'))
      zip.addFile('exports/teams.csv', Buffer.from(teamsCsv, 'utf8'))
      zip.addFile('exports/users.csv', Buffer.from(usersCsv, 'utf8'))
      const data = await blob.uploadBuffer({
        body: zip.toBuffer(),
        mimetype: 'application/zip',
        extension: '.zip',
        folder: 'frisbee/exports',
      })
      const url = await blob.getObjectUrl(data.key, data.bucket)
      const email = userEmail.primary(user).value
      await mail.send({
        to: [email],
        subject: `Your Export Is Ready`,
        html: `
          Hey ${user.firstName},<br/><br/>
          Here is a link to your export:</br></br>
          <a href="${url}">${url}</a></br></br>
          The link above will <strong>expire</strong> soon.</br></br>
          Have a nice day.
        `
          .split('\n')
          .map((i) => i.trim())
          .join('\n')
          .trim(),
      })
      return {email}
    },
  }),
])
/**
 *
 */
const _createTeamsFromObjects = async (
  objects: Record<string, string>[],
  seasonId: string
) => {
  const teamCSVNameList = [] as string[]
  let teamCSVList = objects
    .filter((i) => i.type === 'team')
    .map((i) => ({
      seasonId: seasonId,
      name: i.team_name,
      color: 'hsla(0, 0%, 100%, 1)',
    }))
    .filter((i) => {
      if (teamCSVNameList.includes(i.name)) return false
      teamCSVNameList.push(i.name)
      return true
    })
  const teamDBList = await $Team.getMany({
    seasonId: seasonId,
    name: {$in: teamCSVNameList.map(regex.normalize)},
  })
  const teamDBNameList = teamDBList.map((i) => i.name.toLowerCase().trim())
  const teamCSVNewList = teamCSVList.filter((i) => {
    return !teamDBNameList.includes(i.name.toLowerCase().trim())
  })
  if (teamCSVNewList.length) await $Team.createMany(teamCSVNewList)
}
/**
 *
 */
const _createUsersFromObjects = async (
  objects: Record<string, string>[],
  seasonId: string
) => {
  const userCSVEmailList = [] as string[]
  let userCSVList = objects
    .map((i) => ({
      _team: i.team_name,
      _captain: i.type === 'team',
      _email: i.email_address,
      firstName: i.first_name,
      lastName: i.last_name,
      gender: i.gender as any,
      termsAccepted: false,
      emails: [userEmail.create(i.email_address, true)],
    }))
    .filter((i) => {
      if (userCSVEmailList.includes(i._email)) return false
      userCSVEmailList.push(i._email)
      return true
    })
  const loadDBUsers = () => {
    const csvEmails = userCSVEmailList.map(regex.normalize)
    return $User.getMany({
      $or: [{email: {$in: csvEmails}}, {'emails.value': {$in: csvEmails}}],
    })
  }
  let userDBList = await loadDBUsers()
  const allUserEmails = (user: TUser) =>
    [user.email, ...(user.emails ?? []).map((i) => i.value)]
      .filter((x) => x?.trim())
      .map((i) => i?.toLowerCase().trim()) as string[]
  const userDBEmailList = userDBList.flatMap(allUserEmails)
  const userCSVNewList = userCSVList.filter((i) => {
    return !userDBEmailList.includes(i._email.toLowerCase().trim())
  })
  if (userCSVNewList.length) await $User.createMany(userCSVNewList)
  userDBList = await loadDBUsers()
  const teamDBList = await $Team.getMany({seasonId})
  const memberCSVList = userDBList
    .map((i) => {
      const userCSV = userCSVList.find((x) => {
        return allUserEmails(i).includes(x._email.toLowerCase().trim())
      })
      if (!userCSV) return undefined
      const userCSVTeamName = userCSV?._team.toLowerCase().trim()
      const teamDBOfUser = teamDBList.find((i) => {
        return i.name.toLowerCase().trim() === userCSVTeamName
      })
      if (!teamDBOfUser) return undefined
      return {
        seasonId: teamDBOfUser.seasonId,
        teamId: teamDBOfUser.id,
        userId: i.id,
        captain: userCSV._captain,
        pending: false,
      }
    })
    .filter((i) => !!i)
    .map((i) => i!)
  const memberDBList = await $Member.getMany({
    seasonId,
    userId: {$in: userDBList.map((i) => i.id)},
  })
  const memberDBUserIdList = memberDBList.map((i) => i.userId)
  const memberCSVNewList = memberCSVList.filter((i) => {
    return !memberDBUserIdList.includes(i.userId)
  })
  if (memberCSVNewList.length) await $Member.createMany(memberCSVNewList)
}
/**
 *
 */
const _parseCSVString = (csv: string) => {
  const data = []
  const body = csv.split('\n').filter((i) => i.trim())
  const head = body.splice(0, 1)[0]
  const cols = _tokenify(head)
  for (const row of body) {
    const tokens = _tokenify(row)
    const insert = cols.reduce((all, key, index) => {
      all[key] = tokens[index]
      return all
    }, {} as Record<string, string>)
    data.push(insert)
  }
  return data
}
/**
 *
 */
const _tokenify = (text: string) => {
  let tokens = [] as string[]
  for (let i = 0, quotes = false, token = ''; i < text.length; i++) {
    const escaped =
      i > 0 && text[i - 1] === '\\' && !(i > 1 && text[i - 2] === '\\')
    if (text[i] === '"' && !escaped) {
      quotes = !quotes
      continue
    }
    if (text[i] === ',' && !quotes) {
      tokens.push(token.trim())
      token = ''
      continue
    }
    token += text[i]
  }
  return tokens
}
/**
 *
 */
const _csvify = (objects: any[]) => {
  const headings: string[] = []
  for (const obj of objects) {
    for (const key in obj) {
      if (!headings.includes(key)) headings.push(key)
    }
  }
  const rows: string[] = []
  for (const obj of objects) {
    let row = ''
    for (const key of headings) {
      let value = JSON.stringify(obj[key])
      if (typeof obj[key] === 'string') row += value + ','
      else {
        value = value !== undefined ? value.replace(/\"/g, '""') : ''
        row += `"${value}"` + ','
      }
    }
    rows.push(row)
  }
  let csv = ''
  for (const heading of headings) csv += heading + ','
  for (const row of rows) csv += '\n' + row
  return csv
}
