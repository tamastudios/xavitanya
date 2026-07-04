import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Chip, Empty, Loading, Modal, Field, Input, Select, TextArea, Banner } from '../components/UI'
import { JOB_STATUSES, statusLabel, audit } from '../lib/helpers'

const KANBAN = ['presupuesto_pendiente','presupuesto_aceptado','en_preparacion','en_proceso','pausada','pendiente_revision','acabada','facturada']

// Color identificativo de cada estado del tablero
const STATUS_COLOR = {
  presupuesto_pendiente: '#f5b301',
  presupuesto_aceptado: '#8b5cf6',
  en_preparacion: '#0ea5e9',
  en_proceso: '#1f7a5c',
  pausada: '#f97316',
  pendiente_revision: '#eab308',
  acabada: '#16a34a',
  facturada: '#64748b',
}

function NuevaObra({ open, onClose, onSaved }) {
  const [clients, setClients] = useState([])
  const [err, setErr] = useState(null)
  const [f, setF] = useState({ name: '', client_id: '', address: '', description: '', status: 'presupuesto_pendiente', priority: 'normal', budget: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    if (open) supabase.from('clients').select('id, name').order('name').then(({ data }) => setClients(data ?? []))
  }, [open])

  async function save(e) {
    e.preventDefault()
    setErr(null)
    const { data, error } = await supabase.from('jobs').insert({
      name: f.name.trim(), client_id: f.client_id || null, address: f.address.trim() || null,
      description: f.description.trim() || null, status: f.status, priority: f.priority,
      budget: f.budget ? Number(f.budget) : null,
    }).select().single()
    if (error) return setErr('No se pudo crear la obra: ' + error.message)
    await audit('crear_obra', 'jobs', data.id, { name: f.name })
    onSaved(); onClose()
    setF({ name: '', client_id: '', address: '', description: '', status: 'presupuesto_pendiente', priority: 'normal', budget: '' })
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva obra">
      <form onSubmit={save}>
        <Field label="Nombre de la obra"><Input value={f.name} onChange={set('name')} placeholder="Ej: Reforma baño · Cliente García" required /></Field>
        <Field label="Cliente">
          <Select value={f.client_id} onChange={set('client_id')}>
            <option value="">Sin cliente</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Dirección"><Input value={f.address} onChange={set('address')} placeholder="Calle, número, ciudad" /></Field>
        <Field label="Descripción del trabajo"><TextArea value={f.description} onChange={set('description')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estado">
            <Select value={f.status} onChange={set('status')}>
              {JOB_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Prioridad">
            <Select value={f.priority} onChange={set('priority')}>
              <option value="baja">Baja</option><option value="normal">Normal</option>
              <option value="alta">Alta</option><option value="urgente">Urgente</option>
            </Select>
          </Field>
        </div>
        <Field label="Presupuesto estimado (€)"><Input type="number" inputMode="decimal" value={f.budget} onChange={set('budget')} /></Field>
        {err && <div className="mb-4"><Banner tone="danger">{err}</Banner></div>}
        <Button type="submit">Crear obra</Button>
      </form>
    </Modal>
  )
}

export default function Obras() {
  const { user, isAdmin, isStaff } = useAuth()
  const nav = useNavigate()
  const [jobs, setJobs] = useState(null)
  const [view, setView] = useState('kanban')
  const [showNew, setShowNew] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState('en_proceso')

  async function load() {
    if (isStaff) {
      const { data } = await supabase.from('jobs')
        .select('id, name, address, status, priority, label, clients(name)').order('created_at', { ascending: false })
      setJobs(data ?? [])
    } else {
      const { data } = await supabase.from('job_assignments')
        .select('jobs(id, name, address, status, priority, label)').eq('user_id', user.id)
      setJobs((data ?? []).map(a => a.jobs).filter(Boolean))
    }
  }
  useEffect(() => { load() }, [user.id, isStaff])

  async function move(job, newStatus) {
    await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id)
    await audit('cambiar_estado_obra', 'jobs', job.id, { de: job.status, a: newStatus })
    load()
  }

  async function deleteJob(jobId, jobName) {
    if (!confirm(`¿Eliminar la obra "${jobName}"? Se borrará todo lo relacionado. No se puede deshacer.`)) return
    const { error } = await supabase.from('jobs').delete().eq('id', jobId)
    if (error) {
      alert('No se pudo eliminar la obra. Puede que tenga fichajes o datos asociados.\n\nDetalle: ' + error.message)
      return
    }
    await audit('eliminar_obra', 'jobs', jobId, { name: jobName })
    load()
  }

  if (jobs === null) return <Loading />

  const prioTone = (p) => p === 'urgente' ? 'danger' : p === 'alta' ? 'warn' : 'neutral'

  const JobCard = ({ j, compact }) => (
    <Card onClick={() => nav(`/obras/${j.id}`)}
      className={compact ? 'min-w-[240px]' : ''}>
      {!compact && <div className="-mx-4 -mt-4 mb-3 h-1.5 rounded-t-tarjeta" style={{ background: STATUS_COLOR[j.status] ?? '#64748b' }} />}
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-[16px] leading-snug">{j.name}</p>
          {j.clients?.name && <p className="text-humo text-[14px] mt-0.5">{j.clients.name}</p>}
          {j.address && <p className="text-humo text-[13px] mt-0.5 truncate">{j.address}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {j.label && <Chip tone="dark">{j.label}</Chip>}
          {j.priority !== 'normal' && <Chip tone={prioTone(j.priority)}>{j.priority}</Chip>}
        </div>
      </div>
      {!compact && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[j.status] ?? '#64748b' }} />
          <span className="text-[13px] font-bold text-humo">{statusLabel(j.status)}</span>
        </div>
      )}
      {isAdmin && compact && (
        <>
          <select className="mt-3 w-full rounded-lg border border-linea bg-hormigon px-2 py-2 text-[13px] font-semibold"
            value={j.status} onClick={e => e.stopPropagation()} onChange={e => move(j, e.target.value)}>
            {JOB_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={e => { e.stopPropagation(); deleteJob(j.id, j.name) }}
            className="mt-2 w-full px-3 py-2 text-[13px] font-bold text-senal hover:bg-senal/10 rounded-lg">
            Eliminar
          </button>
        </>
      )}
      {isAdmin && !compact && (
        <button onClick={e => { e.stopPropagation(); deleteJob(j.id, j.name) }}
          className="mt-3 w-full px-3 py-2 text-[14px] font-bold text-senal hover:bg-senal/10 rounded-lg">
          Eliminar
        </button>
      )}
    </Card>
  )

  return (
    <div>
      <Header title="Obras"
        right={isAdmin && <Button variant="ambar" className="!w-auto !min-h-[44px] px-4" onClick={() => setShowNew(true)}>+ Nueva</Button>} />

      {isStaff && (
        <div className="px-5 mb-4">
          <div className="flex bg-columna rounded-full p-1 w-full max-w-[280px]">
            {['kanban', 'lista'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`flex-1 px-5 py-2.5 rounded-full text-[14px] font-bold transition ${view === v ? 'bg-grafito text-white shadow-tarjeta' : 'text-humo'}`}>
                {v === 'kanban' ? 'Tablero' : 'Lista'}
              </button>
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && <Empty>Todavía no hay obras{isAdmin ? '. Crea la primera con el botón "+ Nueva".' : ' asignadas a ti.'}</Empty>}

      {isStaff && view === 'kanban' ? (
        <>
          {/* Tablero móvil: píldoras de estado deslizables + columna activa */}
          <div className="md:hidden overflow-x-auto no-scrollbar mb-3">
            <div className="flex gap-2 px-5 w-max">
              {KANBAN.map(st => {
                const count = jobs.filter(j => j.status === st).length
                const active = selectedStatus === st
                return (
                  <button key={st} onClick={() => setSelectedStatus(st)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-bold whitespace-nowrap border transition ${active ? 'bg-grafito text-white border-grafito shadow-tarjeta' : 'bg-papel text-humo border-linea'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[st] }} />
                    {statusLabel(st)}
                    <span className={`min-w-[20px] text-center rounded-full px-1.5 py-0.5 text-[11px] ${active ? 'bg-white/20 text-white' : 'bg-columna text-humo'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="md:hidden px-5 pb-4 anim-aparecer" key={selectedStatus}>
            <div className="rounded-2xl bg-columna p-3 border-t-4" style={{ borderTopColor: STATUS_COLOR[selectedStatus] }}>
              <p className="font-extrabold text-[14px] mb-2 px-1 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[selectedStatus] }} />
                  {statusLabel(selectedStatus)}
                </span>
                <span className="text-humo">{jobs.filter(j => j.status === selectedStatus).length} obra(s)</span>
              </p>
              <div className="space-y-3">
                {jobs.filter(j => j.status === selectedStatus).map(j => <JobCard key={j.id} j={j} compact />)}
                {jobs.filter(j => j.status === selectedStatus).length === 0 && (
                  <div className="rounded-tarjeta border-2 border-dashed border-linea py-10 text-center text-humo text-[14px] bg-papel/40">
                    No hay obras en este estado
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tablero escritorio: columnas con fondo */}
          <div className="hidden md:block overflow-x-auto pb-4">
            <div className="flex gap-3 px-5 w-max items-start">
              {KANBAN.map(st => {
                const col = jobs.filter(j => j.status === st)
                return (
                  <div key={st} className="w-[270px] rounded-2xl bg-columna p-3 border-t-4" style={{ borderTopColor: STATUS_COLOR[st] }}>
                    <p className="font-extrabold text-[14px] mb-2 px-1 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[st] }} />
                      {statusLabel(st)} <span className="text-humo font-bold">({col.length})</span>
                    </p>
                    <div className="space-y-3">
                      {col.map(j => <JobCard key={j.id} j={j} compact />)}
                      {col.length === 0 && <div className="rounded-tarjeta border-2 border-dashed border-linea h-16 bg-papel/40" />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="px-5 space-y-3">
          {jobs.map(j => <JobCard key={j.id} j={j} />)}
        </div>
      )}

      <NuevaObra open={showNew} onClose={() => setShowNew(false)} onSaved={load} />
    </div>
  )
}
