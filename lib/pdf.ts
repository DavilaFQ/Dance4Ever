import { type Event, AGE_CATEGORY_LABELS, AGE_CATEGORY_HINTS } from '@/lib/supabase'
import { type State, STYLES, MODALITY_OPTIONS } from '@/components/register/types'
import { effectiveCategory, costBreakdown, costoTotal, formatMoney, formatEventDate, extractErrorMessage, loadImage, modalityLabel, participacionesPorAlumno, isBeforeCoreoDeadline, getPrecioEntradaRegistro } from '@/components/register/utils'


export async function generateReceiptPDF(state: State, event: Event | null) {
  const doc = await generatePDF(state, event, true)
  const filename = `Comprobante_Registro_${state.academy.replace(/\s+/g, '_') || 'Dance4ever'}.pdf`
  doc.save(filename)
}

export async function generateReceiptPDFDoc(state: State, event: Event | null) {
  return generatePDF(state, event, true)
}

export async function generateBudgetPDF(state: State, event: Event | null) {
  const doc = await generatePDF(state, event, false)
  const filename = `Presupuesto_Registro_${state.academy.replace(/\s+/g, '_') || 'Dance4ever'}.pdf`
  doc.save(filename)
}

export async function generateBudgetPDFDoc(state: State, event: Event | null) {
  return generatePDF(state, event, false)
}

export async function generatePDF(state: State, event: Event | null, showBankInfo: boolean) {
  const jsPDF = (await import('jspdf')).default
  const autoTable = (await import('jspdf-autotable')).default

  // Preload logo
  let logoImg: HTMLImageElement | null = null
  try {
    logoImg = await loadImage('/logo.png')
  } catch (e) {
    console.error('Failed to load logo:', e)
  }

  const doc = new jsPDF('p', 'mm', 'a4')
  const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
  const bd = costBreakdown(state, event)
  const paq = bd.paq
  const rep = bd.rep
  const asistente = bd.asistenteCosto
  const dancersPorAsistente = bd.dancersPorAsistente
  const precioEntrada = bd.precioEntrada
  const beforeDeadline = bd.beforeDeadline

  // Header Background
  doc.setFillColor(76, 29, 149) // Royal deep purple gala color `#4C1D95`
  doc.rect(0, 0, 210, 42, 'F')

  // Accent line
  doc.setFillColor(217, 70, 239) // Fuchsia `#D946EF`
  doc.rect(0, 42, 210, 2.5, 'F')

  // Logo / Brand Name
  let logoWidth = 20
  let logoHeight = 20
  let textStartX = 39

  if (logoImg) {
    const originalWidth = logoImg.width
    const originalHeight = logoImg.height
    if (originalWidth > 0 && originalHeight > 0) {
      const ratio = originalWidth / originalHeight
      // Safe height for logo inside header is 18mm
      logoHeight = 18
      logoWidth = logoHeight * ratio
      // Cap width just in case it is too wide
      if (logoWidth > 40) {
        logoWidth = 40
        logoHeight = logoWidth / ratio
      }
    }

    // Vertical centering in the 42mm header
    const logoY = (42 - logoHeight) / 2
    doc.addImage(logoImg, 'PNG', 15, logoY, logoWidth, logoHeight)
    textStartX = 15 + logoWidth + 4
  } else {
    textStartX = 15
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.text('DANCE4EVER', textStartX, 18)

  doc.setTextColor(234, 179, 8) // Gold
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  const subtitleText = showBankInfo ? 'COMPROBANTE DE REGISTRO' : 'PRE-REGISTRO EN REVISIÓN'
  doc.text(subtitleText, textStartX, 24)

  // Event name and date on the right side
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  const eventName = event?.name?.toUpperCase() || 'EVENTO NACIONAL DANCE4EVER'
  doc.text(eventName, 195, 18, { align: 'right' })
  
  doc.setTextColor(200, 200, 200)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const eventDate = event?.date ? formatEventDate(event.date) : (event?.name || 'Evento')
  doc.text(eventDate, 195, 24, { align: 'right' })
  
  // Badge on right depending on confirmation status
  if (showBankInfo) {
    doc.setFillColor(22, 163, 74) // Success Green
    doc.rect(155, 29, 40, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('REGISTRO CONFIRMADO', 175, 33, { align: 'center' })
  } else {
    doc.setFillColor(245, 158, 11) // Amber / Orange-500 (#F59E0B)
    doc.rect(150, 29, 45, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.text('REGISTRO EN REVISIÓN', 172.5, 33, { align: 'center' })
  }

  let y = 52

  // Section title: DATOS DE LA ACADEMIA Y COACH
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(17, 17, 17)
  doc.text('INFORMACIÓN DE LA ACADEMIA Y COACH', 15, y)
  y += 4

  // Underline fuchsia accent for the section
  doc.setDrawColor(217, 70, 239)
  doc.setLineWidth(0.5)
  doc.line(15, y, 195, y)
  y += 5

  // Info blocks in columns
  // Col 1
  doc.setFontSize(8.5)
  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('ACADEMIA / COLEGIO:', 15, y)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'normal')
  doc.text(state.academy.toUpperCase() || 'SIN ACADEMIA', 52, y)

  // Col 2
  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('FOLIO REGISTRO:', 120, y)
  doc.setTextColor(217, 70, 239) // Fuchsia for emphasis
  doc.setFont('helvetica', 'bold')
  doc.text(`#D4E-${state.confirmedRegistrationId || 'TEMP'}`, 150, y)

  y += 5

  // Row 2
  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('COACH:', 15, y)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'normal')
  doc.text(state.coach.name.toUpperCase() || 'SIN NOMBRE', 52, y)

  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('CIUDAD / SEDE:', 120, y)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'normal')
  doc.text(state.city.toUpperCase() || 'SIN CIUDAD', 150, y)

  y += 5

  // Row 3
  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('WHATSAPP / TEL:', 15, y)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'normal')
  doc.text(state.coach.phone || 'SIN WHATSAPP', 52, y)

  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('FECHA REGISTRO:', 120, y)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'normal')
  let registrationDate = new Date()
  if (state.confirmedAt) {
    registrationDate = new Date(state.confirmedAt)
  }

  const confirmTimestamp = registrationDate.toLocaleString('es-MX', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  }).toUpperCase()
  doc.text(confirmTimestamp, 150, y)

  y += 5

  // Row 4
  if (state.coach.email) {
    doc.setTextColor(100, 100, 100)
    doc.setFont('helvetica', 'bold')
    doc.text('EMAIL / CORREO:', 15, y)
    doc.setTextColor(17, 17, 17)
    doc.setFont('helvetica', 'normal')
    doc.text(state.coach.email, 52, y)
    y += 5
  }

  const assistants = state.coach.assistants.filter(a => a.trim()).join(', ')
  if (assistants) {
    doc.setTextColor(100, 100, 100)
    doc.setFont('helvetica', 'bold')
    doc.text('ASISTENTES:', 15, y)
    doc.setTextColor(17, 17, 17)
    doc.setFont('helvetica', 'normal')
    doc.text(assistants.toUpperCase(), 52, y, { maxWidth: 140 })
    y += 5
  }

  y += 3

  // Unified page footer/header hooks
  const pageFooterHook = (data: any) => {
    if (data.pageNumber > 1) {
      doc.setFillColor(76, 29, 149) // Royal deep purple gala color `#4C1D95`
      doc.rect(0, 0, 210, 15, 'F')
      doc.setFillColor(217, 70, 239)
      doc.rect(0, 15, 210, 1, 'F')
      
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('DANCE4EVER - DETALLES Y COSTOS DE REGISTRO', 15, 10)
    }
    
    const footerY = 287
    doc.setDrawColor(217, 70, 239, 0.3)
    doc.setLineWidth(0.3)
    doc.line(15, footerY - 4, 195, footerY - 4)

    doc.setTextColor(120, 120, 120)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.text(`Dance4Ever · Página ${data.pageNumber} · www.dance4ever.com.mx`, 105, footerY, { align: 'center' })
  }

  // Section: Acts
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(17, 17, 17)
  doc.text(`COREOGRAFÍAS REGISTRADAS (${state.acts.length})`, 15, y)
  y += 4

  doc.setDrawColor(217, 70, 239)
  doc.setLineWidth(0.5)
  doc.line(15, y, 195, y)
  y += 4

  const actRows = state.acts.map((act, idx) => {
    const cat = act.ageCategory ? AGE_CATEGORY_LABELS[act.ageCategory] : '—'
    const mod = act.modality ? modalityLabel(act.modality) : '—'
    const lvl = act.modality === 'grupal' ? (act.level === 'basico' ? 'BÁSICO' : act.level === 'avanzado' ? 'AVANZADO' : '') : ''
    const style = act.style ?? '—'
    const dancersCount = act.dancerIndices.length
    return [
      `#${idx + 1}`,
      cat.toUpperCase(),
      `${mod.toUpperCase()}${lvl ? ' - ' + lvl : ''}`,
      style.toUpperCase(),
      `${dancersCount} Alumno${dancersCount === 1 ? '' : 's'}`
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['ID', 'CATEGORÍA', 'MODALIDAD', 'ESTILO', 'INTEGRANTES']],
    body: actRows,
    theme: 'striped',
    styles: { fontSize: 8.5, font: 'helvetica', cellPadding: 2.5 },
    headStyles: { fillColor: [76, 29, 149], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 245, 255] },
    margin: { left: 15, right: 15 },
    didDrawPage: pageFooterHook
  })

  let finalY = (doc as any).lastAutoTable.finalY || (y + 10)
  
  // Section: Dancers
  let dancersY = finalY + 8
  
  if (dancersY > 235) {
    doc.addPage()
    dancersY = 22
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(17, 17, 17)
  doc.text(`INTEGRANTES REGISTRADOS (${filledDancers.length}) - DETALLE DE PAGO`, 15, dancersY)
  dancersY += 4

  doc.setDrawColor(217, 70, 239)
  doc.setLineWidth(0.5)
  doc.line(15, dancersY, 195, dancersY)
  dancersY += 4

  // Sort dancers alphabetically by name
  const sortedDancersWithIndex = filledDancers
    .map((dancer, originalIndex) => ({ dancer, originalIndex }))
    .sort((a, b) => a.dancer.name.localeCompare(b.dancer.name, 'es'))

  const countsMap = participacionesPorAlumno(state)
  const beforeJune15 = isBeforeCoreoDeadline(event)

  const dancerRows = sortedDancersWithIndex.map(({ dancer, originalIndex }, rank) => {
    const compCat = effectiveCategory(dancer)
    const categoryStr = compCat ? AGE_CATEGORY_LABELS[compCat] : '—'
    const n = countsMap.get(originalIndex) ?? 0
    
    let cost = paq
    let breakdownStr = `$${paq.toLocaleString('es-MX')} (Insc.)`
    if (beforeJune15) {
      if (n > 1) {
        cost += (n - 1) * rep
        breakdownStr += ` + $${((n - 1) * rep).toLocaleString('es-MX')} (${n - 1} extra)`
      } else {
        breakdownStr += ' (1ª coreo inc.)'
      }
    } else {
      if (n > 0) {
        cost += n * rep
        breakdownStr += ` + $${(n * rep).toLocaleString('es-MX')} (${n} coreo${n === 1 ? '' : 's'})`
      }
    }
    
    return [
      `${rank + 1}`,
      dancer.name.toUpperCase(),
      categoryStr.toUpperCase(),
      `${n} Coreo${n === 1 ? '' : 's'}`,
      breakdownStr,
      `$${cost.toLocaleString('es-MX')}`
    ]
  })

  autoTable(doc, {
    startY: dancersY,
    head: [['#', 'INTEGRANTE (ALFABÉTICO)', 'CATEGORÍA', 'COREOGRAFÍAS', 'DESGLOSE DE PAGO', 'TOTAL']],
    body: dancerRows,
    theme: 'striped',
    styles: { fontSize: 8, font: 'helvetica', cellPadding: 2 },
    headStyles: { fillColor: [217, 70, 239], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [253, 244, 255] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { fontStyle: 'bold' },
      2: { cellWidth: 25 },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 45, halign: 'right' },
      5: { cellWidth: 20, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 15, right: 15 },
    didDrawPage: pageFooterHook
  })

  let finalDancersY = (doc as any).lastAutoTable.finalY || (dancersY + 15)
  let costY: number
  if (showBankInfo) {
  let bankY = finalDancersY + 8

  if (bankY > 215) {
    doc.addPage()
    bankY = 22
  }

  // Draw light lavender background bank card
  doc.setFillColor(250, 245, 255) // Soft cream/lavender tint `#FAF5FF`
  doc.setDrawColor(217, 70, 239) // Fuchsia
  doc.setLineWidth(0.4)
  doc.rect(15, bankY, 180, 18, 'FD')

  // Title inside card
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(217, 70, 239) // Fuchsia
  doc.text('INFORMACIÓN DE PAGO (DEPÓSITO O TRANSFERENCIA)', 20, bankY + 5)

  doc.setFontSize(7.5)
  // Col 1
  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'normal')
  doc.text('BENEFICIARIO:', 20, bankY + 10)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('JOEL ARTURO GARCIA', 45, bankY + 10)
  
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('BANCO:', 20, bankY + 14)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('BBVA', 45, bankY + 14)

  // Col 2
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('CUENTA:', 95, bankY + 10)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('010 440 2340', 115, bankY + 10)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('CLABE:', 95, bankY + 14)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('012 180 001044023400', 115, bankY + 14)

  // Col 3
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('NO. DE TARJETA:', 148, bankY + 10)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('4152 3139 6949 9099', 148, bankY + 14)

  costY = bankY + 18 + 6
  } else {
    costY = finalDancersY + 8
  }

  if (costY > 225) {
    doc.addPage()
    costY = 22
  }

  // Cost items calculation
  const freeEntries = Math.floor(filledDancers.length / dancersPorAsistente)
  const assistantsList = state.coach.assistants.filter(a => a.trim())
  const paidAssistants = Math.max(0, assistantsList.length - freeEntries)

  let totalInscripciones = 0
  let totalAdicionales = 0
  let totalAdicionalesCount = 0

  state.dancers.forEach((dancer, idx) => {
    if (dancer.name.trim().length === 0) return
    totalInscripciones += paq
    
    const n = countsMap.get(idx) ?? 0
    if (beforeJune15) {
      if (n > 1) {
        totalAdicionalesCount += (n - 1)
        totalAdicionales += (n - 1) * rep
      }
    } else {
      totalAdicionalesCount += n
      totalAdicionales += n * rep
    }
  })

  const totalDancers = totalInscripciones + totalAdicionales
  const totalCoach = 0
  const totalAsistentes = paidAssistants * asistente
  const totalEntradas = (state.ticketsCount ?? 0) * getPrecioEntradaRegistro(event)
  const total = totalDancers + totalAsistentes + totalEntradas

  // Card details
  const cardWidth = 110
  const cardHeight = 50
  const cardX = 15
  const cardY = costY

  // Draw light purple background card
  doc.setFillColor(248, 245, 255)
  doc.setDrawColor(217, 70, 239)
  doc.setLineWidth(0.4)
  doc.rect(cardX, cardY, cardWidth, cardHeight, 'FD')

  // Title inside card
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(17, 17, 17)
  doc.text('DESGLOSE DE COSTOS (MXN)', cardX + 5, cardY + 6)

  // Divider
  doc.setDrawColor(217, 70, 239, 0.3)
  doc.line(cardX + 5, cardY + 9, cardX + cardWidth - 5, cardY + 9)

  let itemY = cardY + 14
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')

  // 1. Coach Entry
  doc.setTextColor(80, 80, 80)
  doc.text('Coach (entrada):', cardX + 5, itemY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 17, 17)
  doc.text('Gratis ($0)', cardX + cardWidth - 5, itemY, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  itemY += 5

  // 2. Inscripción de Participantes
  doc.setTextColor(80, 80, 80)
  doc.text('Inscripción Integrantes:', cardX + 5, itemY)
  doc.setTextColor(17, 17, 17)
  doc.text(`(${filledDancers.length} x $${paq})`, cardX + 38, itemY)
  doc.setFont('helvetica', 'bold')
  doc.text(`$${totalInscripciones.toLocaleString('es-MX')}`, cardX + cardWidth - 5, itemY, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  itemY += 5

  // 3. Coreografías adicionales
  if (totalAdicionalesCount > 0) {
    doc.setTextColor(80, 80, 80)
    doc.text('Coreografías Adic.:', cardX + 5, itemY)
    doc.setTextColor(17, 17, 17)
    doc.text(`(${totalAdicionalesCount} x $${rep})`, cardX + 38, itemY)
    doc.setFont('helvetica', 'bold')
    doc.text(`$${totalAdicionales.toLocaleString('es-MX')}`, cardX + cardWidth - 5, itemY, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    itemY += 5
  }

  // 4. Asistentes
  if (assistantsList.length > 0) {
    doc.setTextColor(80, 80, 80)
    doc.text('Asistentes:', cardX + 5, itemY)
    doc.setTextColor(17, 17, 17)
    doc.text(`(${paidAssistants} x $${asistente}${freeEntries > 0 ? `, ${freeEntries} gratis` : ''})`, cardX + 38, itemY)
    doc.setFont('helvetica', 'bold')
    doc.text(`$${(totalAsistentes).toLocaleString('es-MX')}`, cardX + cardWidth - 5, itemY, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    itemY += 5
  }

  // 5. Entradas acompañantes
  if (state.ticketsCount > 0) {
    doc.setTextColor(80, 80, 80)
    doc.text('Entradas Familia:', cardX + 5, itemY)
    doc.setTextColor(17, 17, 17)
    doc.text(`(${state.ticketsCount} x $${getPrecioEntradaRegistro(event)})`, cardX + 38, itemY)
    doc.setFont('helvetica', 'bold')
    doc.text(`$${(totalEntradas).toLocaleString('es-MX')}`, cardX + cardWidth - 5, itemY, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    itemY += 5
  }

  // Final Divider
  doc.setDrawColor(217, 70, 239, 0.5)
  doc.line(cardX + 5, cardY + cardHeight - 10, cardX + cardWidth - 5, cardY + cardHeight - 10)

  // TOTAL ESTIMADO
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(217, 70, 239)
  doc.text('TOTAL ESTIMADO:', cardX + 5, cardY + cardHeight - 4.5)
  doc.setFontSize(11)
  doc.text(`$${total.toLocaleString('es-MX')} MXN`, cardX + cardWidth - 5, cardY + cardHeight - 4.5, { align: 'right' })



  // Watermark + note for budget (non-confirmed) PDF
  if (!showBankInfo) {
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const pageCount = doc.getNumberOfPages()

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)

      // Set watermark opacity (lower opacity to avoid clutter since there are multiple)
      try {
        const gsWatermark = doc.GState({ opacity: 0.08 })
        doc.setGState(gsWatermark)
      } catch { /* fallback if GState not supported */ }

      // Draw red diagonal watermarks (3 positions: top, middle, bottom)
      doc.setTextColor(239, 68, 68) // Tailwind Red-500 (#EF4444)
      doc.setFontSize(25)
      doc.setFont('helvetica', 'bold')
      
      const watermarkText = 'PRE-REGISTRO · EN REVISIÓN'
      
      // Top Watermark
      doc.text(watermarkText, pageW / 2, pageH * 0.26, {
        angle: 45,
        align: 'center',
      })

      // Middle Watermark
      doc.text(watermarkText, pageW / 2, pageH * 0.5, {
        angle: 45,
        align: 'center',
      })

      // Bottom Watermark
      doc.text(watermarkText, pageW / 2, pageH * 0.74, {
        angle: 45,
        align: 'center',
      })

      // Reset GState opacity for footer note to be fully visible and clear
      try {
        const gsNormal = doc.GState({ opacity: 1.0 })
        doc.setGState(gsNormal)
      } catch { /* fallback if GState not supported */ }

      // Footer note
      const footerY = pageH - 10
      doc.setTextColor(140, 140, 140)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'italic')
      doc.text(
        'Este documento es un presupuesto de referencia. El comprobante oficial con datos bancarios estará disponible cuando tu registro sea confirmado.',
        pageW / 2,
        footerY,
        { align: 'center', maxWidth: 180 }
      )
    }
  }

  // Output / Download
  return doc
}
 
export async function generateExtraTicketsPDF(state: State, event: Event | null, newTickets: number, action: 'view' | 'download' = 'download', pdfWindow: any = null) {
  const jsPDF = (await import('jspdf')).default
  
  let logoImg: HTMLImageElement | null = null
  try {
    logoImg = await loadImage('/logo.png')
  } catch (e) {
    console.error('Failed to load logo:', e)
  }

  const doc = new jsPDF('p', 'mm', 'a4')
  
  // Header Background
  doc.setFillColor(76, 29, 149) // Royal deep purple gala color `#4C1D95`
  doc.rect(0, 0, 210, 42, 'F')

  // Accent line
  doc.setFillColor(217, 70, 239) // Fuchsia
  doc.rect(0, 42, 210, 2.5, 'F')

  // Logo / Brand Name
  let logoWidth = 20
  let logoHeight = 20
  let textStartX = 39

  if (logoImg) {
    const originalWidth = logoImg.width
    const originalHeight = logoImg.height
    if (originalWidth > 0 && originalHeight > 0) {
      const ratio = originalWidth / originalHeight
      logoHeight = 18
      logoWidth = logoHeight * ratio
      if (logoWidth > 40) {
        logoWidth = 40
        logoHeight = logoWidth / ratio
      }
    }
    const logoY = (42 - logoHeight) / 2
    doc.addImage(logoImg, 'PNG', 15, logoY, logoWidth, logoHeight)
    textStartX = 15 + logoWidth + 4
  } else {
    textStartX = 15
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text('DANCE4EVER', textStartX, 18)

  doc.setTextColor(234, 179, 8) // Gold
  doc.setFontSize(9)
  doc.text('COMPROBANTE DE ENTRADAS ADICIONALES', textStartX, 24)

  // Event name on right
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  const eventName = event?.name?.toUpperCase() || 'EVENTO NACIONAL DANCE4EVER'
  doc.text(eventName, 195, 18, { align: 'right' })
  
  doc.setTextColor(200, 200, 200)
  doc.setFontSize(9)
  const eventDate = event?.date ? formatEventDate(event.date) : (event?.name || 'Evento')
  doc.text(eventDate, 195, 24, { align: 'right' })

  let y = 52

  // Coach and Academy Info Section
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(17, 17, 17)
  doc.text('INFORMACIÓN DE REFERENCIA DEL REGISTRO', 15, y)
  y += 4

  doc.setDrawColor(217, 70, 239)
  doc.setLineWidth(0.5)
  doc.line(15, y, 195, y)
  y += 5

  doc.setFontSize(8.5)
  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('ACADEMIA / COLEGIO:', 15, y)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'normal')
  doc.text(state.academy.toUpperCase() || 'SIN ACADEMIA', 52, y)

  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('FOLIO REGISTRO:', 120, y)
  doc.setTextColor(217, 70, 239) // Fuchsia
  doc.text(`#D4E-${state.confirmedRegistrationId || 'TEMP'}`, 150, y)
  y += 5

  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('COACH:', 15, y)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'normal')
  doc.text(state.coach.name.toUpperCase() || 'SIN NOMBRE', 52, y)

  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('CIUDAD / SEDE:', 120, y)
  doc.text(state.city.toUpperCase() || 'SIN CIUDAD', 150, y)
  y += 5

  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('WHATSAPP / TEL:', 15, y)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'normal')
  doc.text(state.coach.phone || 'SIN WHATSAPP', 52, y)

  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'bold')
  doc.text('FECHA SOLICITUD:', 120, y)
  doc.text(new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase(), 150, y)
  y += 12

  // Ticket detail card
  doc.setFillColor(250, 245, 255) // soft lavender
  doc.setDrawColor(217, 70, 239)
  doc.setLineWidth(0.4)
  doc.rect(15, y, 180, 28, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(217, 70, 239)
  doc.text('DETALLE DE ENTRADAS ADICIONALES SOLICITADAS', 20, y + 6)

  doc.setDrawColor(217, 70, 239, 0.3)
  doc.line(20, y + 9, 190, y + 9)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text('CONCEPTO: Entradas para Acompañantes / Familiares (Dance4Ever)', 20, y + 14)
  const entradaUnit = getPrecioEntradaRegistro(event)
  doc.text(`CANTIDAD: ${newTickets} boleto(s) adicional(es)`, 20, y + 19)
  doc.text(`COSTO UNITARIO: $${entradaUnit.toLocaleString('es-MX')} MXN`, 20, y + 24)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 17, 17)
  const extraTotal = newTickets * entradaUnit
  doc.text(`TOTAL DE ESTA SOLICITUD: $${extraTotal.toLocaleString('es-MX')} MXN`, 110, y + 24)

  y += 34

  // Bank Info Card
  doc.setFillColor(250, 245, 255) // Soft cream/lavender tint
  doc.setDrawColor(217, 70, 239)
  doc.setLineWidth(0.4)
  doc.rect(15, y, 180, 22, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(217, 70, 239)
  doc.text('INFORMACIÓN DE PAGO PARA ESTE LOTE DE BOLETOS', 20, y + 5)

  doc.setFontSize(7.5)
  // Col 1
  doc.setTextColor(100, 100, 100)
  doc.text('BENEFICIARIO:', 20, y + 11)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('JOEL ARTURO GARCIA', 45, y + 11)
  
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('BANCO:', 20, y + 16)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('BBVA', 45, y + 16)

  // Col 2
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('CUENTA:', 95, y + 11)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('010 440 2340', 115, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('CLABE:', 95, y + 16)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('012 180 001044023400', 115, y + 16)

  // Col 3
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('NO. DE TARJETA:', 148, y + 11)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('4152 3139 6949 9099', 148, y + 16)

  y += 28

  // Instructions
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(17, 17, 17)
  doc.text('INSTRUCCIONES IMPORTANTES PARA LA ENTREGA:', 15, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  const paragraph = '1. Realiza la transferencia o depósito bancario por el total exacto indicado en este recibo.\n2. Envía una fotografía o captura del comprobante de pago de la transferencia junto con este archivo PDF al comité organizador vía WhatsApp.\n3. Tus boletos físicos adicionales te serán entregados el día del evento en la taquilla de registro junto con tu paquete principal.'
  doc.text(paragraph, 15, y, { maxWidth: 180 })

  y += 18



  // Footer
  const footerY = 287
  doc.setDrawColor(217, 70, 239, 0.3)
  doc.setLineWidth(0.3)
  doc.line(15, footerY - 4, 195, footerY - 4)

  doc.setTextColor(120, 120, 120)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.text('Dance4Ever · Comprobante de Entradas Extras · www.dance4ever.com.mx', 105, footerY, { align: 'center' })

  const filename = `Recibo_Entradas_Extras_${state.academy.replace(/\s+/g, '_') || 'Dance4ever'}.pdf`
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)

  if (action === 'view') {
    if (pdfWindow) {
      pdfWindow.location.href = url
    } else {
      window.open(url, '_blank')
    }
  } else {
    // Robust forced download using an anchor element
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

export async function generateCartaPDF(state: State, event: Event | null) {
  const doc = await generateCartaPDFDoc(state, event)
  const filename = `Carta_Responsiva_${(state.academy || 'Dance4ever').replace(/\s+/g, '_')}.pdf`
  doc.save(filename)
}

export async function generateCartaPDFDoc(state: State, event: Event | null) {
  const jsPDF = (await import('jspdf')).default

  let logoImg: HTMLImageElement | null = null
  try { logoImg = await loadImage('/logo.png') } catch { /* ignore */ }

  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = doc.internal.pageSize.getWidth()

  // Header
  doc.setFillColor(76, 29, 149)
  doc.rect(0, 0, 210, 35, 'F')
  if (logoImg) {
    const originalWidth = logoImg.width
    const originalHeight = logoImg.height
    const ratio = originalHeight > 0 ? originalWidth / originalHeight : 1
    let logoHeight = 27
    let logoWidth = logoHeight * ratio
    if (logoWidth > 120) {
      logoWidth = 120
      logoHeight = logoWidth / ratio
    }
    const logoX = (pageW - logoWidth) / 2
    const logoY = (35 - logoHeight) / 2
    doc.addImage(logoImg, 'PNG', logoX, logoY, logoWidth, logoHeight)
  }

  let y = 43

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(76, 29, 149)
  doc.text('CARTA RESPONSIVA Y ACUERDO DE CONFORMIDAD LEGAL', 105, y, { align: 'center' })

  y += 8

  // Carta text
  const coachName = state.coach.name || '______________________________'
  const academy = state.academy || '______________________________'
  const eventName = event?.name || '______________________________'
  const categories = [...new Set(state.acts.filter(a => a.ageCategory).map(a => AGE_CATEGORY_LABELS[a.ageCategory!]))].join(', ') || '______________________________'
  const today = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(30, 30, 30)

  const textLines = [
    `Yo, ${coachName}, en mi calidad de representante legal, director y/o persona responsable del Colegio o Academia ${academy}, declaro bajo protesta de decir verdad que cuento con las autorizaciones expresas, firmas y consentimientos por escrito de los padres o tutores legales de cada uno de los integrantes menores de edad registrados, otorgándome facultad amplia y suficiente para representarlos en el evento ${eventName}, autorizar su participación y aceptar los términos del presente instrumento en su nombre.`,
    '',
    `Manifiesto mi conformidad y aceptación absoluta de las bases, lineamientos, CONVOCATORIA y REGLAMENTO oficial de DANCE4EVER. Acepto que cualquier decisión del Comité Organizador, penalización o descalificación derivada del incumplimiento de dichas normativas por parte de cualquier miembro de mi delegación (alumnos, bailarines, coreógrafos, personal de apoyo o padres de familia acompañantes), será entera y exclusiva responsabilidad de mi equipo y de mi persona, deslindando a los organizadores de cualquier reclamo.`,
    '',
    `Asimismo, otorgo a DANCE4EVER de manera irrevocable, perpetua y gratuita la cesión de derechos de uso de imagen, voz, fotografía y video de los participantes inscritos en los que pudieran aparecer durante el desarrollo del evento, con fines informativos, de difusión cultural, comerciales o promocionales, pudiendo ser reproducidos y distribuidos total o parcialmente en medios digitales, impresos y redes sociales oficiales.`,
    '',
    `DECLARACIÓN DE RIESGOS Y COBERTURA MÉDICA: Reconozco y acepto que la danza y disciplinas afines implican un esfuerzo físico riguroso y conllevan riesgos inherentes de lesiones (esguinces, fracturas u otros accidentes). Declaro expresamente que todos los participantes cuentan con una póliza de seguro médico vigente (público o privado) y que DANCE4EVER únicamente brindará asistencia de primeros auxilios y paramédicos de emergencia en el recinto. Libero de toda responsabilidad civil, penal, administrativa o de cualquier otra índole a los Directivos, organizadores, patrocinadores, staff de DANCE4EVER y a los operadores del recinto sede ante cualquier percance que pudiera suscitarse durante el transcurso del evento.`,
    '',
    `ACUERDO DE VALIDEZ DE FIRMA ELECTRÓNICA: Ambas partes reconocen que la firma digital/holográfica plasmada y capturada electrónicamente en este portal tiene pleno valor probatorio y efectos jurídicos equivalentes a una firma física autógrafa, de conformidad con lo establecido en el Artículo 89 del Código de Comercio y demás legislación aplicable en los Estados Unidos Mexicanos. Para la interpretación y cumplimiento de este instrumento, las partes se someten expresamente a las leyes aplicables y a la jurisdicción de los tribunales competentes de la Ciudad de México, renunciando a cualquier otro fuero que por razón de sus domicilios presentes o futuros pudiera corresponderles.`
  ]

  for (const line of textLines) {
    if (line === '') { y += 2.5; continue }
    const lines = doc.splitTextToSize(line, 180)
    for (const l of lines) {
      if (y > 275) { doc.addPage(); y = 20 }
      doc.text(l, 15, y)
      y += 4.5
    }
  }

  y += 6

  if (y > 220) { doc.addPage(); y = 25 }

  // Draw card background for data section
  doc.setFillColor(248, 248, 250)
  doc.roundedRect(15, y - 2, 180, 48, 3, 3, 'F')
  doc.setDrawColor(76, 29, 149)
  doc.setLineWidth(0.8)
  doc.line(15, y - 2, 15, y + 46)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(76, 29, 149)
  doc.text('DATOS DE REGISTRO Y CONFORMIDAD', 19, y + 3)
  y += 8.5

  const dataFields = [
    ['Academia / Equipo:', academy],
    ['Competencia:', eventName],
    ['Categorías Registradas:', categories],
    ['Fecha del Evento:', event?.date ? formatEventDate(event.date) : '______________________________'],
    ['Fecha de Firma Digital:', today],
    ['Representante Autorizado:', `${coachName} (Coach / Responsable)`],
  ]

  doc.setFontSize(8)
  for (const [label, value] of dataFields) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(70, 70, 70)
    doc.text(label, 19, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(17, 17, 17)
    
    const valText = String(value)
    const lines = doc.splitTextToSize(valText, 120)
    doc.text(lines[0], 65, y)
    y += 5.2
  }

  y += 8

  if (y > 250) { doc.addPage(); y = 25 }

  // Draw centered professional signature section
  const signWidth = 80
  const signX = (pageW - signWidth) / 2
  
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.4)
  doc.line(signX, y + 16, signX + signWidth, y + 16)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(60, 60, 60)
  doc.text('FIRMA ELECTRÓNICA DE ACEPTACIÓN', pageW / 2, y + 21, { align: 'center' })
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(120, 120, 120)
  doc.text(`Responsable: ${coachName}`, pageW / 2, y + 25, { align: 'center' })
  doc.text('Consentimiento Digital y Trazado de Firma con Validez Legal', pageW / 2, y + 28.5, { align: 'center' })

  if (state.signature) {
    try {
      doc.addImage(state.signature, 'PNG', signX + 10, y - 5, 60, 20)
    } catch { /* ignore */ }
  }

  // Footer
  return doc
}
