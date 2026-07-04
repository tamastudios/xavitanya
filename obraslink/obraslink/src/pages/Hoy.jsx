import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Chip, Empty, Loading, Banner, Modal, Field, Select, TextArea } from '../components/UI'
import {
  statusLabel, fmtTime, fmtDate, fmtEUR, monthValue, monthRange, entryHours, fmtHours,
  startOfWeek, weekDays, toDateStr, INCIDENT_KINDS, incidentLabel, getGPS, audit,
} from '../lib/helpers'
import { isNetworkError, addToOutbox, syncOutbox } from '../lib/offline'

// ---------------- EMPLEADO ----------------

function ProblemaModal({ open, onClose, jobs, defaultJobId }) {
  const { user } = useAuth()
  const [kind, setKind] = useState('falta_material')
  const [jobId, setJobId] = useState(defaultJobId ?? '')
  const [message, setMessage] = useState('')
  const [sendGps, setSendGps] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { if (open) { setJobId(defaultJobId ?? ''); setMsg(null); setMessage('') } }, [open, defaultJobId])

  async function send(e) {
    e.preventDefault()
    if (!message.trim()) return setMsg({ tone: 'warn', text: 'Cuenta en una línea qué pasa.' })
    setBusy(true); setMsg(null)
    const gps = sendGps ? await getGPS() : null
    const payload = { user_id: user.id, job_id: jobId || null, kind, message: message.trim(), gps }
    try {
      if (!navigator.onLine) throw new TypeError('Failed to fetch')
      const { error } = await supabase.from('incidents').insert(payload)
      if (error) {
        if (isNetworkError(error)) throw error
        throw new Error(error.message)
      }
      await audit('crear_incidencia', 'incidents', null, { kind })
      setMsg({ tone: 'ok', text: 'Aviso enviado. El administrador lo verá en su pantalla de inicio.' })
      setTimeout(onClose, 1500)
    } catch (err) {
      if (isNetworkError(err)) {
        addToOutbox({ table: 'incidents', op: 'insert', payload })
        syncOutbox()
        setMsg({ tone: 'ok', text: 'Sin conexión: el aviso se ha guardado en el móvil y se enviará solo.' })
        setTimeout(onClose, 2000)
      } else {
        setMsg({ tone: 'danger', text: 'No se pudo enviar el aviso: ' + err.message })
      }
    }
    setBusy(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Tengo un problema">
      <form onSubmit={send}>
        <Field label="¿Qué pasa?">
          <Select value={kind} onChange={e => setKind(e.target.value)}>
            {INCIDENT_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </Select>
        </Field>
        <Field label="Obra">
          <Select value={jobId} onChange={e => setJobId(e.target.value)}>
            <option value="">Sin obra concreta</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </Select>
        </Field>
        <Field label="Cuéntalo en una línea">
          <TextArea value={message} onChange={e => setMessage(e.target.value)}
            placeholder="Ej: Se ha acabado el cemento cola. Necesitamos 4 sacos más para mañana." className="min-h-[90px]" />
        </Field>
        <label className="flex items-center gap-3 text-[15px] font-semibold mb-4">
          <input type="checkbox" className="w-5 h-5" checked={sendGps} onChange={e => setSendGps(e.target.checked)} />
          Enviar mi ubicación GPS
        </label>
        {msg && <div className="mb-4"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
        <Button type="submit" variant="danger" disabled={busy}>{busy ? 'Enviando…' : 'Avisar al administrador'}</Button>
      </form>
    </Modal>
  )
}

function HoyEmpleado() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [jobs, setJobs] = useState(null)
  const [open, setOpen] = useState(null)
  const [monthHours, setMonthHours] = useState(0)
  const [week, setWeek] = useState([])
  const [showProblema, setShowProblema] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: asg } = await supabase
        .from('job_assignments')
        .select('job_id, jobs(id, name, address, maps_url, status, description)')
        .eq('user_id', user.id)
      const active = (asg ?? []).map(a => a.jobs).filter(j => j && !['acabada','facturada','cobrada','archivada'].includes(j.status))
      setJobs(active)

      const { data: openEntry } = await supabase.from('time_entries')
        .select('*').eq('user_id', user.id).is('clock_out', null)
        .order('clock_in', { ascending: false }).limit(1).maybeSingle()
      setOpen(openEntry)

      const { from, to } = monthRange(monthValue())
      const { data: entries } = await supabase.from('time_entries')
        .select('clock_in, clock_out, break_minutes').eq('user_id', user.id)
        .gte('clock_in', from).lt('clock_in', to).not('clock_out', 'is', null)
      setMonthHours((entries ?? []).reduce((s, e) => s + entryHours(e), 0))

      // Cuadrante de la semana (si el admin lo ha rellenado)
      const monday = startOfWeek()
      const days = weekDays(monday)
      const { data: sched } = await supabase.from('schedule_assignments')
        .select('work_date, jobs(id, name)')
        .eq('user_id', user.id)
        .gte('work_date', toDateStr(monday)).lte('work_date', toDateStr(days[6]))
      setWeek(days.map(d => ({
        date: d,
        job: (sched ?? []).find(s => s.work_date === toDateStr(d))?.jobs ?? null,
      })))
    }
    load()
  }, [user.id])

  if (jobs === null) return <Loading />

  const todayStr = toDateStr(new Date())
  const scheduledToday = week.find(w => toDateStr(w.date) === todayStr)?.job
  const today = (scheduledToday && jobs.find(j => j.id === scheduledToday.id)) || jobs[0]
  const rate = Number(profile?.hourly_rate ?? 0)
  const hasSchedule = week.some(w => w.job)

  return (
    <div>
      <Header title={`Hola, ${profile?.full_name?.split(' ')[0] ?? ''}`}
        subtitle={new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <div className="px-5 space-y-4">
        {open && (
          <Banner tone="ok">
            Estás fichado desde las {fmtTime(open.clock_in)}{open.pause_started_at ? ' · En pausa' : ''}
          </Banner>
        )}

        {!open && (
          <Button variant="ambar" className="text-[19px] min-h-[64px]" onClick={() => nav('/fichar')}>
            Fichar entrada
          </Button>
        )}
        {open && (
          <Button variant="danger" className="text-[19px] min-h-[64px]" onClick={() => nav('/fichar')}>
            Fichar salida
          </Button>
        )}

        {/* Cuánto llevo este mes */}
        <Card onClick={() => nav('/perfil')} className="text-center">
          <p className="text-humo text-[13px] font-bold uppercase tracking-wide">Este mes llevas</p>
          <p className="text-[32px] font-extrabold leading-tight mt-1">
            {fmtHours(monthHours)}{rate > 0 && <span className="text-casco"> · {fmtEUR(monthHours * rate)}</span>}
          </p>
          {rate > 0 && <p className="text-humo text-[13px] mt-1">a {fmtEUR(rate)}/hora · toca para ver el detalle</p>}
        </Card>

        {today ? (
          <div className="cabecera text-white rounded-tarjeta shadow-flotante p-4 anim-aparecer">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-ambar text-[13px] font-bold uppercase tracking-wide">Tu obra de hoy</p>
                <h2 className="text-[21px] font-extrabold mt-0.5">{today.name}</h2>
                {today.address && <p className="text-white/70 mt-1 text-[15px]">{today.address}</p>}
              </div>
              <Chip tone="claro">{statusLabel(today.status)}</Chip>
            </div>
            {today.description && <p className="mt-3 text-[15px] text-white/85">{today.description}</p>}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button variant="ghost" onClick={() =>
                window.open(today.maps_url || `https://maps.google.com/?q=${encodeURIComponent(today.address ?? today.name)}`, '_blank')}>
                Abrir en Maps
              </Button>
              <Button variant="ambar" onClick={() => nav(`/obras/${today.id}`)}>Ver obra</Button>
            </div>
          </div>
        ) : (
          <Card><Empty>No tienes obras asignadas. Habla con tu encargado.</Empty></Card>
        )}

        {/* Mi semana: dónde me toca cada día */}
        {hasSchedule && (
          <Card>
            <h3 className="font-extrabold mb-2">Mi semana</h3>
            {week.map((w, i) => {
              const isToday = toDateStr(w.date) === todayStr
              return (
                <div key={i} className={`flex justify-between items-center py-2 border-t border-linea first:border-0 ${isToday ? 'bg-ambar/10 -mx-4 px-4 rounded-lg border-0' : ''}`}>
                  <span className={`text-[15px] capitalize ${isToday ? 'font-extrabold' : 'font-semibold text-humo'}`}>
                    {w.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}{isToday ? ' · hoy' : ''}
                  </span>
                  <span className={`text-[15px] ${w.job ? 'font-bold' : 'text-humo'}`}>{w.job?.name ?? '—'}</span>
                </div>
              )
            })}
          </Card>
        )}

        <Button variant="danger" className="min-h-[60px]" onClick={() => setShowProblema(true)}>
          ⚠️ Tengo un problema
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => nav('/parte')}>Escribir parte del día</Button>
          <Button variant="ghost" onClick={() => nav('/almacen')}>Coger material</Button>
          <Button variant="ghost" onClick={() => nav('/factura')}>Mi parte mensual</Button>
          <Button variant="ghost" onClick={() => nav('/perfil')}>Mi perfil</Button>
        </div>
      </div>

      <ProblemaModal open={showProblema} onClose={() => setShowProblema(false)}
        jobs={jobs} defaultJobId={open?.job_id ?? today?.id ?? ''} />
    </div>
  )
}

// ---------------- JEFE / ADMIN ----------------

function BuscadorGlobal() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setResults(null); return }
    timer.current = setTimeout(async () => {
      const term = `%${q.trim()}%`
      const [{ data: jobs }, { data: clients }, { data: people }, { data: mats }] = await Promise.all([
        supabase.from('jobs').select('id, name, status').ilike('name', term).limit(5),
        supabase.from('clients').select('id, name, phone').ilike('name', term).limit(5),
        supabase.from('profiles').select('id, full_name').ilike('full_name', term).eq('active', true).limit(5),
        supabase.from('materials').select('id, name, stock, unit').ilike('name', term).limit(5),
      ])
      setResults({ jobs: jobs ?? [], clients: clients ?? [], people: people ?? [], mats: mats ?? [] })
    }, 300)
    return () => clearTimeout(timer.current)
  }, [q])

  const total = results ? results.jobs.length + results.clients.length + results.people.length + results.mats.length : 0

  return (
    <div>
      <input
        value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Buscar obra, cliente, empleado o material…"
        className="w-full min-h-[52px] rounded-xl border border-linea bg-papel px-4 text-[16px] focus:outline-none focus:border-grafito focus:ring-4 focus:ring-grafito/10"
      />
      {results && (
        <Card className="mt-2">
          {total === 0 && <p className="text-humo text-[15px]">No se ha encontrado nada con «{q}».</p>}
          {results.jobs.map(j => (
            <button key={j.id} onClick={() => nav(`/obras/${j.id}`)} className="w-full text-left flex justify-between items-center py-2.5 border-t border-linea first:border-0">
              <span className="font-semibold">🏗️ {j.name}</span>
              <span className="text-humo text-[13px]">{statusLabel(j.status)}</span>
            </button>
          ))}
          {results.clients.map(c => (
            <button key={c.id} onClick={() => nav('/clientes')} className="w-full text-left flex justify-between items-center py-2.5 border-t border-linea first:border-0">
              <span className="font-semibold">👤 {c.name}</span>
              <span className="text-humo text-[13px]">{c.phone ?? 'Cliente'}</span>
            </button>
          ))}
          {results.people.map(p => (
            <button key={p.id} onClick={() => nav('/empleados')} className="w-full text-left flex justify-between items-center py-2.5 border-t border-linea first:border-0">
              <span className="font-semibold">👷 {p.full_name}</span>
              <span className="text-humo text-[13px]">Empleado</span>
            </button>
          ))}
          {results.mats.map(m => (
            <button key={m.id} onClick={() => nav('/almacen')} className="w-full text-left flex justify-between items-center py-2.5 border-t border-linea first:border-0">
              <span className="font-semibold">📦 {m.name}</span>
              <span className="text-humo text-[13px]">{Number(m.stock)} {m.unit}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  )
}

function InicioAdmin() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [stats, setStats] = useState(null)

  async function load() {
    const now = new Date()
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0)
    const startYesterday = new Date(startToday); startYesterday.setDate(startYesterday.getDate() - 1)
    const threeDaysAgo = new Date(startToday); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

    const [
      { count: activas }, { data: abiertos }, { count: partes }, { count: facturas },
      { data: people }, { data: recentReports }, { data: incidents },
      { data: yesterdayEntries }, { count: partesAyer }, { data: budgetJobs },
    ] = await Promise.all([
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'en_proceso'),
      supabase.from('time_entries').select('id, clock_in, job_id, profiles(full_name), jobs(name)').is('clock_out', null),
      supabase.from('daily_reports').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'enviado'),
      supabase.from('profiles').select('id, full_name, role, hourly_rate').eq('active', true),
      supabase.from('daily_reports').select('user_id').gte('report_date', toDateStr(threeDaysAgo)),
      supabase.from('incidents').select('id, kind, message, gps, status, created_at, profiles!incidents_user_id_fkey(full_name), jobs(name)')
        .eq('status', 'abierta').order('created_at', { ascending: false }),
      supabase.from('time_entries').select('clock_in, clock_out, break_minutes')
        .gte('clock_in', startYesterday.toISOString()).lt('clock_in', startToday.toISOString()).not('clock_out', 'is', null),
      supabase.from('daily_reports').select('id', { count: 'exact', head: true }).eq('report_date', toDateStr(startYesterday)),
      supabase.from('jobs').select('id, name, budget').eq('status', 'en_proceso').not('budget', 'is', null),
    ])

    // Coste de obras con presupuesto (horas × tarifa + material)
    let overBudget = []
    const bJobs = (budgetJobs ?? []).filter(j => Number(j.budget) > 0)
    if (bJobs.length > 0) {
      const ids = bJobs.map(j => j.id)
      const [{ data: jobEntries }, { data: jobMoves }] = await Promise.all([
        supabase.from('time_entries').select('job_id, user_id, clock_in, clock_out, break_minutes')
          .in('job_id', ids).not('clock_out', 'is', null),
        supabase.from('material_movements').select('job_id, type, quantity, materials(price)').in('job_id', ids),
      ])
      const rateById = Object.fromEntries((people ?? []).map(p => [p.id, Number(p.hourly_rate ?? 0)]))
      overBudget = bJobs.map(j => {
        const labor = (jobEntries ?? []).filter(e => e.job_id === j.id)
          .reduce((s, e) => s + entryHours(e) * (rateById[e.user_id] ?? 0), 0)
        const material = (jobMoves ?? []).filter(m => m.job_id === j.id).reduce((s, m) => {
          const cost = Number(m.quantity) * Number(m.materials?.price ?? 0)
          return m.type === 'salida' ? s + cost : m.type === 'devolucion' ? s - cost : s
        }, 0)
        return { ...j, cost: labor + material }
      }).filter(j => j.cost > Number(j.budget))
    }

    // Empleados sin parte en los últimos 3 días
    const reported = new Set((recentReports ?? []).map(r => r.user_id))
    const sinParte = (people ?? []).filter(p => p.role === 'empleado' && !reported.has(p.id))

    // Fichajes sospechosamente largos (> 12 h abiertos)
    const olvidos = (abiertos ?? []).filter(e => Date.now() - new Date(e.clock_in) > 12 * 3600000)

    setStats({
      activas: activas ?? 0,
      abiertos: abiertos ?? [],
      partes: partes ?? 0,
      facturas: facturas ?? 0,
      incidents: incidents ?? [],
      sinParte,
      olvidos,
      overBudget,
      ayer: {
        horas: (yesterdayEntries ?? []).reduce((s, e) => s + entryHours(e), 0),
        partes: partesAyer ?? 0,
      },
    })
  }
  useEffect(() => { load() }, [])

  async function resolveIncident(id) {
    await supabase.from('incidents').update({
      status: 'resuelta', resolved_by: user.id, resolved_at: new Date().toISOString(),
    }).eq('id', id)
    await audit('resolver_incidencia', 'incidents', id)
    load()
  }

  if (!stats) return <Loading />

  const Num = ({ n, label, to }) => (
    <Card onClick={() => nav(to)} className="text-center">
      <p className="text-[30px] font-extrabold leading-none">{n}</p>
      <p className="text-humo text-[13px] font-semibold mt-1">{label}</p>
    </Card>
  )

  // Trabajando ahora, agrupado por obra
  const porObra = {}
  for (const e of stats.abiertos) {
    const key = e.jobs?.name ?? 'Sin obra'
    porObra[key] ??= []
    porObra[key].push(e)
  }

  const totalAlertas = stats.incidents.length + stats.olvidos.length + stats.sinParte.length + stats.overBudget.length

  return (
    <div>
      <Header title="Inicio" subtitle="Resumen de la empresa"
        right={<Link to="/perfil" className="text-white/85 font-bold text-[15px] underline underline-offset-4">Perfil</Link>} />
      <div className="px-5 space-y-4">
        <BuscadorGlobal />

        <div className="grid grid-cols-3 gap-3">
          <Num n={stats.activas} label="Obras en proceso" to="/obras" />
          <Num n={stats.abiertos.length} label="Fichajes abiertos" to="/informes" />
          <Num n={stats.partes} label="Partes por revisar" to="/informes" />
        </div>

        {/* Resumen de ayer */}
        <Card>
          <p className="text-humo text-[13px] font-bold uppercase tracking-wide mb-1">Ayer</p>
          <p className="text-[15px] font-semibold">
            {fmtHours(stats.ayer.horas)} fichadas · {stats.ayer.partes} parte(s) del día · {stats.activas} obra(s) en proceso
          </p>
        </Card>

        {/* Alertas */}
        {totalAlertas > 0 && (
          <Card>
            <h3 className="font-extrabold mb-2">⚠️ Necesita tu atención</h3>
            <div className="space-y-2">
              {stats.incidents.map(i => (
                <div key={i.id} className="rounded-xl bg-senal-claro p-3">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-[15px] font-bold text-senal">
                      {incidentLabel(i.kind)} · {i.profiles?.full_name}{i.jobs?.name ? ` · ${i.jobs.name}` : ''}
                    </p>
                    <span className="text-humo text-[12px] whitespace-nowrap">{fmtTime(i.created_at)}</span>
                  </div>
                  <p className="text-[14px] mt-1">{i.message}</p>
                  <div className="flex gap-2 mt-2">
                    {i.gps && (
                      <button onClick={() => window.open(`https://maps.google.com/?q=${i.gps}`, '_blank')}
                        className="text-[13px] font-bold text-grafito underline underline-offset-2">Ver ubicación</button>
                    )}
                    <button onClick={() => resolveIncident(i.id)}
                      className="text-[13px] font-bold text-casco underline underline-offset-2">Marcar resuelta</button>
                  </div>
                </div>
              ))}
              {stats.olvidos.map(e => (
                <Banner key={e.id} tone="warn">
                  {e.profiles?.full_name} lleva fichado desde {fmtDate(e.clock_in)} a las {fmtTime(e.clock_in)} (¿olvidó fichar la salida?). Corrígelo en Informes.
                </Banner>
              ))}
              {stats.sinParte.length > 0 && (
                <Banner tone="warn">
                  Sin parte diario en los últimos 3 días: {stats.sinParte.map(p => p.full_name).join(', ')}
                </Banner>
              )}
              {stats.overBudget.map(j => (
                <Banner key={j.id} tone="danger">
                  «{j.name}» ha superado el presupuesto: {fmtEUR(j.cost)} de {fmtEUR(j.budget)} previstos.
                </Banner>
              ))}
            </div>
          </Card>
        )}

        {stats.facturas > 0 && (
          <Card onClick={() => nav('/informes')}>
            <Banner tone="warn">{stats.facturas} parte(s) mensual(es) de autónomos pendientes de aprobar</Banner>
          </Card>
        )}

        {stats.abiertos.length > 0 && (
          <Card>
            <h3 className="font-extrabold mb-2">Trabajando ahora</h3>
            {Object.entries(porObra).map(([obra, people]) => (
              <div key={obra} className="py-2 border-t border-linea first:border-0">
                <p className="text-[13px] font-bold uppercase tracking-wide text-humo">{obra} · {people.length}</p>
                {people.map(e => (
                  <div key={e.id} className="flex justify-between py-1">
                    <span className="font-semibold">{e.profiles?.full_name}</span>
                    <span className="text-humo">desde {fmtTime(e.clock_in)}</span>
                  </div>
                ))}
              </div>
            ))}
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => nav('/cuadrante')}>📅 Cuadrante semanal</Button>
          <Button variant="ghost" onClick={() => nav('/auditoria')}>🕵️ Auditoría</Button>
          <Button variant="ghost" onClick={() => nav('/clientes')}>Clientes</Button>
          <Button variant="ghost" onClick={() => nav('/empleados')}>Empleados</Button>
          <Button variant="ghost" onClick={() => nav('/obras')}>Obras</Button>
          <Button variant="ghost" onClick={() => nav('/informes')}>Informes</Button>
        </div>
      </div>
    </div>
  )
}

export default function Hoy() {
  const { isAdmin } = useAuth()
  return isAdmin ? <InicioAdmin /> : <HoyEmpleado />
}
