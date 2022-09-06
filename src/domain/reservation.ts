import { pipe } from 'ramda'
import { randomBytes } from 'crypto'
import { Either, List } from 'monet'
import { AppError } from '../shared'

export interface Reservation {
  id: string
  clientName: string
  seats: number
  date: Date
  accepted: boolean
}
export const Reservation = {
  createNew: (clientName: string, seats: number, date: Date): Reservation => ({
    id: randomBytes(6).toString('hex'),
    clientName,
    seats,
    date,
    accepted: true,
  }),

  createFrom: (props: {
    id: string
    clientName: string
    seats: number
    date: string
    accepted: boolean
  }): Reservation => ({
    id: props.id,
    clientName: props.clientName,
    seats: props.seats,
    date: new Date(props.date),
    accepted: props.accepted,
  }),

  accept:
    (capacity: number) =>
    (
      reservation: Reservation,
    ): ((rs: List<Reservation>) => Either<AppError<'NO_CAPACITY'>, Reservation>) =>
      pipe(
        (rs: List<Reservation>): number => rs.foldRight(0)((r, total) => total + r.seats),
        (reservedSeats: number): Either<AppError<'NO_CAPACITY'>, Reservation> =>
          reservedSeats + reservation.seats <= capacity
            ? Either.right({ ...reservation, accepted: true })
            : Either.left(
                AppError.createDomain('NO_CAPACITY', new Error('there is no capacity')),
              ),
      ),
}
