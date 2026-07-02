import { supabase } from './supabase'

// ---------- Estados de obra ----------
export const JOB_STATUSES = [
  { id: 'nuevo_contacto', label: 'Nuevo contacto' },
  { id: 'presupuesto_pendiente', label: 'Presupuesto pendiente' },
  { id: 'presupuesto_enviado', label: 'Presupuesto enviado' },
  { id: 'presupuesto_aceptado', label: 'Presupuesto aceptado' },
  { id: 'en_preparacion', label: 'En preparación' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'pausada', label: 'Pausada' },
  { id: 'pendiente_revision', label: 'Pendiente de revisión' },
  { id: 'acabada', label: 'Acabada' },
  { id: 'facturada', label: 'Facturada' },
  { id: 'cobrada', label: 'Cobrada' },
  { id: 'archivada', label: 'Archivada' },
]
export const statusLabel = (id) => JOB_STATUSES.find(s => s.id === id)?.label ?? id

export const UNITS = ['unidad', 'caja', 'metro', 'kg', 'saco', 'bote', 'litro', 'palet']

export const MOVEMENT_LABELS = {
  entrada: 'Entrada a almacén',
  salida: 'Cogido para obra',
  devolucion: 'Devuelto a almacén',
  ajuste: 'Ajuste de inventario',
  roto_perdido: 'Roto / perdido',
}

// ---------- Fechas y formato ----------
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
export const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'
export const fmtEUR = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n ?? 0)
export const fmtHours = (h) => `${(Math.round((h ?? 0) * 100) / 100).toLocaleString('es-ES')} h`

export const monthValue = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}
export const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() }
}

// Horas de un fichaje (descontando pausas)
export const entryHours = (e) => {
  if (!e.clock_out) return 0
  const ms = new Date(e.clock_out) - new Date(e.clock_in)
  return Math.max(0, ms / 3600000 - (e.break_minutes ?? 0) / 60)
}

// ---------- Auditoría ----------
export async function audit(action, table_name, record_id, details = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('audit_logs').insert({
    user_id: user?.id, action, table_name,
    record_id: record_id ? String(record_id) : null, details,
  })
}

// ---------- GPS opcional (siempre con permiso del navegador) ----------
export function getGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(`${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`),
      () => resolve(null),
      { timeout: 5000 }
    )
  })
}

// ---------- Fotos: comprimir y subir a Storage privado ----------
export async function compressImage(file, maxSide = 1600, quality = 0.75) {
  if (!file.type.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality))
  return blob ?? file
}

const MAX_FILE_MB = 25

export async function uploadMedia(userId, file) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`El archivo supera ${MAX_FILE_MB} MB. Usa un vídeo más corto o una foto.`)
  }
  const isVideo = file.type.startsWith('video/')
  const body = isVideo ? file : await compressImage(file)
  const ext = isVideo ? (file.name.split('.').pop() || 'mp4') : 'jpg'
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, body, {
    contentType: isVideo ? file.type : 'image/jpeg',
  })
  if (error) throw error
  return path
}

export async function signedUrl(path, seconds = 3600) {
  const { data } = await supabase.storage.from('media').createSignedUrl(path, seconds)
  return data?.signedUrl ?? null
}
