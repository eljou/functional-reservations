import { Maybe } from 'monet'

export type Failure<C extends string = string> = {
  code: C
  message: string
  error: Maybe<Error>
}

export const Failure = {
  create: <C extends string>(code: C, message: string, error?: Error): Failure<C> => ({
    code,
    message,
    error: error ? Maybe.of(error) : Maybe.none(),
  }),

  log: (f: Failure): void => {
    console.group(`== FAILURE: [ ${f.code} ] ==`)
    console.error(f.message)
    f.error.forEach(console.debug)
    console.groupEnd()
  },
}

export type ParsingFailure = Failure<'PARSING'>
export const ParsingFailure = {
  create: (err: Error): ParsingFailure => Failure.create('PARSING', `Error at parsing: ${err.message}`, err),
}
