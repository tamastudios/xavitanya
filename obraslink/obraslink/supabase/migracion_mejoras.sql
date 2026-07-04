-- ============================================================
-- OBRASLINK · Migración: incidencias + cuadrante semanal
-- Ejecutar en Supabase: SQL Editor > New query > pegar y Run
-- (Es seguro ejecutarlo aunque ya exista parte: usa IF NOT EXISTS)
-- ============================================================

-- ---------- INCIDENCIAS ("Tengo un problema") ----------
create table if not exists public.incidents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  kind text not null default 'otro' check (kind in ('falta_material','averia','accidente','otro')),
  message text not null,
  gps text,                              -- "lat,lng" opcional
  status text not null default 'abierta' check (status in ('abierta','resuelta')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists incidents_status_idx on public.incidents (status, created_at desc);

alter table public.incidents enable row level security;

drop policy if exists "ver mis incidencias" on public.incidents;
create policy "ver mis incidencias" on public.incidents for select
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists "crear incidencia" on public.incidents;
create policy "crear incidencia" on public.incidents for insert
  with check (user_id = auth.uid());

drop policy if exists "admin resuelve incidencias" on public.incidents;
create policy "admin resuelve incidencias" on public.incidents for update
  using (public.is_admin());

-- ---------- CUADRANTE SEMANAL (quién va a qué obra cada día) ----------
create table if not exists public.schedule_assignments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  work_date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, work_date)            -- una obra por persona y día (se puede cambiar)
);
create index if not exists schedule_date_idx on public.schedule_assignments (work_date);

alter table public.schedule_assignments enable row level security;

drop policy if exists "ver mi cuadrante" on public.schedule_assignments;
create policy "ver mi cuadrante" on public.schedule_assignments for select
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists "admin planifica" on public.schedule_assignments;
create policy "admin planifica" on public.schedule_assignments for insert
  with check (public.is_admin());

drop policy if exists "admin replanifica" on public.schedule_assignments;
create policy "admin replanifica" on public.schedule_assignments for update
  using (public.is_admin());

drop policy if exists "admin borra planificacion" on public.schedule_assignments;
create policy "admin borra planificacion" on public.schedule_assignments for delete
  using (public.is_admin());
