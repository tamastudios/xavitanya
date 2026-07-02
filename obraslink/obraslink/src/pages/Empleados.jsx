import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Header, Card, Chip, Loading, Select, Input, Banner } from '../components/UI'
import { audit } from '../lib/helpers'

const ROLES = { admin: 'Administrador', encargado: 'Encargado', empleado: 'Empleado' }

export default function Empleados() {
  const [people, setPeople] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = () => supabase.from('profiles').select('*').order('full_name').then(({ data }) => setPeople(data ?? []))
  useEffect(() => { load() }, [])

  async function update(id, patch, action) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) return setMsg(error.message)
    await audit(action, 'profiles', id, patch)
    load()
  }

  if (people === null) return <Loading />

  return (
    <div>
      <Header title="Empleados" subtitle="Roles, tarifas y acceso" />
      <div className="px-5 space-y-3">
        <Banner tone="warn">
          Para dar de alta a alguien nuevo: Supabase → Authentication → Users → "Add user" (o "Invite"). Aparecerá aquí automáticamente como Empleado.
        </Banner>
        {msg && <Banner tone="danger">{msg}</Banner>}
        {people.map(p => (
          <Card key={p.id} className={!p.active ? 'opacity-50' : ''}>
            <div className="flex justify-between items-center">
              <p className="font-extrabold text-[17px]">{p.full_name || 'Sin nombre'}</p>
              <Chip tone={p.active ? 'ok' : 'danger'}>{p.active ? 'Activo' : 'Desactivado'}</Chip>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="block">
                <span className="text-[13px] font-bold text-humo">Rol</span>
                <Select value={p.role} onChange={e => update(p.id, { role: e.target.value }, 'cambiar_rol')}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </label>
              <label className="block">
                <span className="text-[13px] font-bold text-humo">Tarifa €/hora</span>
                <Input type="number" inputMode="decimal" step="0.5" defaultValue={p.hourly_rate ?? 0}
                  onBlur={e => Number(e.target.value) !== Number(p.hourly_rate) && update(p.id, { hourly_rate: Number(e.target.value) || 0 }, 'cambiar_tarifa')} />
              </label>
            </div>
            <button
              className={`mt-3 font-bold text-[14px] underline underline-offset-4 ${p.active ? 'text-senal' : 'text-casco'}`}
              onClick={() => update(p.id, { active: !p.active }, p.active ? 'desactivar_empleado' : 'activar_empleado')}>
              {p.active ? 'Desactivar acceso' : 'Reactivar acceso'}
            </button>
          </Card>
        ))}
      </div>
    </div>
  )
}
