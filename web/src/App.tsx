import { useState, useEffect, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { dinero, colorMora, textoMora } from './lib/formato'
import { DetalleCliente } from './componentes/DetalleCliente'
import { EfectivoEnTransito, type EfectivoPendiente } from './componentes/EfectivoEnTransito'
import { PanelSupervisor } from './componentes/PanelSupervisor'
import { NuevoCliente } from './componentes/NuevoCliente'
import { NuevaFactura } from './componentes/NuevaFactura'
import { EditarCliente } from './componentes/EditarCliente'
import { EditarFactura } from './componentes/EditarFactura'

type Rol = 'vendedor' | 'supervisor' | 'administrador'

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
  return sesion ? <Enrutador sesion={sesion} /> : <Login />
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

type ClienteBase = { id: string; nombre_comercial: string }

function Enrutador({ sesion }: { sesion: Session }) {
  const [rol, setRol] = useState<Rol | null>(null)
  const [nombre, setNombre] = useState('')
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<ClienteBase | null>(null)

  useEffect(() => {
    supabase
      .from('perfiles')
      .select('rol, nombre')
      .eq('id', sesion.user.id)
      .single()
      .then(({ data }) => {
        setRol((data?.rol as Rol) ?? 'vendedor')
        setNombre(data?.nombre ?? '')
        setCargando(false)
      })
  }, [sesion.user.id])

  if (cargando) return <p style={{ padding: 24 }}>Cargando perfil...</p>

  const esSupervisor = rol === 'supervisor'

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Cartera</h1>
        <button onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>

      <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
        {nombre || sesion.user.email}
        {esSupervisor && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 11,
              color: '#1d4ed8',
              border: '1px solid #93c5fd',
              borderRadius: 999,
              padding: '1px 8px',
            }}
          >
            Supervisor
          </span>
        )}
      </p>

      {abierto ? (
        <VistaDetalle
          cliente={abierto}
          vendedorId={sesion.user.id}
          soloLectura={esSupervisor}
          onCerrar={() => setAbierto(null)}
        />
      ) : esSupervisor ? (
        <PanelSupervisor onVerCliente={setAbierto} />
      ) : (
        <PanelVendedor vendedorId={sesion.user.id} onVerCliente={setAbierto} />
      )}
    </div>
  )
}

/** Que subpantalla se muestra dentro del detalle de un cliente. */
type ModoDetalle =
  | { tipo: 'ver' }
  | { tipo: 'nuevaFactura' }
  | { tipo: 'editarCliente' }
  | { tipo: 'editarFactura'; facturaId: string }

function VistaDetalle({
  cliente,
  vendedorId,
  soloLectura,
  onCerrar,
}: {
  cliente: ClienteBase
  vendedorId: string
  soloLectura: boolean
  onCerrar: () => void
}) {
  const [modo, setModo] = useState<ModoDetalle>({ tipo: 'ver' })
  // Cambiar esta version fuerza a DetalleCliente a recargar sus datos.
  const [version, setVersion] = useState(0)
  const recargar = () => setVersion((v) => v + 1)

  if (modo.tipo === 'nuevaFactura') {
    return (
      <NuevaFactura
        vendedorId={vendedorId}
        clienteId={cliente.id}
        nombreCliente={cliente.nombre_comercial}
        onCerrar={() => setModo({ tipo: 'ver' })}
        onCreada={recargar}
      />
    )
  }

  if (modo.tipo === 'editarCliente') {
    return (
      <EditarCliente
        clienteId={cliente.id}
        onCerrar={() => setModo({ tipo: 'ver' })}
        onGuardado={recargar}
      />
    )
  }

  if (modo.tipo === 'editarFactura') {
    return (
      <EditarFactura
        facturaId={modo.facturaId}
        onCerrar={() => setModo({ tipo: 'ver' })}
        onGuardada={recargar}
      />
    )
  }

  return (
    <>
      {!soloLectura && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={() => setModo({ tipo: 'editarCliente' })}>Editar cliente</button>
          <button onClick={() => setModo({ tipo: 'nuevaFactura' })}>+ Nueva factura</button>
        </div>
      )}

      <DetalleCliente
        key={version}
        clienteId={cliente.id}
        nombreCliente={cliente.nombre_comercial}
        onCerrar={onCerrar}
        onCobroRegistrado={recargar}
        soloLectura={soloLectura}
        onEditarFactura={
          soloLectura ? undefined : (facturaId) => setModo({ tipo: 'editarFactura', facturaId })
        }
      />
    </>
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

type ClienteListado = {
  id: string
  nombre_comercial: string
  identificacion: string | null
  telefono: string | null
}

type Pestana = 'cobrar' | 'clientes'

function PanelVendedor({
  vendedorId,
  onVerCliente,
}: {
  vendedorId: string
  onVerCliente: (c: ClienteBase) => void
}) {
  const [pestana, setPestana] = useState<Pestana>('cobrar')
  const [clientes, setClientes] = useState<ClientePrioridad[]>([])
  const [todos, setTodos] = useState<ClienteListado[]>([])
  const [efectivo, setEfectivo] = useState<EfectivoPendiente[]>([])
  const [error, setError] = useState<string | null>(null)
  const [creandoCliente, setCreandoCliente] = useState(false)

  const cargar = useCallback(async () => {
    const [prio, efec, lista] = await Promise.all([
      supabase.from('v_priorizacion_cobranza').select('*'),
      supabase.from('v_efectivo_pendiente').select('*'),
      supabase
        .from('clientes')
        .select('id, nombre_comercial, identificacion, telefono')
        .eq('activo', true)
        .order('nombre_comercial'),
    ])
    if (prio.error) setError(prio.error.message)
    else setClientes(prio.data ?? [])
    setEfectivo(efec.data ?? [])
    setTodos(lista.data ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (creandoCliente) {
    return (
      <NuevoCliente
        vendedorId={vendedorId}
        onCerrar={() => setCreandoCliente(false)}
        onCreado={cargar}
      />
    )
  }

  const totalCartera = clientes.reduce((s, c) => s + Number(c.saldo_total), 0)

  return (
    <>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <nav style={{ display: 'flex', gap: 4, margin: '12px 0' }}>
        <button onClick={() => setPestana('cobrar')} style={pestana === 'cobrar' ? tabActiva : tab}>
          A quien cobrar ({clientes.length})
        </button>
        <button
          onClick={() => setPestana('clientes')}
          style={pestana === 'clientes' ? tabActiva : tab}
        >
          Clientes ({todos.length})
        </button>
      </nav>

      {pestana === 'cobrar' ? (
        <>
          <EfectivoEnTransito pendientes={efectivo} onDepositado={cargar} />

          <h2 style={{ fontSize: 16 }}>Total por cobrar: {dinero(totalCartera)}</h2>

          {clientes.length === 0 && !error && (
            <p style={{ color: '#666' }}>
              No hay clientes con deuda pendiente. Registra facturas desde la pestana Clientes.
            </p>
          )}

          {clientes.map((c) => (
            <article key={c.id} onClick={() => onVerCliente(c)} style={tarjeta(c.dias_mora_maxima)}>
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
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button onClick={() => setCreandoCliente(true)}>+ Nuevo cliente</button>
          </div>

          {todos.length === 0 && <p style={{ color: '#666' }}>Todavia no tenes clientes registrados.</p>}

          {todos.map((c) => (
            <article
              key={c.id}
              onClick={() => onVerCliente(c)}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 12,
                marginBottom: 6,
                cursor: 'pointer',
              }}
            >
              <strong>{c.nombre_comercial}</strong>
              <div style={{ fontSize: 12, color: '#666' }}>
                {c.identificacion ?? 'Sin identificacion'}
                {c.telefono && ` · ${c.telefono}`}
              </div>
            </article>
          ))}
        </>
      )}
    </>
  )
}

function tarjeta(dias: number | null): React.CSSProperties {
  return {
    border: '1px solid #e5e7eb',
    borderLeftWidth: 4,
    borderLeftColor: colorMora(dias),
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    cursor: 'pointer',
  }
}

const tab: React.CSSProperties = {
  flex: 1,
  padding: 8,
  fontSize: 13,
  background: '#fff',
  color: '#666',
}

const tabActiva: React.CSSProperties = {
  ...tab,
  background: '#111827',
  color: '#fff',
  borderColor: '#111827',
}
