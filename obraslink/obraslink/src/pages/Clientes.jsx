import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Header, Card, Button, Empty, Loading, Modal, Field, Input, TextArea } from '../components/UI'
import { audit } from '../lib/helpers'

export default function Clientes() {
  const [clients, setClients] = useState(null)
  const [show, setShow] = useState(false)
  const [f, setF] = useState({ name: '', nif: '', phone: '', email: '', address: '', contact_person: '', notes: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const load = () => supabase.from('clients').select('*, jobs(id)').order('name').then(({ data }) => setClients(data ?? []))
  useEffect(() => { load() }, [])

  async function save(e) {
    e.preventDefault()
    const { data, error } = await supabase.from('clients').insert({
      name: f.name.trim(), nif: f.nif.trim() || null, phone: f.phone.trim() || null,
      email: f.email.trim() || null, address: f.address.trim() || null,
      contact_person: f.contact_person.trim() || null, notes: f.notes.trim() || null,
    }).select().single()
    if (!error) {
      await audit('crear_cliente', 'clients', data.id, { name: f.name })
      setShow(false); setF({ name: '', nif: '', phone: '', email: '', address: '', contact_person: '', notes: '' })
      load()
    }
  }

  if (clients === null) return <Loading />

  return (
    <div>
      <Header title="Clientes"
        right={<Button variant="ambar" className="!w-auto !min-h-[44px] px-4" onClick={() => setShow(true)}>+ Nuevo</Button>} />
      <div className="px-5 space-y-3">
        {clients.length === 0 && <Empty>Sin clientes todavía. Crea el primero.</Empty>}
        {clients.map(c => (
          <Card key={c.id}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-extrabold text-[17px]">{c.name}</p>
                {c.contact_person && <p className="text-humo text-[14px]">{c.contact_person}</p>}
                {c.address && <p className="text-humo text-[14px]">{c.address}</p>}
              </div>
              <span className="text-humo text-[13px] font-bold">{c.jobs?.length ?? 0} obra(s)</span>
            </div>
            <div className="flex gap-3 mt-3">
              {c.phone && <a href={`tel:${c.phone}`} className="font-bold text-casco underline underline-offset-4">Llamar</a>}
              {c.email && <a href={`mailto:${c.email}`} className="font-bold text-casco underline underline-offset-4">Email</a>}
            </div>
            {c.notes && <p className="mt-2 text-[14px] text-humo bg-hormigon rounded-xl p-3">Nota privada: {c.notes}</p>}
          </Card>
        ))}
      </div>

      <Modal open={show} onClose={() => setShow(false)} title="Nuevo cliente">
        <form onSubmit={save}>
          <Field label="Nombre o empresa"><Input value={f.name} onChange={set('name')} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CIF/NIF (opcional)"><Input value={f.nif} onChange={set('nif')} /></Field>
            <Field label="Teléfono"><Input type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
          </div>
          <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Dirección"><Input value={f.address} onChange={set('address')} /></Field>
          <Field label="Persona de contacto"><Input value={f.contact_person} onChange={set('contact_person')} /></Field>
          <Field label="Notas privadas"><TextArea value={f.notes} onChange={set('notes')} className="min-h-[80px]" /></Field>
          <Button type="submit">Guardar cliente</Button>
        </form>
      </Modal>
    </div>
  )
}
