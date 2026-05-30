export const STATUS = {
  success: '#22c55e',
  warning: '#f97316',
  danger: '#ef4444',
  info: '#eab308',
  muted: '#737373',
  primary: '#d946ef',
  primaryStrong: '#c026d3',
} as const

export const TAB = {
  resumen: '#38bdf8',
  registros: '#818cf8',
  finanzas: '#2dd4bf',
  programa: '#fb923c',
  checklist: '#fb7185',
  eventos: '#a78bfa',
} as const

export type TabId = keyof typeof TAB

export const CHART = {
  sky: TAB.resumen,
  indigo: TAB.registros,
  teal: TAB.finanzas,
  orange: TAB.programa,
  rose: TAB.checklist,
  purple: TAB.eventos,
  emerald: '#34d399',
  primary: '#d946ef',
  accent: '#fbbf24',
  success: '#4ade80',
} as const

export const CATEGORY = {
  tiny: { bg: '#fce7f3', text: '#db2777', border: '#fbcfe8' },
  mini: { bg: '#ffedd5', text: '#ea580c', border: '#fed7aa' },
  elementary: { bg: '#fef3c7', text: '#d97706', border: '#fde68a' },
  junior: { bg: '#dcfce7', text: '#16a34a', border: '#bbf7d0' },
  senior: { bg: '#ccfbf1', text: '#0d9488', border: '#99f6e4' },
  college: { bg: '#e0e7ff', text: '#4f46e5', border: '#c7d2fe' },
  open: { bg: '#f3e8ff', text: '#7c3aed', border: '#e9d5ff' },
} as const

export const WHATSAPP = '#25D366' as const
export const WHATSAPP_HOVER = '#20BA5A' as const
