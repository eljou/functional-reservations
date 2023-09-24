import express from 'express'
import httpErrors from 'http-errors'
import { Either, Task, Funcs, z, Failure, ValidationFailure } from '../../../libs'
import { getLastClientReservations, getReservationById, tryAcceptReservation } from '../di'
const { pipe, match, tap } = Funcs
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
export const createReservationCtrl: express.RequestHandler = (req, res, next) =>
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

export const getReservationByIdCtrl: express.RequestHandler<{ id: string }> = (req, res, next) =>
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

export const getReservationsByNameCtrl: express.RequestHandler<{ name: string }> = (req, res, next) =>
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
