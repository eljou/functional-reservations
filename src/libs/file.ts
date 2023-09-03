import fs from 'fs'
import { Task } from 'data.task.ts'
import { Failure } from './failure'

type IOFailure = Failure<'IO_ERROR'>
const IOFailure = {
  create: (msg: string, err: Error): IOFailure => Failure.create('IO_ERROR', msg, err),
}

export const fileExists = (path: string) => new Task<IOFailure, boolean>((rej, res) => res(fs.existsSync(path)))

export const fsReadFile = (path: string) =>
  new Task<IOFailure, string>((rej, res) =>
    fs.readFile(path, { encoding: 'utf-8' }, (err, data) =>
      err != null ? rej(IOFailure.create(`Failure reading file: ${path}`, err)) : res(data),
    ),
  )

export const fsAppendToFile = (path: string, data: string) =>
  new Task<IOFailure, void>((rej, res) =>
    fs.appendFile(path, data + '\n', { encoding: 'utf-8' }, err =>
      err != null ? rej(IOFailure.create(`Failure writing to file: ${path}`, err)) : res(),
    ),
  )
