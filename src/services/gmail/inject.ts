import { gmail_v1 } from 'googleapis';
import { supabase } from '../../db';
import { Recipient } from '../../types';

const LABEL_NAME = 'Mail Toll';

/**
 * Ensure the "Mail Toll" label exists and return its ID.
 * Caches the label ID on the recipient record.
 */
async function ensureLabel(gmail: gmail_v1.Gmail, recipient: Recipient): Promise<string> {
  // Check cached label ID
  if (recipient.gmail_label_id) {
    return recipient.gmail_label_id;
  }

  // List existing labels
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  const existing = data.labels?.find((l) => l.name === LABEL_NAME);

  if (existing?.id) {
    await cacheLabelId(recipient.id, existing.id);
    return existing.id;
  }

  // Create the label
  const { data: created } = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: LABEL_NAME,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });

  const labelId = created.id!;
  await cacheLabelId(recipient.id, labelId);
  return labelId;
}

async function cacheLabelId(recipientId: string, labelId: string) {
  await supabase
    .from('recipients')
    .update({ gmail_label_id: labelId })
    .eq('id', recipientId);
}

/**
 * Inject a raw email into the recipient's Gmail inbox with the Mail Toll label.
 * Returns the Gmail message ID.
 */
export async function injectEmail(
  gmail: gmail_v1.Gmail,
  recipient: Recipient,
  rawEmail: string
): Promise<string> {
  const labelId = await ensureLabel(gmail, recipient);

  const { data } = await gmail.users.messages.insert({
    userId: 'me',
    requestBody: {
      labelIds: ['INBOX', labelId],
      raw: rawEmail,
    },
  });

  return data.id!;
}
