import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Coach = {
  id: string
  event_id: string
  name: string
  created_at: string
}

export type Participant = {
  id: number
  position: number
  type: string
  style: string
  category: string
  name: string
  academy: string
  city: string
  event_id: string
  coach_id: string | null
  present: boolean | null
  created_at?: string
}

export type Event = {
  id: string
  name: string
  date: string
  current_position: number
  on_deck_count: number
  awards_mode: boolean
  started_at: string | null
  registration_token: string | null
  created_at: string
  default_cost_paquete: number
  default_cost_repeticion: number
  cost_asistente: number
  cost_entrada_temprana: number
  cost_entrada_tardia: number
  deadline_precio_entrada: string | null
  deadline_registro: string | null
  deadline_cambios: string | null
  fecha_cambio_tarifa_coreo: string | null
  dancers_por_asistente_gratis: number
}

export type Modality = 'solista' | 'dueto' | 'trio' | 'grupal'
export type AgeCategory = 'tiny' | 'mini' | 'elementary' | 'junior' | 'senior' | 'college' | 'open' | 'allstar'
export type Level = 'basico' | 'avanzado'

export const AGE_CATEGORY_ORDER: AgeCategory[] = ['tiny', 'mini', 'elementary', 'junior', 'senior', 'college', 'open', 'allstar']

export const AGE_CATEGORY_LABELS: Record<AgeCategory, string> = {
  tiny: 'Tiny',
  mini: 'Mini',
  elementary: 'Elementary',
  junior: 'Junior',
  senior: 'Senior',
  college: 'College',
  open: 'Open',
  allstar: 'AllStar',
}

export const AGE_CATEGORY_HINTS: Record<AgeCategory, string> = {
  tiny: 'Kinder - 3-5 años',
  mini: '1 a 3 Primaria - 6-8 años',
  elementary: '4 a 6 Primaria - 9-11 años',
  junior: 'Secundaria - 12-14 años',
  senior: 'Preparatoria - 15-17 años',
  college: 'Universidad - 18-21 años',
  open: 'Mayores de 21 años',
  allstar: 'Categoría Especial',
}

export function categoryFromAge(age: number): AgeCategory {
  if (age <= 5) return 'tiny'
  if (age <= 8) return 'mini'
  if (age <= 11) return 'elementary'
  if (age <= 14) return 'junior'
  if (age <= 17) return 'senior'
  if (age <= 21) return 'college'
  return 'open'
}

export function categoryFromBirthdate(iso: string, refDate: Date = new Date()): AgeCategory | null {
  if (!iso) return null
  const b = new Date(iso)
  if (isNaN(b.getTime())) return null
  let age = refDate.getFullYear() - b.getFullYear()
  if (refDate.getMonth() < b.getMonth() || (refDate.getMonth() === b.getMonth() && refDate.getDate() < b.getDate())) age--
  if (age < 0) return null
  return categoryFromAge(age)
}

export type CoachRegistration = {
  id: number
  event_id: string
  coach_name: string
  coach_phone: string
  coach_email: string | null
  extra_coaches: string[]
  academy: string
  team_name: string
  cost_paquete: number | null
  cost_repeticion: number | null
  confirmed_at: string | null
  submitted_at: string
  tickets_count: number | null
  notes: string | null
  paid: number
  payment_notes: string | null
  updated_at?: string
  signature?: string
  draft_id?: string | null
}

export type RegistrationDancer = {
  id: number
  registration_id: number
  name: string
  birthdate: string
  category: AgeCategory | null
  category_manual: boolean | null
  order_idx: number
  created_at?: string
}

export type RegistrationAct = {
  id: number
  registration_id: number
  modality: Modality
  age_category: AgeCategory | null
  level: Level | null
  style: string
  order_idx: number
  dancer_ids: number[]
  created_at?: string
}

export type EditLog = {
  id: number
  registration_id: number
  edited_by: string
  action: string
  entity_type: string | null
  entity_id: number | null
  changes: Record<string, { old: unknown; new: unknown }>
  snapshot: Record<string, unknown> | null
  created_at: string
}

export type ProgramDraft = {
  event_id: string
  act_order: number[]
  intermedio_index: number | null
  min_gap: number
  updated_at: string
}

export type RegistrationDraftRow = {
  draft_id: string
  event_id: string
  state: Record<string, unknown>
  updated_at: string
}

export type EventSnapshot = {
  id: string
  event_id: string
  label: string
  created_at: string
}
