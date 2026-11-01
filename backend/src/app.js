import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRouter from './routes/auth.js';
import clientsRouter from './routes/clients.js';
import dashboardRouter from './routes/dashboard.js';
import ordersRouter from './routes/orders.js';
import photosRouter from './routes/photos.js';
import racketsRouter from './routes/rackets.js';
import servicesRouter from './routes/services.js';
import stringsRouter from './routes/strings.js';

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
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/rackets', racketsRouter);
  app.use('/api/strings', stringsRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/photos', photosRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
