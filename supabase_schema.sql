-- 1. Crear la tabla de Checklist de Eventos
create table if not exists public.event_checklist (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  text text not null,
  category text not null default 'general',
  priority text not null default 'media',
  completed boolean not null default false,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habilitar la Seguridad a Nivel de Fila (RLS)
alter table public.event_checklist enable row level security;

-- 3. Crear política para permitir acceso público total
-- (Esto coincide con el modelo de desarrollo simplificado de las otras tablas del proyecto)
create policy "Acceso publico total en event_checklist"
  on public.event_checklist
  for all
  using (true)
  with check (true);

-- 4. Habilitar replicacion en Tiempo Real para esta tabla
-- Nota: Si da un error porque ya existe en la publicacion, se puede omitir
alter publication supabase_realtime add table event_checklist;

-- ============================================================
-- 5. Tabla de borrador del programa (orden de coreografías)
-- ============================================================
create table if not exists public.program_drafts (
  event_id uuid references public.events(id) on delete cascade primary key,
  act_order jsonb not null default '[]'::jsonb,
  intermedio_index integer,
  min_gap integer not null default 5,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.program_drafts enable row level security;

create policy "Acceso publico total en program_drafts"
  on public.program_drafts
  for all
  using (true)
  with check (true);

alter publication supabase_realtime add table program_drafts;

-- ============================================================
-- 6. Tabla de borradores del formulario de registro
-- ============================================================
create table if not exists public.registration_drafts (
  draft_id uuid primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  state jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.registration_drafts enable row level security;

create policy "Acceso publico total en registration_drafts"
  on public.registration_drafts
  for all
  using (true)
  with check (true);

-- ============================================================
-- 7. Tabla de snapshots de eventos
-- ============================================================
create table if not exists public.event_snapshots (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  label text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.event_snapshots enable row level security;

create policy "Acceso publico total en event_snapshots"
  on public.event_snapshots
  for all
  using (true)
  with check (true);

alter publication supabase_realtime add table event_snapshots;

-- ============================================================
-- 8. Correcciones: defaults, timestamps, índices
-- ============================================================

-- 8a. Defaults para eventos (evitar nulls)
alter table public.events alter column current_position set default 0;
alter table public.events alter column awards_mode set default false;
alter table public.events alter column on_deck_count set default 3;

-- 8b. Timestamps faltantes
alter table public.participants add column if not exists created_at timestamp with time zone default timezone('utc'::text, now());
alter table public.registration_acts add column if not exists created_at timestamp with time zone default timezone('utc'::text, now());
alter table public.registration_dancers add column if not exists created_at timestamp with time zone default timezone('utc'::text, now());
alter table public.coach_registrations add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());

-- 8c. Índices para FK consultadas frecuentemente
create index if not exists idx_participants_event_id on public.participants(event_id);
create index if not exists idx_registration_acts_reg_id on public.registration_acts(registration_id);
create index if not exists idx_registration_dancers_reg_id on public.registration_dancers(registration_id);
create index if not exists idx_coach_registrations_event_id on public.coach_registrations(event_id);

-- ============================================================
-- 9. Migración: coaches extra existentes → asistentes
-- ============================================================
-- Migrar todos los elementos de extra_coaches que no tengan prefijo "Asistente:" a que lo tengan
update public.coach_registrations
set extra_coaches = (
  select array_agg(
    case
      when elem like 'Asistente:%' then elem
      when elem is not null and elem != '' then 'Asistente: ' || elem
      else elem
    end
  )
  from unnest(extra_coaches) as elem
)
where extra_coaches is not null and cardinality(extra_coaches) > 0;
