import * as core from '@actions/core'
import COS from 'cos-nodejs-sdk-v5'
import _path from 'path'
import {upload} from './upload'
import {dowload} from './dowload'

interface IOptions {
  cli: COS
  bucket: string
  region: string
  localPath: string
  remotePath: string
  clean: boolean
}

async function run(): Promise<void> {
  const cos = {
    cli: new COS({
      SecretId: core.getInput('secret_id'),
      SecretKey: core.getInput('secret_key'),
      Domain:
        core.getInput('accelerate') === 'true'
          ? '{Bucket}.cos.accelerate.myqcloud.com'
          : undefined
    }),
    type: core.getInput('type'),
    bucket: core.getInput('cos_bucket'),
    region: core.getInput('cos_region'),
    localPath: _path.join(process.cwd(), core.getInput('local_path')),
    remotePath: core.getInput('remote_path'),
    clean: core.getInput('clean') === 'true'
  }
  if (cos.type === 'upload') {
    upload(cos)
      .then(res => {
        core.setOutput('path', res)
      })
      .catch(reason => {
        core.setFailed(`fail to upload files to cos: ${reason.message}`)
      })
  } else {
    dowload(cos).catch(reason => {
      core.setFailed(`fail to dowload files to cos: ${reason.message}`)
    })
  }
}

run()
