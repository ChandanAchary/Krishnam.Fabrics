import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { hashOtpCode } from '@/lib/otp';
import { emailSchema, passwordSchema } from '@/lib/validation';

type Purpose = 'email_change' | 'password_change';

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let body: { purpose?: Purpose; code?: string; newEmail?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { purpose, code, newEmail, newPassword } = body;
  if (purpose !== 'email_change' && purpose !== 'password_change') {
    return NextResponse.json({ error: 'Invalid purpose.' }, { status: 400 });
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });
  }

  let validatedEmail: string | null = null;
  if (purpose === 'email_change') {
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email.' }, { status: 400 });
    }
    validatedEmail = parsed.data;
  } else {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid password.' }, { status: 400 });
    }
  }

  const admin = createSupabaseAdminClient();

  const { data: otpRow, error: fetchError } = await admin
    .from('auth_otps')
    .select('*')
    .eq('user_id', user.id)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !otpRow) {
    return NextResponse.json({ error: 'No active code found. Please request a new one.' }, { status: 400 });
  }
  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Code expired. Please request a new one.' }, { status: 400 });
  }
  if (otpRow.attempts >= otpRow.max_attempts) {
    return NextResponse.json({ error: 'Too many attempts. Please request a new one.' }, { status: 400 });
  }

  if (hashOtpCode(code) !== otpRow.code_hash) {
    const attemptsLeft = otpRow.max_attempts - otpRow.attempts - 1;
    await admin.from('auth_otps').update({ attempts: otpRow.attempts + 1 }).eq('id', otpRow.id);
    return NextResponse.json(
      { error: attemptsLeft > 0 ? `Incorrect code. ${attemptsLeft} attempt(s) left.` : 'Incorrect code. Please request a new one.' },
      { status: 400 }
    );
  }

  if (purpose === 'email_change' && otpRow.new_email && validatedEmail !== otpRow.new_email) {
    return NextResponse.json({ error: 'Email does not match the one this code was issued for.' }, { status: 400 });
  }

  await admin.from('auth_otps').update({ consumed_at: new Date().toISOString() }).eq('id', otpRow.id);

  if (purpose === 'email_change') {
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      email: validatedEmail!,
      email_confirm: true,
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    await admin.from('audit_logs').insert({
      user_id: user.id,
      action: 'change_email',
      table_name: 'auth.users',
      record_id: user.id,
      old_value: { email: user.email },
      new_value: { email: validatedEmail },
      reason: 'otp_verified',
    });
  } else {
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    await admin.from('audit_logs').insert({
      user_id: user.id,
      action: 'change_password',
      table_name: 'auth.users',
      record_id: user.id,
      old_value: null,
      new_value: null,
      reason: 'otp_verified',
    });
  }

  return NextResponse.json({ ok: true });
}
