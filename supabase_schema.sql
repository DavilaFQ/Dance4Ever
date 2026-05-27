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
alter publish supabase_realtime add table event_checklist;
