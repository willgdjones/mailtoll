import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth, AuthenticatedRequest } from './middleware/auth';
import { authRouter } from './routes/auth';
import { registryRouter } from './routes/registry';
import { scheduleRouter } from './routes/schedule';
import { payRouter } from './routes/pay';
import { settingsRouter } from './routes/settings';
import { supabase } from './db';

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

// Rate limiters
const registryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests. Try again later.' },
});

const scheduleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests. Try again later.' },
});

// Routes
app.use('/auth', authRouter);
app.use('/registry', registryLimiter, registryRouter);
app.use('/schedule', scheduleLimiter, scheduleRouter);
app.use('/pay', scheduleLimiter, payRouter);
app.use('/settings', settingsRouter);

// Welcome page for new signups
app.get('/welcome', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { data: recipient } = await supabase
      .from('recipients')
      .select('handle')
      .eq('id', req.recipientId)
      .single();

    const fs = await import('fs');
    const htmlPath = path.join(__dirname, 'views', 'welcome.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html.replace('"/*__RECIPIENT_DATA__*/"', JSON.stringify(recipient || {}));
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// Public profile page
app.get('/:handle', async (req, res, next) => {
  try {
    const { handle } = req.params;
    const { data: recipient } = await supabase
      .from('recipients')
      .select('handle, price_usd, accepted_rails, category_preferences')
      .eq('handle', handle)
      .single();

    if (!recipient) {
      const fs = await import('fs');
      const htmlPath = path.join(__dirname, 'views', '404.html');
      res.status(404).send(fs.readFileSync(htmlPath, 'utf-8'));
      return;
    }

    const fs = await import('fs');
    const htmlPath = path.join(__dirname, 'views', 'profile.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html.replace('"/*__PROFILE_DATA__*/"', JSON.stringify({
      handle: recipient.handle,
      price_usd: parseFloat(recipient.price_usd),
      accepted_rails: recipient.accepted_rails,
      category_preferences: recipient.category_preferences,
    }));
    res.send(html);
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Mail Toll API running on port ${config.port}`);
  });
}

export default app;
