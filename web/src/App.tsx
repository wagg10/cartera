import { useState, useEffect, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { dinero, colorMora, textoMora } from './lib/formato'
import { DetalleCliente } from './componentes/DetalleCliente'
import { EfectivoEnTransito, type EfectivoPendiente } from './componentes/EfectivoEnTransito'

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargando(false)
    })
    const { data: escucha } = supabase.auth.onAuthStateChange((_e, nueva) => setSesion(nueva))
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

type ClientePrioridad = {
  id: string
  nombre_comercial: string
  saldo_total: string
  facturas_pendientes: number
  dias_mora_maxima: number | null
  ruta_nombre: string | null
  excede_limite: boolean
}

function Panel({ sesion }: { sesion: Session }) {
  const [clientes, setClientes] = useState<ClientePrioridad[]>([])
  const [efectivo, setEfectivo] = useState<EfectivoPendiente[]>([])
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<ClientePrioridad | null>(null)

  const cargar = useCallback(async () => {
    const [prio, efec] = await Promise.all([
      supabase.from('v_priorizacion_cobranza').select('*'),
      supabase.from('v_efectivo_pendiente').select('*'),
    ])
    if (prio.error) setError(prio.error.message)
    else setClientes(prio.data ?? [])
    setEfectivo(efec.data ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totalCartera = clientes.reduce((s, c) => s + Number(c.saldo_total), 0)

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Cartera</h1>
        <button onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>
      <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{sesion.user.email}</p>

      {abierto ? (
        <DetalleCliente
          clienteId={abierto.id}
          nombreCliente={abierto.nombre_comercial}
          onCerrar={() => setAbierto(null)}
          onCobroRegistrado={cargar}
        />
      ) : (
        <>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}

          <EfectivoEnTransito pendientes={efectivo} onDepositado={cargar} />

          <h2 style={{ fontSize: 16 }}>
            A quien cobrar ({clientes.length}) — total {dinero(totalCartera)}
          </h2>

          {clientes.length === 0 && !error && <p>No hay clientes con deuda pendiente.</p>}

          {clientes.map((c) => (
            <article
              key={c.id}
              onClick={() => setAbierto(c)}
              style={{
                border: '1px solid #e5e7eb',
                borderLeftWidth: 4,
                borderLeftColor: colorMora(c.dias_mora_maxima),
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{c.nombre_comercial}</strong>
                  {c.ruta_nombre && (
                    <span style={{ color: '#666', fontSize: 12 }}> · {c.ruta_nombre}</span>
                  )}
                  <div
                    style={{ fontSize: 13, color: colorMora(c.dias_mora_maxima), fontWeight: 600 }}
                  >
                    {textoMora(c.dias_mora_maxima)}
                  </div>
                  {c.excede_limite && (
                    <div style={{ fontSize: 12, color: '#dc2626' }}>
                      Supera el limite de credito
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{dinero(c.saldo_total)}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {c.facturas_pendientes} factura(s)
                  </div>
                </div>
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  )
}
