import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const icons = {
  hoy: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  obras: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01',
  almacen: 'M3 9l9-5 9 5v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9zM8 21v-8h8v8',
  informes: 'M4 20V10M10 20V4M16 20v-7M20 20H2',
  perfil: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
}

function Tab({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 ${isActive ? 'text-grafito' : 'text-humo'}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon d={icons[icon]} />
          <span className={`text-[11px] ${isActive ? 'font-extrabold' : 'font-semibold'}`}>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function BottomNav() {
  const { isAdmin } = useAuth()
  const { pathname } = useLocation()
  const ficharActive = pathname.startsWith('/fichar')

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-papel border-t border-linea safe-bottom">
      <div className="max-w-lg mx-auto flex items-stretch relative">
        <Tab to="/" icon="hoy" label={isAdmin ? 'Inicio' : 'Hoy'} />
        <Tab to="/obras" icon="obras" label="Obras" />

        {/* Pulsador central de fichar */}
        <div className="flex-1 flex justify-center">
          <NavLink to="/fichar" aria-label="Fichar" className="-mt-6">
            <div className={`pulsador w-16 h-16 rounded-full flex items-center justify-center border-4 ${ficharActive ? 'bg-grafito border-grafito text-ambar' : 'bg-ambar border-papel text-grafito'}`}>
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
              </svg>
            </div>
            <span className="block text-center text-[11px] font-extrabold mt-0.5">Fichar</span>
          </NavLink>
        </div>

        <Tab to="/almacen" icon="almacen" label="Almacén" />
        {isAdmin
          ? <Tab to="/informes" icon="informes" label="Informes" />
          : <Tab to="/perfil" icon="perfil" label="Perfil" />}
      </div>
    </nav>
  )
}
