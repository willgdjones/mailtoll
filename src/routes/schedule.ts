import { Router } from 'express';
import { supabase } from '../db';
import { config } from '../config';
import { ScheduleRequest } from '../types';
import { verifyPayment, getPaymentProofId } from '../services/payment';

export const scheduleRouter = Router();

scheduleRouter.post('/', async (req, res, next) => {
  try {
    const body = req.body as ScheduleRequest;

    // Validate required fields
    if (!body.handle || !body.sender_email || !body.subject || !body.body) {
      res.status(400).json({
        error: 'missing_fields',
        message: 'handle, sender_email, subject, and body are required',
      });
      return;
    }

    // Look up recipient
    const { data: recipient } = await supabase
      .from('recipients')
      .select('*')
      .eq('handle', body.handle)
      .single();

    if (!recipient) {
      res.status(404).json({ error: 'recipient_not_found' });
      return;
    }

    const priceUsd = parseFloat(recipient.price_usd);

    // Check whitelist bypass
    const isWhitelisted = recipient.whitelist?.includes(body.sender_email);

    if (!isWhitelisted && !body.payment_proof) {
      // Phase 1: Return 402 with payment instructions
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      res.status(402).json({
        error: 'payment_required',
        amount_usd: priceUsd,
        accepted_rails: recipient.accepted_rails,
        payment_instructions: buildPaymentInstructions(recipient.handle, priceUsd, recipient.accepted_rails),
        expires_at: expiresAt,
      });
      return;
    }

    let paymentProofId: string | null = null;

    if (!isWhitelisted && body.payment_proof) {
      // Verify payment
      const valid = await verifyPayment({
        rail: body.payment_proof.rail,
        proof: body.payment_proof.proof,
        expected_amount_usd: priceUsd,
        recipient_id: recipient.id,
      });

      if (!valid) {
        res.status(402).json({
          error: 'payment_invalid',
          message: 'Payment verification failed or proof already used',
        });
        return;
      }

      paymentProofId = await getPaymentProofId(body.payment_proof.proof);
    }

    // Queue the email
    const { data: email, error } = await supabase
      .from('scheduled_emails')
      .insert({
        recipient_id: recipient.id,
        sender_email: body.sender_email,
        subject: body.subject,
        body: body.body,
        payment_proof_id: paymentProofId,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !email) {
      res.status(500).json({ error: 'queue_failed', detail: error?.message });
      return;
    }

    res.status(201).json({
      scheduled_email_id: email.id,
      status: 'queued',
    });
  } catch (err) {
    next(err);
  }
});

function buildPaymentInstructions(handle: string, priceUsd: number, rails: string[]) {
  const instructions: Record<string, unknown> = {};

  if (rails.includes('stripe')) {
    instructions.stripe = `${config.baseUrl}/pay/stripe`;
  }
  if (rails.includes('coinbase')) {
    instructions.coinbase = `${config.baseUrl}/pay/coinbase`;
  }
  if (rails.includes('stablecoin')) {
    instructions.stablecoin = {
      asset: 'USDC',
      chain: 'ethereum',
      amount: priceUsd.toFixed(2),
    };
  }
  if (rails.includes('x402')) {
    instructions.x402 = {
      paymentRequired: true,
      maxAmountRequired: priceUsd.toFixed(2),
      asset: 'USDC',
    };
  }

  return instructions;
}
