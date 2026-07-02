import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Chip, Empty, Loading, Modal, Field, Input, Select, Banner } from '../components/UI'
import { UNITS, audit } from '../lib/helpers'

function Movimiento({ material, type, onClose, onDone, userId }) {
  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState('')
  const [qty, setQty] = useState('1')
  const [comment, setComment] = useState('')
  const [err, setErr] = useState(null)

  useEffect(() => {
    supabase.from('jobs').select('id, name, status').then(({ data }) => {
      const active = (data ?? []).filter(j => !['acabada','facturada','cobrada','archivada'].includes(j.status))
      setJobs(active)
      if (active[0]) setJobId(active[0].id)
    })
  }, [])

  async function save(e) {
    e.preventDefault()
    const q = Number(qty)
    if (!q || q <= 0) return setErr('Pon una cantidad válida.')
    if (type === 'salida' && q > Number(material.stock)) return setErr(`Solo quedan ${Number(material.stock)} ${material.unit} en stock.`)
    const { data, error } = await supabase.from('material_movements').insert({
      material_id: material.id, job_id: jobId || null, user_id: userId, type, quantity: q,
      from_location: type === 'salida' ? material.location : 'Obra',
      to_location: type === 'salida' ? 'Obra' : material.location,
      comment: comment.trim() || null,
    }).select().single()
    if (error) return setErr(error.message)
    await audit(type === 'salida' ? 'coger_material' : 'devolver_material', 'material_movements', data.id,
      { material: material.name, cantidad: q })
    onDone(); onClose()
  }

  const title = type === 'salida' ? `Coger: ${material.name}` : `Devolver: ${material.name}`
  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={save}>
        <p className="text-humo mb-4">Stock actual: <b className="text-grafito">{Number(material.stock)} {material.unit}</b> · {material.location}</p>
        <Field label={`Cantidad (${material.unit})`}>
          <Input type="number" inputMode="decimal" min="0.5" step="0.5" value={qty} onChange={e => setQty(e.target.value)} required />
        </Field>
        <Field label="¿Para qué obra?">
          <Select value={jobId} onChange={e => setJobId(e.target.value)}>
            <option value="">Sin obra concreta</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </Select>
        </Field>
        <Field label="Comentario (opcional)"><Input value={comment} onChange={e => setComment(e.target.value)} /></Field>
        {err && <div className="mb-4"><Banner tone="danger">{err}</Banner></div>}
        <Button type="submit" variant={type === 'salida' ? 'ambar' : 'ok'}>
          {type === 'salida' ? 'Registrar material cogido' : 'Registrar devolución'}
        </Button>
      </form>
    </Modal>
  )
}

function NuevoMaterial({ open, onClose, onDone }) {
  const [f, setF] = useState({ name: '', category: 'general', unit: 'unidad', stock: '0', min_stock: '0', location: 'Almacén principal', price: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.from('materials').insert({
      name: f.name.trim(), category: f.category, unit: f.unit,
      stock: Number(f.stock) || 0, min_stock: Number(f.min_stock) || 0,
      location: f.location.trim(), price: f.price ? Number(f.price) : 0,
    })
    if (!error) { onDone(); onClose() }
  }
  return (
    <Modal open={open} onClose={onClose} title="Nuevo material">
      <form onSubmit={save}>
        <Field label="Nombre"><Input value={f.name} onChange={set('name')} required placeholder="Ej: Saco de yeso 20kg" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría"><Input value={f.category} onChange={set('category')} /></Field>
          <Field label="Unidad">
            <Select value={f.unit} onChange={set('unit')}>{UNITS.map(u => <option key={u}>{u}</option>)}</Select>
          </Field>
          <Field label="Stock inicial"><Input type="number" inputMode="decimal" value={f.stock} onChange={set('stock')} /></Field>
          <Field label="Stock mínimo"><Input type="number" inputMode="decimal" value={f.min_stock} onChange={set('min_stock')} /></Field>
        </div>
        <Field label="Ubicación"><Input value={f.location} onChange={set('location')} placeholder="Almacén · Pasillo · Estantería" /></Field>
        <Field label="Precio aprox. (€)"><Input type="number" inputMode="decimal" step="0.01" value={f.price} onChange={set('price')} /></Field>
        <Button type="submit">Guardar material</Button>
      </form>
    </Modal>
  )
}

export default function Almacen() {
  const { user, isAdmin } = useAuth()
  const [materials, setMaterials] = useState(null)
  const [q, setQ] = useState('')
  const [move, setMove] = useState(null)      // { material, type }
  const [showNew, setShowNew] = useState(false)

  const load = () => supabase.from('materials').select('*').order('name').then(({ data }) => setMaterials(data ?? []))
  useEffect(() => { load() }, [])

  if (materials === null) return <Loading />
  const list = materials.filter(m =>
    m.name.toLowerCase().includes(q.toLowerCase()) || (m.category ?? '').toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <Header title="Almacén" subtitle="Registra lo que coges y lo que devuelves"
        right={isAdmin && <Button variant="ambar" className="!w-auto !min-h-[44px] px-4" onClick={() => setShowNew(true)}>+ Material</Button>} />
      <div className="px-5 space-y-3">
        <Input placeholder="Buscar material…" value={q} onChange={e => setQ(e.target.value)} />
        {list.length === 0 && <Empty>No hay materiales que coincidan.</Empty>}
        {list.map(m => {
          const low = Number(m.stock) <= Number(m.min_stock)
          return (
            <Card key={m.id}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-extrabold text-[16px]">{m.name}</p>
                  <p className="text-humo text-[13px]">{m.category} · {m.location}</p>
                </div>
                <Chip tone={low ? 'danger' : 'ok'}>{Number(m.stock)} {m.unit}</Chip>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Button variant="ambar" className="min-h-[48px] text-[15px]"
                  onClick={() => setMove({ material: m, type: 'salida' })}>Coger para obra</Button>
                <Button variant="ghost" className="min-h-[48px] text-[15px]"
                  onClick={() => setMove({ material: m, type: 'devolucion' })}>Devolver</Button>
              </div>
            </Card>
          )
        })}
      </div>

      {move && <Movimiento material={move.material} type={move.type} userId={user.id}
        onClose={() => setMove(null)} onDone={load} />}
      <NuevoMaterial open={showNew} onClose={() => setShowNew(false)} onDone={load} />
    </div>
  )
}
