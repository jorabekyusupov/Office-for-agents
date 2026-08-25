import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hasSession = request.cookies.get('better-auth.session_token')?.value;
  if (!hasSession) {
    const signIn = new URL('/sign-in', request.url);
    signIn.searchParams.set('returnTo', request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = { matcher: ['/office/:path*'] };
