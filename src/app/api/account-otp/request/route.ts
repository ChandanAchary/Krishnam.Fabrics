import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { generateOtpCode, hashOtpCode, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS } from '@/lib/otp';
import { sendBrevoEmail, otpEmailHtml } from '@/lib/brevo';
import { emailSchema } from '@/lib/validation';

type Purpose = 'email_change' | 'password_change';

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let body: { purpose?: Purpose; newEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { purpose, newEmail } = body;
  if (purpose !== 'email_change' && purpose !== 'password_change') {
    return NextResponse.json({ error: 'Invalid purpose.' }, { status: 400 });
  }

  let targetEmail: string;
  let storedNewEmail: string | null = null;

  if (purpose === 'email_change') {
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email.' }, { status: 400 });
    }
    if (parsed.data.toLowerCase() === (user.email ?? '').toLowerCase()) {
      return NextResponse.json({ error: 'New email must be different from your current email.' }, { status: 400 });
    }
    targetEmail = parsed.data;
    storedNewEmail = parsed.data;
  } else {
    if (!user.email) {
      return NextResponse.json({ error: 'Account has no email on file.' }, { status: 400 });
    }
    targetEmail = user.email;
  }

  const admin = createSupabaseAdminClient();

  const cooldownSince = new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000).toISOString();
  const { data: recent } = await admin
    .from('auth_otps')
    .select('id, created_at')
    .eq('user_id', user.id)
    .eq('purpose', purpose)
    .gte('created_at', cooldownSince)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    return NextResponse.json(
      { error: `Please wait a moment before requesting another code.` },
      { status: 429 }
    );
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { data: inserted, error: insertError } = await admin
    .from('auth_otps')
    .insert({
      user_id: user.id,
      purpose,
      code_hash: codeHash,
      new_email: storedNewEmail,
      max_attempts: OTP_MAX_ATTEMPTS,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not create verification code.' }, { status: 500 });
  }

  try {
    await sendBrevoEmail({
      to: targetEmail,
      subject: 'Your Krishnam HRMS verification code',
      htmlContent: otpEmailHtml(code, purpose),
    });
  } catch (err) {
    // Don't leave an unusable code blocking the resend cooldown.
    await admin.from('auth_otps').delete().eq('id', inserted.id);
    const message = err instanceof Error ? err.message : 'Could not send verification email.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: targetEmail });
}
