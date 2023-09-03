import { createInterface } from 'readline'
import { Task } from 'data.task.ts'
import { Failure } from './failure'

export const readLn = (str: string): Task<Failure<'INPUT'>, string> =>
  Task.fromLazyPromise(
    () =>
      new Promise((resolve, reject) => {
        try {
          const readlineIface = createInterface({
            input: process.stdin,
            output: process.stdout,
          })

          return readlineIface.question(str, input => {
            readlineIface.close()
            return resolve(input)
          })
        } catch (error) {
          const err = error as Error
          return reject(Failure.create('INPUT', err.message, err))
        }
      }),
  )
