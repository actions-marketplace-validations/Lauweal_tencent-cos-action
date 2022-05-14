import * as core from '@actions/core'
import _path from 'path'
import fs from 'fs'
import {collectLocalFiles, collectRemoteFiles, findDeletedFiles} from './common'
import {IOptions} from './interface'

const dowloadFileFormCOS = async (cos: IOptions, path: string) => {
  core.info(`DOWLOAD FILE ----> ${path}`)
  let remotePath = cos.remotePath
  if (!!_path.extname(remotePath)) {
    remotePath = remotePath.replace(path, '')
  }

  const remoteFilePath = _path.join(remotePath, path)
  const localFilePath = _path.join(cos.localPath, path)
  return new Promise((resolve, reject) => {
    fs.writeFileSync(_path.join(cos.localPath, path), '')
    cos.cli.getObject(
      {
        Bucket: cos.bucket,
        Region: cos.region,
        Key: remoteFilePath,
        Output: fs.createWriteStream(localFilePath, {
          flags: 'w'
        })
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

const dowloadFiles = async (cos: IOptions, localFiles: Set<string>) => {
  const size = localFiles.size
  let index = 0
  let percent = 0
  for (const file of localFiles) {
    await dowloadFileFormCOS(cos, file)
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

const deleteFileFromLocal = (cos: IOptions, path: string) => {
  return new Promise((resolve, reject) => {
    fs.unlink(_path.join(cos.localPath, path), err => {
      if (err) {
        return reject(err)
      } else {
        return resolve(true)
      }
    })
  })
}

const cleanDeleteFiles = async (cos: IOptions, deleteFiles: Set<string>) => {
  const size = deleteFiles.size
  let index = 0
  let percent = 0
  for (const file of deleteFiles) {
    await deleteFileFromLocal(cos, file)
    index++
    percent = parseInt(((index / size) * 100) as any)
    console.log(
      `>> [${index}/${size}, ${percent}%] cleaned ${_path.join(
        cos.localPath,
        file
      )}`
    )
  }
}

export async function dowload(cos: IOptions) {
  const remoteFiles = await collectRemoteFiles(cos)
  if (!fs.existsSync(cos.localPath)) {
    fs.mkdirSync(cos.localPath, {recursive: true})
  }
  console.log(remoteFiles.size, 'files to be dowload')
  let cleanedFilesCount = 0
  if (cos.clean) {
    const localFiles = await collectLocalFiles(cos)
    const deletedFiles = findDeletedFiles(remoteFiles, localFiles)
    if (deletedFiles.size > 0) {
      console.log(`${deletedFiles.size} files to be cleaned`)
    }
    await cleanDeleteFiles(cos, deletedFiles)
    cleanedFilesCount = deletedFiles.size
  }
  await dowloadFiles(cos, remoteFiles)
  let cleanedFilesMessage = ''
  if (cleanedFilesCount > 0) {
    cleanedFilesMessage = `, cleaned ${cleanedFilesCount} files`
  }
}
