import { Router } from 'express';
import { supabase } from '../db';
import { createStripePaymentIntent } from '../services/payment/stripe';
import { createCoinbaseCharge } from '../services/payment/coinbase';

export const payRouter = Router();

// Create a Stripe PaymentIntent for a recipient
payRouter.post('/stripe', async (req, res, next) => {
  try {
    const { handle } = req.body;
    if (!handle) {
      res.status(400).json({ error: 'missing_handle' });
      return;
    }

    const { data: recipient } = await supabase
      .from('recipients')
      .select('price_usd, accepted_rails')
      .eq('handle', handle)
      .single();

    if (!recipient) {
      res.status(404).json({ error: 'recipient_not_found' });
      return;
    }

    if (!recipient.accepted_rails.includes('stripe')) {
      res.status(400).json({ error: 'rail_not_accepted', message: 'Recipient does not accept Stripe' });
      return;
    }

    const { clientSecret, paymentIntentId } = await createStripePaymentIntent(parseFloat(recipient.price_usd));

    res.json({ clientSecret, paymentIntentId, amount_usd: parseFloat(recipient.price_usd) });
  } catch (err) {
    next(err);
  }
});

// Create a Coinbase Commerce charge for a recipient
payRouter.post('/coinbase', async (req, res, next) => {
  try {
    const { handle } = req.body;
    if (!handle) {
      res.status(400).json({ error: 'missing_handle' });
      return;
    }

    const { data: recipient } = await supabase
      .from('recipients')
      .select('handle, price_usd, accepted_rails')
      .eq('handle', handle)
      .single();

    if (!recipient) {
      res.status(404).json({ error: 'recipient_not_found' });
      return;
    }

    if (!recipient.accepted_rails.includes('coinbase')) {
      res.status(400).json({ error: 'rail_not_accepted', message: 'Recipient does not accept Coinbase' });
      return;
    }

    const { chargeId, hostedUrl } = await createCoinbaseCharge(parseFloat(recipient.price_usd), recipient.handle);

    res.json({ chargeId, hostedUrl, amount_usd: parseFloat(recipient.price_usd) });
  } catch (err) {
    next(err);
  }
});
