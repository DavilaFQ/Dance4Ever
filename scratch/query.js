const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const eventId = "20c48101-ec11-43b3-8c91-bf9273bb88bf";

async function run() {
  console.log("Checking DB counts for event:", eventId);

  const [coachesRes, participantsRes, checklistRes] = await Promise.all([
    supabase.from('coaches').select('id, name').eq('event_id', eventId),
    supabase.from('participants').select('id, name, position').eq('event_id', eventId),
    supabase.from('event_checklist').select('*').eq('event_id', eventId)
  ]);

  if (coachesRes.error) console.error("Coaches error:", coachesRes.error);
  if (participantsRes.error) console.error("Participants error:", participantsRes.error);
  if (checklistRes.error) console.error("Checklist error:", checklistRes.error);

  console.log("Coaches count:", coachesRes.data ? coachesRes.data.length : 0);
  console.log("Coaches sample:", coachesRes.data ? coachesRes.data.slice(0, 5) : []);
  
  console.log("Participants count:", participantsRes.data ? participantsRes.data.length : 0);
  console.log("Participants sample:", participantsRes.data ? participantsRes.data.slice(0, 5) : []);

  console.log("Portal status checklist entry:", checklistRes.data ? checklistRes.data.filter(c => c.text === 'PORTAL_STATUS') : []);
}

run();
