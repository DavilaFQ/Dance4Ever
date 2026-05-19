import { supabase } from './supabase'

let clockOffsetMs = 0

export async function syncServerTime(): Promise<void> {
  try {
    const before = Date.now()
    const { data, error } = await supabase.rpc('server_now')
    const after = Date.now()
    if (error || !data) return
    const serverMs = new Date(data as string).getTime()
    const localMid = (before + after) / 2
    clockOffsetMs = serverMs - localMid
  } catch {
    // keep previous offset
  }
}

export function serverNow(): number {
  return Date.now() + clockOffsetMs
}
