import restify from 'restify'
import errors from 'restify-errors'
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
      .chain(res =>
        db
          .findWhen(r => dateToStr(r.date) == dateToStr(res.date))
          .map(list => tryAcceptReservation(res)(list))
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
          List.fromArray,
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

//-- Controllers
type ResponsePair<T = unknown> = [number, T]

const setWithCode =
  <T = unknown>(code: number) =>
  (data: T): ResponsePair<T> => [code, data]

const setSuccessResponse =
  <T = unknown>(res: restify.Response) =>
  ([code, data]: ResponsePair<T>) => {
    res.status(code)
    res.json(data)
  }

const handleCreateReservationRoute: restify.RequestHandler = (req, res, next) => {
  const inputSchema = z.object({ clientName: z.string(), seats: z.number() })

  Task.fromEither(Either.fromTry(() => inputSchema.parse(req.body)).leftMap(ValidationFailure.create))
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
              f => new errors.BadRequestError(f.message),
            )
            .with({ code: 'NO_CAPACITY' }, f => new errors.PreconditionFailedError(f.message))
            .with({ code: 'DB_FAILURE' }, () => new errors.InternalError())
            .exhaustive(),
      ),
    )
    .fork(next, pipe(setWithCode(201), setSuccessResponse(res), next))
}

const handleGetReservationById: restify.RequestHandler = (req, res, next) => {
  Task.fromEither(Either.fromTry(() => req.params.id.toString()).leftMap(ValidationFailure.create))
    .chain(getReservationById)
    .rejectMap(
      pipe(
        tap(f => Failure.log(f)),
        failure =>
          match(failure)
            .with({ code: 'VALIDATION' }, f => new errors.BadRequestError(f.message))
            .with({ code: 'NOT_FOUND' }, f => new errors.ResourceNotFoundError(f.message))
            .with({ code: 'DB_FAILURE' }, () => new errors.InternalError())
            .exhaustive(),
      ),
    )
    .fork(next, pipe(setWithCode(200), setSuccessResponse(res), next))
}

const handleGetLastReservationsByClientName: restify.RequestHandler = (req, res, next) => {
  const inputSchema = z.object({ clientName: z.string(), count: z.number() })

  Task.fromEither(
    Either.fromTry(() =>
      inputSchema.parse({
        clientName: req.params.name,
        count: JSON.parse(req.body).count,
      }),
    ).leftMap(ValidationFailure.create),
  )
    .chain(getLastClientReservations)
    .map(list => list.toArray())
    .rejectMap(
      pipe(
        tap(f => Failure.log(f)),
        failure =>
          match(failure)
            .with({ code: 'VALIDATION' }, f => new errors.BadRequestError(f.message))
            .with({ code: 'DB_FAILURE' }, () => new errors.InternalError())
            .exhaustive(),
      ),
    )
    .fork(next, pipe(setWithCode(200), setSuccessResponse(res), next))
}
// -- App
const server = restify.createServer({ name: 'myapp', version: '1.0.0' })
server.use(restify.plugins.queryParser()).use(restify.plugins.bodyParser())

server.post('/reservation', handleCreateReservationRoute)
server.get('/reservation/:id', handleGetReservationById)
server.get('/reservation/client/:name', handleGetLastReservationsByClientName)

server.listen(3030, () => console.log('%s listening at %s', server.name, server.url))
