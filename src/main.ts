import * as core from '@actions/core'
import COS from 'cos-nodejs-sdk-v5'
import fs from 'fs'
import _path from 'path'

interface IOptions {
  cli: COS
  bucket: string
  region: string
  localPath: string
  remotePath: string
  clean: boolean
}

async function walk(path: string, callback: (path: string) => void) {
  const status = await fs.promises.lstat(path)
  if (!status.isDirectory()) {
    return await callback(path)
  }
  const dir = await fs.promises.opendir(path)
  for await (const dirent of dir) {
    await walk(_path.join(path, dirent.name), callback)
  }
}

const uploadFileToCOS = async (cos: IOptions, path: string) => {
  core.info(`UPLOAD FILE ----> ${path}`)
  const status = await fs.promises.lstat(cos.localPath)
  let localPath = cos.localPath
  if (!status.isDirectory()) {
    localPath = localPath.replace(path, '')
  }
  return new Promise((resolve, reject) => {
    cos.cli.putObject(
      {
        Bucket: cos.bucket,
        Region: cos.region,
        Key: _path.join(cos.remotePath, path),
        StorageClass: 'STANDARD',
        Body: fs.createReadStream(_path.join(localPath, path))
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

const deleteFileFromCOS = (cos: IOptions, path: string) => {
  return new Promise((resolve, reject) => {
    cos.cli.deleteObject(
      {
        Bucket: cos.bucket,
        Region: cos.region,
        Key: _path.join(cos.remotePath, path)
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

const listFilesOnCOS = (cos: IOptions) => {
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

const collectLocalFiles = async (cos: IOptions) => {
  const root = cos.localPath
  const files = new Set<string>()
  await walk(root, path => {
    files.add(path.split(_path.sep).pop() as string)
  })
  return files
}

const uploadFiles = async (cos: IOptions, localFiles: Set<string>) => {
  const size = localFiles.size
  let index = 0
  let percent = 0
  for (const file of localFiles) {
    await uploadFileToCOS(cos, file)
    index++
    percent = parseInt(((index / size) * 100) as any)
    console.log(
      `>> [${index}/${size}, ${percent}%] uploaded ${_path.join(
        cos.localPath,
        file
      )}`
    )
  }
}

const collectRemoteFiles = async (cos: IOptions) => {
  const files = new Set<string>()
  let data: COS.GetBucketResult
  let nextMarker = null

  do {
    data = await listFilesOnCOS(cos)
    for (const e of data.Contents) {
      let p = e.Key.substring(cos.remotePath.length)
      for (; p[0] === '/'; ) {
        p = p.substring(1)
      }
      files.add(p)
    }
    nextMarker = data.NextMarker
  } while (data.IsTruncated === 'true')

  return files
}

const findDeletedFiles = (
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

const cleanDeleteFiles = async (cos: IOptions, deleteFiles: Set<string>) => {
  const size = deleteFiles.size
  let index = 0
  let percent = 0
  for (const file of deleteFiles) {
    await deleteFileFromCOS(cos, file)
    index++
    percent = parseInt(((index / size) * 100) as any)
    console.log(
      `>> [${index}/${size}, ${percent}%] cleaned ${_path.join(
        cos.remotePath,
        file
      )}`
    )
  }
}

const process = async (cos: IOptions) => {
  const localFiles = await collectLocalFiles(cos)
  console.log(localFiles.size, 'files to be uploaded')
  await uploadFiles(cos, localFiles)
  let cleanedFilesCount = 0
  if (cos.clean) {
    const remoteFiles = await collectRemoteFiles(cos)
    const deletedFiles = findDeletedFiles(localFiles, remoteFiles)
    if (deletedFiles.size > 0) {
      console.log(`${deletedFiles.size} files to be cleaned`)
    }
    await cleanDeleteFiles(cos, deletedFiles)
    cleanedFilesCount = deletedFiles.size
  }
  let cleanedFilesMessage = ''
  if (cleanedFilesCount > 0) {
    cleanedFilesMessage = `, cleaned ${cleanedFilesCount} files`
  }
  console.log(`uploaded ${localFiles.size} files${cleanedFilesMessage}`)
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
    bucket: core.getInput('cos_bucket'),
    region: core.getInput('cos_region'),
    localPath: core.getInput('local_path'),
    remotePath: core.getInput('remote_path'),
    clean: core.getInput('clean') === 'true'
  }

  process(cos).catch(reason => {
    core.setFailed(`fail to upload files to cos: ${reason.message}`)
  })
}

run()
