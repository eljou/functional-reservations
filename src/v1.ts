import { readLn, Task, Failure, Funcs } from './libs'
const { pipe, logAndByPass, match, ignore } = Funcs

const runController = (ctrl: Task<Failure, unknown>) =>
  ctrl.map(pipe(logAndByPass('Output: '), () => 'Done')).rejectMap(Failure.log)

const routeWorkflow = () =>
  readLn(`Enter a use-case to run:
  [1] - create reservation
  [0] - exit
`).chain(option =>
    match(option)
      .with('1', () => runController(Task.of(1)))
      .with('0', () => Task.of('Exit'))
      .otherwise(() => Task.of('Unknown command')),
  )

// --- run
async function application() {
  const workflowResponse = await routeWorkflow().toPromise().catch(ignore)
  console.log('... \n\n')

  if (workflowResponse != 'Exit') return application()
}

// eslint-disable-next-line functional/no-expression-statements
application().catch(console.error)
