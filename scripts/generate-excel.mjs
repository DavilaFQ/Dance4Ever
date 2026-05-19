import * as XLSX from 'xlsx'

const academyToCoach = {
  'Ballet Clásico Attitude': 'Andrea López',
  'Academia First Dance': 'Carlos Mendoza',
  'Academia Ifel': 'María Vázquez',
  'Studio Horus Egiptus': 'Roberto Silva',
  'Olimpia Jazmín': 'Sofía Hernández',
  'Unlimited': 'Luis Ramírez',
  'Colegio Cervantes': 'Luis Ramírez',
  'Colegio Subiré Santa Anita': 'Patricia Torres',
  'Colegio Finlándes López Mateos': 'Patricia Torres',
  'Frida Aguimell Studio': 'Daniel Castro',
  'One Space Academia': 'Daniel Castro',
}

const program = [
  [1, 'Solista Ballet Tiny', 'Daniela Castillo', 'Ballet Clásico Attitude', 'Guadalajara'],
  [2, 'Solista Ballet Tiny', 'Hilary Anahí', 'Academia Ifel', 'Guadalajara'],
  [3, 'Solista Ballet Tiny', 'Miroslava Alfaro', 'Ballet Clásico Attitude', 'Guadalajara'],
  [4, 'Dueto Show Mini', 'Victoria y Leah', 'Olimpia Jazmín', 'Guadalajara'],
  [5, 'Grupal Jazz Elem. Basic', 'Studio Horus Egiptus', 'Studio Horus Egiptus', 'Guadalajara'],
  [6, 'Solista Ballet Mini', 'Dannae Piña', 'Ballet Clásico Attitude', 'Guadalajara'],
  [7, 'Solista Ballet Mini', 'Ana Saucedo', 'Ballet Clásico Attitude', 'Guadalajara'],
  [8, 'Solista Ballet Mini', 'Victoria Alfaro', 'Academia Ifel', 'Guadalajara'],
  [9, 'Solista Ballet Mini', 'Sara Cruz', 'Ballet Clásico Attitude', 'Guadalajara'],
  [10, 'Solista Ballet Mini', 'Anna Pau Acosta', 'Academia Ifel', 'Guadalajara'],
  [11, 'Solista Ballet Mini', 'Fernanda Martínez', 'Ballet Clásico Attitude', 'Guadalajara'],
  [12, 'Grupal HH College', 'Academia First Dance', 'Academia First Dance', 'Guadalajara'],
  [13, 'Grupal HH College', 'Unlimited', 'Unlimited', 'Guadalajara'],
  [14, 'Solista Jazz Tiny', 'Hilary Anahí', 'Academia Ifel', 'Guadalajara'],
  [15, 'Solista Jazz Tiny', 'Dayana Iñiguez', 'Studio Horus Egiptus', 'Guadalajara'],
  [16, 'Grupal Pom Elem. Basic', 'Colegio Subiré Santa Anita', 'Colegio Subiré Santa Anita', 'Guadalajara'],
  [17, 'Grupal Pom Elem. Basic', 'Colegio Cervantes', 'Colegio Cervantes', 'Guadalajara'],
  [18, 'Solista Jazz Mini', 'Romina Caminos', 'Academia First Dance', 'Guadalajara'],
  [19, 'Solista Jazz Mini', 'Anna Saucedo', 'Ballet Clásico Attitude', 'Guadalajara'],
  [20, 'Solista Jazz Mini', 'Esther', 'Academia Ifel', 'Guadalajara'],
  [21, 'Solista Jazz Mini', 'Isabella Arteaga', 'Academia First Dance', 'Guadalajara'],
  [22, 'Solista Jazz Mini', 'Victoria Alfaro', 'Academia Ifel', 'Guadalajara'],
  [23, 'Solista Jazz Mini', 'Ian Ramírez', 'Academia First Dance', 'Guadalajara'],
  [24, 'Solista Jazz Mini', 'Anna Pau Acosta', 'Academia Ifel', 'Guadalajara'],
  [25, 'Solista Jazz Mini', 'Vania Guzmán', 'Academia First Dance', 'Guadalajara'],
  [26, 'Grupal Jazz Open', 'Academia First Dance', 'Academia First Dance', 'Guadalajara'],
  [27, 'Solista Ballet Elementary', 'Stephanie Castillo', 'Ballet Clásico Attitude', 'Guadalajara'],
  [28, 'Solista Ballet Elementary', 'Alondra Méndez', 'Ballet Clásico Attitude', 'Guadalajara'],
  [29, 'Solista Ballet Elementary', 'Luciana Aime', 'Academia Ifel', 'Guadalajara'],
  [30, 'Solista Ballet Elementary', 'Alondra Orta', 'Ballet Clásico Attitude', 'Guadalajara'],
  [31, 'Solista Ballet Elementary', 'Zoe Zavala', 'Ballet Clásico Attitude', 'Guadalajara'],
  [32, 'Grupal Pom Elem. Adv.', 'Colegio Finlándes López Mateos', 'Colegio Finlándes López Mateos', 'Guadalajara'],
  [33, 'Solista Ballet Junior', 'Melisa Correa', 'Ballet Clásico Attitude', 'Guadalajara'],
  [34, 'Solista Ballet Junior', 'Luna Rojas', 'Ballet Clásico Attitude', 'Guadalajara'],
  [35, 'Solista HH Mini', 'Silvia Medina', 'Academia First Dance', 'Guadalajara'],
  [36, 'Dueto Jazz College', 'Andrea y Fryda', 'Unlimited', 'Guadalajara'],
  [37, 'Solista HH Senior', 'Fatima Nuñez', 'Academia First Dance', 'Guadalajara'],
  [38, 'Dueto Ballet Tiny', 'Miroslava y Daniela', 'Ballet Clásico Attitude', 'Guadalajara'],
  [39, 'Solista AcroJazz Mini', 'Emily Quezada', 'Studio Horus Egiptus', 'Guadalajara'],
  [40, 'Solista AcroJazz Mini', 'Ximena Tamayo', 'Olimpia Jazmín', 'Guadalajara'],
  [41, 'Solista AcroJazz Mini', 'Aeris Muñoz', 'Studio Horus Egiptus', 'Guadalajara'],
  [42, 'Solista AcroJazz Mini', 'Frida Mora', 'Studio Horus Egiptus', 'Guadalajara'],
  [43, 'Solista Show Tiny', 'Kailany', 'Studio Horus Egiptus', 'Guadalajara'],
  [44, 'Trío Jazz Mini', 'Ballet Clásico Attitude', 'Ballet Clásico Attitude', 'Guadalajara'],
  [45, 'Solista Jazz Elementary', 'Valentina Reynoso', 'Studio Horus Egiptus', 'Guadalajara'],
  [46, 'Solista Jazz Elementary', 'Shuman Chen', 'Frida Aguimell Studio', 'Guadalajara'],
  [47, 'Solista Jazz Elementary', 'Crista Ángulo', 'Studio Horus Egiptus', 'Guadalajara'],
  [48, 'Solista Jazz Elementary', 'Victoria Bernardino', 'One Space Academia', 'Guadalajara'],
  [49, 'Solista Jazz Elementary', 'Luciana Aime', 'Academia Ifel', 'Guadalajara'],
  [50, 'Solista Show Elementary', 'Denis Vizcarra', 'Studio Horus Egiptus', 'Guadalajara'],
  [51, 'Solista Show Elementary', 'Dario González', 'Olimpia Jazmín', 'Guadalajara'],
  [52, 'Solista Show Elementary', 'Bellabeth Tinajero', 'Studio Horus Egiptus', 'Guadalajara'],
  [53, 'Grupal Pom Open', 'Academia First Dance', 'Academia First Dance', 'Guadalajara'],
  [54, 'Trío Jazz Elementary', 'Ballet Clásico Attitude', 'Ballet Clásico Attitude', 'Guadalajara'],
  [55, 'Dueto Jazz Elementary', 'Zoe y Alondra', 'Ballet Clásico Attitude', 'Guadalajara'],
  [56, 'Solista Show Mini', 'Esther', 'Academia Ifel', 'Guadalajara'],
  [57, 'Solista AcroJazz Elementary', 'Renata Tovar', 'One Space Academia', 'Guadalajara'],
  [58, 'Solista AcroJazz Elementary', 'Daniela Lozano', 'Academia Ifel', 'Guadalajara'],
  [59, 'Solista AcroJazz Elementary', 'Karina Pérez', 'Olimpia Jazmín', 'Guadalajara'],
  [60, 'Solista AcroJazz Elementary', 'Zoe Anaya', 'One Space Academia', 'Guadalajara'],
  [61, 'Solista AcroJazz Elementary', 'Alexa Orozco', 'Academia Ifel', 'Guadalajara'],
  [62, 'Solista Lírico Elementary', 'Dulce Roldán', 'Academia First Dance', 'Guadalajara'],
  [63, 'Grupal Jazz Elem. Adv.', 'Studio Horus Egiptus', 'Studio Horus Egiptus', 'Guadalajara'],
  [64, 'Solista Jazz Junior', 'Melisa Correa', 'Ballet Clásico Attitude', 'Guadalajara'],
  [65, 'Solista Jazz Junior', 'Val Iñiguez', 'Academia First Dance', 'Guadalajara'],
  [66, 'Solista Jazz Junior', 'Luna Rojas', 'Ballet Clásico Attitude', 'Guadalajara'],
  [67, 'Solista Jazz Junior', 'Dalia Contreras', 'Studio Horus Egiptus', 'Guadalajara'],
  [68, 'Dueto Ballet Mini', 'Anna y Sara', 'Ballet Clásico Attitude', 'Guadalajara'],
  [69, 'Solista Contempo Mini', 'Silvia Medina', 'Academia First Dance', 'Guadalajara'],
  [70, 'Dueto Ballet Elementary', 'Zoe y Alondra', 'Ballet Clásico Attitude', 'Guadalajara'],
  [71, 'Dueto AcroJazz Elem.', 'Daniela y Alexa', 'Academia Ifel', 'Guadalajara'],
  [72, 'Solista AcroJazz Senior', 'Leonora Bravo', 'Olimpia Jazmín', 'Guadalajara'],
  [73, 'Solista AcroJazz College', 'Christian Matus', 'One Space Academia', 'Guadalajara'],
  [74, 'Solista AcroJazz College', 'Tanairy Godínez', 'Academia Ifel', 'Guadalajara'],
  [75, 'Solista AcroJazz College', 'Mya Staple', 'Academia First Dance', 'Guadalajara'],
  [76, 'Solista Show Open', 'Victoria Sánchez', 'Olimpia Jazmín', 'Guadalajara'],
  [77, 'Solista Lírico Junior', 'Ilse Orozco', 'Academia Ifel', 'Guadalajara'],
  [78, 'Grupal Show Elem. Adv.', 'Olimpia Jazmín', 'Olimpia Jazmín', 'Guadalajara'],
  [79, 'Solista Contempo Elementary', 'Sofía Mejía', 'Studio Horus Egiptus', 'Guadalajara'],
  [80, 'Solista Contempo Junior', 'Camila Robles', 'Frida Aguimell Studio', 'Guadalajara'],
  [81, 'Grupal Jazz Senior', 'Academia First Dance', 'Academia First Dance', 'Guadalajara'],
  [82, 'Grupal Ballet Open', 'Ballet Clásico Attitude', 'Ballet Clásico Attitude', 'Guadalajara'],
  [83, 'Solista HH Junior', 'Mateo Reyes', 'Unlimited', 'Guadalajara'],
  [84, 'Grupal AcroJazz Senior', 'Studio Horus Egiptus', 'Studio Horus Egiptus', 'Guadalajara'],
  [85, 'Solista Show Senior', 'Renata Vidal', 'Olimpia Jazmín', 'Guadalajara'],
  [86, 'Grupal Lírico Open', 'Academia First Dance', 'Academia First Dance', 'Guadalajara'],
  [87, 'Grupal Show Senior', 'Studio Horus Egiptus', 'Studio Horus Egiptus', 'Guadalajara'],
]

const header = ['Posición', 'Coach', 'Tipo', 'Estilo', 'Categoría', 'Nombre', 'Academia', 'Ciudad']
const rows = [header]
for (const [pos, rawType, name, academy, city] of program) {
  const coach = academyToCoach[academy] || 'Sin asignar'
  const parts = rawType.split(' ')
  const type = parts[0] || ''
  const style = parts[1] || ''
  const category = parts.slice(2).join(' ')
  rows.push([pos, coach, type, style, category, name, academy, city])
}

const ws = XLSX.utils.aoa_to_sheet(rows)
ws['!cols'] = [
  { wch: 8 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 28 }, { wch: 14 },
]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Programa')

const outPath = '/home/xxx/Downloads/Programa Dance4ever.xlsx'
XLSX.writeFile(wb, outPath)
const uniqueCoaches = new Set(Object.values(academyToCoach))
console.log(`Generado: ${outPath} (${rows.length - 1} participaciones, ${uniqueCoaches.size} coaches)`)
