import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Field, Select, TextArea, Banner } from '../components/UI'
import { uploadMedia, audit } from '../lib/helpers'
import { isNetworkError, addToOutbox, syncOutbox } from '../lib/offline'

const JOBS_CACHE_KEY = 'xt_obras_cache_v1'

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

  // ---------- Dictado por voz ----------
  // En iPhone/iPad el reconocimiento de voz web no funciona bien dentro de
  // apps instaladas (se queda colgado). Ahí usamos el micrófono del teclado.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const recRef = useRef(null)
  const [listening, setListening] = useState(false)
  const voiceSupported = !isIOS && typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  function toggleVoice() {
    if (listening) { try { recRef.current?.stop() } catch {}; return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (ev) => {
      let text = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) text += ev.results[i][0].transcript
      }
      if (text.trim()) setWorkDone(prev => (prev ? prev.trim() + ' ' : '') + text.trim())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { setListening(false) }
  }
  useEffect(() => () => { try { recRef.current?.stop() } catch {} }, [])

  useEffect(() => {
    supabase.from('job_assignments').select('jobs(id, name, status)').eq('user_id', user.id)
      .then(({ data }) => {
        const active = (data ?? []).map(a => a.jobs).filter(Boolean)
        if (active.length > 0) {
          setJobs(active)
          if (!jobId && active[0]) setJobId(active[0].id)
        }
      })
      .catch(() => {})
    // Sin conexión: usar la lista de obras guardada en el móvil
    if (!navigator.onLine) {
      try {
        const cached = JSON.parse(localStorage.getItem(JOBS_CACHE_KEY)) ?? []
        setJobs(cached)
        if (!jobId && cached[0]) setJobId(cached[0].id)
      } catch {}
    }
  }, [user.id])

  function saveOffline() {
    addToOutbox({
      table: 'daily_reports',
      op: 'insert',
      payload: {
        user_id: user.id,
        job_id: jobId || null,
        work_done: workDone.trim(),
        incidents: incidents.trim() || null,
        report_date: new Date().toISOString().slice(0, 10),
      },
    })
    syncOutbox()
    const fotosAviso = files.length > 0 ? ' Las fotos no se pueden guardar sin conexión: añádelas luego desde otro parte.' : ''
    setMsg({ tone: 'ok', text: `Parte guardado en el móvil. Se subirá solo al recuperar cobertura.${fotosAviso}` })
    setTimeout(() => nav('/'), 2000)
  }

  async function save(e) {
    e.preventDefault()
    if (listening) { try { recRef.current?.stop() } catch {} }
    if (!workDone.trim()) return setMsg({ tone: 'warn', text: 'Escribe (o dicta) al menos una línea de lo que has hecho hoy.' })
    setBusy(true); setMsg(null)
    if (!navigator.onLine) { saveOffline(); setBusy(false); return }
    try {
      const { data: report, error } = await supabase.from('daily_reports')
        .insert({ user_id: user.id, job_id: jobId || null, work_done: workDone.trim(), incidents: incidents.trim() || null })
        .select().single()
      if (error) {
        if (isNetworkError(error)) { saveOffline(); setBusy(false); return }
        throw error
      }

      for (const f of files) {
        const path = await uploadMedia(user.id, f)
        await supabase.from('report_media').insert({ report_id: report.id, job_id: jobId || null, path, uploaded_by: user.id })
      }
      await audit('crear_parte', 'daily_reports', report.id, { fotos: files.length })
      setMsg({ tone: 'ok', text: 'Parte guardado. ¡Buen trabajo hoy!' })
      setTimeout(() => nav('/'), 1200)
    } catch (err) {
      if (isNetworkError(err)) { saveOffline(); setBusy(false); return }
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
          {isIOS && (
            <div className="mb-4 -mt-2 rounded-xl bg-hormigon border border-linea px-4 py-3 text-[14px] text-humo font-semibold">
              💡 Para dictar con la voz: toca el cuadro de arriba y pulsa el micrófono 🎤 del teclado del iPhone. Habla y el texto se escribe solo.
            </div>
          )}
          {voiceSupported && (
            <div className="mb-4 -mt-2">
              <button type="button" onClick={toggleVoice}
                className={`w-full min-h-[52px] rounded-xl px-4 text-[16px] font-bold border transition active:scale-[0.98] flex items-center justify-center gap-2 ${
                  listening ? 'bg-senal text-white border-senal' : 'bg-hormigon text-grafito border-linea'}`}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0014 0M12 17v5" />
                </svg>
                {listening ? 'Escuchando… toca para parar' : 'Dictar por voz (manos libres)'}
              </button>
              {listening && <p className="text-humo text-[13px] mt-1.5 text-center">Habla con normalidad: el texto aparece arriba cuando haces una pausa.</p>}
            </div>
          )}
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
