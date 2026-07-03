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

  async function recover() {
    if (!email.trim()) return setMsg({ tone: 'warn', text: 'Escribe tu email arriba y vuelve a pulsar "He olvidado mi contraseña".' })
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setMsg(error
      ? { tone: 'danger', text: 'No se pudo enviar el email de recuperación.' }
      : { tone: 'ok', text: 'Te hemos enviado un email para cambiar la contraseña.' })
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
          <Input type="text" inputMode="numeric" maxLength="4" autoComplete="off" value={password}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, '')
              setPassword(val)
            }}
            placeholder="0000" required />
        </Field>
        {msg && <div className="mb-4"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
        <Button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>

      <p className="text-humo text-[13px] mt-8">
        ¿No tienes cuenta? Pide al administrador que te dé de alta.
      </p>
    </div>
  )
}
