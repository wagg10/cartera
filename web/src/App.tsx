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
      (_e, nueva) => setSesion(nueva)
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
      <input type="email" placeholder="Correo" value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }} />
      <input type="password" placeholder="Contrasena" value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }} />
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
  saldo_0_30: string
  saldo_31_60: string
  saldo_61_90: string
  saldo_90_mas: string
}

type EfectivoPendiente = {
  cobro_id: string
  nombre_comercial: string
  monto: string
  recibido_en: string
  alerta_deposito: boolean
}

/** Formatea un monto que llega como string desde Postgres NUMERIC. */
function dinero(valor: string): string {
  return Number(valor).toLocaleString('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Color segun gravedad de la mora. */
function colorMora(dias: number | null): string {
  if (dias === null || dias <= 0) return '#6b7280'
  if (dias <= 30) return '#ca8a04'
  if (dias <= 60) return '#ea580c'
  return '#dc2626'
}

function Panel({ sesion }: { sesion: Session }) {
  const [clientes, setClientes] = useState<ClientePrioridad[]>([])
  const [efectivo, setEfectivo] = useState<EfectivoPendiente[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // La vista ya viene ordenada por mora y saldo. El frontend no recalcula nada.
    supabase.from('v_priorizacion_cobranza').select('*').then(({ data, error }) => {
      if (error) setError(error.message)
      else setClientes(data ?? [])
    })

    supabase.from('v_efectivo_pendiente').select('*').then(({ data }) => {
      setEfectivo(data ?? [])
    })
  }, [])

  const totalCartera = clientes.reduce((s, c) => s + Number(c.saldo_total), 0)
  const totalEfectivo = efectivo.reduce((s, e) => s + Number(e.monto), 0)

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Cartera</h1>
        <button onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>
      <p style={{ color: '#666', fontSize: 13 }}>{sesion.user.email}</p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {efectivo.length > 0 && (
        <section style={{
          border: '1px solid #fbbf24', background: '#fffbeb',
          borderRadius: 8, padding: 12, marginBottom: 16,
        }}>
          <strong>Efectivo sin depositar: {dinero(String(totalEfectivo))}</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14 }}>
            {efectivo.map((e) => (
              <li key={e.cobro_id}>
                {e.nombre_comercial} — {dinero(e.monto)}
                {e.alerta_deposito && (
                  <span style={{ color: '#dc2626', fontWeight: 600 }}> (mas de 24h)</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 style={{ fontSize: 16 }}>
        A quien cobrar ({clientes.length}) — total {dinero(String(totalCartera))}
      </h2>

      {clientes.length === 0 && !error && <p>No hay clientes con deuda pendiente.</p>}

      {clientes.map((c) => (
        <article key={c.id} style={{
          border: '1px solid #e5e7eb', borderRadius: 8,
          padding: 12, marginBottom: 8,
          borderLeftWidth: 4, borderLeftColor: colorMora(c.dias_mora_maxima),
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>{c.nombre_comercial}</strong>
              {c.ruta_nombre && (
                <span style={{ color: '#666', fontSize: 12 }}> · {c.ruta_nombre}</span>
              )}
              <div style={{ fontSize: 13, color: colorMora(c.dias_mora_maxima), fontWeight: 600 }}>
                {c.dias_mora_maxima !== null && c.dias_mora_maxima > 0
                  ? `${c.dias_mora_maxima} dias de mora`
                  : 'Al dia'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{dinero(c.saldo_total)}</div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {c.facturas_pendientes} factura(s)
              </div>
            </div>
          </div>

          {c.excede_limite && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>
              Supera el limite de credito
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
