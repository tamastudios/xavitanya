import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Chip, Loading, Field, Select } from '../components/UI'
import { statusLabel, fmtDate, fmtEUR, fmtHours, entryHours, signedUrl, MOVEMENT_LABELS, TOOLS, audit } from '../lib/helpers'

export default function ObraDetalle() {
  const { id } = useParams()
  const { isAdmin, isStaff } = useAuth()
  const [job, setJob] = useState(null)
  const [assigned, setAssigned] = useState([])
  const [people, setPeople] = useState([])
  const [moves, setMoves] = useState([])
  const [reports, setReports] = useState([])
  const [photos, setPhotos] = useState([])
  const [hours, setHours] = useState(0)
  const [tools, setTools] = useState([])
  const [toolsSearch, setToolsSearch] = useState('')
  const [toolsRemoveSearch, setToolsRemoveSearch] = useState('')

  async function load() {
    const { data: j } = await supabase.from('jobs')
      .select('*, clients(name, phone)').eq('id', id).single()
    setJob(j)

    const { data: asg } = await supabase.from('job_assignments')
      .select('id, user_id, profiles(full_name)').eq('job_id', id)
    setAssigned(asg ?? [])

    if (isAdmin) {
      const { data: p } = await supabase.from('profiles').select('id, full_name').eq('active', true).order('full_name')
      setPeople(p ?? [])
    }

    const { data: mv } = await supabase.from('material_movements')
      .select('id, type, quantity, created_at, materials(name, unit, price), profiles(full_name)')
      .eq('job_id', id).order('created_at', { ascending: false })
    setMoves(mv ?? [])

    const { data: rp } = await supabase.from('daily_reports')
      .select('id, report_date, work_done, status, profiles(full_name)')
      .eq('job_id', id).order('report_date', { ascending: false }).limit(10)
    setReports(rp ?? [])

    const { data: te } = await supabase.from('time_entries')
      .select('clock_in, clock_out, break_minutes').eq('job_id', id).not('clock_out', 'is', null)
    setHours((te ?? []).reduce((s, e) => s + entryHours(e), 0))

    const { data: media } = await supabase.from('report_media')
      .select('path').eq('job_id', id).order('created_at', { ascending: false }).limit(12)
    const urls = await Promise.all((media ?? []).map(m => signedUrl(m.path)))
    setPhotos(urls.filter(Boolean))

    const { data: tls } = await supabase.from('job_tools')
      .select('id, tool_name').eq('job_id', id).order('tool_name')
    setTools(tls ?? [])
  }
  useEffect(() => { load() }, [id])

  if (!job) return <Loading />

  const matCost = moves.reduce((s, m) => {
    const cost = Number(m.quantity) * Number(m.materials?.price ?? 0)
    if (m.type === 'salida') return s + cost
    if (m.type === 'devolucion') return s - cost
    return s
  }, 0)

  async function assign(userId) {
    if (!userId) return
    await supabase.from('job_assignments').insert({ job_id: id, user_id: userId })
    await audit('asignar_empleado', 'job_assignments', id, { user_id: userId })
    load()
  }
  async function unassign(aid) {
    await supabase.from('job_assignments').delete().eq('id', aid)
    load()
  }

  async function addTool(toolName) {
    if (!toolName.trim()) return
    if (tools.some(t => t.tool_name.toLowerCase() === toolName.toLowerCase())) return
    await supabase.from('job_tools').insert({ job_id: id, tool_name: toolName })
    await audit('asignar_herramienta', 'job_tools', id, { tool: toolName })
    setToolsSearch('')
    load()
  }

  async function removeTool(toolId) {
    await supabase.from('job_tools').delete().eq('id', toolId)
    load()
  }

  return (
    <div>
      <Header title={job.name} subtitle={job.clients?.name} right={<Chip tone="dark">{statusLabel(job.status)}</Chip>} />
      <div className="px-5 space-y-4">
        <Card>
          {job.address && <p className="font-semibold">{job.address}</p>}
          {job.description && <p className="text-humo mt-2 text-[15px]">{job.description}</p>}
          <div className="flex gap-4 mt-3 text-[14px] text-humo">
            {job.start_date && <span>Inicio: {fmtDate(job.start_date)}</span>}
            {job.budget != null && isStaff && <span>Presupuesto: {fmtEUR(job.budget)}</span>}
          </div>
          <div className="mt-4">
            <Button variant="ghost" onClick={() =>
              window.open(job.maps_url || `https://maps.google.com/?q=${encodeURIComponent(job.address ?? job.name)}`, '_blank')}>
              Abrir en Maps
            </Button>
          </div>
        </Card>

        {isStaff && (
          <Card>
            <div className="flex justify-between"><h3 className="font-extrabold">Resumen</h3></div>
            <div className="grid grid-cols-2 gap-3 mt-2 text-center">
              <div><p className="text-[24px] font-extrabold">{fmtHours(hours)}</p><p className="text-humo text-[13px]">Horas trabajadas</p></div>
              <div><p className="text-[24px] font-extrabold">{fmtEUR(matCost)}</p><p className="text-humo text-[13px]">Material gastado (aprox.)</p></div>
            </div>
          </Card>
        )}

        <Card>
          <h3 className="font-extrabold mb-2">Equipo asignado</h3>
          {assigned.map(a => (
            <div key={a.id} className="flex justify-between items-center py-2 border-t border-linea first:border-0">
              <span className="font-semibold">{a.profiles?.full_name}</span>
              {isAdmin && <button onClick={() => unassign(a.id)} className="text-senal text-[14px] font-bold">Quitar</button>}
            </div>
          ))}
          {assigned.length === 0 && <p className="text-humo">Nadie asignado todavía.</p>}
          {isAdmin && (
            <div className="mt-3">
              <Field label="Añadir empleado">
                <Select defaultValue="" onChange={e => { assign(e.target.value); e.target.value = '' }}>
                  <option value="" disabled>Elige a alguien…</option>
                  {people.filter(p => !assigned.some(a => a.user_id === p.id))
                    .map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </Select>
              </Field>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-extrabold mb-2">Herramientas</h3>
          {isAdmin && (
            <div className="mb-3 space-y-2">
              <input
                type="text"
                placeholder="Buscar herramienta para quitar…"
                value={toolsRemoveSearch}
                onChange={e => setToolsRemoveSearch(e.target.value)}
                className="w-full px-3 py-2 border border-linea rounded-lg text-[15px]"
              />
              {toolsRemoveSearch && (
                <div className="bg-fondo-2 rounded-lg border border-linea max-h-48 overflow-y-auto">
                  {tools.filter(t =>
                    t.tool_name.toLowerCase().includes(toolsRemoveSearch.toLowerCase())
                  ).map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => { removeTool(tool.id); setToolsRemoveSearch('') }}
                      className="w-full text-left px-3 py-2 hover:bg-linea text-[15px] border-b border-linea last:border-0 flex justify-between items-center"
                    >
                      <span>{tool.tool_name}</span>
                      <span className="text-senal font-bold">Quitar</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {tools.filter(t =>
            !toolsRemoveSearch || t.tool_name.toLowerCase().includes(toolsRemoveSearch.toLowerCase())
          ).map(t => (
            <div key={t.id} className="flex justify-between items-center py-2 border-t border-linea first:border-0">
              <span className="font-semibold">{t.tool_name}</span>
              {isAdmin && !toolsRemoveSearch && <button onClick={() => removeTool(t.id)} className="text-senal text-[14px] font-bold">Quitar</button>}
            </div>
          ))}
          {tools.length === 0 && <p className="text-humo">Sin herramientas asignadas.</p>}
          {isAdmin && (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                placeholder="Buscar herramienta para añadir…"
                value={toolsSearch}
                onChange={e => setToolsSearch(e.target.value)}
                className="w-full px-3 py-2 border border-linea rounded-lg text-[15px]"
              />
              {toolsSearch && (
                <div className="bg-fondo-2 rounded-lg border border-linea max-h-48 overflow-y-auto">
                  {TOOLS.filter(t =>
                    t.toLowerCase().includes(toolsSearch.toLowerCase()) &&
                    !tools.some(jt => jt.tool_name.toLowerCase() === t.toLowerCase())
                  ).map(tool => (
                    <button
                      key={tool}
                      onClick={() => addTool(tool)}
                      className="w-full text-left px-3 py-2 hover:bg-linea text-[15px] border-b border-linea last:border-0"
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-extrabold mb-2">Materiales de la obra</h3>
          {moves.map(m => (
            <div key={m.id} className="py-2 border-t border-linea first:border-0">
              <div className="flex justify-between">
                <span className="font-semibold">{m.materials?.name}</span>
                <span className="font-bold">{Number(m.quantity)} {m.materials?.unit}</span>
              </div>
              <p className="text-humo text-[13px]">{MOVEMENT_LABELS[m.type]} · {m.profiles?.full_name} · {fmtDate(m.created_at)}</p>
            </div>
          ))}
          {moves.length === 0 && <p className="text-humo">Sin movimientos de material.</p>}
        </Card>

        <Card>
          <h3 className="font-extrabold mb-2">Últimos partes diarios</h3>
          {reports.map(r => (
            <div key={r.id} className="py-2 border-t border-linea first:border-0">
              <div className="flex justify-between items-center">
                <span className="font-semibold">{r.profiles?.full_name} · {fmtDate(r.report_date)}</span>
                <Chip tone={r.status === 'aprobado' ? 'ok' : r.status === 'rechazado' ? 'danger' : 'warn'}>{r.status}</Chip>
              </div>
              <p className="text-humo text-[14px] mt-1 line-clamp-2">{r.work_done}</p>
            </div>
          ))}
          {reports.length === 0 && <p className="text-humo">Sin partes todavía.</p>}
        </Card>

        {photos.length > 0 && (
          <Card>
            <h3 className="font-extrabold mb-3">Fotos de la obra</h3>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt={`Foto de obra ${i + 1}`} className="w-full aspect-square object-cover rounded-xl border border-linea" />
                </a>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
