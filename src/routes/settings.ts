import { Router } from 'express';
import path from 'path';
import { supabase } from '../db';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

export const settingsRouter = Router();

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
      .select('handle, email, price_usd, accepted_rails, whitelist, wallet_address, category_preferences')
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
    const allowedFields = ['price_usd', 'accepted_rails', 'whitelist', 'wallet_address', 'category_preferences'];
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

    const { data, error } = await supabase
      .from('recipients')
      .update(updates)
      .eq('id', req.recipientId)
      .select('handle, email, price_usd, accepted_rails, whitelist, wallet_address, category_preferences')
      .single();

    if (error) {
      res.status(500).json({ error: 'update_failed', detail: error.message });
      return;
    }

    res.json({ ...data, price_usd: parseFloat(data.price_usd) });
  } catch (err) {
    next(err);
  }
});
