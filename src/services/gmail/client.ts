import { google, gmail_v1 } from 'googleapis';
import { config } from '../../config';
import { supabase } from '../../db';
import { Recipient } from '../../types';

/**
 * Create an authenticated Gmail client for a specific recipient.
 * Handles token refresh and persists new tokens to the database.
 */
export function createGmailClient(recipient: Recipient): gmail_v1.Gmail {
  const oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
  );

  oauth2Client.setCredentials({
    access_token: recipient.gmail_access_token,
    refresh_token: recipient.gmail_refresh_token,
  });

  // Listen for token refresh events and persist new tokens
  oauth2Client.on('tokens', async (tokens) => {
    const updates: Record<string, string> = {};
    if (tokens.access_token) updates.gmail_access_token = tokens.access_token;
    if (tokens.refresh_token) updates.gmail_refresh_token = tokens.refresh_token;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('recipients')
        .update(updates)
        .eq('id', recipient.id);
    }
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}
