import { pipe } from 'ramda'
import { Schema } from 'zod'
import { Either, List } from 'monet'
import { deserialize, serialize } from 'bson'
import { match } from 'ts-pattern'
import { ParsingFailure } from './failure'

export const jsonParse = (obj: string): Either<ParsingFailure, unknown> =>
  Either.fromTry(() => JSON.parse(obj) as unknown).leftMap(ParsingFailure.create)

export const parseStrToNumber = (str: string): Either<ParsingFailure, number> =>
  Either.of<ParsingFailure, number>(parseInt(str)).chain(
    (num): Either<ParsingFailure, number> =>
      isNaN(num) ? Either.left(ParsingFailure.create(new Error(`${str}: is not a number`))) : Either.right(num),
  )

export const dateToStr = (d: Date): string => `${d.getFullYear()}/${d.getMonth()}/${d.getDay()}`

export const serializeToBase64: (ob: object) => string = pipe(
  serialize,
  uIntArr => Buffer.from(uIntArr),
  buffer => buffer.toString('base64'),
)

export const deserializeFromBase64 =
  <T>(schema: Schema<T>): ((str: string) => Either<ParsingFailure, T>) =>
  str =>
    Either.of<ParsingFailure, Buffer>(Buffer.from(str, 'base64'))
      .chain(b => Either.fromTry(() => deserialize(b)).leftMap(ParsingFailure.create))
      .map(doc => schema.safeParse(doc))
      .chain(doc =>
        match<ReturnType<typeof schema.safeParse>, Either<ParsingFailure, T>>(doc)
          .with({ success: true }, r => Either.right(r.data))
          .with({ success: false }, r => Either.left(ParsingFailure.create(r.error)))
          .exhaustive(),
      )

export const logAndByPass =
  <X = unknown>(label: string) =>
  (x: X): X => {
    console.group(label)
    console.dir(x)
    console.groupEnd()
    return x
  }

export const ignore = () => {}

export const takeN =
  <T>(n: number) =>
  (list: List<T>): List<T> => {
    const take = (xs: List<T>, i: number = n): List<T> => {
      const head = xs.head()

      if (!head) return xs
      if (i == 0) return List.fromArray([])
      if (i == 1) return List.of(head)
      return (List.of(head) as List<T>).concat(take(xs.tail(), i - 1))
    }

    return take(list.reverse())
  }
