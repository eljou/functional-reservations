import { Failure, Task, Funcs } from '../../libs'
import { Reservation } from '../01-domain/reservation'
import { DbFailure, ReservationsRepository } from '../01-domain/reservation-repository'
const { pipe } = Funcs

export const makeGetReservationById =
  (db: ReservationsRepository) =>
  (id: string): Task<DbFailure | Failure<'NOT_FOUND'>, Reservation> =>
    db
      .findOneWhen(r => r.id == id)
      .chain(
        pipe(
          mb => mb.toEither(Failure.create('NOT_FOUND', `Reservation with id: ${id} was not found`)),
          Task.fromEither,
        ),
      )
