import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Chip, Loading, Field, Input } from '../components/UI'
import { monthValue, monthLabel, monthRange, entryHours, fmtHours, fmtDate, fmtTime } from '../lib/helpers'

const ROLES = { admin: 'Administrador', encargado: 'Encargado', empleado: 'Empleado' }

export default function Perfil() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const [month, setMonth] = useState(monthValue())
  const [entries, setEntries] = useState(null)
  const [name, setName] = useState('')

  useEffect(() => { if (profile) setName(profile.full_name ?? '') }, [profile])

  useEffect(() => {
    const { from, to } = monthRange(month)
    supabase.from('time_entries')
      .select('id, clock_in, clock_out, break_minutes, jobs(name)')
      .eq('user_id', user.id).gte('clock_in', from).lt('clock_in', to)
      .order('clock_in', { ascending: false })
      .then(({ data }) => setEntries(data ?? []))
  }, [month, user.id])

  async function saveName() {
    if (name.trim() && name.trim() !== profile?.full_name) {
      await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user.id)
      refreshProfile()
    }
  }

  if (entries === null) return <Loading />
  const total = entries.filter(e => e.clock_out).reduce((s, e) => s + entryHours(e), 0)

  return (
    <div>
      <Header title="Mi perfil" right={<Chip tone="dark">{ROLES[profile?.role] ?? ''}</Chip>} />
      <div className="px-5 space-y-4">
        <Card>
          <Field label="Tu nombre">
            <Input value={name} onChange={e => setName(e.target.value)} onBlur={saveName} />
          </Field>
          <p className="text-humo text-[14px]">Sesión: {user.email}</p>
        </Card>

        <Card>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-extrabold">Mis horas</h3>
            <Chip tone="ok">{fmtHours(total)}</Chip>
          </div>
          <Field label="Mes"><Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></Field>
          {entries.length === 0 && <p className="text-humo">Sin fichajes en {monthLabel(month)}.</p>}
          {entries.map(e => (
            <div key={e.id} className="flex justify-between py-2 border-t border-linea text-[15px]">
              <div>
                <p className="font-semibold">{fmtDate(e.clock_in)} · {e.jobs?.name ?? 'Sin obra'}</p>
                <p className="text-humo text-[13px]">
                  {fmtTime(e.clock_in)} → {e.clock_out ? fmtTime(e.clock_out) : 'abierto'}
                  {e.break_minutes > 0 ? ` · ${e.break_minutes} min pausa` : ''}
                </p>
              </div>
              <span className="font-bold">{e.clock_out ? fmtHours(entryHours(e)) : '—'}</span>
            </div>
          ))}
        </Card>

        <Button variant="ghost" onClick={signOut}>Cerrar sesión</Button>
        <p className="text-humo text-[12px] text-center pb-2">ObrasLink · versión MVP 0.1</p>
      </div>
    </div>
  )
}
