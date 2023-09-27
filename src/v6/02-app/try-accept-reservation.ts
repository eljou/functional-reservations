import { Failure, Task, Funcs } from '../../libs'
import { DomainValidationFailure, Reservation } from '../01-domain/reservation'
import { DbFailure, ReservationsRepository } from '../01-domain/reservation-repository'
const { dateToStr, pipe } = Funcs

export type Input = Parameters<typeof Reservation.tryCreate>[0]
export type UseCaseErrors = DbFailure | Failure<'NO_CAPACITY'> | DomainValidationFailure

export const makeTryToReserve =
  (db: ReservationsRepository) =>
  (totalCapacity: number) =>
  (input: Input): Task<UseCaseErrors, Reservation> => {
    const sameDate = (a: Reservation) => (b: Reservation) => dateToStr(a.date) == dateToStr(b.date)
    const tryAcceptReservation = Reservation.tryAccept(totalCapacity)

    return Task.fromEither(Reservation.tryCreate(input))
      .chain(newReservation =>
        db.findWhen(sameDate(newReservation)).chain(pipe(tryAcceptReservation(newReservation), Task.fromEither)),
      )
      .chain(Task.tap(db.saveReservation))
  }
