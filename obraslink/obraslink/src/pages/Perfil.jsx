import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Chip, Loading, Field, Input, Banner } from '../components/UI'
import { monthValue, monthLabel, monthRange, entryHours, fmtHours, fmtDate, fmtTime, audit } from '../lib/helpers'

const ROLES = { admin: 'Administrador', encargado: 'Encargado', empleado: 'Empleado' }

export default function Perfil() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const [month, setMonth] = useState(monthValue())
  const [entries, setEntries] = useState(null)
  const [name, setName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [pinMsg, setPinMsg] = useState(null)

  useEffect(() => { if (profile) setName(profile.full_name ?? '') }, [profile])

  function loadEntries() {
    const { from, to } = monthRange(month)
    supabase.from('time_entries')
      .select('id, clock_in, clock_out, break_minutes, jobs(name)')
      .eq('user_id', user.id).gte('clock_in', from).lt('clock_in', to)
      .order('clock_in', { ascending: false })
      .then(({ data }) => setEntries(data ?? []))
  }
  useEffect(() => { loadEntries() }, [month, user.id])

  async function deleteEntry(id) {
    if (!confirm('¿Borrar este fichaje? No se puede deshacer.')) return
    const { error } = await supabase.from('time_entries').delete().eq('id', id)
    if (error) { alert('No se pudo borrar: ' + error.message); return }
    await audit('borrar_fichaje', 'time_entries', id)
    loadEntries()
  }

  async function saveName() {
    if (name.trim() && name.trim() !== profile?.full_name) {
      await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user.id)
      refreshProfile()
    }
  }

  async function changePin(e) {
    e.preventDefault()
    setPinMsg(null)
    if (!/^\d{4}$/.test(newPin)) return setPinMsg({ tone: 'danger', text: 'El PIN debe ser de 4 números.' })
    const { error } = await supabase.auth.updateUser({ password: newPin })
    if (error) return setPinMsg({ tone: 'danger', text: 'No se pudo cambiar el PIN: ' + error.message })
    setNewPin('')
    setPinMsg({ tone: 'ok', text: 'PIN cambiado. Úsalo la próxima vez que entres.' })
  }

  if (entries === null) return <Loading />
  const total = entries.filter(e => e.clock_out).reduce((s, e) => s + entryHours(e), 0)

  return (
    <div>
      <Header title="Mi perfil" right={<Chip tone="claro">{ROLES[profile?.role] ?? ''}</Chip>} />
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
            <div key={e.id} className="flex justify-between items-center gap-3 py-2 border-t border-linea text-[15px]">
              <div className="min-w-0">
                <p className="font-semibold">{fmtDate(e.clock_in)} · {e.jobs?.name ?? 'Sin obra'}</p>
                <p className="text-humo text-[13px]">
                  {fmtTime(e.clock_in)} → {e.clock_out ? fmtTime(e.clock_out) : 'abierto'}
                  {e.break_minutes > 0 ? ` · ${e.break_minutes} min pausa` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold">{e.clock_out ? fmtHours(entryHours(e)) : '—'}</span>
                <button onClick={() => deleteEntry(e.id)} className="text-senal text-[13px] font-bold">Borrar</button>
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <h3 className="font-extrabold mb-3">Cambiar PIN</h3>
          <form onSubmit={changePin}>
            <Field label="Nuevo PIN (4 números)">
              <Input type="tel" maxLength="4" autoComplete="off" value={newPin} placeholder="0000"
                onChange={e => setNewPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} />
            </Field>
            {pinMsg && <div className="mb-4"><Banner tone={pinMsg.tone}>{pinMsg.text}</Banner></div>}
            <Button type="submit" variant="ghost" disabled={newPin.length !== 4}>Guardar nuevo PIN</Button>
          </form>
        </Card>

        <Button variant="ghost" onClick={signOut}>Cerrar sesión</Button>
        <p className="text-humo text-[12px] text-center pb-2">Xavi Tanya Serveis Integrals · versión MVP 0.1</p>
      </div>
    </div>
  )
}
