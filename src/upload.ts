import * as core from '@actions/core'
import fs from 'fs'
import _path from 'path'
import {
  collectLocalFiles,
  collectRemoteFiles,
  findDeletedFiles,
  walk
} from './common'
import {IOptions} from './interface'

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

export const upload = async (cos: IOptions) => {
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
