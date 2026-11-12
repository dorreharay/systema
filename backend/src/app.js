import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRouter from './routes/auth.js';
import billingRouter from './routes/billing.js';
import clientsRouter from './routes/clients.js';
import dashboardRouter from './routes/dashboard.js';
import insightsRouter from './routes/insights.js';
import ordersRouter from './routes/orders.js';
import pagesRouter from './routes/pages.js';
import photosRouter from './routes/photos.js';
import racketsRouter from './routes/rackets.js';
import referenceRouter from './routes/reference.js';
import servicesRouter from './routes/services.js';
import stringsRouter from './routes/strings.js';
import studioRouter from './routes/studio.js';
import teamRouter from './routes/team.js';

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

  // The few pages the server has, outside the API: the one behind the link in a password reset email.
  app.use(pagesRouter);

  app.use('/api/auth', authRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/studio-interest', studioRouter);
  app.use('/api/team', teamRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/insights', insightsRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/rackets', racketsRouter);
  app.use('/api/strings', stringsRouter);
  app.use('/api/reference', referenceRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/photos', photosRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
