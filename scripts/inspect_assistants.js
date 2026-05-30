import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function inspect() {
  const { data, error } = await supabase
    .from('coach_registrations')
    .select('id, coach_name, academy, extra_coaches, submitted_at')
    .neq('submitted_at', '1970-01-01T00:00:00Z')
    .order('submitted_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('--- ULTIMOS REGISTROS COMPLETADOS ---')
  data.forEach(r => {
    console.log(`ID: ${r.id}`)
    console.log(`Academy: ${r.academy}`)
    console.log(`Coach: ${r.coach_name}`)
    console.log(`Asistentes (raw extra_coaches):`, r.extra_coaches)
    console.log('------------------------------------')
  })
}

inspect()
