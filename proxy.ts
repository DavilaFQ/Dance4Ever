import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SECRET = process.env.MAINTENANCE_SECRET || 'd4e2026'

export function proxy(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE === 'false') return NextResponse.next()

  const pathname = request.nextUrl.pathname

  if (
    pathname === '/maintenance' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo.png'
  ) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get('d4e_sudo')?.value
  if (cookie === SECRET) return NextResponse.next()

  const sudo = request.nextUrl.searchParams.get('sudo')
  if (sudo === SECRET) {
    const url = new URL(pathname, request.url)
    const res = NextResponse.redirect(url)
    res.cookies.set('d4e_sudo', SECRET, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    })
    return res
  }

  return NextResponse.redirect(new URL('/maintenance', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
