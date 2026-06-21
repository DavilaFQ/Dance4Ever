import { RegistrationAct, RegistrationDancer } from './supabase'

export interface ScheduleItem {
  id: string
  act: Pick<RegistrationAct, 'dancer_ids' | 'age_category' | 'modality' | 'style'>
  reg: {
    id: number
    academy: string
    dancers: Pick<RegistrationDancer, 'id' | 'name'>[]
  }
}

export type Conflict = {
  dancerId: number
  dancerName: string
  registrationName: string
  positionA: number
  positionB: number
  gap: number
}

const CATEGORY_ORDER = ['tiny', 'mini', 'elementary', 'junior', 'senior', 'college', 'open']
const MODALITY_ORDER = ['solista', 'dueto', 'trio', 'grupal']

export function detectConflicts<T extends ScheduleItem>(
  items: T[],
  minGap: number
): Conflict[] {
  const conflicts: Conflict[] = []

  for (const regId of new Set(items.map(i => i.reg.id))) {
    const regItems = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.reg.id === regId)

    const dancerSet = new Set<number>()
    regItems.forEach(({ item }) => {
      (item.act.dancer_ids || []).forEach(did => dancerSet.add(did))
    })

    for (const dancerId of dancerSet) {
      const positions = regItems
        .filter(({ item }) => (item.act.dancer_ids || []).includes(dancerId))
        .map(({ idx }) => idx)
        .sort((a, b) => a - b)

      if (positions.length < 2) continue

      for (let i = 0; i < positions.length - 1; i++) {
        const gap = positions[i + 1] - positions[i] - 1
        if (gap < minGap) {
          const reg = regItems[0].item.reg
          const dancer = reg.dancers.find(d => d.id === dancerId)
          conflicts.push({
            dancerId,
            dancerName: dancer?.name || `Bailarín #${dancerId}`,
            registrationName: reg.academy,
            positionA: positions[i] + 1,
            positionB: positions[i + 1] + 1,
            gap,
          })
        }
      }
    }
  }

  return conflicts
}

export function autoSchedule<T extends ScheduleItem>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => {
    const ca = a.act.age_category ? CATEGORY_ORDER.indexOf(a.act.age_category) : 99
    const cb = b.act.age_category ? CATEGORY_ORDER.indexOf(b.act.age_category) : 99
    if (ca !== cb) return ca - cb

    const ma = MODALITY_ORDER.indexOf(a.act.modality)
    const mb = MODALITY_ORDER.indexOf(b.act.modality)
    if (ma !== mb) return ma - mb

    const sa = a.act.style || ''
    const sb = b.act.style || ''
    return sa.localeCompare(sb)
  })

  return sorted
}


export function getConflictsForItem(
  conflicts: Conflict[],
  itemIndex: number
): Conflict[] {
  return conflicts.filter(
    c => c.positionA === itemIndex + 1 || c.positionB === itemIndex + 1
  )
}

export function buildConflictMap(
  conflicts: Conflict[]
): Map<number, Conflict[]> {
  const map = new Map<number, Conflict[]>()
  for (const c of conflicts) {
    const add = (pos: number) => {
      const idx = pos - 1
      if (!map.has(idx)) map.set(idx, [])
      map.get(idx)!.push(c)
    }
    add(c.positionA)
    add(c.positionB)
  }
  return map
}
