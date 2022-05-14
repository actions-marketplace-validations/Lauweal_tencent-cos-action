import fs from 'fs'
import _path from 'path'
import COS from 'cos-nodejs-sdk-v5'
import {IOptions} from './interface'

export async function walk(path: string, callback: (path: string) => void) {
  const status = await fs.promises.lstat(path)
  if (!status.isDirectory()) {
    return await callback(path)
  }
  const dir = await fs.promises.opendir(path)
  for await (const dirent of dir) {
    await walk(_path.join(path, dirent.name), callback)
  }
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

  do {
    data = await listFilesOnCOS(cos)
    let len = cos.remotePath.length
    if (!!_path.extname(cos.remotePath)) {
      let remotePaths = cos.remotePath.split('/')
      remotePaths.pop()
      len = remotePaths.join('/').length
    }
    for (const e of data.Contents) {
      let p = e.Key.substring(len)
      for (; p[0] === '/'; ) {
        p = p.substring(1)
      }
      files.add(p)
    }
    nextMarker = data.NextMarker
  } while (data.IsTruncated === 'true')

  return files
}

export const findDeletedFiles = (
  localFiles: Set<string>,
  remoteFiles: Set<string>
) => {
  const deletedFiles = new Set<string>()
  for (const file of remoteFiles) {
    if (!localFiles.has(file)) {
      deletedFiles.add(file)
    }
  }
  return deletedFiles
}
