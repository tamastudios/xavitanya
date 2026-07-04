// Modo offline: si no hay cobertura, guardamos los registros en el móvil
// (localStorage) y los subimos solos cuando vuelve la conexión.
import { supabase } from './supabase'

const OUTBOX_KEY = 'xt_outbox_v1'          // registros pendientes de subir
const PENDING_ENTRY_KEY = 'xt_fichaje_local_v1' // fichaje abierto sin conexión

// ---------- avisar a las pantallas de que algo ha cambiado ----------
const listeners = new Set()
export function subscribeOffline(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const notify = () => listeners.forEach(fn => { try { fn() } catch {} })

// ---------- detectar errores de red (vs errores reales del servidor) ----------
export function isNetworkError(e) {
  if (!navigator.onLine) return true
  const msg = String(e?.message ?? e ?? '')
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg)
}

// ---------- bandeja de salida ----------
export function getOutbox() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY)) ?? [] } catch { return [] }
}
function setOutbox(list) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(list))
  notify()
}
export function addToOutbox(item) {
  // item = { table, op: 'insert'|'update', match?: {id}, payload }
  setOutbox([...getOutbox(), {
    ...item,
    id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    queued_at: new Date().toISOString(),
  }])
}

// ---------- fichaje abierto sin conexión ----------
export function getPendingEntry() {
  try { return JSON.parse(localStorage.getItem(PENDING_ENTRY_KEY)) } catch { return null }
}
export function setPendingEntry(entry) {
  if (entry) localStorage.setItem(PENDING_ENTRY_KEY, JSON.stringify(entry))
  else localStorage.removeItem(PENDING_ENTRY_KEY)
  notify()
}
export function createLocalEntry({ user_id, job_id, gps_in }) {
  const entry = {
    id: `local-${Date.now()}`,
    local: true,
    user_id,
    job_id: job_id || null,
    clock_in: new Date().toISOString(),
    clock_out: null,
    break_minutes: 0,
    pause_started_at: null,
    gps_in: gps_in ?? null,
    gps_out: null,
  }
  setPendingEntry(entry)
  return entry
}

// ---------- subir lo pendiente ----------
let syncing = false
export async function syncOutbox() {
  if (syncing || !navigator.onLine) return

  // 1) Si hay un fichaje abierto guardado en el móvil, subirlo ya
  const pending = getPendingEntry()
  if (pending) {
    const { id, local, ...payload } = pending
    try {
      const { data, error } = await supabase.from('time_entries').insert(payload).select().single()
      if (!error && data) {
        setPendingEntry(null)
        // avisar a la pantalla de fichar de que ahora el fichaje es "real"
        notify()
      } else if (error && !isNetworkError(error)) {
        // error real (no de red): descartar para no bloquear la cola
        setPendingEntry(null)
      }
    } catch (e) {
      if (!isNetworkError(e)) setPendingEntry(null)
    }
  }

  // 2) Subir la bandeja de salida en orden
  const box = getOutbox()
  if (box.length === 0) return
  syncing = true
  try {
    for (const item of box) {
      try {
        let error
        if (item.op === 'update' && item.match?.id) {
          ({ error } = await supabase.from(item.table).update(item.payload).eq('id', item.match.id))
        } else {
          ({ error } = await supabase.from(item.table).insert(item.payload))
        }
        if (error && isNetworkError(error)) break // seguimos sin conexión: parar y reintentar luego
        // subido (o error real que no se arregla reintentando): quitar de la cola
        setOutbox(getOutbox().filter(i => i.id !== item.id))
      } catch (e) {
        if (isNetworkError(e)) break
        setOutbox(getOutbox().filter(i => i.id !== item.id))
      }
    }
  } finally {
    syncing = false
  }
}

// Llamar una vez al arrancar la app
let initialized = false
export function initOfflineSync() {
  if (initialized) return
  initialized = true
  window.addEventListener('online', () => { notify(); syncOutbox() })
  window.addEventListener('offline', notify)
  syncOutbox()
  // reintento suave cada 45 s por si el evento 'online' no salta (cobertura intermitente)
  setInterval(() => { if (navigator.onLine) syncOutbox() }, 45000)
}
