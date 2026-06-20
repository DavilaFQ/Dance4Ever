import { supabase } from './supabase'

export interface PortalConfig {
  enableOperations: boolean
  enableRegistration: boolean
  scheduledStartTime?: string | null
}

export const DEFAULT_CONFIG: PortalConfig = {
  enableOperations: true,
  enableRegistration: true,
  scheduledStartTime: null,
}

/**
 * Obtiene la configuración de portales actual para un evento específico.
 */
export async function fetchPortalConfig(eventId: string): Promise<PortalConfig> {
  if (!eventId) return DEFAULT_CONFIG
  try {
    const { data, error } = await supabase
      .from('event_checklist')
      .select('notes')
      .eq('event_id', eventId)
      .eq('category', 'system_config')
      .eq('text', 'PORTAL_STATUS')
      .maybeSingle()

    if (error) {
      console.error('Error fetching portal config:', error)
      return DEFAULT_CONFIG
    }

    if (data && data.notes) {
      try {
        const parsed = JSON.parse(data.notes)
        return {
          enableOperations: typeof parsed.enableOperations === 'boolean' ? parsed.enableOperations : true,
          enableRegistration: typeof parsed.enableRegistration === 'boolean' ? parsed.enableRegistration : true,
          scheduledStartTime: parsed.scheduledStartTime || null,
        }
      } catch {
        return DEFAULT_CONFIG
      }
    }
  } catch (e) {
    console.error('Error in fetchPortalConfig:', e)
  }
  return DEFAULT_CONFIG
}

/**
 * Guarda la configuración de portales actual para un evento específico.
 */
export async function savePortalConfig(eventId: string, config: PortalConfig): Promise<void> {
  if (!eventId) return
  try {
    // Buscar si ya existe la fila de configuración para este evento
    const { data: existing, error: fetchErr } = await supabase
      .from('event_checklist')
      .select('id')
      .eq('event_id', eventId)
      .eq('category', 'system_config')
      .eq('text', 'PORTAL_STATUS')
      .maybeSingle()

    if (fetchErr) throw fetchErr

    const notesStr = JSON.stringify(config)

    if (existing) {
      // Actualizar registro existente
      const { error } = await supabase
        .from('event_checklist')
        .update({ notes: notesStr })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      // Insertar nuevo registro de configuración
      const { error } = await supabase
        .from('event_checklist')
        .insert({
          event_id: eventId,
          category: 'system_config',
          text: 'PORTAL_STATUS',
          priority: 'alta',
          completed: false,
          notes: notesStr,
        })
      if (error) throw error
    }
  } catch (e) {
    console.error('Error saving portal config:', e)
    throw e
  }
}

/**
 * Se suscribe en tiempo real a los cambios de configuración para un evento específico.
 * Retorna una función para cancelar la suscripción.
 */
export function subscribePortalConfig(eventId: string, callback: (config: PortalConfig) => void): () => void {
  if (!eventId) return () => {}

  // Carga inicial asíncrona
  fetchPortalConfig(eventId).then(callback)

  const channelName = `realtime:portal_config:${eventId}`
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'event_checklist',
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => {
        const record = (payload.eventType === 'DELETE' ? payload.old : payload.new) as any
        if (record && record.category === 'system_config' && record.text === 'PORTAL_STATUS') {
          if (payload.eventType === 'DELETE') {
            callback(DEFAULT_CONFIG)
          } else if (record.notes) {
            try {
              const parsed = JSON.parse(record.notes)
              callback({
                enableOperations: typeof parsed.enableOperations === 'boolean' ? parsed.enableOperations : true,
                enableRegistration: typeof parsed.enableRegistration === 'boolean' ? parsed.enableRegistration : true,
                scheduledStartTime: parsed.scheduledStartTime || null,
              })
            } catch {
              callback(DEFAULT_CONFIG)
            }
          }
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
