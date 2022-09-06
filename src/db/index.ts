import fs from 'fs'
import { map, pipe, filter } from 'ramda'
import { z } from 'zod'
import { Task } from 'data.task.ts'
import { AppError, dateToStr, jsonParse } from 'shared'
import { Either, List } from 'monet'
import { Reservation } from 'domain/reservation'

const fileExists = (path: string) =>
  new Task<AppError<'DB_ERROR'>, boolean>((rej, res) => fs.exists(path, res))

const fsReadFile = (path: string) =>
  new Task<AppError<'DB_ERROR'>, string>((rej, res) =>
    fs.readFile(path, { encoding: 'utf-8' }, (err, data) =>
      err != null ? rej(AppError.create('DB_ERROR', err)) : res(data),
    ),
  )

const fsWriteToFile = (path: string, data: string) =>
  new Task<AppError<'DB_ERROR'>, void>((rej, res) =>
    fs.writeFile(path, data, { encoding: 'utf-8' }, err =>
      err != null ? rej(AppError.create('DB_ERROR', err)) : res(),
    ),
  )

const memoryDb = new Map<string, Reservation>()

const dbPath = './src/db/reservations.json'

const reservationSchema = z.object({
  id: z.string(),
  clientName: z.string(),
  seats: z.number(),
  date: z.string(),
  accepted: z.boolean(),
})

const validateReservations = (
  json: unknown,
): Either<AppError<'JSON_PARSE'>, z.infer<typeof reservationSchema>[]> =>
  Either.fromTry(() => {
    try {
      return z.array(reservationSchema).parse(json)
    } catch (error) {
      throw AppError.create('JSON_PARSE', error as Error)
    }
  })

export type DbErrors = AppError<'DB_ERROR'> | AppError<'JSON_PARSE'>
export const DB = {
  readReservations:
    (dbType: 'file' | 'memory') =>
    (date: Date): Task<DbErrors, List<Reservation>> =>
      dbType == 'memory'
        ? Task.of<DbErrors, List<Reservation>>(List.fromArray([...memoryDb.values()]))
        : fileExists(dbPath)
            .chain(exists =>
              exists
                ? fsReadFile(dbPath)
                : fsWriteToFile(dbPath, '[]').chain(() => fsReadFile(dbPath)),
            )
            .map(str =>
              jsonParse(str)
                .chain(validateReservations)
                .map(
                  pipe(
                    map(Reservation.createFrom),
                    filter<Reservation>(r => dateToStr(r.date) === dateToStr(date)),
                    List.fromArray,
                  ),
                ),
            )
            .chain(Task.fromEither),

  saveReservation:
    (dbType: 'file' | 'memory') =>
    (reservation: Reservation): Task<DbErrors, string> =>
      dbType == 'memory'
        ? Task.of<DbErrors, typeof memoryDb>(
            memoryDb.set(reservation.id, reservation),
          ).map(() => reservation.id)
        : DB.readReservations(dbType)(reservation.date)
            .map(list => list.cons(reservation).toArray())
            .chain(xs => fsWriteToFile(dbPath, JSON.stringify(xs)))
            .map(() => reservation.id),
}
