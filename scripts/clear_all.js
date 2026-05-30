import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPath = path.resolve(__dirname, '../.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    let value = match[2] ? match[2].trim() : ''
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1)
    }
    env[match[1]] = value
  }
})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Falta configurar NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function clearAll() {
  console.log('🧹 Iniciando limpieza de registros en Supabase...')

  try {
    // 1. Delete from registration_edit_log
    console.log('   Deleting from registration_edit_log...')
    const { error: errLog } = await supabase.from('registration_edit_log').delete().neq('id', -1)
    if (errLog) console.log('   (Note or error deleting logs):', errLog.message)

    // 2. Delete from registration_acts
    console.log('   Deleting from registration_acts...')
    const { error: errActs } = await supabase.from('registration_acts').delete().neq('id', -1)
    if (errActs) console.log('   Error deleting acts:', errActs.message)

    // 3. Delete from registration_dancers
    console.log('   Deleting from registration_dancers...')
    const { error: errDancers } = await supabase.from('registration_dancers').delete().neq('id', -1)
    if (errDancers) console.log('   Error deleting dancers:', errDancers.message)

    // 4. Delete from registration_drafts
    console.log('   Deleting from registration_drafts...')
    const { error: errDrafts } = await supabase.from('registration_drafts').delete().neq('draft_id', '00000000-0000-0000-0000-000000000000')
    if (errDrafts) console.log('   Error deleting registration drafts:', errDrafts.message)

    // 5. Delete from coach_registrations
    console.log('   Deleting from coach_registrations...')
    const { error: errCoaches } = await supabase.from('coach_registrations').delete().neq('id', -1)
    if (errCoaches) console.log('   Error deleting coach registrations:', errCoaches.message)

    console.log('✅ Base de datos limpiada con éxito.')
  } catch (error) {
    console.error('❌ Error fatal durante la limpieza:', error.message)
  }
}

clearAll()
