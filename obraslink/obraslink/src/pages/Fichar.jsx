import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Field, Select, Loading, Banner } from '../components/UI'
import { fmtTime, getGPS, audit } from '../lib/helpers'

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
  const [entry, setEntry] = useState(undefined) // undefined = cargando
  const [useGps, setUseGps] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    const { data: asg } = await supabase
      .from('job_assignments').select('jobs(id, name, status)').eq('user_id', user.id)
    const active = (asg ?? []).map(a => a.jobs).filter(j => j && !['acabada','facturada','cobrada','archivada'].includes(j.status))
    setJobs(active)
    if (active[0] && !jobId) setJobId(active[0].id)

    const { data } = await supabase.from('time_entries')
      .select('*').eq('user_id', user.id).is('clock_out', null)
      .order('clock_in', { ascending: false }).limit(1).maybeSingle()
    setEntry(data ?? null)
  }
  useEffect(() => { load() }, [user.id])

  async function run(fn) {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e.message ?? 'Algo ha fallado. Inténtalo otra vez.') }
    setBusy(false)
  }

  const clockIn = () => run(async () => {
    const gps = useGps ? await getGPS() : null
    const { data, error } = await supabase.from('time_entries')
      .insert({ user_id: user.id, job_id: jobId || null, gps_in: gps }).select().single()
    if (error) throw error
    await audit('fichar_entrada', 'time_entries', data.id, { job_id: jobId })
    setEntry(data)
  })

  const pause = () => run(async () => {
    const { data, error } = await supabase.from('time_entries')
      .update({ pause_started_at: new Date().toISOString() }).eq('id', entry.id).select().single()
    if (error) throw error
    setEntry(data)
  })

  const resume = () => run(async () => {
    const mins = Math.round((Date.now() - new Date(entry.pause_started_at)) / 60000)
    const { data, error } = await supabase.from('time_entries')
      .update({ pause_started_at: null, break_minutes: (entry.break_minutes ?? 0) + mins })
      .eq('id', entry.id).select().single()
    if (error) throw error
    setEntry(data)
  })

  const clockOut = () => run(async () => {
    let breakMin = entry.break_minutes ?? 0
    if (entry.pause_started_at) breakMin += Math.round((Date.now() - new Date(entry.pause_started_at)) / 60000)
    const gps = useGps ? await getGPS() : null
    const { error } = await supabase.from('time_entries')
      .update({ clock_out: new Date().toISOString(), pause_started_at: null, break_minutes: breakMin, gps_out: gps })
      .eq('id', entry.id)
    if (error) throw error
    await audit('fichar_salida', 'time_entries', entry.id)
    const j = entry.job_id
    setEntry(null)
    // Recomendar el parte diario al salir
    nav(`/parte${j ? `?obra=${j}` : ''}`)
  })

  if (entry === undefined) return <Loading />

  const paused = !!entry?.pause_started_at
  const elapsed = entry ? now - new Date(entry.clock_in) - (entry.break_minutes ?? 0) * 60000
    - (paused ? now - new Date(entry.pause_started_at) : 0) : 0

  return (
    <div>
      <Header title="Fichar" subtitle={entry ? 'Jornada en curso' : 'Empieza tu jornada'} />
      <div className="px-5 space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}

        {!entry && (
          <>
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
            <Card className="text-center py-8">
              <div className="franjas h-1.5 rounded-full mb-6 mx-8" />
              <p className="text-humo font-bold uppercase tracking-wide text-[13px]">
                {paused ? 'En pausa' : 'Trabajando'} · entrada {fmtTime(entry.clock_in)}
              </p>
              <p className="text-[52px] font-extrabold tabular-nums leading-tight mt-1">{hhmmss(elapsed)}</p>
              {entry.break_minutes > 0 && <p className="text-humo mt-1">{entry.break_minutes} min de pausa acumulados</p>}
            </Card>

            {!paused
              ? <Button variant="ghost" onClick={pause} disabled={busy}>Empezar pausa</Button>
              : <Button variant="ok" onClick={resume} disabled={busy}>Reanudar trabajo</Button>}

            <Button variant="danger" className="min-h-[72px] text-[20px] pulsador" onClick={clockOut} disabled={busy}>
              Fichar salida
            </Button>
            <p className="text-humo text-[14px] text-center">
              Al salir te pediremos el parte del día: qué has hecho y fotos de la obra.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
