import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargando(false)
    })

    const { data: escucha } = supabase.auth.onAuthStateChange(
      (_evento, nuevaSesion) => setSesion(nuevaSesion)
    )

    return () => escucha.subscription.unsubscribe()
  }, [])

  if (cargando) return <p style={{ padding: 24 }}>Cargando...</p>

  return sesion ? <Panel sesion={sesion} /> : <Login />
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar() {
    setError(null)
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setEnviando(false)
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>Cartera</h1>
      <input
        type="email"
        placeholder="Correo"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />
      <input
        type="password"
        placeholder="Contrasena"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />
      <button onClick={entrar} disabled={enviando} style={{ width: '100%', padding: 8 }}>
        {enviando ? 'Entrando...' : 'Entrar'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  )
}

type Cliente = {
  id: string
  nombre_comercial: string
  identificacion: string | null
}

function Panel({ sesion }: { sesion: Session }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('clientes')
      .select('id, nombre_comercial, identificacion')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setClientes(data ?? [])
      })
  }, [])

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Cartera</h1>
      <p>Sesion iniciada como <strong>{sesion.user.email}</strong></p>
      <button onClick={() => supabase.auth.signOut()}>Salir</button>

      <h2 style={{ marginTop: 24 }}>Clientes ({clientes.length})</h2>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {clientes.length === 0 && !error && <p>No hay clientes registrados.</p>}

      <ul>
        {clientes.map((c) => (
          <li key={c.id}>
            {c.nombre_comercial}
            {c.identificacion && <span style={{ color: '#666' }}> - {c.identificacion}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
