import {
  badRequestError,
  payloadTooLargeError,
  tooManyRequestsError,
  toAppError,
} from '@shared/errors'
import os from 'os'
import path from 'path'
import createBusboy from 'busboy'
import fs from 'fs-extra'
import {IncomingMessage} from 'http'
import {random} from '../utils/random'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_UPLOAD_FILES = 1
const MAX_UPLOAD_FIELDS = 16

const cleanupFiles = async (filepaths: string[]) => {
  await Promise.all(
    filepaths.map((filepath) => fs.remove(filepath).catch(() => {})),
  )
}

type TUploadedFile = {
  filepath: string
  filename: string
  extension: string
  mimetype: string
  encoding: string
}

const createUploadParser = (req: IncomingMessage) => {
  try {
    return createBusboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: MAX_UPLOAD_FILES,
        fields: MAX_UPLOAD_FIELDS,
      },
    })
  } catch (error) {
    // busboy throws synchronously for a missing or non-multipart content type
    throw badRequestError('Upload must be sent as multipart form data.', {
      errorCode: 'upload.unsupported_content_type',
      cause: error,
    })
  }
}

export const blob = {
  digestRequest(req: IncomingMessage) {
    return new Promise<[TUploadedFile[], Map<string, string | undefined>]>(
      (resolve, reject) => {
        let busboy: ReturnType<typeof createBusboy>
        try {
          busboy = createUploadParser(req)
        } catch (error) {
          req.resume()
          reject(toAppError(error))
          return
        }
        const fields = new Map<string, string | undefined>()
        const files: TUploadedFile[] = []
        const filepaths: string[] = []
        const outputs: fs.WriteStream[] = []
        // settles once each write stream has released its file descriptor,
        // so cleanup never races a stream that is still opening its file
        const closed: Promise<void>[] = []
        let done = false

        const fail = async (error: unknown) => {
          if (done) return
          done = true
          req.unpipe(busboy)
          req.resume()
          outputs.forEach((output) => output.destroy())
          await Promise.all(closed)
          await cleanupFiles(filepaths)
          reject(toAppError(error))
        }

        req.on('aborted', () =>
          fail(
            badRequestError('Upload was aborted.', {
              errorCode: 'upload.aborted',
            }),
          ),
        )
        req.on('error', fail)
        busboy.on('field', (fieldname, val) => fields.set(fieldname, val))
        busboy.on('filesLimit', () =>
          fail(
            tooManyRequestsError('Too many files were uploaded.', {
              errorCode: 'upload.files_limit',
            }),
          ),
        )
        busboy.on('fieldsLimit', () =>
          fail(
            tooManyRequestsError('Too many fields were uploaded.', {
              errorCode: 'upload.fields_limit',
            }),
          ),
        )
        busboy.on('partsLimit', () =>
          fail(
            tooManyRequestsError('Too many parts were uploaded.', {
              errorCode: 'upload.parts_limit',
            }),
          ),
        )
        busboy.on('error', fail)

        busboy.on('file', (fieldname, file, {filename, encoding, mimeType}) => {
          if (done || !filename?.trim()) {
            file.resume()
            return
          }
          const extension = path.extname(filename).toLowerCase()
          const filepath = path.join(
            os.tmpdir(),
            `upload-${random.generateId()}${extension || '.bin'}`,
          )
          filepaths.push(filepath)
          const output = fs.createWriteStream(filepath, {flags: 'wx'})
          outputs.push(output)
          closed.push(new Promise<void>((ok) => output.on('close', ok)))
          output.on('error', fail)
          file.on('error', fail)
          file.on('limit', () => {
            file.unpipe(output)
            file.resume()
            void fail(
              payloadTooLargeError('Upload exceeded size limit.', {
                errorCode: 'upload.size_limit',
              }),
            )
          })
          file.pipe(output)
          files.push({
            filename,
            filepath,
            extension,
            mimetype: mimeType,
            encoding,
          })
        })

        busboy.on('finish', async () => {
          if (done) return
          // close follows finish for each stream; any stream error has
          // already called fail, which marks the request as done
          await Promise.all(closed)
          if (done) return
          done = true
          resolve([files, fields])
        })

        req.pipe(busboy)
      },
    )
  },

  async filepathBuffer(filepath: string) {
    try {
      return await fs.readFile(filepath)
    } finally {
      await fs.remove(filepath).catch(() => {})
    }
  },
}
