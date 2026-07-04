-- ============================================================
-- OBRASLINK · Migración 2: permitir eliminar partes mensuales
-- Ejecutar en Supabase: SQL Editor > New query > pegar y Run
-- ============================================================

-- El autónomo puede eliminar su propio parte mensual mientras
-- no esté aprobado (borrador o enviado)
drop policy if exists "borrar mi parte mensual" on public.invoices;
create policy "borrar mi parte mensual" on public.invoices for delete
  using (user_id = auth.uid() and status in ('borrador','enviado'));

-- El administrador puede eliminar cualquier parte mensual
drop policy if exists "admin borra partes mensuales" on public.invoices;
create policy "admin borra partes mensuales" on public.invoices for delete
  using (public.is_admin());
