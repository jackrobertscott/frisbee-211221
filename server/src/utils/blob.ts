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
/**
 *
 */
export const blob = {
  /**
   *
   */
  digestRequest(req: IncomingMessage) {
    const busboy = createBusboy({
      headers: req.headers as any,
    })
    const fields = new Map<string, string | undefined>()
    const files: Array<{
      filepath: string
      filename: string
      extension: string
      mimetype: string
      encoding: string
    }> = []
    busboy.on('field', (fieldname, val) => fields.set(fieldname, val))
    busboy.on('file', (fieldname, file, {filename, encoding, mimeType}) => {
      const filepath = path.join(os.tmpdir(), path.basename(fieldname))
      const extension = path.extname(filename).toLowerCase()
      file.pipe(fs.createWriteStream(filepath))
      files.push({
        filename,
        filepath,
        extension,
        mimetype: mimeType,
        encoding,
      })
    })
    const uploadPromise = new Promise<[typeof files, typeof fields]>((ok) => {
      busboy.on('finish', () => ok([files, fields]))
    })
    req.pipe(busboy)
    return uploadPromise
  },
  /**
   *
   */
  async filepathBuffer(filepath: string) {
    return fs.readFile(filepath)
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
