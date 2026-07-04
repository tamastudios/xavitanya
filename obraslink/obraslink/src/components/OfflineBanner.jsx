import { useEffect, useState } from 'react'
import { getOutbox, getPendingEntry, subscribeOffline, syncOutbox } from '../lib/offline'

// Barrita que aparece arriba cuando no hay conexión o hay registros
// guardados en el móvil pendientes de subir.
export default function OfflineBanner() {
  const [, force] = useState(0)

  useEffect(() => {
    const unsub = subscribeOffline(() => force(n => n + 1))
    const onChange = () => force(n => n + 1)
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
    return () => { unsub(); window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange) }
  }, [])

  const offline = !navigator.onLine
  const pending = getOutbox().length + (getPendingEntry() ? 1 : 0)

  if (!offline && pending === 0) return null

  return (
    <div className={`sticky top-0 z-50 px-4 py-2.5 text-center text-[14px] font-bold ${offline ? 'bg-grafito text-ambar' : 'bg-ambar text-grafito'}`}>
      {offline
        ? `📴 Sin conexión${pending > 0 ? ` · ${pending} registro(s) guardados en el móvil` : ' · lo que hagas se guardará en el móvil'}`
        : <button onClick={syncOutbox} className="underline underline-offset-2">⬆️ Subiendo {pending} registro(s) pendiente(s)… toca para reintentar</button>}
    </div>
  )
}
