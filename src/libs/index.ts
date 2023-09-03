import { randomBytes } from 'crypto'
import { match, P } from 'ts-pattern'
import { pipe, tap } from 'ramda'
import * as utils from './functions'
import * as File from './file'
export { Task } from 'data.task.ts'
export { Either, Maybe, List } from 'monet'
export { z, Schema } from 'zod'
export * from './console'
export * from './failure'

const Funcs = { pipe, tap, match, P, randomBytes, ...utils }
export { Funcs, File }
