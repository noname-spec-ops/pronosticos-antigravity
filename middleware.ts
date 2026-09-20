import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from './lib/rateLimiter';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only apply rate limiting to API routes
  if (pathname.startsWith('/api')) {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    const rateResult = checkRateLimit(ip, 60, 60);

    if (!rateResult.isAllowed) {
      return new NextResponse(
        JSON.stringify({
          error: 'Prea multe cereri. Rate limit depășit pentru protecție anti-scraping.',
          retryAfterSeconds: rateResult.resetInSeconds,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(rateResult.resetInSeconds),
          },
        }
      );
    }
  }

  const response = NextResponse.next();

  // Basic security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
