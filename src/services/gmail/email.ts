/**
 * Build an RFC 2822 compliant raw email string, base64url-encoded for Gmail API.
 */
export function buildRawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const boundary = `boundary_${Date.now()}`;

  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    opts.body,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    `<html><body><pre style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(opts.body)}</pre></body></html>`,
    ``,
    `--${boundary}--`,
  ];

  const raw = lines.join('\r\n');

  // Gmail API expects base64url encoding
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
