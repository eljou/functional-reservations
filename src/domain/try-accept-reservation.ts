import { Task } from 'data.task.ts'
import { DB, DbErrors } from 'db'
import { AppError } from 'shared'
import { Reservation } from './reservation'

const dbKind = 'file'

type UseCaseErrors = DbErrors | AppError<'NO_CAPACITY'>
export const tryAcceptReservation = (
  reservation: Reservation,
): Task<UseCaseErrors, string> =>
  DB.readReservations(dbKind)(reservation.date)
    .map(Reservation.accept(10)(reservation))
    .chain(Task.fromEither)
    .chain(DB.saveReservation(dbKind))
