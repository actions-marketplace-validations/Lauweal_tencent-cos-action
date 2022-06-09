import fs from 'fs'
import _path from 'path'
import COS from 'cos-nodejs-sdk-v5'
import {IOptions} from './interface'

function isFile(path: string) {
  const _paths = path.split('/')
  console.log(
    _paths[_paths.length - 1],
    _paths[_paths.length - 1].includes('.')
  )
  return _paths[_paths.length - 1].includes('.')
}

export function mkdir(path: string) {
  let dir = path
  if (isFile(path)) {
    let filepath = path.split('/')
    dir = filepath.splice(0, filepath.length - 1).join('/')
    dir = dir.startsWith('/') ? dir : `/${dir}`
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true})
  }
}

export async function walk(path: string, callback: (path: string) => void) {
  if (isFile(path)) {
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
): Promise<void | any> {
  if (isFile(path)) {
    return await callback(path)
  }
  const {Contents} = await listFilesOnCOS({...cos, remotePath: path})
  const files = Contents.map(c => c.Key).filter(f => isFile(f))
  return await Promise.all(files.map(c => walKRemote(cos, c, callback)))
}

export const collectLocalFiles = async (cos: IOptions) => {
  const root = cos.localPath
  const files = new Set<string>()
  await walk(root, path => {
    if (isFile(cos.localPath)) {
      const _paths = path.split('/')
      files.add(_paths[_paths.length - 1])
    } else {
      files.add(path.replace(cos.localPath, ''))
    }
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
  await walKRemote(cos, cos.remotePath, path => {
    files.add(path.replace(cos.remotePath, ''))
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
