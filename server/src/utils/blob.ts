import {badRequestError, tooManyRequestsError, toAppError} from '@shared/errors'
import os from 'os'
import path from 'path'
import createBusboy from 'busboy'
import fs from 'fs-extra'
import {IncomingMessage} from 'http'
import {random} from './random'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_UPLOAD_FILES = 1
const MAX_UPLOAD_FIELDS = 16

const cleanupFiles = async (filepaths: string[]) => {
  await Promise.all(
    filepaths.map((filepath) => fs.remove(filepath).catch(() => {})),
  )
}

export const blob = {
  digestRequest(req: IncomingMessage) {
    return new Promise<
      [
        Array<{
          filepath: string
          filename: string
          extension: string
          mimetype: string
          encoding: string
        }>,
        Map<string, string | undefined>,
      ]
    >((resolve, reject) => {
      const busboy = createBusboy({
        headers: req.headers as any,
        limits: {
          fileSize: MAX_UPLOAD_BYTES,
          files: MAX_UPLOAD_FILES,
          fields: MAX_UPLOAD_FIELDS,
        },
      })
      const fields = new Map<string, string | undefined>()
      const files: Array<{
        filepath: string
        filename: string
        extension: string
        mimetype: string
        encoding: string
      }> = []
      const filepaths: string[] = []
      const uploads: Promise<void>[] = []
      let done = false

      const fail = async (error: unknown) => {
        if (done) return
        done = true
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
        if (!filename?.trim()) {
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
        const upload = new Promise<void>((ok, no) => {
          output.on('finish', ok)
          output.on('error', no)
          file.on('error', no)
          file.on('limit', () =>
            no(
              tooManyRequestsError('Upload exceeded size limit.', {
                errorCode: 'upload.size_limit',
              }),
            ),
          )
        }).catch((error) => {
          if (!done) throw error
        })
        file.pipe(output)
        files.push({
          filename,
          filepath,
          extension,
          mimetype: mimeType,
          encoding,
        })
        uploads.push(upload)
      })

      busboy.on('finish', async () => {
        if (done) return
        try {
          await Promise.all(uploads)
          done = true
          resolve([files, fields])
        } catch (error) {
          await fail(error)
        }
      })

      req.pipe(busboy)
    })
  },

  async filepathBuffer(filepath: string) {
    try {
      return await fs.readFile(filepath)
    } finally {
      await fs.remove(filepath).catch(() => {})
    }
  },
}
