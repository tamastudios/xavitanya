import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Header, Card, Chip, Loading, Field, Input, Select, Button, Modal, Banner } from '../components/UI'
import { monthValue, monthLabel, monthRange, entryHours, fmtHours, fmtEUR, fmtDate, audit, startOfWeek, toDateStr, signedUrl } from '../lib/helpers'

export default function Informes() {
  const [month, setMonth] = useState(monthValue())
  const [data, setData] = useState(null)
  const [employees, setEmployees] = useState([])
  const [selectedEmp, setSelectedEmp] = useState('')
  const [jobsList, setJobsList] = useState([])
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState({ userId: '', jobId: '', date: '', hours: '' })
  const [manualMsg, setManualMsg] = useState(null)
  const [openReport, setOpenReport] = useState(null)
  const [reportPhotos, setReportPhotos] = useState([])

  async function load() {
    setData(null)
    const { from, to } = monthRange(month)
    // Límites del mes para columnas de tipo fecha (report_date)
    const [yy, mm] = month.split('-').map(Number)
    const monthStart = `${month}-01`
    const monthEnd = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`
    const [{ data: entries }, { data: reports }, { data: allReports }, { data: invoices }, { data: emps }, { data: jobs }] = await Promise.all([
      supabase.from('time_entries')
        .select('user_id, job_id, clock_in, clock_out, break_minutes, profiles(full_name), jobs(name, clients(name))')
        .gte('clock_in', from).lt('clock_in', to).not('clock_out', 'is', null),
      supabase.from('daily_reports')
        .select('id, report_date, work_done, status, profiles!daily_reports_user_id_fkey(full_name), jobs(name)')
        .eq('status', 'pendiente').order('report_date', { ascending: false }),
      supabase.from('daily_reports')
        .select('id, user_id, report_date, work_done, incidents, status, profiles!daily_reports_user_id_fkey(full_name), jobs(name)')
        .gte('report_date', monthStart).lt('report_date', monthEnd)
        .order('report_date', { ascending: false }),
      supabase.from('invoices').select('*, profiles(full_name)').eq('month', month).order('created_at'),
      supabase.from('profiles').select('id, full_name').eq('active', true).order('full_name'),
      supabase.from('jobs').select('id, name').order('name'),
    ])
    setData({ entries: entries ?? [], reports: reports ?? [], allReports: allReports ?? [], invoices: invoices ?? [] })
    setEmployees(emps ?? [])
    setJobsList(jobs ?? [])
  }
  useEffect(() => { load() }, [month])

  // Abrir un parte diario completo (con sus fotos)
  async function showReport(r) {
    setOpenReport(r)
    setReportPhotos([])
    const { data: media } = await supabase.from('report_media').select('path').eq('report_id', r.id)
    const urls = await Promise.all((media ?? []).map(m => signedUrl(m.path)))
    setReportPhotos(urls.filter(Boolean))
  }

  if (!data) return <Loading />

  // Agregados - inicializar con TODOS los empleados (aunque no hayan fichado)
  const byEmployee = {}
  for (const emp of employees) {
    byEmployee[emp.full_name] = { total: 0, jobs: {}, days: {}, weeks: {} }
  }
  for (const e of data.entries) {
    const emp = e.profiles?.full_name ?? 'Desconocido'
    const job = e.jobs ? `${e.jobs.name}${e.jobs.clients?.name ? ` · ${e.jobs.clients.name}` : ''}` : 'Sin obra'
    byEmployee[emp] ??= { total: 0, jobs: {}, days: {}, weeks: {} }
    const h = entryHours(e)
    byEmployee[emp].total += h
    byEmployee[emp].jobs[job] = (byEmployee[emp].jobs[job] ?? 0) + h
    // Para detectar horas extra: acumular por día y por semana
    const day = toDateStr(e.clock_in)
    const week = toDateStr(startOfWeek(new Date(e.clock_in)))
    byEmployee[emp].days[day] = (byEmployee[emp].days[day] ?? 0) + h
    byEmployee[emp].weeks[week] = (byEmployee[emp].weeks[week] ?? 0) + h
  }
  // Horas extra: días de más de 8 h o semanas de más de 40 h
  const overtime = (d) => ({
    longDays: Object.entries(d.days ?? {}).filter(([, h]) => h > 8),
    longWeeks: Object.entries(d.weeks ?? {}).filter(([, h]) => h > 40),
  })

  async function saveManualHours() {
    setManualMsg(null)
    const { userId, jobId, date, hours } = manual
    if (!userId || !date || !hours) return setManualMsg('Rellena empleado, fecha y horas.')
    const h = Number(hours)
    if (h <= 0 || h > 24) return setManualMsg('Pon unas horas válidas (0-24).')
    const clockIn = `${date}T08:00:00`
    const endHour = 8 + h
    const hh = String(Math.floor(endHour)).padStart(2, '0')
    const mm = String(Math.round((endHour % 1) * 60)).padStart(2, '0')
    const clockOut = `${date}T${hh}:${mm}:00`
    const { error } = await supabase.from('time_entries').insert({
      user_id: userId, job_id: jobId || null, clock_in: clockIn, clock_out: clockOut, break_minutes: 0,
    })
    if (error) return setManualMsg(error.message)
    await audit('anadir_horas_manual', 'time_entries', null, { userId, jobId, date, hours: h })
    setShowManual(false)
    setManual({ userId: '', jobId: '', date: '', hours: '' })
    load()
  }

  const filteredEmployees = selectedEmp
    ? Object.entries(byEmployee).filter(([emp]) => emp === selectedEmp)
    : Object.entries(byEmployee)

  function exportCSV() {
    const rows = [['Empleado', 'Obra', 'Horas', 'Mes']]
    for (const [emp, d] of Object.entries(byEmployee))
      for (const [job, h] of Object.entries(d.jobs))
        rows.push([emp, job, (Math.round(h * 100) / 100).toString().replace('.', ','), month])
    const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"', '""')}"`).join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `horas_${month}.csv`
    a.click()
  }

  async function reviewReport(id, status) {
    await supabase.from('daily_reports').update({ status }).eq('id', id)
    await audit(status === 'aprobado' ? 'aprobar_parte' : 'rechazar_parte', 'daily_reports', id)
    setOpenReport(null)
    load()
  }
  async function approveInvoice(id) {
    await supabase.from('invoices').update({ status: 'aprobado' }).eq('id', id)
    await audit('aprobar_factura', 'invoices', id)
    load()
  }
  async function deleteInvoice(inv) {
    if (!confirm(`¿Eliminar el parte mensual de ${inv.profiles?.full_name ?? 'este autónomo'} de ${monthLabel(month)}? No se puede deshacer.`)) return
    const { error } = await supabase.from('invoices').delete().eq('id', inv.id)
    if (error) return alert('No se pudo eliminar: ' + error.message + '\n\n¿Has ejecutado migracion_mejoras_2.sql en Supabase?')
    await audit('eliminar_factura', 'invoices', inv.id, { month, de: inv.profiles?.full_name })
    load()
  }

  return (
    <div>
      <Header title="Informes" subtitle={monthLabel(month)} />
      <div className="px-5 space-y-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Field label="Mes"><Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></Field>
          </div>
          <Button variant="ghost" className="!w-auto px-4 mb-4" onClick={exportCSV}>Exportar CSV</Button>
        </div>

        <Field label="Empleado">
          <Select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)}>
            <option value="">Todos los empleados</option>
            {employees.map(emp => <option key={emp.id} value={emp.full_name}>{emp.full_name}</option>)}
          </Select>
        </Field>

        <div className="flex justify-between items-center">
          <h3 className="font-extrabold text-[18px]">Horas por empleado y obra</h3>
          <Button variant="ambar" className="!w-auto !min-h-[40px] px-3 text-[13px]" onClick={() => setShowManual(true)}>+ Añadir horas</Button>
        </div>
        {filteredEmployees.length === 0 && <Card><p className="text-humo">No hay empleados.</p></Card>}
        {filteredEmployees.map(([emp, d]) => {
          const ot = overtime(d)
          return (
          <Card key={emp}>
            <div className="flex justify-between items-center">
              <p className="font-extrabold text-[17px]">{emp}</p>
              <div className="flex items-center gap-2">
                {(ot.longDays.length > 0 || ot.longWeeks.length > 0) && <Chip tone="warn">⚠ Horas extra</Chip>}
                <Chip tone="dark">{fmtHours(d.total)}</Chip>
              </div>
            </div>
            {(ot.longDays.length > 0 || ot.longWeeks.length > 0) && (
              <p className="text-ambar-oscuro text-[13px] font-semibold mt-1.5">
                {ot.longDays.length > 0 && `${ot.longDays.length} día(s) con más de 8 h (${ot.longDays.map(([day, h]) => `${fmtDate(day)}: ${fmtHours(h)}`).join(', ')})`}
                {ot.longDays.length > 0 && ot.longWeeks.length > 0 && ' · '}
                {ot.longWeeks.length > 0 && `${ot.longWeeks.length} semana(s) con más de 40 h`}
              </p>
            )}
            <div className="mt-2">
              {Object.entries(d.jobs).map(([job, h]) => (
                <div key={job} className="flex justify-between py-1.5 border-t border-linea text-[15px]">
                  <span className="text-humo pr-3">{job}</span>
                  <span className="font-bold whitespace-nowrap">{fmtHours(h)}</span>
                </div>
              ))}
            </div>
          </Card>
          )
        })}

        <h3 className="font-extrabold text-[18px] mt-2">Partes diarios por revisar ({data.reports.length})</h3>
        {data.reports.length === 0 && <Card><p className="text-humo">Todo revisado. Bien.</p></Card>}
        {data.reports.map(r => (
          <Card key={r.id}>
            <p className="font-bold">{r.profiles?.full_name} · {r.jobs?.name ?? 'Sin obra'} · {fmtDate(r.report_date)}</p>
            <p className="text-humo text-[15px] mt-1">{r.work_done}</p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Button variant="ok" className="min-h-[44px] text-[15px]" onClick={() => reviewReport(r.id, 'aprobado')}>Aprobar</Button>
              <Button variant="ghost" className="min-h-[44px] text-[15px]" onClick={() => reviewReport(r.id, 'rechazado')}>Rechazar</Button>
            </div>
          </Card>
        ))}

        <h3 className="font-extrabold text-[18px] mt-2">Todos los partes de {monthLabel(month)}</h3>
        {(() => {
          const list = data.allReports.filter(r => !selectedEmp || r.profiles?.full_name === selectedEmp)
          if (list.length === 0) return <Card><p className="text-humo">No hay partes diarios este mes.</p></Card>
          return (
            <Card>
              {list.map(r => (
                <button key={r.id} onClick={() => showReport(r)}
                  className="w-full text-left py-2.5 border-t border-linea first:border-0 active:bg-hormigon">
                  <div className="flex justify-between items-center gap-2">
                    <p className="font-bold text-[15px] min-w-0 truncate">
                      {fmtDate(r.report_date)} · {r.profiles?.full_name}
                    </p>
                    <Chip tone={r.status === 'aprobado' ? 'ok' : r.status === 'rechazado' ? 'danger' : 'warn'}>{r.status}</Chip>
                  </div>
                  <p className="text-humo text-[14px] mt-0.5 line-clamp-1">{r.jobs?.name ?? 'Sin obra'} · {r.work_done}</p>
                </button>
              ))}
            </Card>
          )
        })()}

        <h3 className="font-extrabold text-[18px] mt-2">Partes mensuales de autónomos</h3>
        {data.invoices.length === 0 && <Card><p className="text-humo">Ningún autónomo ha generado su parte de {monthLabel(month)}.</p></Card>}
        {data.invoices.map(inv => (
          <Card key={inv.id}>
            <div className="flex justify-between items-center">
              <p className="font-extrabold">{inv.profiles?.full_name}</p>
              <Chip tone={inv.status === 'aprobado' ? 'ok' : inv.status === 'enviado' ? 'warn' : 'neutral'}>{inv.status}</Chip>
            </div>
            <p className="text-humo mt-1">{fmtHours(inv.total_hours)} · {fmtEUR(inv.hourly_rate)}/h (sin IVA) · Total con IVA <b className="text-grafito">{fmtEUR(inv.total_amount)}</b></p>
            {inv.status === 'enviado' && (
              <Button variant="ok" className="min-h-[44px] text-[15px] mt-3" onClick={() => approveInvoice(inv.id)}>Aprobar parte mensual</Button>
            )}
            <button onClick={() => deleteInvoice(inv)}
              className="mt-3 w-full px-3 py-2 text-[14px] font-bold text-senal hover:bg-senal/10 rounded-lg">
              Eliminar parte mensual
            </button>
          </Card>
        ))}
      </div>

      {openReport && (
        <Modal open onClose={() => setOpenReport(null)}
          title={`Parte · ${fmtDate(openReport.report_date)}`}>
          <p className="font-extrabold text-[16px]">{openReport.profiles?.full_name}</p>
          <p className="text-humo text-[14px] mb-3">{openReport.jobs?.name ?? 'Sin obra'} · Estado: {openReport.status}</p>
          <p className="text-[13px] font-bold uppercase tracking-wide text-humo mb-1">Trabajo realizado</p>
          <p className="text-[15px] whitespace-pre-wrap mb-3">{openReport.work_done}</p>
          {openReport.incidents && (
            <>
              <p className="text-[13px] font-bold uppercase tracking-wide text-humo mb-1">Incidencias</p>
              <p className="text-[15px] whitespace-pre-wrap mb-3">{openReport.incidents}</p>
            </>
          )}
          {reportPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {reportPhotos.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt={`Foto ${i + 1}`} className="w-full aspect-square object-cover rounded-xl border border-linea" />
                </a>
              ))}
            </div>
          )}
          {openReport.status === 'pendiente' && (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ok" className="min-h-[44px] text-[15px]" onClick={() => reviewReport(openReport.id, 'aprobado')}>Aprobar</Button>
              <Button variant="ghost" className="min-h-[44px] text-[15px]" onClick={() => reviewReport(openReport.id, 'rechazado')}>Rechazar</Button>
            </div>
          )}
        </Modal>
      )}

      {showManual && (
        <Modal open onClose={() => { setShowManual(false); setManualMsg(null) }} title="Añadir horas manualmente">
          <Field label="Empleado">
            <Select value={manual.userId} onChange={e => setManual({ ...manual, userId: e.target.value })}>
              <option value="">Elige empleado…</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Obra (opcional)">
            <Select value={manual.jobId} onChange={e => setManual({ ...manual, jobId: e.target.value })}>
              <option value="">Sin obra</option>
              {jobsList.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <Input type="date" value={manual.date} onChange={e => setManual({ ...manual, date: e.target.value })} />
            </Field>
            <Field label="Horas">
              <Input type="number" inputMode="decimal" step="0.5" min="0.5" max="24" value={manual.hours} onChange={e => setManual({ ...manual, hours: e.target.value })} placeholder="Ej: 6" />
            </Field>
          </div>
          {manualMsg && <div className="mb-3"><Banner tone="danger">{manualMsg}</Banner></div>}
          <Button variant="ambar" onClick={saveManualHours}>Guardar horas</Button>
        </Modal>
      )}
    </div>
  )
}
