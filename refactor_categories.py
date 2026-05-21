import re

with open("app/register/[eventId]/page.tsx", "r") as f:
    content = f.read()

# 1. Replace requiredDancers
content = re.sub(
    r'function requiredDancers\(m: Modality \| null\): number \| null \{\n\s*if \(m === \'solista\'\) return 1\n\s*if \(m === \'dueto\'\) return 2\n\s*if \(m === \'trio\'\) return 3\n\s*return null\n\}',
    '''function minDancers(m: Modality | null): number {
  if (m === 'solista') return 1
  if (m === 'dueto') return 2
  if (m === 'trio') return 3
  if (m === 'grupal') return 4
  return 0
}

function maxDancers(m: Modality | null): number {
  if (m === 'solista') return 1
  if (m === 'dueto') return 2
  if (m === 'trio') return 3
  if (m === 'grupal') return 100
  return 0
}''',
    content
)

# 2. Update nextStep
content = re.sub(
    r'    case \'act_modality\': \{\n\s*const act = state\.acts\[current\.i\]\n\s*if \(act\.modality === \'grupal\'\) return \{ kind: \'act_grupal_category\', i: current\.i \}\n\s*return \{ kind: \'act_style\', i: current\.i \}\n\s*\}\n\s*case \'act_grupal_category\': return \{ kind: \'act_level\', i: current\.i \}\n\s*case \'act_level\': return \{ kind: \'act_style\', i: current\.i \}\n\s*case \'act_style\': \{\n\s*const act = state\.acts\[current\.i\]\n\s*const needs = requiredDancers\(act\.modality\)\n\s*if \(needs !== null\) return \{ kind: \'act_dancers\', i: current\.i \}\n\s*const ni = current\.i \+ 1\n\s*if \(ni < \(state\.actCount \?\? 0\)\) return \{ kind: \'act_modality\', i: ni \}\n\s*return \{ kind: \'costs\' \}\n\s*\}',
    '''    case 'act_modality': {
      const act = state.acts[current.i]
      if (act.modality === 'grupal') return { kind: 'act_level', i: current.i }
      return { kind: 'act_style', i: current.i }
    }
    case 'act_level': return { kind: 'act_style', i: current.i }
    case 'act_style': {
      return { kind: 'act_dancers', i: current.i }
    }''',
    content
)

# 3. Update prevStep
content = re.sub(
    r'    case \'act_modality\': \{\n\s*if \(current\.i === 0\) return \{ kind: \'act_count\' \}\n\s*const prev = current\.i - 1\n\s*const prevAct = state\.acts\[prev\]\n\s*const needs = requiredDancers\(prevAct\.modality\)\n\s*if \(needs !== null\) return \{ kind: \'act_dancers\', i: prev \}\n\s*return \{ kind: \'act_style\', i: prev \}\n\s*\}\n\s*case \'act_grupal_category\': return \{ kind: \'act_modality\', i: current\.i \}\n\s*case \'act_level\': return \{ kind: \'act_grupal_category\', i: current\.i \}\n\s*case \'act_style\': \{\n\s*const act = state\.acts\[current\.i\]\n\s*if \(act\.modality === \'grupal\'\) return \{ kind: \'act_level\', i: current\.i \}\n\s*return \{ kind: \'act_modality\', i: current\.i \}\n\s*\}\n\s*case \'act_dancers\': return \{ kind: \'act_style\', i: current\.i \}\n\s*case \'costs\': \{\n\s*const last = \(state\.actCount \?\? 1\) - 1\n\s*const lastAct = state\.acts\[last\]\n\s*const needs = requiredDancers\(lastAct\.modality\)\n\s*if \(needs !== null\) return \{ kind: \'act_dancers\', i: last \}\n\s*return \{ kind: \'act_style\', i: last \}\n\s*\}',
    '''    case 'act_modality': {
      if (current.i === 0) return { kind: 'act_count' }
      const prev = current.i - 1
      return { kind: 'act_dancers', i: prev }
    }
    case 'act_level': return { kind: 'act_modality', i: current.i }
    case 'act_style': {
      const act = state.acts[current.i]
      if (act.modality === 'grupal') return { kind: 'act_level', i: current.i }
      return { kind: 'act_modality', i: current.i }
    }
    case 'act_dancers': return { kind: 'act_style', i: current.i }
    case 'costs': {
      const last = (state.actCount ?? 1) - 1
      return { kind: 'act_dancers', i: last }
    }''',
    content
)

# 4. Remove `case 'act_grupal_category':` block entirely
content = re.sub(r'    case \'act_grupal_category\': \{.*?\}\n\n    case \'act_level\': \{', "    case 'act_level': {", content, flags=re.DOTALL)

# 5. Rewrite act_dancers to remove lockedCategory and use min/max
# Replace from `case 'act_dancers': {` to the end of the block.
# Wait, let's just do a manual string replacement for the `toggle` function and the rendering.
old_act_dancers = r'''    case 'act_dancers': {
      const i = step.i
      const a = state.acts[i]
      const needs = requiredDancers(a.modality) ?? 0
      const selected = a.dancerIndices.length
      const valid = selected === needs

      // Group all team dancers by category, sort groups lowest first
      const grouped = new Map<AgeCategory, { d: Dancer, di: number }[]>()
      state.dancers.forEach((d, di) => {
        const cat = effectiveCategory(d)
        if (!cat) return
        if (!grouped.has(cat)) grouped.set(cat, [])
        grouped.get(cat)!.push({ d, di })
      })
      const sortedCats = AGE_CATEGORY_ORDER.filter(c => grouped.has(c))

      // Lock category: if any selected, use that one's category
      const firstSelected = a.dancerIndices[0]
      const lockedCategory: AgeCategory | null = firstSelected !== undefined
        ? effectiveCategory(state.dancers[firstSelected])
        : null

      function toggle(di: number) {
        const d = state.dancers[di]
        const dCat = effectiveCategory(d)
        const cur = a.dancerIndices
        if (cur.includes(di)) {
          const next = cur.filter(x => x !== di)
          // Update act ageCategory if list becomes empty
          updateAct(i, { dancerIndices: next, ageCategory: next.length > 0 ? a.ageCategory : null })
          return
        }
        // Adding: must match locked category
        if (lockedCategory && dCat !== lockedCategory) return
        if (cur.length >= needs) return
        const next = [...cur, di]
        updateAct(i, { dancerIndices: next, ageCategory: dCat })
      }

      return (
        <div className="flex flex-col h-auto lg:h-full max-h-full min-h-0">
          <div className="text-center space-y-3 shrink-0 mb-5">
            <p className="font-display text-xs md:text-sm tracking-[0.4em] text-[rgb(var(--c-primary))]">
              {`SELECCIONA ${needs} ${needs === 1 ? 'ALUMNO/A' : 'ALUMNOS/AS'}`}
              {lockedCategory && ` · ${AGE_CATEGORY_LABELS[lockedCategory].toUpperCase()}`}
            </p>
            <h2 className="font-display text-3xl md:text-4xl leading-tight text-[rgb(var(--c-text-strong))]">{`Acto ${i + 1} · ${a.modality ? modalityLabel(a.modality) : ''}`}</h2>
          </div>
          {sortedCats.length === 0 ? (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <p className="text-[rgb(var(--c-text))] text-center text-base italic">
                No hay integrantes con fecha de nacimiento válida en el equipo.<br />
                Regresa y verifica los datos de los alumnos/as.
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
              {sortedCats.map(cat => {
                const list = grouped.get(cat)!
                const disabled = lockedCategory !== null && cat !== lockedCategory
                return (
                  <div key={cat} className={disabled ? 'opacity-30' : ''}>
                    <p className="font-display text-xs tracking-[0.4em] text-[rgb(var(--c-primary))] mb-2 sticky top-0 bg-[rgb(var(--c-surface))] py-1.5 z-10">
                      {AGE_CATEGORY_LABELS[cat].toUpperCase()} · {AGE_CATEGORY_HINTS[cat]}
                    </p>
                    <div className={`grid ${list.length > 6 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                      {list.map(({ d, di }) => {
                        const isSel = a.dancerIndices.includes(di)
                        return (
                          <button
                            key={di}
                            onClick={() => toggle(di)}
                            disabled={disabled}
                            className={`text-left px-4 py-3 rounded-2xl flex items-center gap-3 border transition-all active:scale-[0.98] duration-150 ${
                              isSel
                                ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm'
                                : disabled
                                  ? 'bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text)/0.4)] border-[rgb(var(--c-border)/0.5)] cursor-not-allowed opacity-55'
                                  : 'bg-white border-[rgb(var(--c-border))] text-[rgb(var(--c-text-strong))] active:bg-[rgb(var(--c-surface-2))] hover:bg-[rgb(var(--c-surface-2))]'
                            }`}
                          >
                            <span className="font-display text-base opacity-50 w-7 text-center shrink-0">{di + 1}</span>
                            <span className="font-display text-xl flex-1 uppercase truncate">{d.name || `Alumno/a ${di + 1}`}</span>
                            {isSel && <Check className="w-5 h-5 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="shrink-0 pt-2 lg:pt-3">
            <NextButton isKeyboardOpen={isKeyboardOpen} onClick={() => { syncActsArray(); onNext() }} disabled={!valid} />
          </div>
        </div>
      )
    }'''

new_act_dancers = r'''    case 'act_dancers': {
      const i = step.i
      const a = state.acts[i]
      const minN = minDancers(a.modality)
      const maxN = maxDancers(a.modality)
      const selected = a.dancerIndices.length
      const valid = selected >= minN && selected <= maxN

      // Group all team dancers by category, sort groups lowest first
      const grouped = new Map<AgeCategory, { d: Dancer, di: number }[]>()
      state.dancers.forEach((d, di) => {
        const cat = effectiveCategory(d)
        if (!cat) return
        if (!grouped.has(cat)) grouped.set(cat, [])
        grouped.get(cat)!.push({ d, di })
      })
      const sortedCats = AGE_CATEGORY_ORDER.filter(c => grouped.has(c))

      function toggle(di: number) {
        const cur = a.dancerIndices
        let next: number[]
        if (cur.includes(di)) {
          next = cur.filter(x => x !== di)
        } else {
          if (cur.length >= maxN) return
          next = [...cur, di]
        }
        
        // Auto-calculate the highest category among selected dancers
        const selectedCategories = next.map(idx => effectiveCategory(state.dancers[idx])).filter(Boolean) as AgeCategory[]
        let highestCategory: AgeCategory | null = null
        if (selectedCategories.length > 0) {
          const maxIndex = Math.max(...selectedCategories.map(c => AGE_CATEGORY_ORDER.indexOf(c)))
          highestCategory = AGE_CATEGORY_ORDER[maxIndex]
        }
        
        updateAct(i, { dancerIndices: next, ageCategory: highestCategory })
      }

      return (
        <div className="flex flex-col h-auto lg:h-full max-h-full min-h-0">
          <div className="text-center space-y-3 shrink-0 mb-5">
            <p className="font-display text-xs md:text-sm tracking-[0.4em] text-[rgb(var(--c-primary))]">
              {a.modality === 'grupal' ? `SELECCIONA DE 4 A 100 ALUMNOS/AS` : `SELECCIONA ${minN} ${minN === 1 ? 'ALUMNO/A' : 'ALUMNOS/AS'}`}
            </p>
            <h2 className="font-display text-3xl md:text-4xl leading-tight text-[rgb(var(--c-text-strong))]">{`Acto ${i + 1} · ${a.modality ? modalityLabel(a.modality) : ''}`}</h2>
            <div className="flex flex-col items-center justify-center gap-1">
              <span className="text-[rgb(var(--c-text))] text-sm">Categoría del acto (Calculada):</span>
              <span className={`font-display text-lg px-3 py-1 rounded-lg ${a.ageCategory ? 'bg-[rgb(var(--c-primary))] text-white' : 'bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text)/0.5)]'}`}>
                {a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory].toUpperCase() : 'SELECCIONA ALUMNOS'}
              </span>
            </div>
          </div>
          {sortedCats.length === 0 ? (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <p className="text-[rgb(var(--c-text))] text-center text-base italic">
                No hay integrantes con fecha de nacimiento válida en el equipo.<br />
                Regresa y verifica los datos de los alumnos/as.
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
              {sortedCats.map(cat => {
                const list = grouped.get(cat)!
                return (
                  <div key={cat}>
                    <p className="font-display text-xs tracking-[0.4em] text-[rgb(var(--c-primary))] mb-2 sticky top-0 bg-[rgb(var(--c-surface))] py-1.5 z-10">
                      {AGE_CATEGORY_LABELS[cat].toUpperCase()} · {AGE_CATEGORY_HINTS[cat]}
                    </p>
                    <div className={`grid ${list.length > 6 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                      {list.map(({ d, di }) => {
                        const isSel = a.dancerIndices.includes(di)
                        return (
                          <button
                            key={di}
                            onClick={() => toggle(di)}
                            className={`text-left px-4 py-3 rounded-2xl flex items-center gap-3 border transition-all active:scale-[0.98] duration-150 ${
                              isSel
                                ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm'
                                : 'bg-white border-[rgb(var(--c-border))] text-[rgb(var(--c-text-strong))] active:bg-[rgb(var(--c-surface-2))] hover:bg-[rgb(var(--c-surface-2))]'
                            }`}
                          >
                            <span className="font-display text-base opacity-50 w-7 text-center shrink-0">{di + 1}</span>
                            <span className="font-display text-xl flex-1 uppercase truncate">{d.name || `Alumno/a ${di + 1}`}</span>
                            {isSel && <Check className="w-5 h-5 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="shrink-0 pt-2 lg:pt-3">
            <NextButton isKeyboardOpen={isKeyboardOpen} onClick={() => { syncActsArray(); onNext() }} disabled={!valid} />
          </div>
        </div>
      )
    }'''

content = content.replace(old_act_dancers, new_act_dancers)

with open("app/register/[eventId]/page.tsx", "w") as f:
    f.write(content)
