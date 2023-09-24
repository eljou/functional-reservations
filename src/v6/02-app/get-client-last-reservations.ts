import { List, Funcs, Task } from '../../libs'
import { Reservation } from '../01-domain/reservation'
import { DbFailure, ReservationsRepository } from '../01-domain/reservation-repository'
const { takeN } = Funcs

export const makeGetLastClientReservations =
  (db: ReservationsRepository) =>
  (props: { clientName: string; count: number }): Task<DbFailure, List<Reservation>> =>
    db.findWhen(r => r.clientName == props.clientName).map(takeN(props.count))
