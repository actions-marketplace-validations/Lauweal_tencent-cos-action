import fs from 'fs'
import _path from 'path'
import COS from 'cos-nodejs-sdk-v5'
import {IOptions} from './interface'

export async function walk(path: string, callback: (path: string) => void) {
  if (path.includes('.') || !fs.statSync(path).isDirectory()) {
    return await callback(path)
  }
  const dir = await fs.promises.opendir(path)
  for await (const dirent of dir) {
    await walk(_path.join(path, dirent.name), callback)
  }
}

export async function walKRemote(
  cos: IOptions,
  path: string,
  callback: (path: string) => void
) {
  if (path.includes('.') || !fs.statSync(path).isDirectory()) {
    const {Contents} = await listFilesOnCOS({...cos, remotePath: path})
    return await callback(path)
  }
  const {Contents} = await listFilesOnCOS({...cos, remotePath: path})
  await Promise.allSettled(Contents.map(c => walKRemote(cos, c.Key, callback)))
}

export const collectLocalFiles = async (cos: IOptions) => {
  const root = cos.localPath
  const files = new Set<string>()
  await walk(root, path => {
    files.add(path.split(_path.sep).pop() as string)
  })
  return files
}

export const listFilesOnCOS = (cos: IOptions) => {
  return new Promise<COS.GetBucketResult>((resolve, reject) => {
    cos.cli.getBucket(
      {
        Bucket: cos.bucket,
        Region: cos.region,
        Prefix: cos.remotePath
      },
      function (err, data) {
        if (err) {
          return reject(err)
        } else {
          return resolve(data)
        }
      }
    )
  })
}

export const collectRemoteFiles = async (cos: IOptions) => {
  const files = new Set<string>()
  let data: COS.GetBucketResult
  let nextMarker = null
  await walKRemote(cos, cos.remotePath, path => {
    files.add(path.split(_path.sep).pop() as string)
  })

  return files
}

export const findDeletedFiles = (
  localFiles: Set<string>,
  remoteFiles: Set<string>
) => {
  const deletedFiles = new Set<string>()
  for (const file of remoteFiles) {
    if (localFiles.has(file)) {
      deletedFiles.add(file)
    }
  }
  return deletedFiles
}
