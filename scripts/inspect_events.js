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
    .from('events')
    .select('*')

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('--- EVENTOS DISPONIBLES ---')
  console.log(JSON.stringify(data, null, 2))
}

inspect()
