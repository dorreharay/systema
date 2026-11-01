import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRouter from './routes/auth.js';

export function createApp() {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  // An API is read from another origin (the web build of the app), so its responses must be allowed to be.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // No authentication: used by the host (Railway, a load balancer) to see that the server is up.
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
