# Xavi Tanya Serveis Integrals · Gestión de obras para empresas de reformas (MVP)

Aplicación web instalable en el móvil (PWA) para gestionar obras, fichajes, partes diarios, almacén y partes mensuales facturables de autónomos. En español, mobile-first, con botones grandes y pensada para personal no técnico.

**Stack:** React (Vite) + Supabase (Auth, PostgreSQL con RLS, Storage privado) + PWA. Todo funciona con los planes gratuitos de Supabase y Cloudflare Pages / Netlify.

---

## 1. Crear el proyecto en Supabase (gratis)

1. Entra en https://supabase.com y crea una cuenta.
2. **New project** → ponle nombre (ej. `obraslink`), elige región `EU (Frankfurt)` y una contraseña de base de datos (guárdala).
3. Cuando termine de crearse, ve a **SQL Editor → New query**, pega TODO el contenido de `supabase/schema.sql` y pulsa **Run**. Esto crea las tablas, las políticas de seguridad (RLS), los triggers de stock, el bucket privado de archivos y unos materiales de ejemplo.

## 2. Crear tu usuario administrador

1. En Supabase: **Authentication → Users → Add user** → pon tu email y una contraseña. Marca "Auto confirm user".
2. Vuelve al **SQL Editor** y ejecuta (con tu email real):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'TU_EMAIL_AQUI');
```

Para dar de alta empleados: repite el paso 1 con su email (o usa "Invite user" para que reciban un email). Aparecerán en la app con rol Empleado; desde **Empleados** puedes cambiarles el rol y la tarifa €/hora.

## 3. Configurar y probar en tu ordenador

```bash
npm install
cp .env.example .env
```

Edita `.env` con los datos de **Supabase → Project Settings → API**:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> La clave `anon` es pública por diseño: los datos están protegidos por Row Level Security en el servidor, no por el frontend. Nunca pongas la clave `service_role` en la app.

```bash
npm run dev
```

Abre http://localhost:5173 y entra con tu usuario admin.

## 4. Publicar gratis (Cloudflare Pages o Netlify)

**Cloudflare Pages** (recomendado):
1. Sube el proyecto a un repositorio de GitHub.
2. En https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: `npm run build` · Output directory: `dist`.
4. En **Settings → Environment variables** añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
5. Deploy. Tendrás una URL `https://tuapp.pages.dev` con HTTPS automático.

**Netlify:** igual (build `npm run build`, publish `dist`, mismas variables). El archivo `public/_redirects` ya está incluido para que las rutas funcionen.

Por último, en Supabase → **Authentication → URL Configuration**, pon tu URL pública como *Site URL* (para que funcionen los emails de recuperación de contraseña).

## 5. Instalar en el móvil

- **Android (Chrome):** abre la URL → menú ⋮ → **"Instalar aplicación"**.
- **iPhone (Safari):** abre la URL → botón Compartir → **"Añadir a pantalla de inicio"**.

Queda como una app más, a pantalla completa y con su icono.

---

## Qué incluye este MVP

- Login con email/contraseña, recuperación de contraseña y cuentas desactivables.
- Roles **admin / encargado / empleado** con Row Level Security estricta: un empleado solo ve sus fichajes, sus partes, sus facturas y sus obras asignadas. Los clientes solo los ve el staff.
- **Clientes** (admin): alta y ficha con contacto y notas privadas.
- **Obras**: creación, tablero Kanban por los 12 estados, prioridad, asignación de empleados, detalle con horas, coste de material, partes y galería de fotos.
- **Vista Hoy del empleado**: obra asignada, botón "Abrir en Maps", fichar, parte, material, horas del mes.
- **Fichaje**: entrada, pausa, reanudar y salida, con cronómetro, obra seleccionable y GPS opcional (siempre pidiendo permiso). Al salir se recomienda el parte del día. Los fichajes cerrados no puede tocarlos el empleado; solo el admin (y queda en auditoría).
- **Partes diarios**: texto de trabajo, incidencias y fotos/vídeos (las fotos se comprimen en el móvil antes de subir). El jefe aprueba o rechaza.
- **Almacén**: inventario con stock, stock mínimo con aviso de "poco stock", ubicaciones, y registro de "coger para obra" / "devolver" con actualización automática de stock por trigger. Los movimientos no se pueden borrar ni editar.
- **Informes** (admin): horas por empleado y por obra/cliente por mes, exportación CSV (Excel), revisión de partes y aprobación de partes mensuales.
- **Parte mensual / borrador de factura** del autónomo: horas desglosadas por obra, tarifa configurable, PDF descargable con anexo de días, y flujo borrador → enviado → aprobado. (Es un borrador, no facturación legal certificada; la estructura de `invoices` está preparada para integrar VeriFactu más adelante.)
- **Auditoría**: fichajes, cambios de estado, aprobaciones, cambios de rol/tarifa, etc. quedan en `audit_logs` (solo lo lee el admin).
- **PWA** instalable con manifest, iconos y service worker; archivos privados servidos con URLs firmadas temporales; HTTPS obligatorio en el hosting.

## Seguridad aplicada

- RLS en todas las tablas y en Storage (cada usuario solo sube a su carpeta; solo staff ve archivos de otros).
- Los permisos se validan en el servidor (políticas SQL), no solo en el frontend.
- El stock lo actualiza un trigger `security definer`: el empleado no tiene permiso de escritura sobre `materials`.
- Sin claves secretas en el frontend; variables de entorno para configuración.
- Contraseñas gestionadas por Supabase Auth (nunca se guardan a mano).
- Doble factor para el jefe: Supabase lo soporta (Authentication → puede activarse MFA); está previsto en la hoja de ruta de la app.
- RGPD básico: datos mínimos, empleados desactivables, acceso por rol, GPS opcional y con consentimiento.

## Estructura del código

```
supabase/schema.sql      Esquema completo: tablas + RLS + triggers + storage
src/lib/supabase.js      Cliente de Supabase
src/lib/helpers.js       Estados, formatos, horas, auditoría, subida de fotos
src/context/AuthContext  Sesión + perfil + rol
src/components/          UI base (botones grandes, tarjetas, modal) y menú inferior
src/pages/               Login, Hoy, Fichar, Parte, Obras, ObraDetalle,
                         Clientes, Almacén, Informes, Factura, Empleados, Perfil
```

## Hoja de ruta (fase 2, ya prevista en el esquema)

- Tareas por obra con fotos antes/después y comentarios.
- Notificaciones en la app (obra asignada, parte rechazado, falta fichar salida, bajo stock).
- Calendario semanal/mensual con arrastrar obras.
- Modo offline (guardar fichajes/partes sin conexión y sincronizar).
- Escaneo QR de materiales, buscador global, página de ajustes de empresa.
- Corrección de fichajes por el admin desde la interfaz con motivo obligatorio (la base ya lo registra en auditoría).
- Exportación PDF de informes del jefe e integración futura con facturación legal / VeriFactu.
