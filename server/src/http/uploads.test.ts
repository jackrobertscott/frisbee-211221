import {getErrorStatusCode, isAppError} from '@shared/errors'
import fs from 'fs-extra'
import http from 'http'
import nodeFs from 'fs'
import {AddressInfo} from 'net'
import os from 'os'
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {blob} from './uploads'

type TDigest = Awaited<ReturnType<typeof blob.digestRequest>>

let server: http.Server
let baseUrl = ''
let lastResult: Promise<TDigest> | undefined

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastResult = blob.digestRequest(req)
    lastResult.then(
      ([files, fields]) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({files, fields: [...fields]}))
      },
      (error: unknown) => {
        res.statusCode = getErrorStatusCode(error)
        res.end()
      },
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

let removed: string[] = []

beforeEach(() => {
  removed = []
  lastResult = undefined
  const remove = fs.remove
  vi.spyOn(fs, 'remove').mockImplementation(async (filepath: string) => {
    removed.push(filepath)
    await remove(filepath)
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(removed.map((filepath) => fs.remove(filepath)))
})

type TPart = {name: string; filename?: string; type?: string; content: string | Buffer}

const BOUNDARY = 'test-boundary-1234'

const multipart = (parts: TPart[]) =>
  Buffer.concat([
    ...parts.flatMap((part) => {
      const disposition = `form-data; name="${part.name}"${
        part.filename === undefined ? '' : `; filename="${part.filename}"`
      }`
      const head = [
        `--${BOUNDARY}`,
        `Content-Disposition: ${disposition}`,
        ...(part.type ? [`Content-Type: ${part.type}`] : []),
        '',
        '',
      ].join('\r\n')
      const content =
        typeof part.content === 'string' ? Buffer.from(part.content) : part.content
      return [Buffer.from(head), content, Buffer.from('\r\n')]
    }),
    Buffer.from(`--${BOUNDARY}--\r\n`),
  ])

const post = async (body: Buffer, contentType = `multipart/form-data; boundary=${BOUNDARY}`) => {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {'Content-Type': contentType},
    body: new Uint8Array(body),
  })
  const text = await response.text()
  return {status: response.status, text}
}

const rejection = async () => {
  try {
    await lastResult
  } catch (error) {
    return error
  }
  throw new Error('Expected the upload to be rejected.')
}

describe('blob.digestRequest', () => {
  it('stores the file in the temp directory and collects fields', async () => {
    const result = await post(
      multipart([
        {name: 'seasonId', content: 'season-1'},
        {name: 'file', filename: 'Members.CSV', type: 'text/csv', content: 'a,b\n1,2\n'},
      ]),
    )
    expect(result.status).toBe(200)
    const [files, fields] = await (lastResult ?? Promise.reject(new Error('no request')))
    expect(fields.get('seasonId')).toBe('season-1')
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      filename: 'Members.CSV',
      extension: '.csv',
      mimetype: 'text/csv',
      encoding: '7bit',
    })
    expect(files[0].filepath.startsWith(os.tmpdir())).toBe(true)
    expect(files[0].filepath).toMatch(/upload-.+\.csv$/)

    // reading the upload returns its contents and removes the temp file
    const buffer = await blob.filepathBuffer(files[0].filepath)
    expect(buffer.toString('utf8')).toBe('a,b\n1,2\n')
    expect(await fs.pathExists(files[0].filepath)).toBe(false)
  })

  it('uses a .bin extension for files without one', async () => {
    await post(multipart([{name: 'file', filename: 'README', content: 'hello'}]))
    const [files] = await (lastResult ?? Promise.reject(new Error('no request')))
    expect(files[0].extension).toBe('')
    expect(files[0].filepath).toMatch(/\.bin$/)
    await blob.filepathBuffer(files[0].filepath)
  })

  it('skips file parts without a filename', async () => {
    const result = await post(
      multipart([
        {name: 'file', filename: '   ', content: 'ignored'},
        {name: 'note', content: 'kept'},
      ]),
    )
    expect(result.status).toBe(200)
    expect(JSON.parse(result.text)).toEqual({files: [], fields: [['note', 'kept']]})
  })

  it('rejects more than one file', async () => {
    const result = await post(
      multipart([
        {name: 'file', filename: 'one.csv', content: 'one'},
        {name: 'file', filename: 'two.csv', content: 'two'},
      ]),
    )
    expect(result.status).toBe(429)
    expect(await rejection()).toMatchObject({errorCode: 'upload.files_limit'})
    // cleanup is attempted for the first file's temp path
    expect(removed).toHaveLength(1)
  })

  it('removes the temp file of an upload rejected for too many files', async () => {
    // open the temp file late so the files limit is always hit before the
    // write stream has created it
    vi.spyOn(fs, 'createWriteStream').mockImplementation((filepath, options) =>
      nodeFs.createWriteStream(filepath, {
        ...(typeof options === 'object' ? options : {}),
        fs: {
          open: (...args: Parameters<typeof nodeFs.open>) => {
            setTimeout(() => nodeFs.open(...args), 30)
          },
          write: nodeFs.write,
          close: nodeFs.close,
        },
      }),
    )
    const result = await post(
      multipart(
        Array.from({length: 4}, (_, index) => ({
          name: 'file',
          filename: `file${index}.csv`,
          content: `content ${index}`,
        })),
      ),
    )
    expect(result.status).toBe(429)
    expect(await rejection()).toMatchObject({errorCode: 'upload.files_limit'})
    expect(removed).toHaveLength(1)
    // give a late-opening write stream the chance to recreate the file
    await new Promise((resolve) => setTimeout(resolve, 60))
    for (const filepath of removed) {
      expect(await fs.pathExists(filepath)).toBe(false)
    }
  })

  it('rejects too many fields', async () => {
    const fields = Array.from({length: 17}, (_, index) => ({
      name: `field${index}`,
      content: 'x',
    }))
    const result = await post(multipart(fields))
    expect(result.status).toBe(429)
    expect(await rejection()).toMatchObject({errorCode: 'upload.fields_limit'})
  })

  it('rejects files over 5MB and removes the partial file', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const result = await post(
        multipart([
          {name: 'file', filename: 'big.csv', content: Buffer.alloc(5 * 1024 * 1024 + 1, 'a')},
        ]),
      )
      expect(result.status).toBe(413)
      const error = await rejection()
      expect(isAppError(error)).toBe(true)
      expect(error).toMatchObject({statusCode: 413, errorCode: 'upload.size_limit'})
      expect(removed).toHaveLength(1)
      expect(await fs.pathExists(removed[0])).toBe(false)
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('rejects a request that is not multipart as a bad request', async () => {
    const result = await post(
      Buffer.from(JSON.stringify({payload: {}})),
      'application/json',
    )
    expect(result.status).toBe(400)
    const error = await rejection()
    expect(isAppError(error)).toBe(true)
    expect(error).toMatchObject({
      statusCode: 400,
      errorCode: 'upload.unsupported_content_type',
    })
    expect(removed).toEqual([])
  })

  it('rejects a request that is aborted mid-upload', async () => {
    const client = http.request(baseUrl, {
      method: 'POST',
      agent: false,
      headers: {'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`},
    })
    client.on('error', () => undefined)
    const partial = multipart([{name: 'file', filename: 'slow.csv', content: 'x'.repeat(1000)}])
    client.write(partial.subarray(0, 300))
    await vi.waitFor(() => expect(lastResult).toBeDefined())
    await new Promise((resolve) => setTimeout(resolve, 20))
    client.destroy()

    const error = await rejection()
    expect(isAppError(error)).toBe(true)
    expect(error).toMatchObject({statusCode: 400, errorCode: 'upload.aborted'})
    await vi.waitFor(() => expect(removed).toHaveLength(1))
  })
})
