import { Modality, AgeCategory, Level } from '@/lib/supabase'

export type Coach = {
  name: string
  phone: string
  email: string
  assistants: string[]
}

export type Dancer = {
  name: string
  birthdate: string
  categoryOverride: AgeCategory | null
}

export type Act = {
  modality: Modality | null
  ageCategory: AgeCategory | null
  level: Level | null
  style: string | null
  dancerIndices: number[]
}

export type State = {
  coach: Coach
  academy: string
  city: string
  teamName: string
  teamSize: number | null
  dancers: Dancer[]
  actCount: number | null
  acts: Act[]
  costPaquete: number | null
  costRepeticion: number | null
  confirmedRegistrationId: number | null
  ticketsCount: number
  confirmedAt?: string | null
  notes: string
  signature: string | null
}

export type Step =
  | { kind: 'welcome' }
  | { kind: 'setup' }
  | { kind: 'dancers' }
  | { kind: 'acts' }
  | { kind: 'summary' }
  | { kind: 'carta' }
  | { kind: 'pending' }
  | { kind: 'confirmed' }
  | { kind: 'selector' }

export const STYLES = ['Jazz', 'Poms', 'Acro Jazz', 'Hip Hop', 'Show', 'Ballet', 'Contempo']

export const CATEGORY_COLORS: Record<AgeCategory, { bg: string; border: string; text: string }> = {
  tiny: { bg: 'bg-rose-100', border: 'border-rose-300 focus-within:border-rose-500', text: 'text-rose-700' },
  mini: { bg: 'bg-orange-100', border: 'border-orange-300 focus-within:border-orange-500', text: 'text-orange-700' },
  elementary: { bg: 'bg-amber-100', border: 'border-amber-300 focus-within:border-amber-500', text: 'text-amber-700' },
  junior: { bg: 'bg-emerald-100', border: 'border-emerald-300 focus-within:border-emerald-500', text: 'text-emerald-700' },
  senior: { bg: 'bg-teal-100', border: 'border-teal-300 focus-within:border-teal-500', text: 'text-teal-700' },
  college: { bg: 'bg-indigo-100', border: 'border-indigo-300 focus-within:border-indigo-500', text: 'text-indigo-700' },
  open: { bg: 'bg-purple-100', border: 'border-purple-300 focus-within:border-purple-500', text: 'text-purple-700' },
}

export const DEFAULT_DANCER_COLOR = {
  bg: 'bg-[rgb(var(--c-primary)/0.02)]',
  border: 'border-[rgb(var(--c-primary)/0.15)] focus-within:border-[rgb(var(--c-primary))]',
  text: 'text-[rgb(var(--c-primary))]'
}

export const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: 'solista', label: 'SOLISTA' },
  { value: 'dueto', label: 'DUETO' },
  { value: 'trio', label: 'TRÍO' },
  { value: 'grupal', label: 'GRUPAL' },
]
