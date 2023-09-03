import { pipe } from 'ramda'
import { Schema } from 'zod'
import { Either } from 'monet'
import { deserialize, serialize } from 'bson'
import { match } from 'ts-pattern'
import { ParsingFailure } from './failure'

export const jsonParse = <T = unknown>(obj: string): Either<ParsingFailure, T> =>
  Either.fromTry(() => JSON.parse(obj)).leftMap(ParsingFailure.create)

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

type FromB64Deserializer<T> = (str: string) => Either<ParsingFailure, T>
export const deserializeFromBase64 =
  <T>(schema: Schema<T>): FromB64Deserializer<T> =>
  str =>
    Either.of<ParsingFailure, Buffer>(Buffer.from(str, 'base64'))
      .chain(b => Either.fromTry(() => deserialize(b)).leftMap(ParsingFailure.create))
      .chain(doc =>
        match<ReturnType<typeof schema.safeParse>, Either<ParsingFailure, T>>(schema.safeParse(doc))
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
