import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function run() {
  const { data, error } = await supabase.from('events').select('*').limit(1)
  if (error) {
    console.error('Error fetching event:', error)
    return
  }
  if (data && data.length > 0) {
    console.log('Columns in events table:', Object.keys(data[0]))
    console.log('Values:', data[0])
  } else {
    console.log('No events found in table.')
  }
}

run()
