import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import BottomNav from './components/BottomNav'
import { Loading, Banner } from './components/UI'
import Login from './pages/Login'
import Hoy from './pages/Hoy'
import Fichar from './pages/Fichar'
import Parte from './pages/Parte'
import Obras from './pages/Obras'
import ObraDetalle from './pages/ObraDetalle'
import Clientes from './pages/Clientes'
import Almacen from './pages/Almacen'
import Informes from './pages/Informes'
import Factura from './pages/Factura'
import Empleados from './pages/Empleados'
import Perfil from './pages/Perfil'

function Layout({ children }) {
  return (
    <div className="max-w-lg mx-auto min-h-dvh pb-28">
      {children}
      <BottomNav />
    </div>
  )
}

function Protected({ children, adminOnly = false }) {
  const { session, profile, loading, isAdmin } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (profile && !profile.active) {
    return (
      <div className="max-w-lg mx-auto p-6 pt-20">
        <Banner tone="danger">Tu cuenta está desactivada. Habla con el administrador.</Banner>
      </div>
    )
  }
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return <Layout>{children}</Layout>
}

function Router() {
  const { session, loading } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={loading ? <Loading /> : session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protected><Hoy /></Protected>} />
      <Route path="/fichar" element={<Protected><Fichar /></Protected>} />
      <Route path="/parte" element={<Protected><Parte /></Protected>} />
      <Route path="/obras" element={<Protected><Obras /></Protected>} />
      <Route path="/obras/:id" element={<Protected><ObraDetalle /></Protected>} />
      <Route path="/almacen" element={<Protected><Almacen /></Protected>} />
      <Route path="/factura" element={<Protected><Factura /></Protected>} />
      <Route path="/perfil" element={<Protected><Perfil /></Protected>} />
      <Route path="/clientes" element={<Protected adminOnly><Clientes /></Protected>} />
      <Route path="/informes" element={<Protected adminOnly><Informes /></Protected>} />
      <Route path="/empleados" element={<Protected adminOnly><Empleados /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Router />
      </BrowserRouter>
    </AuthProvider>
  )
}
