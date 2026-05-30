import { RegistrationAct, RegistrationDancer } from './supabase'

export interface ScheduleItem {
  id: string
  act: Pick<RegistrationAct, 'dancer_ids' | 'age_category' | 'modality'>
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
    return ma - mb
  })

  const byCategory = new Map<string, T[]>()
  for (const item of sorted) {
    const cat = item.act.age_category || 'open'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(item)
  }

  const result: T[] = []

  for (const cat of CATEGORY_ORDER) {
    const catItems = byCategory.get(cat)
    if (!catItems || catItems.length === 0) continue

    const byReg = new Map<number, T[]>()
    for (const item of catItems) {
      const rid = item.reg.id
      if (!byReg.has(rid)) byReg.set(rid, [])
      byReg.get(rid)!.push(item)
    }

    const regGroups = Array.from(byReg.values())
    const scheduled: T[] = []
    let round = 0
    let hasMore = true

    while (hasMore) {
      hasMore = false
      for (const acts of regGroups) {
        if (round < acts.length) {
          scheduled.push(acts[round])
          hasMore = true
        }
      }
      round++
    }

    result.push(...scheduled)
  }

  return result
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
