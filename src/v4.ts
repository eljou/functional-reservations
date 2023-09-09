import { readLn, Either, Task, Funcs, List, z, Schema, File, Failure, ParsingFailure, Maybe } from './libs'
const {
  pipe,
  tap,
  match,
  randomBytes,
  takeN,
  ignore,
  logAndByPass,
  dateToStr,
  parseStrToNumber,
  serializeToBase64,
  deserializeFromBase64,
} = Funcs

type InvalidSeats = Failure<'INVALID_SEATS'>
const InvalidSeats = {
  create: (n: number): InvalidSeats =>
    Failure.create('INVALID_SEATS', `You are only allowed to reserve from 1 to 12 seats. You provided ${n}`),
}

type InvalidName = Failure<'INVALID_NAME'>
const InvalidName = {
  create: (): InvalidName => Failure.create('INVALID_NAME', `Invalid empty name`),
}

type ValidationFailure = InvalidName | InvalidSeats

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
  tryCreate: (params: Omit<Reservation, 'id' | 'date' | 'accepted'>): Either<ValidationFailure, Reservation> =>
    Either.of<ValidationFailure, typeof createReservation>(createReservation)
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
type UseCaseErrors = DbFailure | Failure<'NO_CAPACITY'> | ValidationFailure

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

const readInt = (label: string) => readLn(label).chain(pipe(parseStrToNumber, Task.fromEither))

const readClientName = () => readLn('Your name: ')
const readSeats = () => readInt('Seats to reserve: ')

const runCreateReservation = () =>
  readClientName()
    .chain(clientName => readSeats().map(seats => ({ clientName, seats })))
    .map(tap(() => console.log('-----')))
    .chain(tryAcceptReservation(30 /* move to ENV */))

const runGetReservationById = () =>
  readLn('Reservation id: ')
    .map(tap(() => console.log('-----')))
    .chain(getReservationById)

const runGetClientReservations = () =>
  readClientName()
    .chain(clientName => readInt('Limit :').map(count => ({ clientName, count })))
    .map(tap(() => console.log('-----')))
    .chain(getLastClientReservations)
    .map(ls => ls.toArray())

// --- App
const runController = (ctrl: Task<Failure, unknown>) =>
  ctrl.map(pipe(logAndByPass('Output: '), () => 'Done')).rejectMap(Failure.log)

const routeWorkflow = () =>
  readLn(`Enter a use-case to run:
  [1] - create reservation
  [2] - get reservation by id
  [3] - get client reservations
  [0] - exit
`).chain(option =>
    match<string, Task<void, string>>(option)
      .with('1', pipe(runCreateReservation, runController))
      .with('2', pipe(runGetReservationById, runController))
      .with('3', pipe(runGetClientReservations, runController))
      .with('0', () => Task.of('Exit'))
      .otherwise(() => Task.of('Unknown command')),
  )

// --- run
async function application() {
  const workflowResponse = await routeWorkflow().toPromise().catch(ignore)
  console.log('... \n\n')

  if (workflowResponse != 'Exit') return application()
}

application().catch(console.error)
