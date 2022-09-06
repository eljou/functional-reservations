import { Either } from 'monet'

export interface AppError<C extends string> {
  code: C
  kind: 'domain' | 'infrastructure'
  msg: string
  stack: string
}

export const AppError = {
  createDomain: <C extends string>(code: C, err: Error): AppError<C> => {
    return {
      code,
      kind: 'domain',
      msg: err.message,
      stack: err.stack ?? 'No stack trace',
    }
  },
  createInfra: <C extends string>(code: C, err: Error): AppError<C> => {
    return {
      code,
      kind: 'infrastructure',
      msg: err.message,
      stack: err.stack ?? 'No stack trace',
    }
  },
}

export const jsonParse = <T = unknown>(obj: string): Either<AppError<'JSON_PARSE'>, T> =>
  Either.fromTry(() => {
    try {
      return JSON.parse(obj)
    } catch (error) {
      throw AppError.createInfra('JSON_PARSE', error as Error)
    }
  })

export const dateToStr = (d: Date): string =>
  `${d.getFullYear()}/${d.getMonth()}/${d.getDay()}`
