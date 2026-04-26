import os from 'os'
import path from 'path'
import createBusboy from 'busboy'
import fs from 'fs-extra'
import config from '../config'
import {IncomingMessage} from 'http'
import {random} from './random'
import {S3Client, PutObjectCommand, GetObjectCommand} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'
/**
 *
 */
const s3Client = new S3Client({
  region: config.AWSBucketRegion,
})

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_UPLOAD_FILES = 1
const MAX_UPLOAD_FIELDS = 16

const cleanupFiles = async (filepaths: string[]) => {
  await Promise.all(filepaths.map((filepath) => fs.remove(filepath).catch(() => {})))
}
/**
 *
 */
export const blob = {
  /**
   *
   */
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
        reject(error instanceof Error ? error : new Error(String(error)))
      }

      req.on('aborted', () => fail(new Error('Upload was aborted.')))
      req.on('error', fail)
      busboy.on('field', (fieldname, val) => fields.set(fieldname, val))
      busboy.on('filesLimit', () => fail(new Error('Too many files were uploaded.')))
      busboy.on('fieldsLimit', () => fail(new Error('Too many fields were uploaded.')))
      busboy.on('partsLimit', () => fail(new Error('Too many parts were uploaded.')))
      busboy.on('error', fail)

      busboy.on('file', (fieldname, file, {filename, encoding, mimeType}) => {
        if (!filename?.trim()) {
          file.resume()
          return
        }
        const extension = path.extname(filename).toLowerCase()
        const filepath = path.join(
          os.tmpdir(),
          `upload-${random.generateId()}${extension || '.bin'}`
        )
        filepaths.push(filepath)
        const output = fs.createWriteStream(filepath, {flags: 'wx'})
        const upload = new Promise<void>((ok, no) => {
          output.on('finish', ok)
          output.on('error', no)
          file.on('error', no)
          file.on('limit', () => no(new Error('Upload exceeded size limit.')))
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
  /**
   *
   */
  async filepathBuffer(filepath: string) {
    try {
      return await fs.readFile(filepath)
    } finally {
      await fs.remove(filepath).catch(() => {})
    }
  },
  /**
   *
   */
  async uploadBuffer({
    body,
    mimetype,
    extension,
    folder,
  }: {
    body: Buffer
    mimetype: string
    extension: string
    folder: string
  }) {
    if (!config.AWSBucket)
      throw new Error('Missing AWS bucket environment variable.')
    const filename = random.randomString(24).concat(extension)
    const key = path.join(folder, filename)
    const bucket = config.AWSBucket
    await s3Client.send(
      new PutObjectCommand({
        Key: key,
        Bucket: bucket,
        ContentType: mimetype,
        Body: body,
      })
    )
    return {
      key,
      bucket,
      mimetype,
      extension,
      filename,
    }
  },
  /**
   *
   */
  async getObjectUrl(key: string, bucket: string = config.AWSBucket) {
    const command = new GetObjectCommand({Key: key, Bucket: bucket})
    return getSignedUrl(s3Client, command)
  },
}
