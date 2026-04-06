import { Router } from 'express';
import { google } from 'googleapis';
import { config } from '../config';
import { supabase } from '../db';

export const authRouter = Router();

const oauth2Client = new google.auth.OAuth2(
  config.googleClientId,
  config.googleClientSecret,
  config.googleRedirectUri
);

const SCOPES = [
  'openid',
  'email',
  'profile',
];

// Step 1: Redirect to Google consent screen
authRouter.get('/google', (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  res.redirect(url);
});

// Step 2: Handle callback
authRouter.get('/google/callback', async (req, res, next) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).json({ error: 'missing_code' });
      return;
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    if (!userInfo.email || !userInfo.id) {
      res.status(400).json({ error: 'missing_user_info' });
      return;
    }

    // Generate handle from email (before @)
    const baseHandle = userInfo.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Upsert recipient
    const { data: existing } = await supabase
      .from('recipients')
      .select('id, handle')
      .eq('google_id', userInfo.id)
      .single();

    let recipientId: string;
    let handle: string;

    if (existing) {
      // Update tokens
      await supabase
        .from('recipients')
        .update({
          gmail_access_token: tokens.access_token!,
          gmail_refresh_token: tokens.refresh_token || undefined,
          email: userInfo.email,
        })
        .eq('id', existing.id);
      recipientId = existing.id;
      handle = existing.handle;
    } else {
      // Find unique handle
      handle = baseHandle;
      let suffix = 1;
      while (true) {
        const { data: conflict } = await supabase
          .from('recipients')
          .select('id')
          .eq('handle', handle)
          .single();
        if (!conflict) break;
        handle = `${baseHandle}${suffix++}`;
      }

      const { data: newRecipient, error } = await supabase
        .from('recipients')
        .insert({
          google_id: userInfo.id,
          email: userInfo.email,
          handle,
          gmail_access_token: tokens.access_token!,
          gmail_refresh_token: tokens.refresh_token!,
        })
        .select('id')
        .single();

      if (error || !newRecipient) {
        res.status(500).json({ error: 'failed_to_create_recipient', detail: error?.message });
        return;
      }
      recipientId = newRecipient.id;
    }

    // Create a session token (simple JWT via Supabase or custom)
    // We'll use Supabase admin to create a custom JWT claim
    const jwt = await createSessionToken(recipientId, userInfo.email);

    // Set cookie and redirect to settings
    res.cookie('session', jwt, {
      httpOnly: true,
      secure: config.baseUrl.startsWith('https'),
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.redirect('/settings');
  } catch (err) {
    next(err);
  }
});

async function createSessionToken(recipientId: string, email: string): Promise<string> {
  // Use jsonwebtoken to create a simple session token
  const jwt = await import('jsonwebtoken');
  return jwt.sign(
    { sub: recipientId, email },
    config.jwtSecret,
    { expiresIn: '30d' }
  );
}
