import { Router } from 'express';
import path from 'path';
import { supabase } from '../db';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

export const settingsRouter = Router();

const RESERVED_HANDLES = [
  'auth', 'registry', 'schedule', 'settings', 'welcome', 'pay',
  'health', 'admin', 'api', 'login', 'signup', 'logout', 'about',
  'help', 'support', 'billing', 'pricing', 'public', 'static',
];

export function validateHandle(handle: string): { valid: boolean; error?: string } {
  if (!handle) return { valid: false, error: 'Handle is required' };
  if (handle.length < 3) return { valid: false, error: 'Handle must be at least 3 characters' };
  if (handle.length > 30) return { valid: false, error: 'Handle must be 30 characters or fewer' };
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(handle) && handle.length > 2) {
    return { valid: false, error: 'Handle must be lowercase alphanumeric (hyphens and underscores allowed in the middle)' };
  }
  if (!/^[a-z0-9]+$/.test(handle) && handle.length <= 2) {
    return { valid: false, error: 'Handle must be lowercase alphanumeric' };
  }
  if (RESERVED_HANDLES.includes(handle)) {
    return { valid: false, error: 'This handle is reserved' };
  }
  return { valid: true };
}

// Check handle availability (unauthenticated — used by welcome page)
settingsRouter.get('/check-handle/:handle', async (req, res) => {
  const handle = req.params.handle.toLowerCase();
  const validation = validateHandle(handle);
  if (!validation.valid) {
    res.json({ available: false, error: validation.error });
    return;
  }

  const { data: existing } = await supabase
    .from('recipients')
    .select('id')
    .eq('handle', handle)
    .single();

  res.json({ available: !existing });
});

// Serve settings page
settingsRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { data: recipient } = await supabase
      .from('recipients')
      .select('*')
      .eq('id', req.recipientId)
      .single();

    if (!recipient) {
      res.status(404).json({ error: 'recipient_not_found' });
      return;
    }

    // Read the HTML and inject recipient data
    const fs = await import('fs');
    const htmlPath = path.join(__dirname, '..', 'views', 'settings.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    // Fetch stats
    const { count: totalEmails } = await supabase
      .from('scheduled_emails')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', recipient.id)
      .eq('status', 'delivered');

    const { data: earnings } = await supabase
      .from('payment_proofs')
      .select('amount_usd')
      .eq('recipient_id', recipient.id);

    const totalEarnings = (earnings || []).reduce((sum: number, p: { amount_usd: number }) => sum + parseFloat(String(p.amount_usd)), 0);

    const recipientJson = JSON.stringify({
      handle: recipient.handle,
      email: recipient.email,
      price_usd: parseFloat(recipient.price_usd),
      accepted_rails: recipient.accepted_rails,
      whitelist: recipient.whitelist || [],
      wallet_address: recipient.wallet_address || '',
      category_preferences: recipient.category_preferences || '',
      bio: recipient.bio || '',
      x_url: recipient.x_url || '',
      linkedin_url: recipient.linkedin_url || '',
      stats: {
        total_emails: totalEmails || 0,
        total_earnings_usd: totalEarnings,
      },
    });
    html = html.replace(
      '"/*__RECIPIENT_DATA__*/"',
      recipientJson
    );
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// Get settings as JSON
settingsRouter.get('/json', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { data: recipient } = await supabase
      .from('recipients')
      .select('handle, email, price_usd, accepted_rails, whitelist, wallet_address, category_preferences, bio, x_url, linkedin_url')
      .eq('id', req.recipientId)
      .single();

    if (!recipient) {
      res.status(404).json({ error: 'recipient_not_found' });
      return;
    }

    res.json({
      ...recipient,
      price_usd: parseFloat(recipient.price_usd),
    });
  } catch (err) {
    next(err);
  }
});

// Update settings
settingsRouter.patch('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const allowedFields = ['handle', 'price_usd', 'accepted_rails', 'whitelist', 'wallet_address', 'category_preferences', 'bio', 'x_url', 'linkedin_url'];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'no_valid_fields' });
      return;
    }

    // Validate handle if being updated
    if (updates.handle !== undefined) {
      const handle = (updates.handle as string).toLowerCase();
      const validation = validateHandle(handle);
      if (!validation.valid) {
        res.status(400).json({ error: 'invalid_handle', message: validation.error });
        return;
      }
      // Check uniqueness excluding current user
      const { data: conflict } = await supabase
        .from('recipients')
        .select('id')
        .eq('handle', handle)
        .neq('id', req.recipientId!)
        .single();
      if (conflict) {
        res.status(409).json({ error: 'handle_taken', message: 'This handle is already taken' });
        return;
      }
      updates.handle = handle;
    }

    const { data, error } = await supabase
      .from('recipients')
      .update(updates)
      .eq('id', req.recipientId)
      .select('handle, email, price_usd, accepted_rails, whitelist, wallet_address, category_preferences, bio, x_url, linkedin_url')
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: 'handle_taken', message: 'This handle is already taken' });
        return;
      }
      res.status(500).json({ error: 'update_failed', detail: error.message });
      return;
    }

    res.json({ ...data, price_usd: parseFloat(data.price_usd) });
  } catch (err) {
    next(err);
  }
});
