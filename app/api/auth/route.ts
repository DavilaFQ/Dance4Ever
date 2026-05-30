import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { password } = await request.json()
    const secret = process.env.MAINTENANCE_SECRET || 'd4e2026'

    if (password === secret) {
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { success: false, error: 'Contraseña incorrecta' },
      { status: 401 }
    )
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Petición inválida' },
      { status: 400 }
    )
  }
}
