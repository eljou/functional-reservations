import { makeGetLastClientReservations } from '../02-app/get-client-last-reservations'
import { makeGetReservationById } from '../02-app/get-reservation-by-id'
import { makeTryAcceptReservation } from '../02-app/try-accept-reservation'
import { makeFileRepo } from './file-repo'

const fileRepo = makeFileRepo()

export const tryAcceptReservation = makeTryAcceptReservation(fileRepo)
export const getReservationById = makeGetReservationById(fileRepo)
export const getLastClientReservations = makeGetLastClientReservations(fileRepo)
