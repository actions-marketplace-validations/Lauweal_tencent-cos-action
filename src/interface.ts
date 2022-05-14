import COS from 'cos-nodejs-sdk-v5'

export interface IOptions {
  cli: COS
  bucket: string
  region: string
  localPath: string
  remotePath: string
  clean: boolean
}
