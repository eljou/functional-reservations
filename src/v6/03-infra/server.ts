import express from 'express'

export function createServer(registerRoutes: (server: express.Express) => void): express.Express {
  const app = express().use(express.json())

  registerRoutes(app)

  return app
}
