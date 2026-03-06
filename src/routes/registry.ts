import { Router } from 'express';
import { supabase } from '../db';
import { config } from '../config';

export const registryRouter = Router();

// Public lookup — GTM agents query this to discover pricing and rails
registryRouter.get('/:handle', async (req, res, next) => {
  try {
    const { handle } = req.params;

    const { data: recipient, error } = await supabase
      .from('recipients')
      .select('handle, price_usd, accepted_rails, category_preferences')
      .eq('handle', handle)
      .single();

    if (error || !recipient) {
      res.status(404).json({ error: 'not_found', message: `No recipient with handle "${handle}"` });
      return;
    }

    res.json({
      handle: recipient.handle,
      endpoint: `${config.baseUrl}/schedule`,
      price_usd: parseFloat(recipient.price_usd),
      accepted_rails: recipient.accepted_rails,
      category_preferences: recipient.category_preferences,
    });
  } catch (err) {
    next(err);
  }
});
