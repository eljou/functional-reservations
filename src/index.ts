import { Task } from 'data.task.ts'
import { match } from 'ts-pattern'
import { AppError } from './shared'
import { Reservation } from 'domain/reservation'
import { tryAcceptReservation } from 'domain/try-accept-reservation'
import { readLn } from 'infra'

// - main -
readLn('Your name: ')
  .chain(name =>
    readLn('Number of seats: ')
      .chain(
        (seats): Task<AppError<'VALIDATION'>, number> =>
          isNaN(parseInt(seats))
            ? Task.rejected(AppError.createInfra('VALIDATION', new Error('seats is NaN')))
            : Task.of(parseInt(seats)),
      )
      .map(seats => Reservation.createNew(name, seats, new Date())),
  )
  .chain(tryAcceptReservation)
  .fork(
    err =>
      match(err)
        .with({ code: 'INPUT' }, ex => console.error(ex.code, ' - ', ex.msg))
        .with({ code: 'VALIDATION' }, ex => console.error(ex.code, ' - ', ex.msg))
        .with({ code: 'DB_ERROR' }, ex => console.error(ex.code, ' - ', ex.msg))
        .with({ code: 'NO_CAPACITY' }, ex => console.error(ex.code, ' - ', ex.msg))
        .with({ code: 'JSON_PARSE' }, ex => console.error(ex.code, ' - ', ex.msg))
        .exhaustive(),
    console.log,
  )
