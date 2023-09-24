/* eslint-disable functional/no-expression-statements */
import { createReservationCtrl, getReservationByIdCtrl, getReservationsByNameCtrl } from './03-infra/controllers'
import { createServer } from './03-infra/server'

createServer(server => {
  server
    .post('/reservation', createReservationCtrl)
    .get('/reservation/:id', getReservationByIdCtrl)
    .get('/reservation/client/:name', getReservationsByNameCtrl)
}).listen(3030, () => console.log('%s listening at %s', 'app', 'localhost:3030'))
