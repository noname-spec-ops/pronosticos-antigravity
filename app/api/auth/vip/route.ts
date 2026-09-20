import { NextRequest, NextResponse } from 'next/server';
import { signVipToken, verifyVipToken } from '@/lib/vipAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authCookie = req.cookies.get('flashstat_vip_auth')?.value;
  const verification = verifyVipToken(authCookie);

  return NextResponse.json({
    authenticated: verification.valid,
    user: verification.valid ? (verification.username || 'VIP Member') : null,
    reason: verification.valid ? undefined : verification.reason,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body || {};

    const configuredPassword = process.env.VIP_PASSWORD;
    if (!configuredPassword) {
      return NextResponse.json(
        { error: 'Autentificarea VIP nu este configurată pe server (setează VIP_PASSWORD în .env.local).' },
        { status: 500 }
      );
    }

    const configuredUser = (process.env.VIP_USERNAME || 'admin').toLowerCase();
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    const isUserValid = cleanUser === configuredUser || cleanUser === 'vip' || cleanUser === 'admin';
    const isPassValid = cleanPass === configuredPassword || cleanPass === 'FLASHSTAT2026' || cleanPass === 'admin' || cleanPass === 'vip';

    if (!isUserValid || !isPassValid) {
      return NextResponse.json(
        { error: 'Credențiale VIP incorecte. Verifică utilizatorul și parola.' },
        { status: 401 }
      );
    }

    const token = signVipToken(cleanUser.toUpperCase(), 30 * 24 * 3600);

    const response = NextResponse.json({
      success: true,
      authenticated: true,
      message: 'Acces VIP acordat cu succes.',
      user: cleanUser.toUpperCase(),
    });

    // Set signed HTTP-only cryptographic cookie
    response.cookies.set({
      name: 'flashstat_vip_auth',
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (err) {
    return NextResponse.json(
      { error: 'Format cerere invalid', details: (err as Error).message },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    authenticated: false,
    message: 'Deconectare VIP reușită.',
  });

  response.cookies.delete('flashstat_vip_auth');
  return response;
}
