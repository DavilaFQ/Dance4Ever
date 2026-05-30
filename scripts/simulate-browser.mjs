/**
 * Dance4ever — Simulador UI con Playwright (selectores corregidos)
 * ================================================================
 * Automatiza el formulario real en http://localhost:3000 paso a paso.
 *
 * Uso:
 *   RUNS=3 node scripts/simulate-browser.mjs
 *   HEADLESS=false RUNS=1 node scripts/simulate-browser.mjs  ← para verlo en pantalla
 */

import { chromium } from 'playwright'

const BASE_URL     = process.env.BASE_URL  || 'http://localhost:3000'
const EVENT_ID     = '20c48101-ec11-43b3-8c91-bf9273bb88bf'
const TOKEN        = 'QE53H5C8EA'
const RUNS         = parseInt(process.env.RUNS    || '1', 10)
const HEADLESS     = process.env.HEADLESS !== 'false'
const REGISTER_URL = `${BASE_URL}/register/${EVENT_ID}?t=${TOKEN}&reset=true`

// ─── Datos de prueba realistas ────────────────────────────────────────────────

const GIRL_NAMES = [
  'Sofía García', 'Valentina Hernández', 'Regina López', 'Camila Martínez',
  'Ximena Rodríguez', 'María José González', 'Renata Pérez', 'Isabella Sánchez',
  'Fernanda Ramírez', 'Daniela Flores', 'Luciana Ruiz', 'Paulina Morales',
  'Victoria Ortiz', 'Romina Vázquez', 'Emilia Aguilar', 'Natalia Mendoza',
  'Andrea Reyes', 'Alejandra Jiménez', 'Mariana Moreno', 'Ana Paula Castillo',
  'Valeria Torres', 'Michelle Gutiérrez', 'Karla Chávez', 'Paola Ramos',
  'Ariadna Cruz', 'Samantha Luna', 'Brenda Medina', 'Itzel Vargas',
]
const COACH_NAMES = [
  'Sofía Ruiz', 'Valentina Torres', 'Fernanda Luna', 'Paola Aguilar',
  'Brenda Morales', 'Giselle Vázquez', 'Ana Paula Cruz', 'Ariadna López',
  'Michelle Sánchez', 'Karla Mendoza', 'Itzel Reyes', 'Samantha Ortiz',
]
const ACADEMIES_REAL = [
  // 1. Classical focus (Ballet & Jazz Solos/Duets/Grupales)
  { name: 'Ballet Clásico Attitude',    city: 'Guadalajara', profile: 'classical' },
  { name: 'Academia Ifel',              city: 'Guadalajara', profile: 'classical' },
  { name: 'Ballet Clásico Attitude',    city: 'Guadalajara', profile: 'classical' },
  { name: 'Academia Ifel',              city: 'Guadalajara', profile: 'classical' },
  // 2. Acro & Performance focus (Acro Jazz, Show, Jazz)
  { name: 'Studio Horus Egiptus',       city: 'Guadalajara', profile: 'acro_show' },
  { name: 'Olimpia Jazmín',             city: 'Guadalajara', profile: 'acro_show' },
  { name: 'Studio Horus Egiptus',       city: 'Guadalajara', profile: 'acro_show' },
  // 3. Commercial & Urban focus (Hip Hop, Jazz, Contempo, Poms)
  { name: 'Unlimited',                  city: 'Guadalajara', profile: 'urban_commercial' },
  { name: 'One Space Academia',         city: 'Guadalajara', profile: 'urban_commercial' },
  { name: 'Unlimited',                  city: 'Guadalajara', profile: 'urban_commercial' },
  { name: 'One Space Academia',         city: 'Guadalajara', profile: 'urban_commercial' },
  // 4. School / Group focus (Poms & Jazz Groups only, no solos)
  { name: 'Colegio Cervantes',          city: 'Guadalajara', profile: 'school' },
  { name: 'Colegio Subiré',             city: 'Guadalajara', profile: 'school' },
  { name: 'Colegio Cervantes',          city: 'Guadalajara', profile: 'school' },
  { name: 'Colegio Subiré',             city: 'Guadalajara', profile: 'school' },
  { name: 'Colegio Cervantes',          city: 'Guadalajara', profile: 'school' },
  { name: 'Colegio Subiré',             city: 'Guadalajara', profile: 'school' },
]

const STYLES = ['Jazz', 'Poms', 'Acro Jazz', 'Hip Hop', 'Show', 'Ballet', 'Contempo']

// Fechas de nacimiento por categoría (ref 2026)
const BIRTHDATES = {
  elementary: ['12/03/2014', '22/07/2015', '05/11/2014', '18/02/2015', '30/08/2016', '14/05/2014', '01/09/2015'],
  junior:     ['20/04/2011', '15/08/2012', '07/01/2013', '23/11/2011', '30/03/2012', '14/06/2013', '09/09/2011'],
  senior:     ['10/06/2008', '25/02/2009', '18/07/2010', '03/12/2008', '14/08/2009', '29/01/2010'],
}

const rand    = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick    = (arr)      => arr[Math.floor(Math.random() * arr.length)]
const prob    = (p)        => Math.random() < p
const shuffle = (arr)      => [...arr].sort(() => Math.random() - 0.5)
const delay   = (ms)       => new Promise(r => setTimeout(r, ms))

function generateTeam(academy = pick(ACADEMIES_REAL)) {
  
  // Categoría dominante basada en el programa real
  const pool = prob(0.25) ? 'elementary' : prob(0.50) ? 'junior' : 'senior'
  
  let teamSize = rand(6, 12)
  if (academy.profile === 'school') {
    teamSize = rand(10, 18)
  }
  
  const names = shuffle(GIRL_NAMES).slice(0, teamSize)
  const birthdates = names.map(() => pick(BIRTHDATES[pool]))
  
  const acts = []
  
  if (academy.profile === 'classical') {
    const style1 = prob(0.6) ? 'Ballet' : 'Jazz'
    const style2 = style1 === 'Ballet' ? 'Jazz' : 'Ballet'
    
    // 1. Grupal Ballet/Jazz
    if (prob(0.7) && teamSize >= 6) {
      acts.push({
        modality: 'GRUPAL',
        level: 'AVANZADO',
        style: style1,
        dancers: Array.from({ length: teamSize }, (_, i) => i)
      })
    }
    
    // 2. Dueto Ballet/Jazz
    if (prob(0.6) && teamSize >= 2) {
      acts.push({
        modality: 'DUETO',
        level: null,
        style: style2,
        dancers: [0, 1]
      })
    }
    
    // 3. Solistas (1 o 2)
    const solistaCount = rand(1, 2)
    for (let s = 0; s < solistaCount && s < teamSize; s++) {
      acts.push({
        modality: 'SOLISTA',
        level: null,
        style: prob(0.5) ? 'Ballet' : 'Jazz',
        dancers: [s]
      })
    }
  } 
  else if (academy.profile === 'acro_show') {
    const style1 = prob(0.5) ? 'Acro Jazz' : 'Show'
    const style2 = style1 === 'Acro Jazz' ? 'Show' : 'Acro Jazz'
    
    // 1. Grupal Acro/Show
    if (prob(0.8) && teamSize >= 6) {
      acts.push({
        modality: 'GRUPAL',
        level: 'AVANZADO',
        style: style1,
        dancers: Array.from({ length: teamSize }, (_, i) => i)
      })
    }
    
    // 2. Solistas (1 o 2)
    const solistaCount = rand(1, 2)
    for (let s = 0; s < solistaCount && s < teamSize; s++) {
      acts.push({
        modality: 'SOLISTA',
        level: null,
        style: style2,
        dancers: [s]
      })
    }
  } 
  else if (academy.profile === 'urban_commercial') {
    const style1 = prob(0.4) ? 'Hip Hop' : prob(0.5) ? 'Jazz' : 'Contempo'
    
    // 1. Grupal Urban
    if (prob(0.8) && teamSize >= 6) {
      acts.push({
        modality: 'GRUPAL',
        level: 'AVANZADO',
        style: style1,
        dancers: Array.from({ length: teamSize }, (_, i) => i)
      })
    }
    
    // 2. Solista Hip Hop
    if (prob(0.5) && teamSize >= 1) {
      acts.push({
        modality: 'SOLISTA',
        level: null,
        style: 'Hip Hop',
        dancers: [0]
      })
    }
    
    // 3. Solista Contempo
    if (prob(0.4) && teamSize >= 2) {
      acts.push({
        modality: 'SOLISTA',
        level: null,
        style: 'Contempo',
        dancers: [1]
      })
    }
  } 
  else if (academy.profile === 'school') {
    const style1 = prob(0.6) ? 'Poms' : 'Jazz'
    
    // 1. Grupal Poms/Jazz Básicos
    acts.push({
      modality: 'GRUPAL',
      level: 'BÁSICO',
      style: style1,
      dancers: Array.from({ length: teamSize }, (_, i) => i)
    })
    
    // 2. Segundo Grupal (opcional)
    if (prob(0.4) && teamSize >= 12) {
      const style2 = style1 === 'Poms' ? 'Jazz' : 'Poms'
      acts.push({
        modality: 'GRUPAL',
        level: 'BÁSICO',
        style: style2,
        dancers: Array.from({ length: teamSize }, (_, i) => i)
      })
    }
  }

  // Garantizar al menos un acto
  if (acts.length === 0) {
    acts.push({
      modality: 'GRUPAL',
      level: 'BÁSICO',
      style: 'Jazz',
      dancers: Array.from({ length: teamSize }, (_, i) => i)
    })
  }

  return {
    coachName:     pick(COACH_NAMES),
    coachPhone:    `55${rand(1000,9999)}${rand(1000,9999)}`,
    coachEmail:    `coach${rand(100,999)}@gmail.com`,
    academyName:   academy.name,
    city:          academy.city,
    teamSize,
    names,
    birthdates,
    acts
  }
}

// ─── Helpers de navegación ────────────────────────────────────────────────────

async function screenshot(page, label) {
  const path = `exports/debug-${label}-${Date.now()}.png`
  await page.screenshot({ path, fullPage: true })
  console.log(`   📸 Screenshot: ${path}`)
  return path
}

/** Click en botón móvil del footer (SIGUIENTE, CONFIRMAR COREOGRAFÍA, etc.) */
async function clickFooterBtn(page, text) {
  // El footer móvil tiene clase mobile-bottom-nav
  const btn = page.locator(`.mobile-bottom-nav button:has-text("${text}")`).first()
  await btn.waitFor({ state: 'visible', timeout: 8000 })
  await btn.click()
  await delay(600)
}

/** Click en cualquier botón visible por texto */
async function clickBtn(page, text, timeout = 8000) {
  const btn = page.locator(`button:has-text("${text}")`).first()
  await btn.waitFor({ state: 'visible', timeout })
  await btn.click()
  await delay(400)
}

/** Fill input por placeholder exacto */
async function fillByPlaceholder(page, placeholder, value) {
  const inp = page.locator(`input[placeholder="${placeholder}"]`).first()
  await inp.waitFor({ state: 'visible', timeout: 8000 })
  await inp.fill(value)
  await delay(150)
}

// ─── PASOS ────────────────────────────────────────────────────────────────────

/**
 * PASO 0: BIENVENIDA
 * El botón "COMENZAR REGISTRO" aparece después de 1.5s (timeout del video)
 */
async function stepWelcome(page) {
  console.log('   🎬 Paso: Bienvenida')
  
  // Si estamos en headless, podemos acelerar la simulación adelantando el video
  try {
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v && v.duration) {
        v.currentTime = v.duration - 0.2;
      }
    });
    // Pequeña espera para que procese el cambio de tiempo
    await delay(300);
  } catch (e) {
    // Silencioso en caso de que aún no cargue
  }

  // Esperamos hasta 15s al botón "COMENZAR REGISTRO" (el video dura 10s)
  try {
    const btn = page.locator('button:has-text("COMENZAR REGISTRO")').first()
    await btn.waitFor({ state: 'visible', timeout: 15000 })
    await btn.click()
    await delay(800)
    console.log('      ✅ "COMENZAR REGISTRO" clickeado')
  } catch {
    // Si hubo localStorage con draft previo puede saltar directo al setup
    console.log('      ⏭️  Pantalla de bienvenida omitida (draft existente o timeout)')
  }
}

/**
 * PASO 1: COACH Y ACADEMIA
 * Placeholders exactos del DOM
 */
async function stepSetup(page, team) {
  console.log('   👤 Paso 1: Coach y Academia')

  // Verificar que estamos en el paso correcto
  await page.waitForSelector('input[placeholder="Nombre del coach"]', { timeout: 8000 })

  await fillByPlaceholder(page, 'Nombre del coach',                   team.coachName)
  await fillByPlaceholder(page, 'Números sin espacios ni guiones',    team.coachPhone)
  await fillByPlaceholder(page, 'correo@ejemplo.com',                 team.coachEmail)
  await fillByPlaceholder(page, 'Ej. Monterrey',                      team.city)
  await fillByPlaceholder(page, 'Ej. Escuela de Danza Ritmo',         team.academyName)

  // Agregar asistentes de manera realista (1 asistente para grupos pequeños, 2 para grupos grandes >= 12)
  const assistantsCount = team.teamSize >= 12 ? 2 : 1
  console.log(`      Agregando ${assistantsCount} asistentes de backstage...`)
  const possibleAssistants = [
    'Gabriela Mendoza', 'Lorena Ortiz', 'Sofia Hernandez', 'Adriana Castillo',
    'Diana Lopez', 'Monica Vazquez', 'Claudia Sanchez', 'Lucia Ramirez',
    'Patricia Gomez', 'Jessica Torres', 'Silvia Jimenez', 'Martha Flores',
    'Alejandra Ruiz', 'Veronica Diaz', 'Beatriz Alvarez', 'Sandra Romero'
  ];
  for (let idx = 0; idx < assistantsCount; idx++) {
    await clickBtn(page, 'AGREGAR')
    await delay(200)
    const nameIdx = (team.coachName.charCodeAt(0) + idx * 7) % possibleAssistants.length
    const assistantName = possibleAssistants[nameIdx]
    await page.locator(`input[placeholder="Nombre del asistente ${idx + 1}"]`).first().fill(assistantName)
    await delay(200)
  }

  await delay(300)
  await clickFooterBtn(page, 'SIGUIENTE')
  console.log('      ✅ Setup completado')
}

/**
 * PASO 2: INTEGRANTES
 * Usa el modal de Smart Paste (PEGAR LISTA) con la textarea de texto
 */
async function stepDancers(page, team) {
  console.log(`   💃 Paso 2: Integrantes (${team.teamSize})`)

  // Esperar que cargue el paso de dancers
  await page.waitForSelector('button:has-text("PEGAR LISTA")', { timeout: 8000 })

  // Abrir modal Smart Paste
  await clickBtn(page, 'PEGAR LISTA')
  await delay(500)

  // Construir texto en formato "Nombre, DD/MM/YYYY"
  const pasteText = team.names.map((n, i) => `${n}, ${team.birthdates[i]}`).join('\n')

  // Forzar visibilidad de textarea de Smart Paste y botón en móvil programáticamente
  await page.evaluate(() => {
    const textarea = Array.from(document.querySelectorAll('textarea')).find(el => el.placeholder.includes('Pega la lista'));
    if (textarea) {
      textarea.style.display = 'block';
      let parent = textarea.parentElement;
      while (parent && parent.tagName !== 'BODY') {
        parent.style.display = 'block';
        parent.classList.remove('hidden');
        parent = parent.parentElement;
      }
    }
    const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('ANALIZAR Y CARGAR'));
    if (btn) {
      btn.style.display = 'block';
      btn.classList.remove('hidden');
    }
  });
  await delay(300);

  // Llenar la textarea (solo visible en desktop, el modal la oculta en móvil - ahora forzada)
  const textarea = page.locator('textarea[placeholder="Pega la lista aquí..."]').first()
  const isVisible = await textarea.isVisible().catch(() => false)

  if (isVisible) {
    await textarea.fill(pasteText)
    await delay(300)
    await clickBtn(page, 'ANALIZAR Y CARGAR')
    await delay(800)
    console.log('      ✅ Smart Paste (textarea) completado')
  } else {
    // En móvil solo hay el botón de portapapeles — cerramos el modal
    // y agregamos bailarines uno a uno
    console.log('      ℹ️  Textarea no disponible (viewport móvil), agregando uno a uno...')
    await clickBtn(page, 'CERRAR')
    await delay(400)

    for (let i = 0; i < team.teamSize; i++) {
      // Agregar fila
      await clickBtn(page, 'AGREGAR INTEGRANTE')
      await delay(300)

      // Nombre: la app agrega integrantes al principio (arriba), por lo que rellenamos siempre el primero
      const nameInputs = page.locator('input[placeholder="Nombre completo"]')
      await nameInputs.first().fill(team.names[i])
      await delay(150)

      // Fecha de nacimiento: el botón calendario del primer bailarín de la lista
      const firstDancerCard = page.locator('div[class*="space-y-1.5"] > div').first()
      await firstDancerCard.locator('button').nth(1).click()
      await delay(400)

      // Parsear fecha DD/MM/YYYY
      const [dd, mm, yyyy] = team.birthdates[i].split('/')

      // Selects de día, mes, año en el bottom sheet
      const selects = page.locator('.fixed select')
      const selCount = await selects.count()
      if (selCount >= 3) {
        await selects.nth(0).selectOption(dd)                     // día
        await selects.nth(1).selectOption(mm)                     // mes
        await selects.nth(2).selectOption(yyyy)                   // año
        await delay(300)
        // Confirmar
        await clickBtn(page, 'Listo')
        await delay(300)
      }
    }
    console.log(`      ✅ ${team.teamSize} bailarines agregados manualmente`)
  }

  // Diagnóstico del estado de los bailarines en el DOM
  const dancersData = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[placeholder="Nombre completo"]'));
    const buttons = Array.from(document.querySelectorAll('button'));
    const calendarButtons = buttons.filter(btn => {
      const hasCalendarIcon = btn.querySelector('svg.lucide-calendar') || btn.querySelector('svg');
      const text = btn.innerText;
      return hasCalendarIcon || text.includes('DD / MM / AAAA') || /^\d{2}\/\d{2}\/\d{4}$/.test(text.trim());
    });
    return inputs.map((inp, idx) => ({
      idx: idx + 1,
      name: inp.value,
      birthdateText: calendarButtons[idx] ? calendarButtons[idx].innerText.trim() : 'NO ENCONTRADO'
    }));
  });
  console.log('      📊 Dancers DOM State:', JSON.stringify(dancersData, null, 2))

  // Avanzar
  await clickFooterBtn(page, 'SIGUIENTE')
  console.log('      ✅ Paso 2 completado')
}

/**
 * PASO 3: COREOGRAFÍAS
 * Añade el grupal, solos y duetos de forma dinámica basándose en el perfil de la academia
 */
async function stepActs(page, team) {
  console.log('   🎭 Paso 3: Coreografías')

  // Esperar el paso de coreografías
  await page.waitForSelector('button:has-text("AGREGAR COREOGRAFÍA")', { timeout: 8000 })

  for (let idx = 0; idx < team.acts.length; idx++) {
    const act = team.acts[idx]
    const accordionIndex = idx + 1
    console.log(`      Acto #${accordionIndex}: ${act.modality} · ${act.style} con ${act.dancers.length} integrantes`)

    // El primer acordeón se auto-inicializa, para los siguientes hacemos click en AGREGAR COREOGRAFÍA
    if (idx > 0) {
      await clickBtn(page, 'AGREGAR COREOGRAFÍA')
      await delay(500)
    }

    // Asegurar que el acordeón correcto está abierto buscando su botón de modalidad
    const modalityBtn = page.locator(`button:has-text("${act.modality}")`).first()
    const isAccordionOpen = await modalityBtn.isVisible().catch(() => false)
    if (!isAccordionOpen) {
      console.log(`      Abriendo acordeón #${accordionIndex}...`)
      const headerSpan = page.locator(`span:has-text("#${accordionIndex}")`).first()
      await headerSpan.click()
      await delay(450)
    }

    // 1. Seleccionar modalidad
    await clickBtn(page, act.modality)
    await delay(300)

    // 2. Seleccionar nivel (solo si es GRUPAL)
    if (act.modality === 'GRUPAL' && act.level) {
      await clickBtn(page, act.level)
      await delay(300)
    }

    // 3. Seleccionar estilo
    await clickBtn(page, act.style.toUpperCase())
    await delay(350)

    // 4. Seleccionar integrantes en la sección de este acordeón
    const dancerSection = page.locator('label:has-text("Selecciona Integrantes")').locator('..').locator('..')
    const chips = dancerSection.locator('button').filter({ hasNotText: 'Integrantes' })

    for (const dancerIdx of act.dancers) {
      try {
        await chips.nth(dancerIdx).click()
        await delay(120)
      } catch (err) {
        console.log(`      ⚠️  No se pudo seleccionar integrante index ${dancerIdx}: ${err.message.slice(0, 50)}`)
      }
    }

    // 5. Confirmar esta coreografía
    await clickFooterBtn(page, 'CONFIRMAR COREOGRAFÍA')
    await delay(500)
  }

  // Avanzar al resumen
  await clickFooterBtn(page, 'SIGUIENTE: RESUMEN')
  await delay(800)
  console.log('      ✅ Paso 3 completado')
}

/**
 * PASO 4: RESUMEN
 * Solo revisamos y avanzamos (boletos opcionales)
 */
async function stepSummary(page, team) {
  console.log('   📋 Paso 4: Resumen')

  // Cada integrante lleva al menos papá y mamá: teamSize * 2
  const ticketsToBuy = team.teamSize * 2
  console.log(`      Agregando ${ticketsToBuy} entradas adicionales para acompañantes...`)

  try {
    const plusBtn = page.locator('button:has-text("+")').first()
    await plusBtn.waitFor({ state: 'visible', timeout: 5000 })
    for (let t = 0; t < ticketsToBuy; t++) {
      await plusBtn.click()
      await delay(60) // clicks rápidos
    }
    await delay(400)
    console.log(`      ✅ ${ticketsToBuy} entradas agregadas exitosamente`)
  } catch (err) {
    console.log(`      ⚠️  No se pudieron agregar entradas adicionales: ${err.message.slice(0, 80)}`)
  }

  // Esperar y hacer click en el botón de avanzar del footer móvil (segundo botón)
  const continueBtn = page.locator('.mobile-bottom-nav button').nth(1)
  await continueBtn.waitFor({ state: 'visible', timeout: 8000 })
  await continueBtn.click()
  await delay(800)
  console.log('      ✅ Resumen confirmado')
}

/**
 * PASO 5: CARTA RESPONSIVA + FIRMA
 * Acepta la carta y dibuja una firma mínima
 */
async function stepCarta(page) {
  console.log('   ✍️  Paso 5: Carta Responsiva')

  // Esperar la carta
  await page.waitForSelector('h2:has-text("Carta"), h2:has-text("CARTA"), h2:has-text("Responsiva")', { timeout: 8000 })
  await delay(600)

  // Buscar el canvas de firma y dibujar en él mediante TouchEvents programáticos
  try {
    const canvas = page.locator('canvas').first()
    if (await canvas.isVisible({ timeout: 3000 })) {
      await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const startX = rect.left + rect.width * 0.15;
        const startY = rect.top + rect.height * 0.5;
        const endX = rect.left + rect.width * 0.85;
        const endY = rect.top + rect.height * 0.55;

        // Helper to construct a Touch object
        const createTouch = (cx, cy) => new Touch({
          identifier: Date.now(),
          target: canvas,
          clientX: cx,
          clientY: cy,
          screenX: cx,
          screenY: cy,
          pageX: cx,
          pageY: cy,
        });

        // 1. TouchStart
        const tStart = createTouch(startX, startY);
        canvas.dispatchEvent(new TouchEvent('touchstart', {
          touches: [tStart],
          targetTouches: [tStart],
          changedTouches: [tStart],
          bubbles: true,
          cancelable: true,
        }));

        // 2. TouchMove (zigzag)
        for (let i = 1; i <= 5; i++) {
          const cx = startX + (endX - startX) * (i / 5);
          const cy = startY + (i % 2 === 0 ? -15 : 15);
          const tMove = createTouch(cx, cy);
          canvas.dispatchEvent(new TouchEvent('touchmove', {
            touches: [tMove],
            targetTouches: [tMove],
            changedTouches: [tMove],
            bubbles: true,
            cancelable: true,
          }));
        }

        // 3. TouchEnd
        const tEnd = createTouch(endX, endY);
        canvas.dispatchEvent(new TouchEvent('touchend', {
          touches: [],
          targetTouches: [],
          changedTouches: [tEnd],
          bubbles: true,
          cancelable: true,
        }));
      });

      await delay(500)
      console.log('      ✅ Firma trazada por TouchEvents programáticos')
    }
  } catch (e) {
    console.log(`      ⚠️  Firma: ${e.message.slice(0, 60)}`)
  }

  // Click en "CONFIRMAR REGISTRO" (segundo botón del footer móvil)
  const confirmBtn = page.locator('.mobile-bottom-nav button').nth(1)
  await confirmBtn.waitFor({ state: 'visible', timeout: 8000 })
  await confirmBtn.click()
  await delay(3000) // esperar guardado en Supabase
  console.log('      ✅ CONFIRMAR REGISTRO clickeado')
}

/**
 * Verificar pantalla de éxito (confirmed/pending)
 */
async function checkSuccess(page) {
  try {
    // Wait for the success header h2 to appear in the DOM
    const successElement = page.locator('h2').filter({
      hasText: /REGISTRO ENVIADO|REGISTRO CONFIRMADO|CAMBIOS/i
    }).first()

    await successElement.waitFor({ state: 'visible', timeout: 10000 })
    return true
  } catch (e) {
    console.log(`      ⚠️  No se encontró confirmación: ${e.message.slice(0, 80)}`)
    return false
  }
}

// ─── Flujo completo ────────────────────────────────────────────────────────────

async function runRegistration(page, team, runNum) {
  // Limpiar localStorage para evitar drafts de runs anteriores
  await page.goto(REGISTER_URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await page.reload({ waitUntil: 'networkidle' })
  await delay(500)

  try {
    await stepWelcome(page)
    await stepSetup(page, team)
    await stepDancers(page, team)
    await stepActs(page, team)
    await stepSummary(page, team)
    await stepCarta(page)

    const success = await checkSuccess(page)
    if (success) {
      console.log(`   ✅ Registro ${runNum} EXITOSO`)
      return true
    } else {
      console.log(`   ⚠️  No se detectó pantalla de éxito`)
      await screenshot(page, `run${runNum}-no-success`)
      return false
    }
  } catch (e) {
    console.log(`   ❌ Error en run ${runNum}: ${e.message.slice(0, 120)}`)
    await screenshot(page, `run${runNum}-error`)
    return false
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🎭 Dance4ever — Simulador UI con Playwright')
  console.log(`🌐 URL: ${REGISTER_URL}`)
  console.log(`🔄 Runs: ${RUNS}`)
  console.log(`👁️  Headless: ${HEADLESS}`)
  console.log('')

  // Asegurarnos que existe la carpeta de exports para screenshots
  const { mkdirSync, existsSync } = await import('fs')
  if (!existsSync('exports')) mkdirSync('exports')

  const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox']
  if (!HEADLESS) {
    // Establecer un tamaño de ventana similar al iPhone 14 Pro
    launchArgs.push('--window-size=460,960')
  }

  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: HEADLESS,
    args: launchArgs,
  })

  let success = 0, failed = 0

  const shuffledAcademies = shuffle(ACADEMIES_REAL)

  for (let i = 1; i <= RUNS; i++) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    const academy = shuffledAcademies[i - 1] || pick(ACADEMIES_REAL)
    const team = generateTeam(academy)
    console.log(`📋 Registro ${i}/${RUNS}: ${team.academyName} (${team.city})`)
    console.log(`   Coach: ${team.coachName} · ${team.teamSize} bailarines`)
    const actDescriptions = team.acts.map(a => `${a.modality} ${a.style}`).join(' + ')
    console.log(`   Coreos: ${actDescriptions}`)

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, // iPhone 14 Pro size
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      locale: 'es-MX',
    })

    // Log de errores de consola
    const page = await context.newPage()
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`   🔴 JS Error: ${msg.text().slice(0, 80)}`)
    })

    const ok = await runRegistration(page, team, i)
    if (ok) success++; else failed++

    await context.close()

    if (i < RUNS) {
      console.log(`\n⏳ Esperando 2s...`)
      await delay(2000)
    }
  }

  await browser.close()

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`🏁 Simulación completada`)
  console.log(`   ✅ Exitosos: ${success}`)
  console.log(`   ❌ Fallidos: ${failed}`)
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message)
  process.exit(1)
})
