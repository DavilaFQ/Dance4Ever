import re

with open("app/register/[eventId]/page.tsx", "r") as f:
    content = f.read()

# Replace the switch cases for summary and confirmed
old_summary_cases = r'''    case 'summary':
      return isMobile ? (
        <MobileSummary
          state={state}
          editMode={editMode}
          tab={mobileSummaryTab}
          setTab={setMobileSummaryTab}
          confirm={confirm}
          saving={saving}
          saveErr={saveErr}
          onEditRequest={openEditMenu}
        />
      ) : (
        <SummaryGrid
          state={state}
          editMode={editMode}
          confirm={confirm}
          saving={saving}
          saveErr={saveErr}
          onEditRequest={openEditMenu}
        />
      )

    case 'confirmed':
      return isMobile ? (
        <MobileSummary
          state={state}
          editMode={false}
          tab={mobileSummaryTab}
          setTab={setMobileSummaryTab}
          confirmed
          startEdit={startEdit}
        />
      ) : (
        <SummaryGrid
          state={state}
          editMode={false}
          confirmed
          startEdit={startEdit}
        />
      )'''

new_summary_cases = r'''    case 'summary':
      return (
        <FullSummary
          state={state}
          editMode={editMode}
          confirm={confirm}
          saving={saving}
          saveErr={saveErr}
          onEditRequest={openEditMenu}
        />
      )

    case 'confirmed':
      return (
        <FullSummary
          state={state}
          editMode={false}
          confirmed
          startEdit={startEdit}
        />
      )'''

content = content.replace(old_summary_cases, new_summary_cases)

# Now remove MobileSummary, SummaryGrid, Card, Summary, SummaryBlock and replace them with FullSummary
# Let's find the start of MobileSummary
start_str = "function MobileSummary({ state, editMode, tab, setTab, confirmed, confirm, saving, saveErr, startEdit, onEditRequest }: {"
start_idx = content.find(start_str)

if start_idx != -1:
    content = content[:start_idx] + r'''function FullSummary({ state, editMode, confirmed, confirm, saving, saveErr, startEdit, onEditRequest }: {
  state: State
  editMode: boolean
  confirmed?: boolean
  confirm?: () => Promise<void>
  saving?: boolean
  saveErr?: string | null
  startEdit?: () => void
  onEditRequest?: () => void
}) {
  const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
  const counts = participacionesPorAlumno(state)
  const total = costoTotal(state)
  const hasCosts = state.costPaquete !== null && state.costRepeticion !== null

  return (
    <div className="w-full flex flex-col h-full overflow-hidden">
      {confirmed && (
        <div className="shrink-0 bg-[#16A34A] text-white text-center py-4 px-4 shadow-md z-10">
          <p className="font-display text-xl md:text-2xl tracking-widest font-bold">¡REGISTRO CONFIRMADO EXITOSAMENTE!</p>
          <p className="text-sm opacity-90 mt-1">Tu información ha sido guardada en nuestro sistema.</p>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto px-2 md:px-4 lg:px-8 py-6 pb-32 space-y-8 bg-[rgb(var(--c-surface-2)/0.3)]">
        
        {/* COACH & ACADEMY */}
        <div className="bg-white rounded-3xl border border-[rgb(var(--c-border))] p-6 md:p-8 shadow-sm">
          <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.5)] pb-2">COACH Y ACADEMIA</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1">COACH PRINCIPAL</p>
              <p className="font-display text-2xl md:text-3xl text-[rgb(var(--c-text-strong))] uppercase leading-tight">{state.coach.name}</p>
              <p className="text-base text-[rgb(var(--c-text))] mt-2 flex items-center gap-2"><span className="opacity-70">📱</span> {state.coach.phone}</p>
              {state.coach.email && <p className="text-base text-[rgb(var(--c-text))] mt-1 flex items-center gap-2"><span className="opacity-70">✉️</span> {state.coach.email}</p>}
              {state.coach.extras.filter(e => e.trim()).length > 0 && (
                <p className="text-sm text-[rgb(var(--c-text))] mt-3"><span className="font-bold">Otros coaches:</span> {state.coach.extras.filter(e => e.trim()).join(', ')}</p>
              )}
            </div>
            <div>
              <p className="text-xs tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1">COLEGIO / ACADEMIA</p>
              <p className="font-display text-2xl md:text-3xl text-[rgb(var(--c-text-strong))] uppercase leading-tight">{state.academy}</p>
              <p className="text-xs tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1 mt-4">NOMBRE DEL EQUIPO</p>
              <p className="font-display text-2xl md:text-3xl text-[rgb(var(--c-success))] uppercase leading-tight">{state.teamName || state.academy}</p>
            </div>
          </div>
        </div>

        {/* COSTS */}
        {hasCosts && (
          <div className="bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] rounded-3xl p-6 md:p-8 shadow-md text-[rgb(var(--c-text-strong))]">
            <h3 className="font-display text-lg tracking-widest opacity-90 mb-4 border-b border-black/10 pb-2">COSTOS ACORDADOS</h3>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex gap-8 w-full md:w-auto">
                <div>
                  <p className="text-xs tracking-[0.2em] opacity-80 font-bold mb-1">1ª PARTICIPACIÓN</p>
                  <p className="font-display text-2xl">{formatMoney(state.costPaquete ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.2em] opacity-80 font-bold mb-1">REPETICIÓN</p>
                  <p className="font-display text-2xl">{formatMoney(state.costRepeticion ?? 0)}</p>
                </div>
              </div>
              <div className="w-full md:w-auto text-left md:text-right bg-white/30 rounded-2xl p-4 md:px-8">
                <p className="text-sm tracking-[0.2em] font-bold opacity-90 mb-1">TOTAL A PAGAR</p>
                <p className="font-display text-4xl md:text-6xl">{formatMoney(total)}</p>
              </div>
            </div>
          </div>
        )}

        {/* DANCERS */}
        <div className="bg-white rounded-3xl border border-[rgb(var(--c-border))] p-6 md:p-8 shadow-sm">
          <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.5)] pb-2 flex justify-between">
            <span>ALUMNOS/AS REGISTRADOS</span>
            <span className="text-[rgb(var(--c-text))] opacity-60">{filledDancers.length}</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            {filledDancers.length === 0 ? (
              <p className="text-[rgb(var(--c-text)/0.5)] italic text-lg col-span-full">Sin integrantes</p>
            ) : filledDancers.map((d) => {
              const di = state.dancers.indexOf(d)
              const n = counts.get(di) ?? 0
              const cost = hasCosts && n > 0 ? (state.costPaquete ?? 0) + Math.max(0, n - 1) * (state.costRepeticion ?? 0) : null
              return (
                <div key={di} className="flex items-center gap-3 border-b border-[rgb(var(--c-border)/0.3)] pb-2">
                  <span className="font-display text-xl text-[rgb(var(--c-text)/0.4)] w-6 text-right shrink-0">{di + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-lg uppercase text-[rgb(var(--c-text-strong))] truncate leading-tight">{d.name}</p>
                    <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-0.5">{formatBirthdate(d.birthdate)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {n > 0 && <span className="block text-sm text-[rgb(var(--c-primary))] font-bold">{n} acto{n === 1 ? '' : 's'}</span>}
                    {cost !== null && <span className="block text-sm text-[rgb(var(--c-text-strong))] font-bold opacity-80">{formatMoney(cost)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ACTS */}
        <div className="bg-white rounded-3xl border border-[rgb(var(--c-border))] p-6 md:p-8 shadow-sm">
          <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.5)] pb-2 flex justify-between">
            <span>ACTOS</span>
            <span className="text-[rgb(var(--c-text))] opacity-60">{state.acts.length}</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {state.acts.length === 0 ? (
              <p className="text-[rgb(var(--c-text)/0.5)] italic text-lg col-span-full">Sin actos</p>
            ) : state.acts.map((a, i) => {
              const cat = a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '—'
              const mod = a.modality ? modalityLabel(a.modality) : '—'
              const lvl = a.modality === 'grupal' ? (a.level === 'basico' ? ' BÁSICO' : a.level === 'avanzado' ? ' AVANZADO' : '') : ''
              return (
                <div key={i} className="border border-[rgb(var(--c-border)/0.5)] rounded-2xl p-4 bg-[rgb(var(--c-surface-2)/0.2)]">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="font-display text-2xl text-[rgb(var(--c-primary))] shrink-0">#{i + 1}</div>
                    <div className="flex-1">
                      <p className="font-display text-xl text-[rgb(var(--c-text-strong))] leading-tight">{cat.toUpperCase()}</p>
                      <p className="font-display text-base text-[rgb(var(--c-text))] mt-0.5">{mod}{lvl} · {a.style ?? '—'}</p>
                    </div>
                  </div>
                  {a.dancerIndices.length > 0 && (
                    <div className="bg-white border border-[rgb(var(--c-border)/0.3)] rounded-xl p-3">
                      <p className="text-xs font-bold tracking-widest text-[rgb(var(--c-text)/0.5)] mb-2">INTEGRANTES ({a.dancerIndices.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {a.dancerIndices.map(di => {
                          const d = state.dancers[di]
                          if (!d) return null
                          return (
                            <span key={di} className="inline-block bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text-strong))] text-xs px-2.5 py-1 rounded-md font-medium border border-[rgb(var(--c-border)/0.5)]">
                              {d.name || `Alumno/a ${di + 1}`}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>

      {/* FLOATING ACTION BAR */}
      <div className="shrink-0 bg-white border-t border-[rgb(var(--c-border))] p-4 md:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">
        <div className="max-w-4xl mx-auto w-full">
          {saveErr && (
            <p className="text-[rgb(var(--c-primary))] text-sm bg-[rgb(var(--c-primary)/0.05)] border border-[rgb(var(--c-primary)/0.2)] rounded-xl px-4 py-3 mb-4 text-center font-medium">{saveErr}</p>
          )}
          {confirmed ? (
            <button
              onClick={startEdit}
              className="w-full h-16 md:h-20 flex items-center justify-center gap-3 bg-white border-2 border-[rgb(var(--c-border))] hover:bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text-strong))] font-display text-xl md:text-2xl tracking-widest rounded-2xl transition-all shadow-sm active:scale-[0.98] duration-150"
            >
              <Pencil className="w-6 h-6 text-[rgb(var(--c-primary))]" /> MODIFICAR REGISTRO
            </button>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              <button
                onClick={onEditRequest}
                className="w-full h-16 flex items-center justify-center gap-2 bg-white border-2 border-[rgb(var(--c-border))] hover:bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text-strong))] font-display text-lg tracking-widest rounded-2xl transition-all active:scale-[0.98] duration-150 md:col-span-1"
              >
                <Pencil className="w-5 h-5 text-[rgb(var(--c-primary))]" /> EDITAR
              </button>
              <button
                onClick={confirm}
                disabled={saving}
                className="w-full h-16 md:h-20 bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 active:brightness-95 text-[rgb(var(--c-text-strong))] font-display text-xl md:text-2xl tracking-widest rounded-2xl disabled:opacity-50 disabled:pointer-events-none transition-all shadow-lg active:scale-[0.98] duration-150 md:col-span-2 md:-mt-2"
              >
                {saving ? 'GUARDANDO…' : editMode ? 'GUARDAR CAMBIOS' : 'CONFIRMAR REGISTRO'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
'''

with open("app/register/[eventId]/page.tsx", "w") as f:
    f.write(content)
