import { Task } from 'data.task.ts'
import { createInterface } from 'readline'
import { AppError } from 'shared'

export const readLn = (str: string): Task<AppError<'INPUT'>, string> =>
  Task.fromPromise(
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
        return reject(AppError.createInfra('INPUT', error as Error))
      }
    }),
  )
