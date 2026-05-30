export function formatMoney(n: number): string {
  if (typeof window !== 'undefined' && window.localStorage?.getItem('hideFinancials') === 'true') {
    return '$ ••••'
  }
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '-'
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'hace unos segundos'
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

export function formatDate(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

import { toDate } from '@/lib/date'

export function safeFormatDate(iso: unknown, options?: Intl.DateTimeFormatOptions): string {
  if (!iso) return 'Sin fecha'
  try {
    const str = String(iso).trim()
    if (!str || str === 'null' || str === 'undefined') return 'Sin fecha'
    const d = toDate(str)
    if (!d) return str
    return d.toLocaleDateString('es-MX', options || { dateStyle: 'long' })
  } catch {
    return typeof iso === 'string' ? iso : 'Sin fecha'
  }
}

export function formatDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

export function formatBirthdate(iso: string): string {
  if (!iso) return ''
  try {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  } catch {
    return iso
  }
}

export function ageFromBirthdate(iso: string, ref: Date = new Date()): number | null {
  if (!iso) return null
  const b = new Date(iso)
  if (isNaN(b.getTime())) return null
  let age = ref.getFullYear() - b.getFullYear()
  if (ref.getMonth() < b.getMonth() || (ref.getMonth() === b.getMonth() && ref.getDate() < b.getDate())) age--
  return age < 0 ? 0 : age
}

export function generateToken(len = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export function isEditedAfterConfirm(r: { confirmed_at: string | null; submitted_at: string }): boolean {
  if (!r.confirmed_at || !r.submitted_at) return false
  const confirmed = new Date(r.confirmed_at).getTime()
  const submitted = new Date(r.submitted_at).getTime()
  return submitted > confirmed + 5000
}
