import { OTP_TTL_MINUTES } from './otp';

interface SendBrevoEmailParams {
  to: string;
  subject: string;
  htmlContent: string;
}

/** Server-only thin wrapper around Brevo's transactional email API. */
export async function sendBrevoEmail({ to, subject, htmlContent }: SendBrevoEmailParams): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Krishnam HRMS';

  if (!apiKey || !senderEmail) {
    throw new Error('Missing BREVO_API_KEY or BREVO_SENDER_EMAIL (server-only).');
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${body || res.statusText}`);
  }
}

export function otpEmailHtml(code: string, purpose: 'email_change' | 'password_change'): string {
  const action = purpose === 'email_change' ? 'confirm your new email address' : 'confirm your password change';
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1e293b;">Verification code</h2>
      <p style="color: #334155;">Use this code to ${action} on Krishnam HRMS:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f172a; margin: 24px 0;">${code}</p>
      <p style="color: #64748b; font-size: 13px;">This code expires in ${OTP_TTL_MINUTES} minutes and can only be used once. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
}
