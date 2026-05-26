import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wlxugmitajxsjilffecu.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY no configurada. Usa: SUPABASE_SERVICE_KEY=... node scripts/simulate-registrations.mjs')
  process.exit(1)
}

const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '15000', 10)
const MAX_RUNS = parseInt(process.env.MAX_RUNS || '0', 10) || Infinity

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const AGE_CATEGORIES = ['tiny', 'mini', 'elementary', 'junior', 'senior', 'college', 'open']

const CATEGORY_BIRTHDATE_RANGES = {
  tiny:    [2020, 2023], // 3-5 years old from 2026
  mini:    [2017, 2020], // 6-8
  elementary: [2014, 2017], // 9-11
  junior:  [2011, 2014], // 12-14
  senior:  [2008, 2011], // 15-17
  college: [2004, 2008], // 18-21
  open:    [1990, 2004], // 22+
}

const MODALITIES = ['solista', 'dueto', 'trio', 'grupal']
const STYLES = ['Jazz', 'Poms', 'Acro Jazz', 'Hip Hop', 'Show', 'Ballet', 'Contempo']
const LEVELS = ['basico', 'avanzado']
const MEXICO_CITIES = [
  'CDMX', 'Guadalajara', 'Monterrey', 'Puebla', 'Queretaro', 'Leon', 'Toluca',
  'Merida', 'San Luis Potosi', 'Aguascalientes', 'Morelia', 'Veracruz', 'Tijuana',
  'Culiacan', 'Hermosillo', 'Saltillo', 'Torreon', 'Chihuahua', 'Cancun', 'Oaxaca'
]

const NAMES = [
  'Sofia', 'Valentina', 'Regina', 'Camila', 'Ximena', 'Maria Jose', 'Renata',
  'Isabella', 'Fernanda', 'Daniela', 'Luciana', 'Paulina', 'Victoria', 'Romina',
  'Emilia', 'Natalia', 'Andrea', 'Alejandra', 'Mariana', 'Ana Paula',
  'Santiago', 'Mateo', 'Sebastian', 'Leonardo', 'Diego', 'Emiliano', 'Matias',
  'Daniel', 'Alexander', 'Gabriel', 'Miguel Angel', 'Juan Pablo', 'Ricardo',
  'Jose Luis', 'Eduardo', 'Fernando', 'Carlos', 'Rodrigo', 'Arturo', 'Alonso'
]

const LAST_NAMES = [
  'Garcia', 'Hernandez', 'Lopez', 'Martinez', 'Rodriguez', 'Gonzalez', 'Perez',
  'Sanchez', 'Ramirez', 'Flores', 'Ruiz', 'Morales', 'Ortiz', 'Vazquez',
  'Aguilar', 'Mendoza', 'Reyes', 'Jimenez', 'Moreno', 'Castillo'
]

const ACADEMY_WORDS = ['Dance', 'Studio', 'Academia', 'Ballet', 'Ritmo', 'Estilo', 'Danza', 'Movimiento', 'Arte', 'Pasos']
const ACADEMY_SUFFIXES = ['Dance Studio', 'Academia de Baile', 'Dance Academy', 'Escuela de Danza', 'Centro Coreografico']

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const pickN = (arr, n) => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, arr.length))
}

function randomBirthdate(category) {
  const [minYear, maxYear] = CATEGORY_BIRTHDATE_RANGES[category]
  const year = rand(minYear, maxYear)
  const month = rand(1, 12)
  const day = rand(1, 28)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function generateAcademy() {
  const word = pick(ACADEMY_WORDS)
  const suffix = pick(ACADEMY_SUFFIXES)
  return `${word} ${rand(1, 50)} - ${suffix}`
}

function generateCoachName() {
  return `${pick(NAMES)} ${pick(LAST_NAMES)}`
}

function generateTeamName(academyName) {
  return academyName.split(' - ')[0]
}

async function getEvents() {
  const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false })
  if (error) {
    console.error('❌ Error obteniendo eventos:', error.message)
    process.exit(1)
  }
  return data
}

function generateDancers(count) {
  const dancers = []
  for (let i = 0; i < count; i++) {
    const category = pick(AGE_CATEGORIES)
    const name = `${pick(NAMES)} ${pick(LAST_NAMES)}`
    const birthdate = randomBirthdate(category)
    dancers.push({ name, birthdate, category, category_manual: false, order_idx: i })
  }
  return dancers
}

function generateActs(dancers) {
  const acts = []
  const usedDancerIds = new Set()
  let orderIdx = 0

  // Always have at least 1 act for groups with 4+ dancers
  const grupalDancers = dancers.length >= 4 ? dancers.slice(0, rand(4, Math.min(dancers.length, 12))) : []

  if (grupalDancers.length >= 4) {
    const style = pick(STYLES)
    const level = pick(LEVELS)
    const dancerIds = grupalDancers.map(d => d.id)
    dancerIds.forEach(id => usedDancerIds.add(id))
    const highestCategory = dancerIds
      .map(id => dancers.find(d => d.id === id).category)
      .sort((a, b) => AGE_CATEGORIES.indexOf(b) - AGE_CATEGORIES.indexOf(a))[0]
    acts.push({
      modality: 'grupal',
      age_category: highestCategory,
      level,
      style,
      order_idx: orderIdx++,
      dancer_ids: dancerIds,
    })
  }

  // Add solistas for unused dancers or randomly
  for (const dancer of dancers) {
    if (usedDancerIds.has(dancer.id) && Math.random() > 0.3) continue
    if (Math.random() > 0.4) continue
    const style = pick(STYLES)
    acts.push({
      modality: 'solista',
      age_category: dancer.category,
      level: 'avanzado',
      style,
      order_idx: orderIdx++,
      dancer_ids: [dancer.id],
    })
    usedDancerIds.add(dancer.id)
  }

  // Random duetos
  if (dancers.length >= 2 && Math.random() > 0.5) {
    const remaining = dancers.filter(d => !usedDancerIds.has(d.id))
    if (remaining.length >= 2) {
      const pair = remaining.slice(0, 2)
      const style = pick(STYLES)
      const highestCat = pair
        .map(d => d.category)
        .sort((a, b) => AGE_CATEGORIES.indexOf(b) - AGE_CATEGORIES.indexOf(a))[0]
      acts.push({
        modality: 'dueto',
        age_category: highestCat,
        level: 'avanzado',
        style,
        order_idx: orderIdx++,
        dancer_ids: pair.map(d => d.id),
      })
      pair.forEach(d => usedDancerIds.add(d.id))
    }
  }

  // Random trio
  if (dancers.length >= 3 && Math.random() > 0.6) {
    const remaining = dancers.filter(d => !usedDancerIds.has(d.id))
    if (remaining.length >= 3) {
      const trio = remaining.slice(0, 3)
      const style = pick(STYLES)
      const highestCat = trio
        .map(d => d.category)
        .sort((a, b) => AGE_CATEGORIES.indexOf(b) - AGE_CATEGORIES.indexOf(a))[0]
      acts.push({
        modality: 'trio',
        age_category: highestCat,
        level: 'avanzado',
        style,
        order_idx: orderIdx++,
        dancer_ids: trio.map(d => d.id),
      })
      trio.forEach(d => usedDancerIds.add(d.id))
    }
  }

  return acts
}

async function createRegistration(event) {
  const now = new Date().toISOString()
  const coachName = generateCoachName()
  const academyRaw = generateAcademy()
  const city = pick(MEXICO_CITIES)
  const academy = `${academyRaw} (${city})`
  const teamName = generateTeamName(academyRaw)

  // Generate assistants (0-2)
  const numAssistants = Math.random() > 0.7 ? rand(1, 2) : 0
  const extraCoaches = []
  for (let i = 0; i < numAssistants; i++) {
    extraCoaches.push(`Asistente: ${generateCoachName()}`)
  }

  // Generate dancers (5-25)
  const dancerCount = rand(5, 25)
  const dancers = generateDancers(dancerCount)

  // Build the registration record
  const registration = {
    event_id: event.id,
    coach_name: coachName,
    coach_phone: `55${rand(1000, 9999)}${rand(1000, 9999)}`,
    coach_email: `${coachName.toLowerCase().replace(/\s+/g, '.')}@gmail.com`,
    extra_coaches: extraCoaches,
    academy,
    team_name: teamName,
    cost_paquete: event.default_cost_paquete ?? 2700,
    cost_repeticion: event.default_cost_repeticion ?? 500,
    submitted_at: now,
    tickets_count: rand(0, 6),
    notes: Math.random() > 0.7 ? 'Gracias por la organizacion, estamos muy emocionados!' : null,
  }

  // Auto-confirm most registrations (80% chance)
  const shouldConfirm = Math.random() > 0.2
  if (shouldConfirm) {
    registration.confirmed_at = now
  }

  console.log(`\n📋 [${new Date().toLocaleTimeString('es-MX')}] Creando registro...`)
  console.log(`   Coach: ${coachName}`)
  console.log(`   Academia: ${academy}`)
  console.log(`   Ciudad: ${city}`)
  console.log(`   Dancers: ${dancerCount}`)
  console.log(`   Asistentes: ${numAssistants}`)
  console.log(`   Estado: ${shouldConfirm ? 'CONFIRMADO' : 'PENDIENTE'}`)

  // Insert registration
  const { data: regData, error: regError } = await supabase
    .from('coach_registrations')
    .insert(registration)
    .select('id')
    .single()

  if (regError) {
    console.error(`   ❌ Error insertando registro:`, regError.message)
    return null
  }

  const registrationId = regData.id
  console.log(`   ✅ Registro #${registrationId} creado`)

  // Insert dancers
  const dancerRecords = dancers.map(d => ({
    registration_id: registrationId,
    name: d.name,
    birthdate: d.birthdate,
    category: d.category,
    category_manual: false,
    order_idx: d.order_idx,
  }))

  const { data: dancerData, error: dancerError } = await supabase
    .from('registration_dancers')
    .insert(dancerRecords)
    .select('id, category, name')

  if (dancerError) {
    console.error(`   ❌ Error insertando dancers:`, dancerError.message)
    return null
  }

  // Map local dancer IDs to DB IDs
  const dbDancers = dancerData.map((dd, i) => ({
    ...dd,
    _localIdx: i,
  }))

  console.log(`   Dancers insertados: ${dbDancers.length}`)

  // Generate and insert acts
  const acts = generateActs(dbDancers)

  if (acts.length === 0) {
    console.log(`   ⚠️  No se generaron coreografias (pocos dancers?)`)
  } else {
    const actRecords = acts.map(a => ({
      registration_id: registrationId,
      modality: a.modality,
      age_category: a.age_category,
      level: a.level,
      style: a.style,
      order_idx: a.order_idx,
      dancer_ids: a.dancer_ids,
    }))

    const { error: actError } = await supabase
      .from('registration_acts')
      .insert(actRecords)

    if (actError) {
      console.error(`   ❌ Error insertando acts:`, actError.message)
      return null
    }

    const actSummary = acts.map(a => `${a.modality} ${a.style} (${a.dancer_ids.length} bailarines)`)
    console.log(`   Coreografias: ${actSummary.join(' | ')}`)
  }

  // Insert edit log entry
  const logEntry = {
    registration_id: registrationId,
    edited_by: 'coach',
    action: shouldConfirm ? 'confirm' : 'create',
    entity_type: 'registration',
    entity_id: registrationId,
    changes: { status: { old: null, new: shouldConfirm ? 'confirmed' : 'submitted' } },
    snapshot: {
      coach_name: coachName,
      academy,
      dancer_count: dancerCount,
      act_count: acts.length,
      confirmed: shouldConfirm,
    },
    created_at: now,
  }

  await supabase.from('registration_edit_log').insert(logEntry)

  return {
    id: registrationId,
    coach: coachName,
    academy,
    dancers: dancerCount,
    acts: acts.length,
    confirmed: shouldConfirm,
  }
}

async function main() {
  if (process.env.CLEANUP === '1') {
    console.log('🧹 Modo limpieza...')
    const { error } = await supabase.from('coach_registrations').delete().neq('id', 0)
    if (error) {
      console.error('❌ Error limpiando:', error.message)
    } else {
      console.log('✅ Todos los registros eliminados')
    }
    process.exit(0)
  }

  console.log('🎭 Dance4ever — Simulador de Registros')
  console.log(`⏱️  Intervalo: ${INTERVAL_MS / 1000}s entre registros`)
  console.log(`🔄 Max ejecuciones: ${MAX_RUNS === Infinity ? 'ilimitado' : MAX_RUNS}`)
  console.log('')

  const events = await getEvents()
  if (events.length === 0) {
    console.error('❌ No hay eventos en la base de datos. Crea uno primero desde /socios/eventos')
    process.exit(1)
  }

  console.log(`📅 Eventos disponibles: ${events.length}`)
  events.forEach(e => console.log(`   - ${e.name} (${e.id}) | fecha: ${e.date}`))
  console.log('')

  const targetEvent = process.env.EVENT_ID
    ? events.find(e => e.id === process.env.EVENT_ID)
    : events[0]

  if (!targetEvent) {
    console.error(`❌ No se encontro el evento con ID ${process.env.EVENT_ID}`)
    process.exit(1)
  }

  console.log(`🎯 Evento objetivo: ${targetEvent.name} (${targetEvent.date})`)
  console.log('')

  let runCount = 0
  const stats = { created: 0, confirmed: 0, error: 0 }

  const runOnce = async () => {
    runCount++
    const result = await createRegistration(targetEvent)
    if (result) {
      stats.created++
      if (result.confirmed) stats.confirmed++
      console.log(`\n📊 Stats: ${stats.created} creados | ${stats.confirmed} confirmados | ${stats.error} errores | Total runs: ${runCount}`)
      console.log(`⏳ Proximo registro en ${INTERVAL_MS / 1000}s...`)
    } else {
      stats.error++
    }
  }

  // Run first one immediately
  await runOnce()

  if (runCount >= MAX_RUNS) {
    console.log(`\n🏁 Limite alcanzado (MAX_RUNS=${MAX_RUNS}). Saliendo.`)
    return
  }

  // Schedule continuous runs
  const interval = setInterval(async () => {
    await runOnce()
    if (runCount >= MAX_RUNS) {
      clearInterval(interval)
      console.log(`\n🏁 Limite alcanzado (MAX_RUNS=${MAX_RUNS}). Saliendo.`)
    }
  }, INTERVAL_MS)

  process.on('SIGINT', () => {
    clearInterval(interval)
    console.log(`\n🛑 Simulacion detenida. Total: ${stats.created} registros creados.`)
    process.exit(0)
  })
}

main()
