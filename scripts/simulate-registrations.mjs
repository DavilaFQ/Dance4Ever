import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wlxugmitajxsjilffecu.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY no configurada. Usa: SUPABASE_SERVICE_KEY=... node scripts/simulate-registrations.mjs')
  process.exit(1)
}

const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '15000', 10)
const MAX_RUNS    = parseInt(process.env.MAX_RUNS    || '0',     10) || Infinity

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Catálogos ────────────────────────────────────────────────────────────────

const AGE_CATEGORIES = ['tiny', 'mini', 'elementary', 'junior', 'senior', 'college', 'open']

// Probabilidad de que la categoría dominante de una academia sea cada una.
// La gran mayoría son academias de niñas de primaria/secundaria.
// College/open son raros (coaches que también bailan, adultos).
const DOMINANT_CATEGORY_WEIGHTS = {
  tiny:       0.05,
  mini:       0.18,
  elementary: 0.30,
  junior:     0.28,
  senior:     0.14,
  college:    0.04,
  open:       0.01,
}

// Nacimientos representativos por categoría (ref 2026)
const CATEGORY_BIRTH_RANGES = {
  tiny:       [2020, 2023],
  mini:       [2017, 2020],
  elementary: [2014, 2017],
  junior:     [2011, 2014],
  senior:     [2008, 2011],
  college:    [2004, 2008],
  open:       [1990, 2004],
}

const STYLES = ['Jazz', 'Poms', 'Acro Jazz', 'Hip Hop', 'Show', 'Ballet', 'Contempo']
const LEVELS = ['basico', 'avanzado']

const MEXICO_CITIES = [
  'CDMX', 'Guadalajara', 'Monterrey', 'Puebla', 'Querétaro', 'León', 'Toluca',
  'Mérida', 'San Luis Potosí', 'Aguascalientes', 'Morelia', 'Veracruz', 'Tijuana',
  'Culiacán', 'Hermosillo', 'Saltillo', 'Torreón', 'Chihuahua', 'Cancún', 'Oaxaca',
]

const GIRL_NAMES = [
  'Sofía', 'Valentina', 'Regina', 'Camila', 'Ximena', 'María José', 'Renata',
  'Isabella', 'Fernanda', 'Daniela', 'Luciana', 'Paulina', 'Victoria', 'Romina',
  'Emilia', 'Natalia', 'Andrea', 'Alejandra', 'Mariana', 'Ana Paula', 'Valeria',
  'Michelle', 'Karla', 'Paola', 'Ariadna', 'Samantha', 'Brenda', 'Itzel', 'Giselle',
]

const BOY_NAMES = [
  'Santiago', 'Mateo', 'Sebastián', 'Leonardo', 'Diego', 'Emiliano', 'Matías',
  'Daniel', 'Alexander', 'Gabriel', 'Miguel Ángel', 'Juan Pablo', 'Ricardo', 'Alonso',
]

const LAST_NAMES = [
  'García', 'Hernández', 'López', 'Martínez', 'Rodríguez', 'González', 'Pérez',
  'Sánchez', 'Ramírez', 'Flores', 'Ruiz', 'Morales', 'Ortiz', 'Vázquez',
  'Aguilar', 'Mendoza', 'Reyes', 'Jiménez', 'Moreno', 'Castillo', 'Torres',
  'Gutiérrez', 'Chávez', 'Ramos', 'Cruz', 'Luna', 'Medina', 'Vargas',
]

const ACADEMY_NAMES = [
  'Studio D', 'Ritmo & Estilo', 'Academia de Baile Élite', 'Dance Factory',
  'Pasos de Arte', 'Danza Viva', 'Movimiento Puro', 'Estudio Coreográfico',
  'Ballet & Jazz Studio', 'Academia Impulso', 'Stars Dance Studio', 'Arte en Movimiento',
  'Compañía de Danza Moderna', 'Nova Dance Academy', 'Centro de Baile Futura',
  'Danzart', 'Academia Azul', 'Ritmo Latino Dance', 'Sublime Dance Studio',
]

// ─── Utilidades ───────────────────────────────────────────────────────────────

const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick  = (arr)      => arr[Math.floor(Math.random() * arr.length)]
const prob  = (p)        => Math.random() < p   // true con probabilidad p

function weightedPick(weights) {
  const entries = Object.entries(weights)
  const total   = entries.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [key, w] of entries) {
    r -= w
    if (r <= 0) return key
  }
  return entries[entries.length - 1][0]
}

// Categoría adyacente con probabilidad decreciente (para simular dispersión real)
function nearbyCategory(dominant) {
  const idx    = AGE_CATEGORIES.indexOf(dominant)
  const spread = prob(0.15) ? 2 : (prob(0.35) ? 1 : 0)  // 50% misma, 35% ±1, 15% ±2
  const dir    = prob(0.5) ? 1 : -1
  const newIdx = Math.max(0, Math.min(AGE_CATEGORIES.length - 1, idx + spread * dir))
  // No pasar de senior (índice 4) salvo academia adulta
  if (dominant !== 'college' && dominant !== 'open' && AGE_CATEGORIES[newIdx] === 'open') {
    return dominant
  }
  return AGE_CATEGORIES[newIdx]
}

function randomBirthdate(category) {
  const [minY, maxY] = CATEGORY_BIRTH_RANGES[category]
  const year  = rand(minY, maxY)
  const month = rand(1, 12)
  const day   = rand(1, 28)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function randomName() {
  // ~90% niñas en academias de baile típicas
  const isGirl  = prob(0.90)
  const first   = isGirl ? pick(GIRL_NAMES) : pick(BOY_NAMES)
  const last    = `${pick(LAST_NAMES)} ${pick(LAST_NAMES)}`
  return `${first} ${last}`
}

function randomCoachName() {
  // Coaches suelen ser adultas / jóvenes adultas
  return `${pick(GIRL_NAMES)} ${pick(LAST_NAMES)}`
}

// ─── Generación de bailarines ─────────────────────────────────────────────────

/**
 * Una academia real tiene una categoría dominante (ej. junior) con la mayoría
 * de integrantes, y algunos dispersos en categorías adyacentes.
 * Tamaño: entre 5 y 28 integrantes (máximo ~30 realista).
 */
function generateDancers(dominantCategory) {
  // Tamaño del equipo: mayoría entre 8 y 20; academias pequeñas (5-7) y grandes (21-28) son menos comunes
  const sizeWeights = { small: 0.15, medium: 0.60, large: 0.25 }
  const sizeRange   = weightedPick(sizeWeights)
  const count = sizeRange === 'small'  ? rand(5, 7)   :
                sizeRange === 'medium' ? rand(8, 20)  : rand(21, 28)

  const dancers = []
  for (let i = 0; i < count; i++) {
    const category = nearbyCategory(dominantCategory)
    dancers.push({
      name:            randomName(),
      birthdate:       randomBirthdate(category),
      category,
      category_manual: false,
      order_idx:       i,
    })
  }
  return dancers
}

// ─── Generación de coreografías ───────────────────────────────────────────────

/**
 * Reglas de negocio realistas:
 * - TODOS los integrantes tienen al menos 1 coreografía.
 * - La mayoría tiene solo 1 participación (grupal).
 * - Una fracción tiene 2 participaciones (grupal + solista/duo/etc.).
 * - Muy pocos tienen 3.
 * - Los solos/duos/tríos son secundarios y poco frecuentes.
 * - Siempre hay al menos 1 grupal (que agrupa la mayoría o todos).
 */
function generateActs(dancers, dominantCategory) {
  const acts      = []
  let   orderIdx  = 0

  // Decidir cuántos grupales habrá (generalmente 1, a veces 2 en academias grandes)
  const numGrupales = dancers.length >= 15 && prob(0.35) ? 2 : 1

  // Dividir bailarines en grupos
  const grupalGroups = []
  if (numGrupales === 1) {
    grupalGroups.push(dancers.map(d => d.id))
  } else {
    // Split ~60/40 para academias con 2 grupales (ej. elementary + junior)
    const split = Math.floor(dancers.length * 0.55)
    grupalGroups.push(dancers.slice(0, split).map(d => d.id))
    grupalGroups.push(dancers.slice(split).map(d => d.id))
  }

  // Insertar grupales
  for (const group of grupalGroups) {
    const style = pick(STYLES)
    const level = pick(LEVELS)
    // Categoría del grupal = la más alta del grupo (la más avanzada)
    const categories = group.map(id => dancers.find(d => d.id === id)?.category || dominantCategory)
    const highestCat = categories.reduce((best, cat) => {
      return AGE_CATEGORIES.indexOf(cat) > AGE_CATEGORIES.indexOf(best) ? cat : best
    }, dominantCategory)

    acts.push({
      modality:    'grupal',
      age_category: highestCat,
      level,
      style,
      order_idx:   orderIdx++,
      dancer_ids:  group,
    })
  }

  // Tracker de participaciones por bailarín
  const participaciones = new Map(dancers.map(d => [d.id, 1]))

  // ── Solistas ──────────────────────────────────────────────────────────────
  // Solo ~15% de los integrantes tienen solista, y solo si la academia es de nivel medio-alto
  const tienesSolistas = prob(0.55) // ¿esta academia tiene solos en general?
  if (tienesSolistas) {
    // Cuántos solistas: entre 1 y 10% del equipo (máx 4-5)
    const maxSolos = Math.max(1, Math.floor(dancers.length * 0.12))
    const numSolos = rand(1, maxSolos)
    // Elegir bailarines candidatos (preferir los que ya tienen solo 1 participación)
    const candidates = [...dancers].sort(() => Math.random() - 0.5).slice(0, numSolos)
    for (const dancer of candidates) {
      // No poner 3+ participaciones (muy raro)
      if ((participaciones.get(dancer.id) ?? 0) >= 2) continue
      const style = pick(STYLES)
      acts.push({
        modality:    'solista',
        age_category: dancer.category,
        level:       'avanzado',
        style,
        order_idx:   orderIdx++,
        dancer_ids:  [dancer.id],
      })
      participaciones.set(dancer.id, (participaciones.get(dancer.id) ?? 0) + 1)
    }
  }

  // ── Duetos ────────────────────────────────────────────────────────────────
  // Solo ~25% de academias tienen dueto(s), y máximo 1-2
  if (prob(0.25)) {
    const numDuetos = prob(0.2) ? 2 : 1
    for (let d = 0; d < numDuetos; d++) {
      // Elegir pareja con <= 1 participación adicional
      const eligible = dancers.filter(d => (participaciones.get(d.id) ?? 0) < 2)
      if (eligible.length < 2) break
      const pair  = eligible.sort(() => Math.random() - 0.5).slice(0, 2)
      const cats  = pair.map(p => p.category)
      const highC = cats.reduce((b, c) => AGE_CATEGORIES.indexOf(c) > AGE_CATEGORIES.indexOf(b) ? c : b)
      acts.push({
        modality:    'dueto',
        age_category: highC,
        level:       'avanzado',
        style:       pick(STYLES),
        order_idx:   orderIdx++,
        dancer_ids:  pair.map(p => p.id),
      })
      pair.forEach(p => participaciones.set(p.id, (participaciones.get(p.id) ?? 0) + 1))
    }
  }

  // ── Tríos ─────────────────────────────────────────────────────────────────
  // Solo ~12% de academias tienen un trío
  if (prob(0.12)) {
    const eligible = dancers.filter(d => (participaciones.get(d.id) ?? 0) < 2)
    if (eligible.length >= 3) {
      const trio  = eligible.sort(() => Math.random() - 0.5).slice(0, 3)
      const highC = trio.map(t => t.category)
                        .reduce((b, c) => AGE_CATEGORIES.indexOf(c) > AGE_CATEGORIES.indexOf(b) ? c : b)
      acts.push({
        modality:    'trio',
        age_category: highC,
        level:       'avanzado',
        style:       pick(STYLES),
        order_idx:   orderIdx++,
        dancer_ids:  trio.map(t => t.id),
      })
    }
  }

  return acts
}

// ─── Crear un registro completo ───────────────────────────────────────────────

async function createRegistration(event) {
  const now              = new Date().toISOString()
  const dominantCategory = weightedPick(DOMINANT_CATEGORY_WEIGHTS)
  const academyName      = pick(ACADEMY_NAMES)
  const city             = pick(MEXICO_CITIES)
  const academy          = `${academyName} (${city})`
  const coachName        = randomCoachName()

  // Asistentes: la mayoría no tiene, algunos 1, muy pocos 2
  const numAssistants = prob(0.60) ? 0 : (prob(0.80) ? 1 : 2)
  const extraCoaches  = Array.from({ length: numAssistants }, () => `Asistente: ${randomCoachName()}`)

  // Boletos de entrada para público: 0-4, la mayoría 0-2
  const ticketsCount = prob(0.30) ? 0 : (prob(0.55) ? rand(1, 2) : rand(3, 4))

  // 85% de los registros se confirman al enviar
  const shouldConfirm = prob(0.85)

  // Generar bailarines
  const dancers = generateDancers(dominantCategory)

  console.log(`\n📋 [${new Date().toLocaleTimeString('es-MX')}] Creando registro...`)
  console.log(`   Categoría dominante: ${dominantCategory.toUpperCase()}`)
  console.log(`   Academia: ${academy}`)
  console.log(`   Coach: ${coachName}`)
  console.log(`   Bailarines: ${dancers.length}`)
  console.log(`   Asistentes: ${numAssistants}`)
  console.log(`   Estado: ${shouldConfirm ? '✅ CONFIRMADO' : '⏳ PENDIENTE'}`)

  // ── 1. Insertar registro ───────────────────────────────────────────────────
  const regPayload = {
    event_id:          event.id,
    coach_name:        coachName,
    coach_phone:       `55${rand(1000, 9999)}${rand(1000, 9999)}`,
    coach_email:       prob(0.70)
      ? `${coachName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'.')}@gmail.com`
      : null,
    extra_coaches:     extraCoaches,
    academy,
    team_name:         academyName,
    cost_paquete:      event.default_cost_paquete  ?? 2700,
    cost_repeticion:   event.default_cost_repeticion ?? 500,
    submitted_at:      now,
    confirmed_at:      shouldConfirm ? now : null,
    tickets_count:     ticketsCount,
    notes:             prob(0.15) ? '¡Muchas gracias por la organización!' : null,
  }

  const { data: regData, error: regError } = await supabase
    .from('coach_registrations')
    .insert(regPayload)
    .select('id')
    .single()

  if (regError) {
    console.error('   ❌ Error insertando registro:', regError.message)
    return null
  }
  const registrationId = regData.id
  console.log(`   ✅ Registro #${registrationId} creado`)

  // ── 2. Insertar bailarines ─────────────────────────────────────────────────
  const dancerRecords = dancers.map(d => ({
    registration_id: registrationId,
    name:            d.name,
    birthdate:       d.birthdate,
    category:        d.category,
    category_manual: false,
    order_idx:       d.order_idx,
  }))

  const { data: dancerData, error: dancerError } = await supabase
    .from('registration_dancers')
    .insert(dancerRecords)
    .select('id, category, name')

  if (dancerError) {
    console.error('   ❌ Error insertando bailarines:', dancerError.message)
    return null
  }

  // Mapear índice → id de BD para poder referenciar en coreografías
  const dbDancers = dancerData.map((dd, i) => ({ ...dancers[i], id: dd.id }))
  console.log(`   Bailarines insertados: ${dbDancers.length}`)

  // ── 3. Generar y validar coreografías ─────────────────────────────────────
  const acts = generateActs(dbDancers, dominantCategory)

  // Verificar que TODOS los bailarines tienen al menos 1 coreografía
  const coveredIds = new Set(acts.flatMap(a => a.dancer_ids))
  const uncovered  = dbDancers.filter(d => !coveredIds.has(d.id))
  if (uncovered.length > 0) {
    // Fallback: agregarlos al primer grupal
    const firstGrupal = acts.find(a => a.modality === 'grupal')
    if (firstGrupal) firstGrupal.dancer_ids.push(...uncovered.map(d => d.id))
  }

  const actRecords = acts.map(a => ({
    registration_id: registrationId,
    modality:        a.modality,
    age_category:    a.age_category,
    level:           a.level,
    style:           a.style,
    order_idx:       a.order_idx,
    dancer_ids:      a.dancer_ids,
  }))

  const { error: actError } = await supabase
    .from('registration_acts')
    .insert(actRecords)

  if (actError) {
    console.error('   ❌ Error insertando coreografías:', actError.message)
    return null
  }

  // Resumen de coreografías
  const actSummary = acts.map(a => {
    const label = { solista: '🧍Solo', dueto: '👯Dueto', trio: '🔺Trío', grupal: '👥Grupal' }[a.modality]
    return `${label} ${a.style} (${a.dancer_ids.length})`
  }).join(' | ')
  console.log(`   Coreografías: ${actSummary}`)

  // Distribución de participaciones
  const partCount = new Map()
  acts.forEach(a => a.dancer_ids.forEach(id => partCount.set(id, (partCount.get(id) ?? 0) + 1)))
  const dist = [1, 2, 3].map(n => `${n}coreo: ${[...partCount.values()].filter(v => v === n).length}`).join(' | ')
  console.log(`   Distribución: ${dist}`)

  // ── 4. Registrar log de auditoría ──────────────────────────────────────────
  await supabase.from('registration_edit_log').insert({
    registration_id: registrationId,
    edited_by:       'coach',
    action:          shouldConfirm ? 'confirm' : 'create',
    entity_type:     'registration',
    entity_id:       registrationId,
    changes:         { status: { old: null, new: shouldConfirm ? 'confirmed' : 'submitted' } },
    snapshot:        {
      coach_name:    coachName,
      academy,
      dominant_category: dominantCategory,
      dancer_count:  dancers.length,
      act_count:     acts.length,
      confirmed:     shouldConfirm,
    },
    created_at:      now,
  })

  return {
    id:              registrationId,
    academy,
    dancers:         dancers.length,
    acts:            acts.length,
    confirmed:       shouldConfirm,
    dominantCategory,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {

  // Modo limpieza
  if (process.env.CLEANUP === '1') {
    console.log('🧹 Limpiando todos los registros de simulación...')
    const { error } = await supabase.from('coach_registrations').delete().neq('id', 0)
    if (error) console.error('❌ Error:', error.message)
    else       console.log('✅ Registros eliminados')
    process.exit(0)
  }

  console.log('🎭 Dance4ever — Simulador Realista de Registros')
  console.log(`⏱️  Intervalo : ${INTERVAL_MS / 1000}s entre registros`)
  console.log(`🔄 Max runs  : ${MAX_RUNS === Infinity ? '∞' : MAX_RUNS}`)
  console.log('')

  // Obtener eventos
  const { data: events, error: evErr } = await supabase
    .from('events').select('*').order('created_at', { ascending: false })
  if (evErr || !events?.length) {
    console.error('❌ No hay eventos. Crea uno desde /socios/eventos')
    process.exit(1)
  }

  const targetEvent = process.env.EVENT_ID
    ? events.find(e => e.id === process.env.EVENT_ID)
    : events[0]

  if (!targetEvent) {
    console.error(`❌ Evento no encontrado: ${process.env.EVENT_ID}`)
    process.exit(1)
  }

  console.log(`📅 Evento: ${targetEvent.name} (${targetEvent.date})`)
  console.log(`💰 Precios: $${targetEvent.default_cost_paquete ?? 2700} paquete | $${targetEvent.default_cost_repeticion ?? 500} rep`)
  console.log('')

  let runCount = 0
  const stats  = { created: 0, confirmed: 0, error: 0 }

  const runOnce = async () => {
    runCount++
    const result = await createRegistration(targetEvent)
    if (result) {
      stats.created++
      if (result.confirmed) stats.confirmed++
      console.log(`\n📊 Total: ${stats.created} registros | ${stats.confirmed} confirmados | ${stats.error} errores`)
      if (runCount < MAX_RUNS) console.log(`⏳ Siguiente en ${INTERVAL_MS / 1000}s...`)
    } else {
      stats.error++
    }
  }

  await runOnce()

  if (runCount >= MAX_RUNS) {
    console.log(`\n🏁 Completado (${MAX_RUNS} runs).`)
    return
  }

  const interval = setInterval(async () => {
    await runOnce()
    if (runCount >= MAX_RUNS) {
      clearInterval(interval)
      console.log(`\n🏁 Completado (${MAX_RUNS} runs).`)
    }
  }, INTERVAL_MS)

  process.on('SIGINT', () => {
    clearInterval(interval)
    console.log(`\n🛑 Detenido. Total: ${stats.created} registros creados.`)
    process.exit(0)
  })
}

main()
