import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Field, Select, Loading, Banner } from '../components/UI'
import { fmtTime, getGPS, audit } from '../lib/helpers'
import {
  isNetworkError, addToOutbox, getPendingEntry, setPendingEntry,
  createLocalEntry, subscribeOffline, syncOutbox,
} from '../lib/offline'

const JOBS_CACHE_KEY = 'xt_obras_cache_v1'
const REMINDER_HOURS = 10 // avisar si lleva más de estas horas fichado

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  return now
}

const hhmmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':')
}

export default function Fichar() {
  const { user } = useAuth()
  const nav = useNavigate()
  const now = useNow()
  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState('')
  const [switchJobId, setSwitchJobId] = useState('')
  const [entry, setEntry] = useState(undefined) // undefined = cargando
  const [useGps, setUseGps] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [offlineMsg, setOfflineMsg] = useState(null)

  async function load() {
    // Si hay un fichaje guardado en el móvil (sin conexión), usarlo directamente
    const pending = getPendingEntry()
    if (pending) {
      setEntry(pending)
      try { setJobs(JSON.parse(localStorage.getItem(JOBS_CACHE_KEY)) ?? []) } catch {}
      return
    }
    try {
      const { data: asg, error: e1 } = await supabase
        .from('job_assignments').select('jobs(id, name, status)').eq('user_id', user.id)
      if (e1 && isNetworkError(e1)) throw e1
      const active = (asg ?? []).map(a => a.jobs).filter(j => j && !['acabada','facturada','cobrada','archivada'].includes(j.status))
      setJobs(active)
      localStorage.setItem(JOBS_CACHE_KEY, JSON.stringify(active))
      if (active[0] && !jobId) setJobId(active[0].id)

      const { data } = await supabase.from('time_entries')
        .select('*').eq('user_id', user.id).is('clock_out', null)
        .order('clock_in', { ascending: false }).limit(1).maybeSingle()
      setEntry(data ?? null)
    } catch {
      // Sin conexión: trabajar con la lista de obras guardada en el móvil
      try {
        const cached = JSON.parse(localStorage.getItem(JOBS_CACHE_KEY)) ?? []
        setJobs(cached)
        if (cached[0] && !jobId) setJobId(cached[0].id)
      } catch {}
      setEntry(null)
      setOfflineMsg('Sin conexión. Puedes fichar igualmente: se guardará en el móvil y se subirá solo al recuperar cobertura.')
    }
  }
  useEffect(() => { load() }, [user.id])
  // Si la cola offline sube el fichaje, recargar para trabajar con el fichaje real
  useEffect(() => subscribeOffline(() => {
    if (!getPendingEntry() && entry?.local && navigator.onLine) load()
  }), [entry])

  async function run(fn) {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e.message ?? 'Algo ha fallado. Inténtalo otra vez.') }
    setBusy(false)
  }

  function clockInLocal(gps) {
    const local = createLocalEntry({ user_id: user.id, job_id: jobId || null, gps_in: gps })
    setEntry(local)
    setOfflineMsg('Fichaje guardado en el móvil. Se subirá solo cuando haya cobertura.')
  }

  const clockIn = () => run(async () => {
    // Pedir permiso de avisos para el recordatorio de salida (no bloquea)
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch {}
    const gps = useGps ? await getGPS() : null
    if (!navigator.onLine) return clockInLocal(gps)
    try {
      const { data, error } = await supabase.from('time_entries')
        .insert({ user_id: user.id, job_id: jobId || null, gps_in: gps }).select().single()
      if (error) {
        if (isNetworkError(error)) return clockInLocal(gps)
        throw error
      }
      await audit('fichar_entrada', 'time_entries', data.id, { job_id: jobId })
      setEntry(data)
    } catch (e) {
      if (isNetworkError(e)) return clockInLocal(gps)
      throw e
    }
  })

  const pause = () => run(async () => {
    const ts = new Date().toISOString()
    if (entry.local) {
      const updated = { ...entry, pause_started_at: ts }
      setPendingEntry(updated); setEntry(updated)
      return
    }
    const { data, error } = await supabase.from('time_entries')
      .update({ pause_started_at: ts }).eq('id', entry.id).select().single()
    if (error) {
      if (isNetworkError(error)) {
        // sin conexión: apuntar el cambio y seguir
        addToOutbox({ table: 'time_entries', op: 'update', match: { id: entry.id }, payload: { pause_started_at: ts } })
        setEntry({ ...entry, pause_started_at: ts })
        return
      }
      throw error
    }
    setEntry(data)
  })

  const resume = () => run(async () => {
    const mins = Math.round((Date.now() - new Date(entry.pause_started_at)) / 60000)
    const payload = { pause_started_at: null, break_minutes: (entry.break_minutes ?? 0) + mins }
    if (entry.local) {
      const updated = { ...entry, ...payload }
      setPendingEntry(updated); setEntry(updated)
      return
    }
    const { data, error } = await supabase.from('time_entries')
      .update(payload).eq('id', entry.id).select().single()
    if (error) {
      if (isNetworkError(error)) {
        addToOutbox({ table: 'time_entries', op: 'update', match: { id: entry.id }, payload })
        setEntry({ ...entry, ...payload })
        return
      }
      throw error
    }
    setEntry(data)
  })

  // Cierra el fichaje actual (online u offline). Devuelve true si se cerró.
  async function closeEntry(gps) {
    let breakMin = entry.break_minutes ?? 0
    if (entry.pause_started_at) breakMin += Math.round((Date.now() - new Date(entry.pause_started_at)) / 60000)
    const payload = { clock_out: new Date().toISOString(), pause_started_at: null, break_minutes: breakMin, gps_out: gps }

    if (entry.local) {
      // fichaje que nació sin conexión: guardarlo completo en la bandeja de salida
      const { id, local, ...base } = entry
      addToOutbox({ table: 'time_entries', op: 'insert', payload: { ...base, ...payload } })
      setPendingEntry(null)
      syncOutbox()
      return true
    }
    try {
      const { error } = await supabase.from('time_entries').update(payload).eq('id', entry.id)
      if (error) {
        if (!isNetworkError(error)) throw error
        addToOutbox({ table: 'time_entries', op: 'update', match: { id: entry.id }, payload })
        setOfflineMsg('Salida guardada en el móvil. Se subirá sola al recuperar cobertura.')
        return true
      }
      await audit('fichar_salida', 'time_entries', entry.id)
      return true
    } catch (e) {
      if (!isNetworkError(e)) throw e
      addToOutbox({ table: 'time_entries', op: 'update', match: { id: entry.id }, payload })
      setOfflineMsg('Salida guardada en el móvil. Se subirá sola al recuperar cobertura.')
      return true
    }
  }

  const clockOut = () => run(async () => {
    const gps = useGps ? await getGPS() : null
    const j = entry.job_id
    const ok = await closeEntry(gps)
    if (!ok) return
    setEntry(null)
    // Recomendar el parte diario al salir
    nav(`/parte${j ? `?obra=${j}` : ''}`)
  })

  // Fichar salida de esta obra y entrada en otra, en un solo gesto
  const switchJob = () => run(async () => {
    if (!switchJobId) return
    const gps = useGps ? await getGPS() : null
    const ok = await closeEntry(gps)
    if (!ok) return

    if (!navigator.onLine) {
      const local = createLocalEntry({ user_id: user.id, job_id: switchJobId, gps_in: gps })
      setEntry(local); setSwitchJobId('')
      setOfflineMsg('Cambio de obra guardado en el móvil. Se subirá solo al recuperar cobertura.')
      return
    }
    try {
      const { data, error } = await supabase.from('time_entries')
        .insert({ user_id: user.id, job_id: switchJobId, gps_in: gps }).select().single()
      if (error) {
        if (!isNetworkError(error)) throw error
        const local = createLocalEntry({ user_id: user.id, job_id: switchJobId, gps_in: gps })
        setEntry(local); setSwitchJobId('')
        return
      }
      await audit('cambiar_de_obra', 'time_entries', data.id, { de: entry.job_id, a: switchJobId })
      setEntry(data); setSwitchJobId('')
    } catch (e) {
      if (!isNetworkError(e)) throw e
      const local = createLocalEntry({ user_id: user.id, job_id: switchJobId, gps_in: gps })
      setEntry(local); setSwitchJobId('')
    }
  })

  const paused = !!(entry && entry.pause_started_at)
  const elapsed = entry ? now - new Date(entry.clock_in) - (entry.break_minutes ?? 0) * 60000
    - (paused ? now - new Date(entry.pause_started_at) : 0) : 0

  // Recordatorio: demasiadas horas fichado
  const tooLong = !!entry && elapsed > REMINDER_HOURS * 3600000
  useEffect(() => {
    if (!tooLong || !entry) return
    const flagKey = `xt_aviso_salida_${entry.id}`
    if (localStorage.getItem(flagKey)) return
    localStorage.setItem(flagKey, '1')
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('¿Sigues trabajando?', {
          body: `Llevas más de ${REMINDER_HOURS} horas fichado. Si ya has terminado, ficha la salida.`,
          icon: '/pwa-192.png',
        })
      }
    } catch {}
  }, [tooLong, entry?.id])

  if (entry === undefined) return <Loading />

  const currentJobName = entry ? (jobs.find(j => j.id === entry.job_id)?.name ?? null) : null
  const otherJobs = entry ? jobs.filter(j => j.id !== entry.job_id) : []

  return (
    <div>
      <Header title="Fichar" subtitle={entry ? 'Jornada en curso' : 'Empieza tu jornada'} />
      <div className="px-5 space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}
        {offlineMsg && <Banner tone="warn">{offlineMsg}</Banner>}

        {!entry && (
          <>
            {jobs.length === 0 && (
              <Banner tone="warn">No tienes ninguna obra asignada. Puedes fichar igualmente, pero pide al administrador que te asigne a tu obra para que las horas queden bien repartidas.</Banner>
            )}
            <Card>
              <Field label="¿En qué obra vas a trabajar?">
                <Select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  {jobs.length === 0 && <option value="">Sin obra asignada</option>}
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-3 text-[15px] font-semibold">
                <input type="checkbox" className="w-5 h-5" checked={useGps} onChange={e => setUseGps(e.target.checked)} />
                Guardar mi ubicación GPS (opcional)
              </label>
            </Card>
            <Button variant="ambar" className="min-h-[72px] text-[20px] pulsador" onClick={clockIn} disabled={busy}>
              Fichar entrada
            </Button>
          </>
        )}

        {entry && (
          <>
            {tooLong && (
              <Banner tone="danger">
                Llevas más de {REMINDER_HOURS} horas fichado. ¿Se te olvidó fichar la salida?
              </Banner>
            )}
            <div className="cabecera text-white rounded-tarjeta shadow-flotante text-center py-9 px-4 anim-aparecer">
              <div className="franjas h-1.5 rounded-full mb-6 mx-8" />
              <p className={`font-bold uppercase tracking-wide text-[13px] ${paused ? 'text-ambar' : 'text-white/70'}`}>
                {paused ? 'En pausa' : 'Trabajando'} · entrada {fmtTime(entry.clock_in)}
              </p>
              <p className="text-[56px] font-extrabold tabular-nums leading-tight mt-1">{hhmmss(elapsed)}</p>
              {currentJobName && <p className="text-white/85 mt-1 text-[15px] font-semibold">{currentJobName}</p>}
              {entry.break_minutes > 0 && <p className="text-white/60 mt-1 text-[14px]">{entry.break_minutes} min de pausa acumulados</p>}
              {entry.local && <p className="text-ambar mt-2 text-[13px] font-bold">Guardado en el móvil · pendiente de subir</p>}
            </div>

            {!paused
              ? <Button variant="ghost" onClick={pause} disabled={busy}>Empezar pausa</Button>
              : <Button variant="ok" onClick={resume} disabled={busy}>Reanudar trabajo</Button>}

            <Button variant="danger" className="min-h-[72px] text-[20px] pulsador" onClick={clockOut} disabled={busy}>
              Fichar salida
            </Button>

            {otherJobs.length > 0 && (
              <Card>
                <h3 className="font-extrabold mb-2">Cambiar de obra</h3>
                <p className="text-humo text-[14px] mb-3">Cierra esta obra y empieza en otra, en un solo gesto.</p>
                <Field label="¿A qué obra vas ahora?">
                  <Select value={switchJobId} onChange={e => setSwitchJobId(e.target.value)}>
                    <option value="">Elige obra…</option>
                    {otherJobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                  </Select>
                </Field>
                <Button variant="ambar" onClick={switchJob} disabled={busy || !switchJobId}>
                  Cambiar de obra
                </Button>
              </Card>
            )}

            <p className="text-humo text-[14px] text-center">
              Al salir te pediremos el parte del día: qué has hecho y fotos de la obra.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
