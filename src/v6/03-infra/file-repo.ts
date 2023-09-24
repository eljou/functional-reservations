import { Reservation } from '../01-domain/reservation'
import { ReservationsRepository, DbFailure } from '../01-domain/reservation-repository'
import { z, Schema, File, ParsingFailure, Funcs, Task, List } from '../../libs'
const { serializeToBase64, deserializeFromBase64, pipe } = Funcs

export const makeFileRepo = (): ReservationsRepository => {
  const dbPath = './src/data.txt'

  const dbSchema: Schema<Reservation> = z.object({
    id: z.string(),
    clientName: z.string(),
    seats: z.number(),
    date: z.date(),
    accepted: z.boolean(),
  })

  const serializeReservation: (r: Reservation) => string = serializeToBase64

  const deserializeReservation = deserializeFromBase64(dbSchema)

  const getRecords = () =>
    File.fsReadFile(dbPath)
      .map(
        pipe(
          content => content.split('\n').filter(str => str.trim()),
          List.fromArray.bind(List),
          lines => lines.map(deserializeReservation),
          ls => ls.sequenceEither<ParsingFailure, Reservation>(),
        ),
      )
      .chain(Task.fromEither)
      .rejectMap(f => DbFailure.create(new Error(`${f.code}: ${f.message}`)))

  return {
    findOneWhen: predicate => getRecords().map(ls => ls.find(predicate)),

    findWhen: predicate => getRecords().map(ls => ls.filter(predicate)),

    saveReservation: reservation =>
      File.fsAppendToFile(dbPath, serializeReservation(reservation)).rejectMap(f =>
        DbFailure.create(new Error(`${f.code}: ${f.message}`)),
      ),
  }
}
