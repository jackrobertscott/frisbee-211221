import config from '../config'
import AWS, {S3, SES, SNS} from 'aws-sdk'
/**
 *
 */
AWS.config.update({
  accessKeyId: config.AWSAccessKeyId,
  secretAccessKey: config.AWSAccessKeySecret,
  region: config.AWSRegion,
})
/**
 *
 */
export default {
  /**
   *
   */
  get s3() {
    return new S3({
      apiVersion: '2006-03-01',
    })
  },
  /**
   *
   */
  get ses() {
    return new SES({
      apiVersion: '2010-12-01',
    })
  },
  /**
   *
   */
  get sns() {
    return new SNS({
      apiVersion: '2010-03-31',
    })
  },
}
