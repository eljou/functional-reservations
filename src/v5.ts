import express from 'express'
import httpErrors from 'http-errors'
import { Either, Task, Funcs, List, z, Schema, File, Failure, ParsingFailure, Maybe, ValidationFailure } from './libs'
const { pipe, tap, match, randomBytes, takeN, dateToStr, serializeToBase64, deserializeFromBase64 } = Funcs

type InvalidSeats = Failure<'INVALID_SEATS'>
const InvalidSeats = {
  create: (n: number): InvalidSeats =>
    Failure.create('INVALID_SEATS', `You are only allowed to reserve from 1 to 12 seats. You provided ${n}`),
}

type InvalidName = Failure<'INVALID_NAME'>
const InvalidName = {
  create: (): InvalidName => Failure.create('INVALID_NAME', `Invalid empty name`),
}

type DomainValidationFailure = InvalidName | InvalidSeats

type Reservation = {
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
    accepted: true,
  })

const Reservation = {
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

type DbFailure = Failure<'DB_FAILURE'>
const DbFailure = {
  create: (err: Error): DbFailure => Failure.create('DB_FAILURE', `Database Error: ${err.message}`, err),
}

interface ReservationsRepository {
  findWhen: (predicate: (r: Reservation) => boolean) => Task<DbFailure, List<Reservation>>
  findOneWhen: (predicate: (r: Reservation) => boolean) => Task<DbFailure, Maybe<Reservation>>
  saveReservation: (r: Reservation) => Task<DbFailure, void>
}

// --- Application use cases

type Input = Parameters<typeof Reservation.tryCreate>[0]
type UseCaseErrors = DbFailure | Failure<'NO_CAPACITY'> | DomainValidationFailure

const makeTryAcceptReservation =
  (db: ReservationsRepository) =>
  (totalCapacity: number) =>
  (input: Input): Task<UseCaseErrors, Reservation> => {
    const tryAcceptReservation = Reservation.tryAccept(totalCapacity)

    return Task.fromEither(Reservation.tryCreate(input))
      .chain(reservation =>
        db
          .findWhen(r => dateToStr(r.date) == dateToStr(reservation.date))
          .map(tryAcceptReservation(reservation))
          .chain(Task.fromEither),
      )
      .chain(Task.tap(db.saveReservation))
  }

const makeGetReservationById =
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

const makeGetLastClientReservations =
  (db: ReservationsRepository) =>
  (props: { clientName: string; count: number }): Task<DbFailure, List<Reservation>> =>
    db.findWhen(r => r.clientName == props.clientName).map(takeN(props.count))

//-- Infra
const makeFileRepo = (): ReservationsRepository => {
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

//-- Dependency Inyection
const fileRepo = makeFileRepo()

const tryAcceptReservation = makeTryAcceptReservation(fileRepo)
const getReservationById = makeGetReservationById(fileRepo)
const getLastClientReservations = makeGetLastClientReservations(fileRepo)

// = express APP
type ResponsePair<T = unknown> = [number, T]

const setWithCode =
  <T = unknown>(code: number) =>
  (data: T): ResponsePair<T> => [code, data]

const setResponse =
  <T = unknown>(res: express.Response) =>
  ([code, data]: ResponsePair<T>): void => {
    // eslint-disable-next-line functional/no-expression-statements
    res.status(code).json(data)
  }

const callNext = (next: express.NextFunction) => () => next()

// Controllers
const createReservationCtrl: express.RequestHandler = (req, res, next) =>
  Task.fromEither(
    Either.fromTry(() => z.object({ clientName: z.string(), seats: z.number() }).parse(req.body)).leftMap(
      ValidationFailure.create,
    ),
  )
    .chain(tryAcceptReservation(30))
    .rejectMap(
      pipe(
        tap(f => Failure.log(f)),
        failure =>
          match(failure)
            .with(
              { code: 'VALIDATION' },
              { code: 'INVALID_NAME' },
              { code: 'INVALID_SEATS' },
              f => new httpErrors.BadRequest(f.message),
            )
            .with({ code: 'NO_CAPACITY' }, f => new httpErrors.PreconditionFailed(f.message))
            .with({ code: 'DB_FAILURE' }, () => new httpErrors.InternalServerError())
            .exhaustive(),
      ),
    )
    .fork(next, pipe(setWithCode(201), setResponse(res), callNext(next)))

const getReservationByIdCtrl: express.RequestHandler<{ id: string }> = (req, res, next) =>
  Task.of<never, string>(req.params.id)
    .chain(getReservationById)
    .rejectMap(
      pipe(
        tap(f => Failure.log(f)),
        failure =>
          match(failure)
            .with({ code: 'NOT_FOUND' }, f => new httpErrors.NotFound(f.message))
            .with({ code: 'DB_FAILURE' }, () => new httpErrors.InternalServerError())
            .exhaustive(),
      ),
    )
    .fork(next, pipe(setWithCode(200), setResponse(res), callNext(next)))

const getReservationsByNameCtrl: express.RequestHandler<{ name: string }> = (req, res, next) =>
  Task.fromEither(
    Either.fromTry(() => z.object({ count: z.number() }).parse(req.body))
      .leftMap(ValidationFailure.create)
      .map(({ count }) => ({ count, clientName: req.params.name })),
  )
    .chain(getLastClientReservations)
    .map(list => list.toArray())
    .rejectMap(
      pipe(
        tap(f => Failure.log(f)),
        failure =>
          match(failure)
            .with({ code: 'VALIDATION' }, f => new httpErrors.BadRequest(f.message))
            .with({ code: 'DB_FAILURE' }, () => new httpErrors.InternalServerError())
            .exhaustive(),
      ),
    )
    .fork(next, pipe(setWithCode(200), setResponse(res), callNext(next)))

// eslint-disable-next-line functional/no-expression-statements
express()
  .use(express.json())
  .post('/reservation', createReservationCtrl)
  .get('/reservation/:id', getReservationByIdCtrl)
  .get('/reservation/client/:name', getReservationsByNameCtrl)
  .listen(3030, () => console.log('listening on port 3030'))
