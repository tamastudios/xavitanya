import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Header, Card, Button, Field, Select, Input, Loading, Empty } from '../components/UI'
import { AUDIT_LABELS, auditLabel, fmtTime, fmtDate } from '../lib/helpers'

const PAGE = 50

// Traducir el detalle guardado (JSON) a texto legible
function detailText(details) {
  if (!details || typeof details !== 'object') return null
  const parts = []
  for (const [k, v] of Object.entries(details)) {
    if (v == null || v === '') continue
    const key = { de: 'de', a: 'a', name: 'nombre', job_id: 'obra', user_id: 'empleado',
      fotos: 'fotos', tool: 'herramienta', material: 'material', cantidad: 'cantidad',
      label: 'etiqueta', kind: 'tipo', date: 'fecha', hours: 'horas', userId: 'empleado', jobId: 'obra' }[k] ?? k
    parts.push(`${key}: ${String(v)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function Auditoria() {
  const [logs, setLogs] = useState(null)
  const [people, setPeople] = useState([])
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').order('full_name')
      .then(({ data }) => setPeople(data ?? []))
  }, [])

  async function load(p = 0) {
    if (p === 0) setLogs(null)
    let q = supabase.from('audit_logs')
      .select('id, action, table_name, record_id, details, created_at, profiles(full_name)')
      .order('created_at', { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE) // pedimos 1 de más para saber si hay siguiente página
    if (filterUser) q = q.eq('user_id', filterUser)
    if (filterAction) q = q.eq('action', filterAction)
    if (filterDate) {
      q = q.gte('created_at', `${filterDate}T00:00:00`).lt('created_at', `${filterDate}T23:59:59.999`)
    }
    const { data } = await q
    const rows = data ?? []
    setHasMore(rows.length > PAGE)
    const pageRows = rows.slice(0, PAGE)
    setLogs(prev => (p === 0 ? pageRows : [...(prev ?? []), ...pageRows]))
    setPage(p)
  }
  useEffect(() => { load(0) }, [filterUser, filterAction, filterDate])

  // Agrupar por día para leerlo mejor
  const byDay = {}
  for (const l of logs ?? []) {
    const day = fmtDate(l.created_at)
    byDay[day] ??= []
    byDay[day].push(l)
  }

  return (
    <div>
      <Header title="Auditoría" subtitle="Quién hizo qué y cuándo" />
      <div className="px-5 space-y-4">
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Persona">
              <Select value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                <option value="">Todas</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Acción">
              <Select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(AUDIT_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Día concreto (opcional)">
            <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
          </Field>
          {(filterUser || filterAction || filterDate) && (
            <button onClick={() => { setFilterUser(''); setFilterAction(''); setFilterDate('') }}
              className="text-[14px] font-bold text-humo underline underline-offset-2">Quitar filtros</button>
          )}
        </Card>

        {logs === null && <Loading />}
        {logs?.length === 0 && <Card><Empty>No hay actividad con esos filtros.</Empty></Card>}

        {Object.entries(byDay).map(([day, rows]) => (
          <div key={day}>
            <p className="text-humo text-[13px] font-bold uppercase tracking-wide mb-2 px-1">{day}</p>
            <Card>
              {rows.map(l => {
                const detail = detailText(l.details)
                return (
                  <div key={l.id} className="py-2.5 border-t border-linea first:border-0">
                    <div className="flex justify-between items-start gap-3">
                      <p className="text-[15px]">
                        <span className="font-bold">{l.profiles?.full_name ?? 'Alguien'}</span>{' '}
                        <span>{auditLabel(l.action).toLowerCase()}</span>
                      </p>
                      <span className="text-humo text-[13px] whitespace-nowrap">{fmtTime(l.created_at)}</span>
                    </div>
                    {detail && <p className="text-humo text-[13px] mt-0.5 break-words">{detail}</p>}
                  </div>
                )
              })}
            </Card>
          </div>
        ))}

        {hasMore && logs && (
          <Button variant="ghost" onClick={() => load(page + 1)}>Cargar más actividad</Button>
        )}
      </div>
    </div>
  )
}
