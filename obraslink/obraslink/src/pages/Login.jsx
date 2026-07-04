import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Field, Input, Banner } from '../components/UI'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e) {
    e.preventDefault()
    if (password.length !== 4) return setMsg({ tone: 'danger', text: 'El PIN debe tener 4 dígitos.' })
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setMsg({ tone: 'danger', text: 'Email o PIN incorrectos. Revisa los datos e inténtalo otra vez.' })
    setBusy(false)
  }

  return (
    <div className="min-h-dvh cabecera flex flex-col justify-center px-5 py-10">
      <div className="max-w-lg mx-auto w-full anim-aparecer">
        <div className="text-white mb-8 px-1">
          <div className="w-14 h-14 rounded-2xl bg-ambar flex items-center justify-center mb-5 shadow-flotante">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-grafito" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
            </svg>
          </div>
          <h1 className="text-[30px] font-extrabold tracking-tight leading-tight">Xavi Tanya<br />Serveis Integrals</h1>
          <p className="text-white/65 mt-2 text-[16px]">Fichajes, partes y almacén de tu empresa.</p>
        </div>

        <div className="bg-papel rounded-tarjeta shadow-flotante p-5">
          <form onSubmit={signIn}>
            <Field label="Email">
              <Input type="email" autoComplete="email" inputMode="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required />
            </Field>
            <Field label="PIN (4 dígitos)">
              <Input type="tel" maxLength="4" autoComplete="off" value={password}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '')
                  setPassword(val.slice(0, 4))
                }}
                placeholder="0000" required />
            </Field>
            {msg && <div className="mb-4"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
            <Button type="submit" variant="ambar" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
          </form>
        </div>

        <p className="text-white/55 text-[13px] mt-6 text-center">
          ¿No tienes cuenta o has olvidado tu PIN? Pide al administrador que te ayude.
        </p>
      </div>
    </div>
  )
}
