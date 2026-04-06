import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { registryRouter } from './routes/registry';
import { scheduleRouter } from './routes/schedule';
import { payRouter } from './routes/pay';
import { settingsRouter } from './routes/settings';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Landing page
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'landing.html'));
});

// Routes
app.use('/auth', authRouter);
app.use('/registry', registryRouter);
app.use('/schedule', scheduleRouter);
app.use('/pay', payRouter);
app.use('/settings', settingsRouter);

app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Mail Toll API running on port ${config.port}`);
  });
}

export default app;
