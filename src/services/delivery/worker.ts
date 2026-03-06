import { pool } from '../../db';
import { Recipient, ScheduledEmail } from '../../types';
import { createGmailClient } from '../gmail/client';
import { buildRawEmail } from '../gmail/email';
import { injectEmail } from '../gmail/inject';

const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const STALE_THRESHOLD_MINUTES = 10;

export async function runDeliveryWorker(): Promise<void> {
  console.log('[Worker] Starting delivery cycle');

  // 1. Recover stale processing emails
  await recoverStaleEmails();

  // 2. Pick up pending emails with SKIP LOCKED
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: emails } = await client.query<ScheduledEmail>(
      `SELECT * FROM scheduled_emails
       WHERE status = 'pending'
       AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (emails.length === 0) {
      await client.query('COMMIT');
      console.log('[Worker] No pending emails');
      return;
    }

    console.log(`[Worker] Picked up ${emails.length} emails`);

    // Mark as processing and release locks
    const ids = emails.map((e) => e.id);
    await client.query(
      `UPDATE scheduled_emails SET status = 'processing' WHERE id = ANY($1)`,
      [ids]
    );
    await client.query('COMMIT');

    // 3. Process each email
    await Promise.allSettled(
      emails.map((email) => processEmail(email))
    );

    console.log('[Worker] Delivery cycle complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Worker] Error in delivery cycle:', err);
  } finally {
    client.release();
  }
}

async function processEmail(email: ScheduledEmail): Promise<void> {
  try {
    // Fetch recipient
    const client = await pool.connect();
    try {
      const { rows } = await client.query<Recipient>(
        'SELECT * FROM recipients WHERE id = $1',
        [email.recipient_id]
      );
      const recipient = rows[0];
      if (!recipient) throw new Error(`Recipient ${email.recipient_id} not found`);

      // Create Gmail client and inject
      const gmail = createGmailClient(recipient);
      const rawEmail = buildRawEmail({
        from: email.sender_email,
        to: recipient.email,
        subject: email.subject,
        body: email.body,
      });

      const gmailMessageId = await injectEmail(gmail, recipient, rawEmail);

      // Mark as delivered
      await client.query(
        `UPDATE scheduled_emails SET status = 'delivered' WHERE id = $1`,
        [email.id]
      );

      // Log delivery
      await client.query(
        `INSERT INTO delivery_log (scheduled_email_id, gmail_message_id) VALUES ($1, $2)`,
        [email.id, gmailMessageId]
      );

      console.log(`[Worker] Delivered email ${email.id} → Gmail ${gmailMessageId}`);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`[Worker] Failed to deliver email ${email.id}:`, err);
    await handleRetry(email);
  }
}

async function handleRetry(email: ScheduledEmail): Promise<void> {
  const newRetryCount = email.retry_count + 1;
  const client = await pool.connect();
  try {
    if (newRetryCount >= MAX_RETRIES) {
      await client.query(
        `UPDATE scheduled_emails SET status = 'failed', retry_count = $2 WHERE id = $1`,
        [email.id, newRetryCount]
      );
      console.log(`[Worker] Email ${email.id} permanently failed after ${MAX_RETRIES} retries`);
    } else {
      await client.query(
        `UPDATE scheduled_emails
         SET status = 'pending',
             retry_count = $2,
             next_attempt_at = NOW() + INTERVAL '5 minutes'
         WHERE id = $1`,
        [email.id, newRetryCount]
      );
      console.log(`[Worker] Email ${email.id} retry ${newRetryCount}/${MAX_RETRIES}`);
    }
  } finally {
    client.release();
  }
}

async function recoverStaleEmails(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `UPDATE scheduled_emails
       SET status = 'pending'
       WHERE status = 'processing'
       AND next_attempt_at < NOW() - INTERVAL '${STALE_THRESHOLD_MINUTES} minutes'`
    );
    if (rowCount && rowCount > 0) {
      console.log(`[Worker] Recovered ${rowCount} stale processing emails`);
    }
  } finally {
    client.release();
  }
}
