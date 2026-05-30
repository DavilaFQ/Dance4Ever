/**
 * Parse a date-field value from Supabase.
 * Handles both date-only strings ("YYYY-MM-DD") and full ISO timestamps.
 * Returns null for null/undefined/empty values.
 */
export function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  if (value.includes('T')) {
    const datePart = value.slice(0, 10)
    const d = new Date(datePart + 'T00:00:00')
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

/**
 * Parse a date-field value as end-of-day (23:59:59.999 local time).
 * Used for deadline comparisons where "before or on the deadline" is the check.
 */
export function toEndOfDay(value: string | null | undefined): Date | null {
  if (!value) return null
  let d: Date
  if (value.includes('T')) {
    d = new Date(value.slice(0, 10) + 'T00:00:00')
  } else {
    d = new Date(value + 'T00:00:00')
  }
  if (isNaN(d.getTime())) return null
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Format a date value for display using locale.
 */
export function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const d = toDate(value)
  if (!d) return ''
  return d.toLocaleDateString('es-MX', options ?? { dateStyle: 'long' })
}

/**
 * Slice a date value to "YYYY-MM-DD" format for <input type="date">.
 */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  if (value.includes('T')) return value.slice(0, 10)
  return value
}

/**
 * Slice a datetime value to "YYYY-MM-DDTHH:MM" for <input type="datetime-local">.
 */
export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  if (value.includes('T')) return value.slice(0, 16)
  return value + 'T00:00'
}
