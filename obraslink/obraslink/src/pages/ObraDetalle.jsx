import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Chip, Loading, Field, Select, Input, Modal } from '../components/UI'
import { statusLabel, fmtDate, fmtEUR, fmtHours, entryHours, signedUrl, MOVEMENT_LABELS, TOOLS, JOB_STATUSES, audit } from '../lib/helpers'

export default function ObraDetalle() {
  const { id } = useParams()
  const { user, isAdmin, isStaff } = useAuth()
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
  const [materials, setMaterials] = useState([])
  const [materialsInJob, setMaterialsInJob] = useState([])
  const [showAddMaterial, setShowAddMaterial] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [materialQty, setMaterialQty] = useState('1')
  const [materialError, setMaterialError] = useState('')
  const [removingMaterialId, setRemovingMaterialId] = useState(null)
  const [removeQty, setRemoveQty] = useState('1')
  const [label, setLabel] = useState('')
  const [labelSaved, setLabelSaved] = useState(false)

  async function load() {
    const { data: j } = await supabase.from('jobs')
      .select('*, clients(name, phone)').eq('id', id).single()
    setJob(j)
    setLabel(j?.label ?? '')

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

    const { data: mat } = await supabase.from('materials').select('id, name, unit, stock').order('name')
    setMaterials(mat ?? [])

    const { data: jobMat } = await supabase.from('material_movements')
      .select('id, material_id, quantity, materials(id, name, unit)')
      .eq('job_id', id)
      .in('type', ['salida'])
      .order('created_at', { ascending: false })

    const grouped = {}
    jobMat?.forEach(m => {
      const key = m.material_id
      if (!grouped[key]) grouped[key] = { ...m, totalQty: 0 }
      grouped[key].totalQty += Number(m.quantity)
    })
    setMaterialsInJob(Object.values(grouped))
  }
  useEffect(() => { load() }, [id])

  async function saveLabel() {
    await supabase.from('jobs').update({ label: label.trim() || null }).eq('id', id)
    await audit('editar_etiqueta_obra', 'jobs', id, { label: label.trim() })
    setLabelSaved(true)
    setTimeout(() => setLabelSaved(false), 2000)
  }

  async function changeStatus(newStatus) {
    await supabase.from('jobs').update({ status: newStatus }).eq('id', id)
    await audit('cambiar_estado_obra', 'jobs', id, { de: job.status, a: newStatus })
    load()
  }

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
    const { error } = await supabase.from('job_tools').insert({ job_id: id, tool_name: toolName })
    if (error) { alert('No se pudo añadir la herramienta: ' + error.message); return }
    await audit('asignar_herramienta', 'job_tools', id, { tool: toolName })
    setToolsSearch('')
    load()
  }

  async function removeTool(toolId) {
    const { error } = await supabase.from('job_tools').delete().eq('id', toolId)
    if (error) { alert('No se pudo quitar la herramienta: ' + error.message); return }
    load()
  }

  async function addMaterial() {
    setMaterialError('')
    if (!selectedMaterial) return
    const mat = materials.find(m => m.id === selectedMaterial)
    if (!mat) return
    const qty = Number(materialQty)
    if (qty <= 0) {
      setMaterialError('La cantidad debe ser mayor a 0')
      return
    }
    if (qty > Number(mat.stock)) {
      setMaterialError(`Solo hay ${mat.stock} ${mat.unit} disponibles`)
      return
    }

    const { error } = await supabase.from('material_movements').insert({
      material_id: selectedMaterial,
      job_id: id,
      user_id: user.id,
      type: 'salida',
      quantity: qty,
      from_location: 'Almacén',
      to_location: 'Obra'
    })

    if (error) {
      setMaterialError(error.message)
      return
    }

    await audit('coger_material_obra', 'material_movements', id, { material: mat.name, cantidad: qty })
    setShowAddMaterial(false)
    setSelectedMaterial('')
    setMaterialQty('1')
    load()
  }

  async function returnMaterial() {
    if (!removingMaterialId) return
    const mat = materialsInJob.find(m => m.material_id === removingMaterialId)
    if (!mat) return
    const qty = Number(removeQty)
    if (qty <= 0 || qty > mat.totalQty) return

    const { error } = await supabase.from('material_movements').insert({
      material_id: removingMaterialId,
      job_id: id,
      user_id: user.id,
      type: 'devolucion',
      quantity: qty,
      from_location: 'Obra',
      to_location: 'Almacén'
    })

    if (!error) {
      await audit('devolver_material_obra', 'material_movements', id, { material: mat.materials?.name, cantidad: qty })
      setRemovingMaterialId(null)
      setRemoveQty('1')
      load()
    }
  }

  return (
    <div>
      <Header title={job.name} subtitle={job.clients?.name} right={<Chip tone="dark">{statusLabel(job.status)}</Chip>} />
      <div className="px-5 space-y-4">
        <Card>
          {job.label && (
            <div className="mb-2">
              <span className="inline-block bg-grafito text-white text-[13px] font-bold px-3 py-1 rounded-full">{job.label}</span>
            </div>
          )}
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

        {isAdmin && (
          <Card>
            <h3 className="font-extrabold mb-3">Gestión de la obra</h3>
            <Field label="Etiqueta">
              <div className="flex gap-2">
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej: Rasa, Urgente, Pladur…" />
                <Button variant="ambar" className="!w-auto px-4" onClick={saveLabel}>
                  {labelSaved ? '✓' : 'Guardar'}
                </Button>
              </div>
            </Field>
            <Field label="Estado de la obra">
              <Select value={job.status} onChange={e => changeStatus(e.target.value)}>
                {JOB_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
          </Card>
        )}

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
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-extrabold">Materiales en obra</h3>
            <Button variant="ambar" className="!w-auto !min-h-[40px] px-3 text-[13px]" onClick={() => setShowAddMaterial(true)}>+ Coger</Button>
          </div>
          {materialsInJob.map(m => (
            <div key={m.material_id} className="py-3 border-t border-linea first:border-0">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{m.materials?.name}</p>
                  <p className="text-[13px] text-humo">{m.totalQty} {m.materials?.unit} en obra</p>
                </div>
                <button onClick={() => setRemovingMaterialId(m.material_id)} className="text-[13px] font-bold text-senal hover:underline">
                  Devolver
                </button>
              </div>
            </div>
          ))}
          {materialsInJob.length === 0 && <p className="text-humo">Sin materiales en la obra.</p>}
        </Card>

        <Card>
          <h3 className="font-extrabold mb-2">Historial de movimientos</h3>
          {moves.map(m => (
            <div key={m.id} className="py-2 border-t border-linea first:border-0">
              <div className="flex justify-between">
                <span className="font-semibold">{m.materials?.name}</span>
                <span className="font-bold">{Number(m.quantity)} {m.materials?.unit}</span>
              </div>
              <p className="text-humo text-[13px]">{MOVEMENT_LABELS[m.type]} · {m.profiles?.full_name} · {fmtDate(m.created_at)}</p>
            </div>
          ))}
          {moves.length === 0 && <p className="text-humo">Sin movimientos.</p>}
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

      {showAddMaterial && (
        <Modal open onClose={() => { setShowAddMaterial(false); setMaterialError('') }} title="Coger material para la obra">
          <form onSubmit={e => { e.preventDefault(); addMaterial() }}>
            <Field label="Material">
              <Select value={selectedMaterial} onChange={e => { setSelectedMaterial(e.target.value); setMaterialError('') }} required>
                <option value="">Elige un material…</option>
                {materials.filter(m => Number(m.stock) > 0 && !materialsInJob.some(jm => jm.material_id === m.id)).map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({Number(m.stock)} {m.unit})</option>
                ))}
              </Select>
            </Field>
            <Field label="Cantidad">
              <Input type="number" inputMode="decimal" min="0.5" step="0.5" value={materialQty} onChange={e => { setMaterialQty(e.target.value); setMaterialError('') }} required />
            </Field>
            {materialError && <div className="mb-3 p-3 bg-senal/10 border border-senal rounded-lg text-senal text-[14px]">{materialError}</div>}
            <Button type="submit" variant="ambar">Coger material</Button>
          </form>
        </Modal>
      )}

      {removingMaterialId && (
        <Modal open onClose={() => { setRemovingMaterialId(null); setRemoveQty('1') }} title="Devolver material">
          <form onSubmit={e => { e.preventDefault(); returnMaterial() }}>
            {(() => {
              const mat = materialsInJob.find(m => m.material_id === removingMaterialId)
              return (
                <>
                  <p className="mb-4 text-humo">
                    <span className="font-semibold text-grafito">{mat?.materials?.name}</span><br/>
                    Disponible para devolver: <span className="font-bold">{mat?.totalQty} {mat?.materials?.unit}</span>
                  </p>
                  <Field label="Cantidad a devolver">
                    <Input type="number" inputMode="decimal" min="0.5" step="0.5" max={mat?.totalQty} value={removeQty} onChange={e => setRemoveQty(e.target.value)} required />
                  </Field>
                  <Button type="submit" variant="ok">Devolver material</Button>
                </>
              )
            })()}
          </form>
        </Modal>
      )}
    </div>
  )
}
