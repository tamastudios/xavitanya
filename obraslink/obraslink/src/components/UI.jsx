// Componentes base: grandes, claros y con pocos adornos.

export function Header({ title, subtitle, right }) {
  return (
    <header className="px-5 pt-6 pb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-humo mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function Card({ children, className = '', onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-papel rounded-tarjeta border border-linea p-4 ${onClick ? 'active:bg-hormigon cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-grafito text-white',
    ambar: 'bg-ambar text-grafito',
    ok: 'bg-casco text-white',
    danger: 'bg-senal text-white',
    ghost: 'bg-papel border border-linea text-grafito',
  }
  return (
    <button
      className={`w-full min-h-[56px] rounded-tarjeta px-5 text-[17px] font-bold active:opacity-80 disabled:opacity-40 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-[15px] font-semibold mb-1.5">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full min-h-[52px] rounded-xl border border-linea bg-papel px-4 text-[17px] focus:outline-none focus:border-grafito'

export const Input = (props) => <input className={inputCls} {...props} />
export const TextArea = (props) => <textarea className={`${inputCls} py-3 min-h-[110px]`} {...props} />
export const Select = ({ children, ...props }) => (
  <select className={inputCls} {...props}>{children}</select>
)

export function Chip({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-hormigon text-humo border border-linea',
    ok: 'bg-casco-claro text-casco',
    warn: 'bg-[#fdf3d7] text-ambar-oscuro',
    danger: 'bg-senal-claro text-senal',
    dark: 'bg-grafito text-white',
  }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-[13px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Empty({ children }) {
  return (
    <div className="text-center text-humo py-10 px-6">
      <p className="text-[16px]">{children}</p>
    </div>
  )
}

export function Loading() {
  return <div className="text-center text-humo py-16">Cargando…</div>
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="bg-papel w-full sm:max-w-md rounded-t-3xl sm:rounded-tarjeta p-5 max-h-[88vh] overflow-y-auto safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[20px] font-extrabold">{title}</h2>
          <button onClick={onClose} className="text-humo text-[15px] font-semibold px-2 py-1">Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Banner({ tone = 'warn', children }) {
  const tones = { warn: 'bg-[#fdf3d7] text-ambar-oscuro', danger: 'bg-senal-claro text-senal', ok: 'bg-casco-claro text-casco' }
  return <div className={`rounded-xl px-4 py-3 text-[15px] font-semibold ${tones[tone]}`}>{children}</div>
}
