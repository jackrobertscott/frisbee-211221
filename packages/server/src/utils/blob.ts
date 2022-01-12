import os from 'os'
import path from 'path'
import createBusboy from 'busboy'
import fs from 'fs-extra'
import config from '../config'
import {IncomingMessage} from 'http'
import {random} from './random'
import aws from './aws'
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
      const extension = path.extname(filename)
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
  async uploadBuffer(data: {
    body: Buffer
    mimetype: string
    extension: string
  }) {
    if (!config.AWSBucket)
      throw new Error('Missing AWS bucket environment variable.')
    const raw = await aws.s3
      .upload({
        Body: data.body,
        Key: random.randomString(24).concat(data.extension),
        Bucket: path.join(config.AWSBucket, data.mimetype),
        ACL: 'public-read',
        ContentType: data.mimetype,
      })
      .promise()
    return {
      key: raw.Key,
      bucket: raw.Bucket,
      url: raw.Location,
    }
  },
}
