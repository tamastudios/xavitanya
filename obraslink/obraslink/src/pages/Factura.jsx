import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Header, Card, Button, Field, Input, TextArea, Chip, Loading, Banner } from '../components/UI'
import { monthValue, monthLabel, monthRange, entryHours, fmtHours, fmtEUR, fmtDate, audit } from '../lib/helpers'

export default function Factura() {
  const { user, profile } = useAuth()
  const [month, setMonth] = useState(monthValue())
  const [lines, setLines] = useState(null)
  const [entries, setEntries] = useState([])
  const [rate, setRate] = useState('')
  const [notes, setNotes] = useState('')
  const [invoice, setInvoice] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => { if (profile && rate === '') setRate(String(profile.hourly_rate ?? 0)) }, [profile])

  useEffect(() => {
    async function load() {
      setLines(null); setMsg(null)
      const { from, to } = monthRange(month)
      const { data } = await supabase.from('time_entries')
        .select('clock_in, clock_out, break_minutes, jobs(name)')
        .eq('user_id', user.id).gte('clock_in', from).lt('clock_in', to)
        .not('clock_out', 'is', null).order('clock_in')
      setEntries(data ?? [])
      const byJob = {}
      for (const e of data ?? []) {
        const j = e.jobs?.name ?? 'Sin obra'
        byJob[j] = (byJob[j] ?? 0) + entryHours(e)
      }
      setLines(Object.entries(byJob).map(([job, hours]) => ({ job, hours: Math.round(hours * 100) / 100 })))

      const { data: inv } = await supabase.from('invoices')
        .select('*').eq('user_id', user.id).eq('month', month).maybeSingle()
      setInvoice(inv)
    }
    load()
  }, [month, user.id])

  if (lines === null) return <Loading />

  const totalHours = Math.round(lines.reduce((s, l) => s + l.hours, 0) * 100) / 100
  const r = Number(rate) || 0
  const base = Math.round(totalHours * r * 100) / 100
  const iva = Math.round(base * 0.21 * 100) / 100
  const total = Math.round((base + iva) * 100) / 100

  async function saveDraft(send = false) {
    setMsg(null)
    const payload = {
      user_id: user.id, month, total_hours: totalHours, hourly_rate: r, total_amount: total,
      lines: lines.map(l => ({ ...l, amount: Math.round(l.hours * r * 100) / 100 })),
      notes: notes.trim() || null, status: send ? 'enviado' : 'borrador',
    }
    const { data, error } = await supabase.from('invoices')
      .upsert(payload, { onConflict: 'user_id,month' }).select().single()
    if (error) return setMsg({ tone: 'danger', text: error.message })
    setInvoice(data)
    await audit(send ? 'enviar_factura' : 'guardar_factura', 'invoices', data.id, { month })
    setMsg({ tone: 'ok', text: send ? 'Parte mensual enviado al jefe.' : 'Borrador guardado.' })
  }

  async function downloadPDF() {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const line = (y) => doc.line(15, y, 195, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
    doc.text('PARTE FACTURABLE MENSUAL (BORRADOR)', 15, 20)
    doc.setFontSize(11); doc.setFont('helvetica', 'normal')
    doc.text(`Autónomo: ${profile?.full_name ?? ''}`, 15, 32)
    doc.text(`Mes: ${monthLabel(month)}`, 15, 39)
    doc.text(`Tarifa: ${fmtEUR(r)}/hora (sin IVA)`, 15, 46)
    line(52)

    let y = 62
    doc.setFont('helvetica', 'bold')
    doc.text('Obra', 15, y); doc.text('Horas', 140, y); doc.text('Importe', 170, y)
    doc.setFont('helvetica', 'normal')
    y += 8
    for (const l of lines) {
      doc.text(doc.splitTextToSize(l.job, 115), 15, y)
      doc.text(String(l.hours).replace('.', ','), 140, y)
      doc.text(fmtEUR(l.hours * r), 170, y)
      y += 8
      if (y > 250) { doc.addPage(); y = 20 }
    }
    line(y); y += 8
    doc.setFont('helvetica', 'normal')
    doc.text(`Base (${fmtHours(totalHours)}): ${fmtEUR(base)}`, 15, y); y += 7
    doc.text(`IVA (21%): ${fmtEUR(iva)}`, 15, y); y += 7
    doc.setFont('helvetica', 'bold')
    doc.text(`TOTAL CON IVA: ${fmtEUR(total)}`, 15, y)
    y += 12
    if (notes.trim()) { doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(`Observaciones: ${notes.trim()}`, 180), 15, y); y += 14 }

    // Anexo: detalle de días
    doc.addPage()
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
    doc.text('Anexo · Detalle de días trabajados', 15, 20)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    y = 32
    for (const e of entries) {
      doc.text(`${fmtDate(e.clock_in)}  ·  ${e.jobs?.name ?? 'Sin obra'}  ·  ${fmtHours(entryHours(e))}`, 15, y)
      y += 6
      if (y > 280) { doc.addPage(); y = 20 }
    }
    doc.setFontSize(8)
    doc.text('Documento borrador generado con ObrasLink. No es una factura legal certificada.', 15, 290)
    doc.save(`parte_mensual_${month}.pdf`)
    if (invoice) await supabase.from('invoices').update({ status: invoice.status === 'aprobado' ? 'exportado' : invoice.status }).eq('id', invoice.id)
  }

  return (
    <div>
      <Header title="Parte mensual" subtitle="Borrador de factura con tus horas por obra" />
      <div className="px-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1"><Field label="Mes"><Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></Field></div>
          <div className="w-36"><Field label="€/hora (sin IVA)"><Input type="number" inputMode="decimal" step="0.5" value={rate} onChange={e => setRate(e.target.value)} /></Field></div>
        </div>

        {invoice && (
          <Banner tone={invoice.status === 'aprobado' ? 'ok' : 'warn'}>
            Estado: {invoice.status === 'borrador' ? 'Borrador guardado' : invoice.status === 'enviado' ? 'Enviado al jefe, pendiente de aprobar' : invoice.status === 'aprobado' ? 'Aprobado por el jefe' : 'Exportado'}
          </Banner>
        )}

        <Card>
          <h3 className="font-extrabold mb-2">Desglose de {monthLabel(month)}</h3>
          {lines.length === 0 && <p className="text-humo">Sin horas fichadas este mes.</p>}
          {lines.map(l => (
            <div key={l.job} className="flex justify-between py-2 border-t border-linea first:border-0">
              <span className="pr-3">{l.job}</span>
              <span className="font-bold whitespace-nowrap">{fmtHours(l.hours)} · {fmtEUR(l.hours * r)}</span>
            </div>
          ))}
          <div className="pt-3 mt-1 border-t-2 border-grafito space-y-1.5">
            <div className="flex justify-between text-[15px]">
              <span className="text-humo">Base ({fmtHours(totalHours)})</span>
              <span className="font-semibold">{fmtEUR(base)}</span>
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="text-humo">IVA (21%)</span>
              <span className="font-semibold">{fmtEUR(iva)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 mt-1 border-t border-linea">
              <span className="font-extrabold text-[17px]">Total con IVA</span>
              <Chip tone="dark">{fmtEUR(total)}</Chip>
            </div>
          </div>
        </Card>

        <Field label="Observaciones (opcional)">
          <TextArea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[80px]"
            placeholder="Ej: Incluye desplazamientos. Pendiente de sumar el sábado 14." />
        </Field>

        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => saveDraft(false)} disabled={lines.length === 0}>Guardar borrador</Button>
          <Button variant="ok" onClick={() => saveDraft(true)} disabled={lines.length === 0}>Enviar al jefe</Button>
        </div>
        <Button variant="ambar" onClick={downloadPDF} disabled={lines.length === 0}>Descargar PDF</Button>
        <p className="text-humo text-[13px] text-center pb-2">
          Esto es un borrador o parte facturable, no una factura legal certificada.
        </p>
      </div>
    </div>
  )
}
