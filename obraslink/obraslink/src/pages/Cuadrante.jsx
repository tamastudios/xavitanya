import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Loading, Banner, Select, Empty } from '../components/UI'
import { startOfWeek, weekDays, toDateStr, audit } from '../lib/helpers'

export default function Cuadrante() {
  const { user } = useAuth()
  const [monday, setMonday] = useState(startOfWeek())
  const [people, setPeople] = useState(null)
  const [jobs, setJobs] = useState([])
  const [sched, setSched] = useState([]) // [{id, user_id, job_id, work_date}]
  const [selectedDay, setSelectedDay] = useState(toDateStr(new Date()))
  const [error, setError] = useState(null)

  const days = weekDays(monday)

  async function load() {
    setError(null)
    const [{ data: p }, { data: j }, { data: s, error: e }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role').eq('active', true).order('full_name'),
      supabase.from('jobs').select('id, name, status')
        .not('status', 'in', '(acabada,facturada,cobrada,archivada)').order('name'),
      supabase.from('schedule_assignments').select('id, user_id, job_id, work_date')
        .gte('work_date', toDateStr(days[0])).lte('work_date', toDateStr(days[6])),
    ])
    if (e) setError('No se pudo cargar el cuadrante. ¿Has ejecutado la migración SQL en Supabase? Detalle: ' + e.message)
    setPeople(p ?? [])
    setJobs(j ?? [])
    setSched(s ?? [])
  }
  useEffect(() => { load() }, [monday])

  function moveWeek(delta) {
    const m = new Date(monday)
    m.setDate(m.getDate() + delta * 7)
    setMonday(m)
    const d = weekDays(m)
    setSelectedDay(toDateStr(d[0]))
  }

  async function assign(userId, dateStr, jobId) {
    setError(null)
    const current = sched.find(s => s.user_id === userId && s.work_date === dateStr)
    if (!jobId) {
      if (!current) return
      const { error: e } = await supabase.from('schedule_assignments').delete().eq('id', current.id)
      if (e) return setError('No se pudo quitar: ' + e.message)
    } else {
      const { error: e } = await supabase.from('schedule_assignments').upsert(
        { user_id: userId, work_date: dateStr, job_id: jobId, created_by: user.id },
        { onConflict: 'user_id,work_date' }
      )
      if (e) return setError('No se pudo guardar: ' + e.message)
    }
    await audit('planificar_cuadrante', 'schedule_assignments', null, { empleado: userId, fecha: dateStr, obra: jobId || 'quitada' })
    load()
  }

  // Copiar lo planificado de la semana anterior a esta
  async function copyLastWeek() {
    const prevMonday = new Date(monday); prevMonday.setDate(prevMonday.getDate() - 7)
    const prevDays = weekDays(prevMonday)
    const { data: prev } = await supabase.from('schedule_assignments')
      .select('user_id, job_id, work_date')
      .gte('work_date', toDateStr(prevDays[0])).lte('work_date', toDateStr(prevDays[6]))
    if (!prev || prev.length === 0) return setError('La semana anterior no tiene nada planificado.')
    const rows = prev.map(r => {
      const d = new Date(r.work_date + 'T12:00:00'); d.setDate(d.getDate() + 7)
      return { user_id: r.user_id, job_id: r.job_id, work_date: toDateStr(d), created_by: user.id }
    })
    const { error: e } = await supabase.from('schedule_assignments').upsert(rows, { onConflict: 'user_id,work_date' })
    if (e) return setError('No se pudo copiar: ' + e.message)
    await audit('planificar_cuadrante', 'schedule_assignments', null, { copiada_semana: toDateStr(monday) })
    load()
  }

  if (people === null) return <Loading />

  const weekLabel = `${days[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
  const todayStr = toDateStr(new Date())
  const selectedDate = days.find(d => toDateStr(d) === selectedDay) ?? days[0]
  const selectedStr = toDateStr(selectedDate)
  const empleados = people

  // Resumen del día seleccionado agrupado por obra
  const daySched = sched.filter(s => s.work_date === selectedStr)
  const porObra = {}
  for (const s of daySched) {
    const job = jobs.find(j => j.id === s.job_id)
    const key = job?.name ?? 'Obra'
    porObra[key] ??= []
    porObra[key].push(people.find(p => p.id === s.user_id)?.full_name ?? '')
  }

  return (
    <div>
      <Header title="Cuadrante semanal" subtitle="Quién va a qué obra cada día" />
      <div className="px-5 space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}

        {/* Navegación de semana */}
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => moveWeek(-1)} className="min-h-[44px] px-4 rounded-xl bg-papel border border-linea font-bold text-[15px]">←</button>
          <p className="font-extrabold text-[16px] capitalize">{weekLabel}</p>
          <button onClick={() => moveWeek(1)} className="min-h-[44px] px-4 rounded-xl bg-papel border border-linea font-bold text-[15px]">→</button>
        </div>

        {/* Píldoras de día */}
        <div className="overflow-x-auto no-scrollbar -mx-5">
          <div className="flex gap-2 px-5 w-max">
            {days.map(d => {
              const ds = toDateStr(d)
              const active = ds === selectedStr
              const count = sched.filter(s => s.work_date === ds).length
              return (
                <button key={ds} onClick={() => setSelectedDay(ds)}
                  className={`flex flex-col items-center px-4 py-2 rounded-2xl border text-[13px] font-bold whitespace-nowrap transition ${
                    active ? 'bg-grafito text-white border-grafito shadow-tarjeta' : 'bg-papel text-humo border-linea'}`}>
                  <span className="capitalize">{d.toLocaleDateString('es-ES', { weekday: 'short' })} {d.getDate()}</span>
                  <span className={`text-[11px] ${active ? 'text-ambar' : ''}`}>
                    {ds === todayStr ? 'hoy · ' : ''}{count > 0 ? `${count} 👷` : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Asignaciones del día */}
        <Card>
          <h3 className="font-extrabold mb-3 capitalize">
            {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {empleados.length === 0 && <Empty>No hay empleados activos.</Empty>}
          {empleados.map(p => {
            const current = sched.find(s => s.user_id === p.id && s.work_date === selectedStr)
            return (
              <div key={p.id} className="py-2.5 border-t border-linea first:border-0">
                <p className="font-bold text-[15px] mb-1.5">{p.full_name}</p>
                <Select value={current?.job_id ?? ''} onChange={e => assign(p.id, selectedStr, e.target.value)}>
                  <option value="">— Sin asignar —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </Select>
              </div>
            )
          })}
        </Card>

        {/* Resumen por obra del día */}
        {Object.keys(porObra).length > 0 && (
          <Card>
            <h3 className="font-extrabold mb-2">Resumen del día por obra</h3>
            {Object.entries(porObra).map(([obra, names]) => (
              <div key={obra} className="py-2 border-t border-linea first:border-0">
                <p className="font-bold text-[14px]">{obra}</p>
                <p className="text-humo text-[14px]">{names.join(', ')}</p>
              </div>
            ))}
          </Card>
        )}

        <button onClick={copyLastWeek}
          className="w-full min-h-[52px] rounded-tarjeta bg-papel border border-linea font-bold text-[15px] text-humo">
          Copiar la planificación de la semana anterior
        </button>
        <p className="text-humo text-[13px] text-center pb-2">
          Cada empleado ve su semana en su pantalla de inicio.
        </p>
      </div>
    </div>
  )
}
