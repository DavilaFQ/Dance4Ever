export async function hashPassword(password: string): Promise<string | null> {
  try {
    const data = new TextEncoder().encode(password + ':d4e-dashboard-salt-v1')
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    // crypto.subtle not available (non-localhost, non-HTTPS)
    return null
  }
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const h = await hashPassword(password)
  return h !== null && h === storedHash
}
