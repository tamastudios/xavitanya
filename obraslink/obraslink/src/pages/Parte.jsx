import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Field, Select, TextArea, Banner } from '../components/UI'
import { uploadMedia, audit } from '../lib/helpers'

export default function Parte() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState(params.get('obra') ?? '')
  const [workDone, setWorkDone] = useState('')
  const [incidents, setIncidents] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase.from('job_assignments').select('jobs(id, name, status)').eq('user_id', user.id)
      .then(({ data }) => {
        const active = (data ?? []).map(a => a.jobs).filter(Boolean)
        setJobs(active)
        if (!jobId && active[0]) setJobId(active[0].id)
      })
  }, [user.id])

  async function save(e) {
    e.preventDefault()
    if (!workDone.trim()) return setMsg({ tone: 'warn', text: 'Escribe al menos una línea de lo que has hecho hoy.' })
    setBusy(true); setMsg(null)
    try {
      const { data: report, error } = await supabase.from('daily_reports')
        .insert({ user_id: user.id, job_id: jobId || null, work_done: workDone.trim(), incidents: incidents.trim() || null })
        .select().single()
      if (error) throw error

      for (const f of files) {
        const path = await uploadMedia(user.id, f)
        await supabase.from('report_media').insert({ report_id: report.id, job_id: jobId || null, path, uploaded_by: user.id })
      }
      await audit('crear_parte', 'daily_reports', report.id, { fotos: files.length })
      setMsg({ tone: 'ok', text: 'Parte guardado. ¡Buen trabajo hoy!' })
      setTimeout(() => nav('/'), 1200)
    } catch (err) {
      setMsg({ tone: 'danger', text: err.message ?? 'No se pudo guardar el parte.' })
    }
    setBusy(false)
  }

  return (
    <div>
      <Header title="Parte del día" subtitle="Cuenta qué has hecho y añade fotos" />
      <form className="px-5 space-y-4" onSubmit={save}>
        <Card>
          <Field label="Obra">
            <Select value={jobId} onChange={e => setJobId(e.target.value)}>
              <option value="">Sin obra concreta</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
            </Select>
          </Field>
          <Field label="¿Qué has hecho hoy?">
            <TextArea value={workDone} onChange={e => setWorkDone(e.target.value)}
              placeholder="Ej: Alicatado de la pared del baño, colocados 12 m². Preparado el suelo para mañana." />
          </Field>
          <Field label="Incidencias (opcional)">
            <TextArea value={incidents} onChange={e => setIncidents(e.target.value)}
              placeholder="Ej: Falta material de rejuntado. La llave de paso pierde agua." className="min-h-[80px]" />
          </Field>
          <Field label="Fotos o vídeos de la obra">
            <input type="file" accept="image/*,video/*" multiple capture="environment"
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
              className="w-full text-[15px] file:mr-3 file:rounded-xl file:border-0 file:bg-grafito file:text-white file:font-bold file:px-4 file:py-3" />
            {files.length > 0 && <p className="text-humo mt-2">{files.length} archivo(s) seleccionado(s). Las fotos se comprimen solas.</p>}
          </Field>
        </Card>
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        <Button type="submit" variant="ok" disabled={busy}>{busy ? 'Guardando…' : 'Guardar parte del día'}</Button>
      </form>
    </div>
  )
}
