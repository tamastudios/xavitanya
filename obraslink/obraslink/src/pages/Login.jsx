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
    <div className="min-h-dvh flex flex-col justify-center max-w-lg mx-auto px-6">
      <div className="franjas h-2 rounded-full mb-8" />
      <h1 className="text-[34px] font-extrabold tracking-tight leading-none">ObrasLink</h1>
      <p className="text-humo mt-2 mb-8 text-[17px]">Fichajes, partes y almacén de tu empresa.</p>

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
        <Button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>

      <p className="text-humo text-[13px] mt-8">
        ¿No tienes cuenta o has olvidado tu PIN? Pide al administrador que te ayude.
      </p>
    </div>
  )
}
