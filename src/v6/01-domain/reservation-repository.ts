import { List, Task, Maybe, Failure } from '../../libs'
import { Reservation } from './reservation'

export type DbFailure = Failure<'DB_FAILURE'>
export const DbFailure = {
  create: (err: Error): DbFailure => Failure.create('DB_FAILURE', `Database Error: ${err.message}`, err),
}

export type ReservationsRepository = {
  findWhen: (predicate: (r: Reservation) => boolean) => Task<DbFailure, List<Reservation>>
  findOneWhen: (predicate: (r: Reservation) => boolean) => Task<DbFailure, Maybe<Reservation>>
  saveReservation: (r: Reservation) => Task<DbFailure, void>
}
