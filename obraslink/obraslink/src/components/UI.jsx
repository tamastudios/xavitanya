// Componentes base: grandes, claros y con pocos adornos.

export function Header({ title, subtitle, right }) {
  return (
    <header className="cabecera text-white px-5 pt-7 pb-6 mb-5 rounded-b-[28px] shadow-flotante flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-white/70 mt-1 text-[15px] leading-snug">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}

export function Card({ children, className = '', onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-papel rounded-tarjeta border border-linea/70 shadow-tarjeta p-4 ${onClick ? 'active:scale-[0.99] active:bg-hormigon cursor-pointer transition-transform' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-grafito text-white shadow-tarjeta',
    ambar: 'bg-ambar text-grafito shadow-tarjeta',
    ok: 'bg-casco text-white shadow-tarjeta',
    danger: 'bg-senal text-white shadow-tarjeta',
    ghost: 'bg-papel border border-linea text-grafito',
  }
  return (
    <button
      className={`w-full min-h-[56px] rounded-tarjeta px-5 text-[17px] font-bold transition active:scale-[0.98] active:opacity-90 disabled:opacity-40 ${styles[variant]} ${className}`}
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
  'w-full min-h-[52px] rounded-xl border border-linea bg-papel px-4 text-[17px] transition focus:outline-none focus:border-grafito focus:ring-4 focus:ring-grafito/10'

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
    claro: 'bg-white/15 text-white border border-white/25 backdrop-blur-sm',
  }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-[13px] font-bold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Empty({ children }) {
  return (
    <div className="text-center text-humo py-10 px-6">
      <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-columna flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 015 0" />
        </svg>
      </div>
      <p className="text-[16px]">{children}</p>
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-humo anim-fundido">
      <div className="w-9 h-9 rounded-full border-[3.5px] border-linea border-t-grafito animate-spin" />
      <p className="text-[14px] font-semibold">Cargando…</p>
    </div>
  )
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-grafito/45 backdrop-blur-[2px] flex items-end sm:items-center sm:justify-center anim-fundido" onClick={onClose}>
      <div
        className="bg-papel w-full sm:max-w-md rounded-t-3xl sm:rounded-tarjeta p-5 pt-3 max-h-[88vh] overflow-y-auto safe-bottom anim-hoja shadow-flotante"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 rounded-full bg-linea mx-auto mb-3 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[20px] font-extrabold">{title}</h2>
          <button onClick={onClose} className="text-humo text-[15px] font-semibold px-2 py-1 rounded-lg active:bg-hormigon">Cerrar</button>
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
