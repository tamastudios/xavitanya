import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/archivo'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Algo ha fallado</h1>
          <p style={{ color: '#6b7280', marginTop: 8 }}>Recarga la app para seguir trabajando. Si vuelve a pasar, avisa al administrador.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 24, background: '#1F2421', color: '#fff', border: 0, borderRadius: 14, padding: '16px 28px', fontSize: 17, fontWeight: 700 }}>
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
