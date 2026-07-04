import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Chip, Empty, Loading, Banner } from '../components/UI'
import { statusLabel, fmtTime, monthValue, monthRange, entryHours, fmtHours } from '../lib/helpers'

// ---------------- EMPLEADO ----------------
function HoyEmpleado() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [jobs, setJobs] = useState(null)
  const [open, setOpen] = useState(null)
  const [monthHours, setMonthHours] = useState(0)

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
    }
    load()
  }, [user.id])

  if (jobs === null) return <Loading />
  const today = jobs[0]

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

        <div className="grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => nav('/parte')}>Escribir parte del día</Button>
          <Button variant="ghost" onClick={() => nav('/almacen')}>Coger material</Button>
          <Button variant="ghost" onClick={() => nav('/factura')}>Mi parte mensual</Button>
          <Button variant="ghost" onClick={() => nav('/perfil')}>Mis horas: {fmtHours(monthHours)}</Button>
        </div>
      </div>
    </div>
  )
}

// ---------------- JEFE / ADMIN ----------------
function InicioAdmin() {
  const nav = useNavigate()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ count: activas }, { data: abiertos }, { count: partes }, { count: facturas }] =
        await Promise.all([
          supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'en_proceso'),
          supabase.from('time_entries').select('id, clock_in, profiles(full_name), jobs(name)').is('clock_out', null),
          supabase.from('daily_reports').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
          supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'enviado'),
        ])
      setStats({
        activas: activas ?? 0,
        abiertos: abiertos ?? [],
        partes: partes ?? 0,
        facturas: facturas ?? 0,
      })
    }
    load()
  }, [])

  if (!stats) return <Loading />

  const Num = ({ n, label, to }) => (
    <Card onClick={() => nav(to)} className="text-center">
      <p className="text-[30px] font-extrabold leading-none">{n}</p>
      <p className="text-humo text-[13px] font-semibold mt-1">{label}</p>
    </Card>
  )

  return (
    <div>
      <Header title="Inicio" subtitle="Resumen de la empresa"
        right={<Link to="/perfil" className="text-white/85 font-bold text-[15px] underline underline-offset-4">Perfil</Link>} />
      <div className="px-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Num n={stats.activas} label="Obras en proceso" to="/obras" />
          <Num n={stats.abiertos.length} label="Fichajes abiertos" to="/informes" />
          <Num n={stats.partes} label="Partes por revisar" to="/informes" />
        </div>

        {stats.facturas > 0 && (
          <Card onClick={() => nav('/informes')}>
            <Banner tone="warn">{stats.facturas} parte(s) mensual(es) de autónomos pendientes de aprobar</Banner>
          </Card>
        )}

        {stats.abiertos.length > 0 && (
          <Card>
            <h3 className="font-extrabold mb-2">Trabajando ahora</h3>
            {stats.abiertos.map(e => (
              <div key={e.id} className="flex justify-between py-2 border-t border-linea first:border-0">
                <span className="font-semibold">{e.profiles?.full_name}</span>
                <span className="text-humo">{e.jobs?.name ?? 'Sin obra'} · {fmtTime(e.clock_in)}</span>
              </div>
            ))}
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3">
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
