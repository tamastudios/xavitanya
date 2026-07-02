-- ============================================================
-- OBRASLINK · Esquema de base de datos (MVP)
-- Ejecutar en Supabase: SQL Editor > New query > pegar y Run
-- ============================================================

-- ---------- EXTENSIONES ----------
create extension if not exists "uuid-ossp";

-- ---------- PERFILES (vinculados a auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'empleado' check (role in ('admin','encargado','empleado')),
  phone text,
  hourly_rate numeric(10,2) default 0,   -- tarifa €/hora del autónomo
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Crear perfil automáticamente al registrarse un usuario
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Función auxiliar: ¿el usuario actual es admin? (security definer evita recursión RLS)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.is_staff() -- admin o encargado
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','encargado') and active);
$$;

-- ---------- CLIENTES ----------
create table public.clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  nif text,
  phone text,
  email text,
  address text,
  contact_person text,
  notes text,                -- notas privadas (solo admin/encargado)
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- OBRAS ----------
create table public.jobs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  client_id uuid references public.clients(id) on delete set null,
  address text,
  maps_url text,
  status text not null default 'nuevo_contacto' check (status in (
    'nuevo_contacto','presupuesto_pendiente','presupuesto_enviado','presupuesto_aceptado',
    'en_preparacion','en_proceso','pausada','pendiente_revision','acabada','facturada','cobrada','archivada')),
  start_date date,
  end_date date,
  description text,
  budget numeric(12,2),
  priority text default 'normal' check (priority in ('baja','normal','alta','urgente')),
  notes text,
  created_at timestamptz not null default now()
);

create table public.job_assignments (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (job_id, user_id)
);

-- ¿Está el usuario actual asignado a esta obra?
create or replace function public.is_assigned(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.job_assignments where job_id = p_job and user_id = auth.uid());
$$;

-- ---------- FICHAJES ----------
create table public.time_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  break_minutes int not null default 0,
  pause_started_at timestamptz,        -- si no es null, está en pausa
  notes text,
  gps_in text,                          -- "lat,lng" opcional, con permiso
  gps_out text,
  edited_by uuid references public.profiles(id),
  edit_reason text,
  created_at timestamptz not null default now()
);
create index on public.time_entries (user_id, clock_in desc);
create index on public.time_entries (job_id);

-- ---------- PARTES DIARIOS ----------
create table public.daily_reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  report_date date not null default current_date,
  work_done text not null,
  incidents text,
  status text not null default 'pendiente' check (status in ('pendiente','aprobado','rechazado')),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.daily_reports (user_id, report_date desc);

create table public.report_media (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid references public.daily_reports(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  path text not null,                   -- ruta en Storage (bucket "media")
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- ALMACÉN ----------
create table public.materials (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category text default 'general',
  unit text not null default 'unidad', -- unidad, caja, metro, kg, saco, bote...
  stock numeric(12,2) not null default 0,
  min_stock numeric(12,2) not null default 0,
  location text default 'Almacén principal',
  price numeric(10,2) default 0,
  notes text,
  photo_path text,
  created_at timestamptz not null default now()
);

create table public.material_movements (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references public.materials(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  user_id uuid not null references public.profiles(id),
  type text not null check (type in ('entrada','salida','devolucion','ajuste','roto_perdido')),
  quantity numeric(12,2) not null check (quantity > 0),
  from_location text,
  to_location text,
  comment text,
  created_at timestamptz not null default now()
);
create index on public.material_movements (material_id, created_at desc);
create index on public.material_movements (job_id);

-- Actualizar stock automáticamente con cada movimiento (security definer:
-- el empleado no necesita permiso UPDATE sobre materials)
create or replace function public.apply_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type in ('salida','roto_perdido') then
    update public.materials set stock = stock - new.quantity where id = new.material_id;
  elsif new.type in ('entrada','devolucion') then
    update public.materials set stock = stock + new.quantity where id = new.material_id;
  elsif new.type = 'ajuste' then
    update public.materials set stock = new.quantity where id = new.material_id;
  end if;
  return new;
end $$;

create trigger on_movement after insert on public.material_movements
  for each row execute function public.apply_movement();

-- ---------- FACTURAS / PARTES FACTURABLES (borrador) ----------
create table public.invoices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month text not null,                  -- formato 'YYYY-MM'
  total_hours numeric(10,2) not null default 0,
  hourly_rate numeric(10,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  lines jsonb not null default '[]',    -- [{job, hours, amount}]
  notes text,
  status text not null default 'borrador' check (status in ('borrador','enviado','aprobado','exportado')),
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

-- ---------- AUDITORÍA ----------
create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id),
  action text not null,
  table_name text,
  record_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.time_entries enable row level security;
alter table public.daily_reports enable row level security;
alter table public.report_media enable row level security;
alter table public.materials enable row level security;
alter table public.material_movements enable row level security;
alter table public.invoices enable row level security;
alter table public.audit_logs enable row level security;

-- PERFILES: cada uno ve el suyo; staff ve todos; solo admin edita roles/tarifas
create policy "perfil propio o staff" on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy "editar mi nombre" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "admin gestiona perfiles" on public.profiles for update
  using (public.is_admin());

-- CLIENTES: solo admin/encargado (datos sensibles)
create policy "staff ve clientes" on public.clients for select using (public.is_staff());
create policy "admin crea clientes" on public.clients for insert with check (public.is_admin());
create policy "admin edita clientes" on public.clients for update using (public.is_admin());
create policy "admin borra clientes" on public.clients for delete using (public.is_admin());

-- OBRAS: staff todo; empleado solo obras asignadas
create policy "ver obras" on public.jobs for select
  using (public.is_staff() or public.is_assigned(id));
create policy "admin crea obras" on public.jobs for insert with check (public.is_admin());
create policy "admin edita obras" on public.jobs for update using (public.is_admin());
create policy "admin borra obras" on public.jobs for delete using (public.is_admin());

-- ASIGNACIONES: staff gestiona; empleado ve las suyas
create policy "ver asignaciones" on public.job_assignments for select
  using (user_id = auth.uid() or public.is_staff());
create policy "admin asigna" on public.job_assignments for insert with check (public.is_admin());
create policy "admin desasigna" on public.job_assignments for delete using (public.is_admin());

-- FICHAJES: empleado crea y ve los suyos; no puede tocar fichajes de otros;
-- solo admin corrige (la app registra motivo + auditoría)
create policy "ver mis fichajes" on public.time_entries for select
  using (user_id = auth.uid() or public.is_staff());
create policy "fichar" on public.time_entries for insert
  with check (user_id = auth.uid());
create policy "cerrar mi fichaje" on public.time_entries for update
  using (user_id = auth.uid() and clock_out is null)
  with check (user_id = auth.uid());
create policy "admin corrige fichajes" on public.time_entries for update
  using (public.is_admin());

-- PARTES DIARIOS
create policy "ver mis partes" on public.daily_reports for select
  using (user_id = auth.uid() or public.is_staff());
create policy "crear mi parte" on public.daily_reports for insert
  with check (user_id = auth.uid());
create policy "editar mi parte pendiente" on public.daily_reports for update
  using (user_id = auth.uid() and status = 'pendiente') with check (user_id = auth.uid());
create policy "admin revisa partes" on public.daily_reports for update using (public.is_admin());

-- MEDIA DE PARTES
create policy "ver media" on public.report_media for select
  using (uploaded_by = auth.uid() or public.is_staff());
create policy "subir media" on public.report_media for insert
  with check (uploaded_by = auth.uid());

-- MATERIALES: todos leen (para poder registrar movimientos); solo admin edita
create policy "ver materiales" on public.materials for select using (auth.uid() is not null);
create policy "admin crea materiales" on public.materials for insert with check (public.is_admin());
create policy "admin edita materiales" on public.materials for update using (public.is_admin());
create policy "admin borra materiales" on public.materials for delete using (public.is_admin());

-- MOVIMIENTOS: cualquiera registra los suyos; no se pueden borrar ni editar
create policy "ver movimientos" on public.material_movements for select
  using (user_id = auth.uid() or public.is_staff());
create policy "registrar movimiento" on public.material_movements for insert
  with check (user_id = auth.uid());

-- FACTURAS: cada autónomo la suya; admin ve y aprueba todas
create policy "ver mis facturas" on public.invoices for select
  using (user_id = auth.uid() or public.is_admin());
create policy "crear mi factura" on public.invoices for insert with check (user_id = auth.uid());
create policy "editar mi borrador" on public.invoices for update
  using (user_id = auth.uid() and status in ('borrador','enviado')) with check (user_id = auth.uid());
create policy "admin aprueba facturas" on public.invoices for update using (public.is_admin());

-- AUDITORÍA: cualquiera inserta, solo admin lee
create policy "insertar auditoria" on public.audit_logs for insert with check (auth.uid() is not null);
create policy "admin lee auditoria" on public.audit_logs for select using (public.is_admin());

-- ============================================================
-- STORAGE: bucket privado "media"
-- ============================================================
insert into storage.buckets (id, name, public) values ('media','media', false)
  on conflict (id) do nothing;

-- Cada usuario sube a su carpeta: media/<uid>/...
create policy "subir a mi carpeta" on storage.objects for insert
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ver mis archivos o staff" on storage.objects for select
  using (bucket_id = 'media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

-- ============================================================
-- DATOS DE EJEMPLO (opcional, materiales realistas)
-- ============================================================
insert into public.materials (name, category, unit, stock, min_stock, location, price) values
  ('Saco de cemento 25kg', 'Obra gruesa', 'saco', 40, 10, 'Almacén principal · Pasillo 1', 4.50),
  ('Placa de yeso 120x250', 'Tabiquería', 'unidad', 25, 8, 'Almacén principal · Zona placas', 7.20),
  ('Bote pintura blanca 15L', 'Pintura', 'bote', 12, 4, 'Almacén principal · Estantería B2', 32.00),
  ('Tubo PVC 40mm (2m)', 'Fontanería', 'unidad', 30, 10, 'Almacén principal · Pasillo 3', 3.10),
  ('Cable 2.5mm (rollo 100m)', 'Electricidad', 'unidad', 6, 2, 'Almacén principal · Estantería C1', 45.00),
  ('Silicona neutra', 'Sellado', 'bote', 18, 6, 'Furgoneta 1', 5.80);

-- ============================================================
-- IMPORTANTE · Primer administrador
-- Después de crear tu usuario (Authentication > Users > Add user),
-- ejecuta esto con tu email para convertirte en admin:
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'TU_EMAIL_AQUI');
-- ============================================================
