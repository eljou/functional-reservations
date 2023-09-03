import { Either } from 'monet'
import { Failure } from './failure'

export const jsonParse = <T = unknown>(obj: string): Either<Failure<'JSON_PARSE'>, T> =>
  Either.fromTry(() => JSON.parse(obj)).leftMap(err =>
    Failure.create('JSON_PARSE', err.message, err),
  )

export const parseStrToNumber = (str: string): Either<Failure<'PARSING'>, number> =>
  Either.of<Failure<'PARSING'>, number>(parseInt(str)).chain(
    (num): Either<Failure<'PARSING'>, number> =>
      isNaN(num)
        ? Either.left(Failure.create('PARSING', `Invalid seats number of: ${str}`))
        : Either.right(num),
  )

export const dateToStr = (d: Date): string =>
  `${d.getFullYear()}/${d.getMonth()}/${d.getDay()}`

export const logAndByPass =
  <X = unknown>(label: string) =>
  (x: X): X => {
    console.group(label)
    console.dir(x)
    console.groupEnd()
    return x
  }

export const ignore = () => {}
