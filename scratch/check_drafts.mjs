import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envContent = fs.readFileSync('.env.local', 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/)
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
})

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL']
const supabaseKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: events } = await supabase.from('events').select('*').limit(1)
  const eventId = events[0].id

  console.log('Attempting to insert a draft registration omitting submitted_at...')
  const testDraftId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
  
  // Clean up if exists
  await supabase.from('coach_registrations').delete().eq('draft_id', testDraftId)

  const { data, error } = await supabase.from('coach_registrations').insert({
    event_id: eventId,
    draft_id: testDraftId,
    coach_name: 'TEST COACH DRAFT',
    coach_phone: '1234567890',
    academy: 'TEST ACADEMY DRAFT',
    team_name: 'TEST TEAM DRAFT',
    tickets_count: 0,
    notes: 'TEST NOTES DRAFT',
  }).select()

  if (error) {
    console.error('INSERT ERROR:', error)
  } else {
    console.log('INSERT SUCCESS:', data)
    // Clean up
    await supabase.from('coach_registrations').delete().eq('draft_id', testDraftId)
  }
}

run()
