import { Either, Failure, List, Funcs } from '../../libs'
const { pipe, randomBytes } = Funcs

export type InvalidSeats = Failure<'INVALID_SEATS'>
export const InvalidSeats = {
  create: (n: number): InvalidSeats =>
    Failure.create('INVALID_SEATS', `You are only allowed to reserve from 1 to 12 seats. You provided ${n}`),
}

export type InvalidName = Failure<'INVALID_NAME'>
export const InvalidName = {
  create: (): InvalidName => Failure.create('INVALID_NAME', `Invalid empty name`),
}

export type DomainValidationFailure = InvalidName | InvalidSeats

export type Reservation = {
  id: string
  clientName: string
  seats: number
  date: Date
  accepted: boolean
}

const validateSeats = (seats: number): Either<InvalidSeats, number> =>
  seats < 1 || seats > 12 ? Either.Left(InvalidSeats.create(seats)) : Either.right(seats)

const validateName = (name: string): Either<InvalidName, string> =>
  name.length == 0 ? Either.Left(InvalidName.create()) : Either.right(name)

const createReservation =
  (clientName: string) =>
  (seats: number): Reservation => ({
    id: randomBytes(16).toString('hex'),
    clientName,
    seats,
    date: new Date(),
    accepted: false,
  })

export const Reservation = {
  tryCreate: (params: Omit<Reservation, 'id' | 'date' | 'accepted'>): Either<DomainValidationFailure, Reservation> =>
    Either.of<DomainValidationFailure, typeof createReservation>(createReservation)
      .apTo(validateName(params.clientName))
      .apTo(validateSeats(params.seats)),

  tryAccept:
    (capacity: number) =>
    (reservation: Reservation): ((rs: List<Reservation>) => Either<Failure<'NO_CAPACITY'>, Reservation>) =>
      pipe(
        (rs): number => rs.foldRight(0)((r, total) => total + r.seats),
        (reservedSeats): Either<Failure<'NO_CAPACITY'>, Reservation> =>
          reservedSeats + reservation.seats <= capacity
            ? Either.right({ ...reservation, accepted: true })
            : Either.left(Failure.create('NO_CAPACITY', 'There is no capacity')),
      ),
}
