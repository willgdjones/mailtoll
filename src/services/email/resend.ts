import { config } from '../../config';

/**
 * Send an email via the Resend REST API.
 * Returns the Resend email ID.
 */
export async function sendEmail(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.body,
      html: `<html><body><pre style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(opts.body)}</pre></body></html>`,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend API error: ${JSON.stringify(err)}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Send a notification to the recipient that a paid email was delivered.
 */
export async function sendNotification(opts: {
  to: string;
  senderEmail: string;
  subject: string;
}): Promise<void> {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Mail Toll <notifications@mailtoll.app>',
        to: [opts.to],
        subject: `New paid email from ${opts.senderEmail}`,
        text: `You received a paid priority email via Mail Toll.\n\nFrom: ${opts.senderEmail}\nSubject: ${opts.subject}\n\nCheck your inbox for the full message.`,
      }),
    });
  } catch (err) {
    console.error('[Notification] Failed to send:', err);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
