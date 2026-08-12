import { useState, useEffect, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { dinero } from './lib/formato'
import { DetalleCliente } from './componentes/DetalleCliente'
import { EfectivoEnTransito, type EfectivoPendiente } from './componentes/EfectivoEnTransito'
import { PanelSupervisor } from './componentes/PanelSupervisor'
import { NuevoCliente } from './componentes/NuevoCliente'
import { NuevaFactura } from './componentes/NuevaFactura'
import { EditarCliente } from './componentes/EditarCliente'
import { EditarFactura } from './componentes/EditarFactura'
import { Acceso } from './componentes/Acceso'

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

  if (cargando) {
    return (
      <div className="min-h-screen grid place-items-center text-tinta-60">Cargando…</div>
    )
  }
  return sesion ? <Enrutador sesion={sesion} /> : <Acceso />
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

  if (cargando) {
    return <div className="min-h-screen grid place-items-center text-tinta-60">Cargando…</div>
  }

  const esSupervisor = rol === 'supervisor'

  return (
    <div className="min-h-screen bg-fondo">
      {/* Encabezado fijo: identidad y salida siempre al alcance del pulgar */}
      <header className="bg-marca-700 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-white leading-none">Cartera</h1>
            <p className="text-marca-100 text-xs mt-0.5 truncate">
              {nombre || sesion.user.email}
              {esSupervisor && (
                <span className="ml-1.5 px-1.5 py-px rounded-full bg-white/15 text-[10px] font-semibold">
                  Supervisor
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-marca-100 text-sm hover:text-white shrink-0"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-16">
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
      </main>
    </div>
  )
}

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
        <div className="flex gap-2 justify-end mb-3">
          <button onClick={() => setModo({ tipo: 'editarCliente' })} className={botonSec}>
            Editar cliente
          </button>
          <button onClick={() => setModo({ tipo: 'nuevaFactura' })} className={botonPri}>
            + Factura
          </button>
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

/**
 * Presentacion de la mora.
 *
 * En este negocio los dias vencidos tienen consecuencia directa sobre el
 * sueldo del vendedor: si un cliente no paga, se lo descuentan. Por eso los
 * dias son el dato dominante de cada fila, por encima del monto. Es la
 * inversion deliberada de la jerarquia habitual en apps financieras.
 */
function estiloMora(dias: number | null) {
  if (dias === null || dias < 0)
    return { color: 'text-tinta-40', barra: 'bg-tinta-40', etiqueta: 'Al día' }
  if (dias === 0) return { color: 'text-mora-1', barra: 'bg-mora-1', etiqueta: 'Vence hoy' }
  if (dias <= 30) return { color: 'text-mora-1', barra: 'bg-mora-1', etiqueta: 'días' }
  if (dias <= 60) return { color: 'text-mora-2', barra: 'bg-mora-2', etiqueta: 'días' }
  return { color: 'text-mora-3', barra: 'bg-mora-3', etiqueta: 'días' }
}

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
      {error && (
        <p className="text-sm text-mora-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      <nav className="flex gap-1 p-1 bg-marca-100/60 rounded-xl mb-4">
        <button
          onClick={() => setPestana('cobrar')}
          className={pestana === 'cobrar' ? pestanaActiva : pestanaInactiva}
        >
          Cobrar ({clientes.length})
        </button>
        <button
          onClick={() => setPestana('clientes')}
          className={pestana === 'clientes' ? pestanaActiva : pestanaInactiva}
        >
          Clientes ({todos.length})
        </button>
      </nav>

      {pestana === 'cobrar' ? (
        <>
          <EfectivoEnTransito pendientes={efectivo} onDepositado={cargar} />

          <div className="flex items-baseline justify-between mb-3">
            <span className="text-xs font-semibold text-tinta-60 uppercase tracking-wide">
              Total por cobrar
            </span>
            <span className="cifra text-2xl font-bold">{dinero(totalCartera)}</span>
          </div>

          {clientes.length === 0 && !error && (
            <p className="text-sm text-tinta-60 bg-white border border-borde rounded-xl px-4 py-6 text-center">
              No hay clientes con deuda pendiente.
              <br />
              Registrá facturas desde la pestaña Clientes.
            </p>
          )}

          <div className="space-y-2">
            {clientes.map((c) => {
              const m = estiloMora(c.dias_mora_maxima)
              const dias = c.dias_mora_maxima
              const enMora = dias !== null && dias > 0

              return (
                <button
                  key={c.id}
                  onClick={() => onVerCliente(c)}
                  className="w-full text-left bg-white border border-borde rounded-xl overflow-hidden
                             hover:border-marca-500 active:scale-[0.995] transition
                             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600"
                >
                  <div className="flex">
                    {/* Franja de urgencia */}
                    <div className={`w-1.5 shrink-0 ${m.barra}`} />

                    <div className="flex-1 min-w-0 p-3">
                      <div className="flex items-start justify-between gap-3">
                        {/* Dias de mora: el dato dominante */}
                        <div className="shrink-0 text-center w-14">
                          <div className={`cifra text-3xl font-bold leading-none ${m.color}`}>
                            {enMora ? dias : '—'}
                          </div>
                          <div className={`text-[10px] font-semibold uppercase mt-0.5 ${m.color}`}>
                            {enMora ? 'días' : m.etiqueta}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[15px] leading-tight truncate">
                            {c.nombre_comercial}
                          </div>
                          <div className="text-xs text-tinta-60 mt-0.5">
                            {c.facturas_pendientes} factura
                            {c.facturas_pendientes !== 1 && 's'}
                            {c.ruta_nombre && ` · ${c.ruta_nombre}`}
                          </div>
                          {c.excede_limite && (
                            <div className="text-xs text-mora-3 font-medium mt-0.5">
                              Supera el límite de crédito
                            </div>
                          )}
                        </div>

                        <div className="cifra text-lg font-bold shrink-0 tabular-nums">
                          {dinero(c.saldo_total)}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={() => setCreandoCliente(true)} className={botonPri}>
              + Nuevo cliente
            </button>
          </div>

          {todos.length === 0 && (
            <p className="text-sm text-tinta-60 bg-white border border-borde rounded-xl px-4 py-6 text-center">
              Todavía no tenés clientes registrados.
            </p>
          )}

          <div className="space-y-2">
            {todos.map((c) => (
              <button
                key={c.id}
                onClick={() => onVerCliente(c)}
                className="w-full text-left bg-white border border-borde rounded-xl p-3
                           hover:border-marca-500 active:scale-[0.995] transition
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600"
              >
                <div className="font-semibold text-[15px]">{c.nombre_comercial}</div>
                <div className="text-xs text-tinta-60 mt-0.5">
                  {c.identificacion ?? 'Sin identificación'}
                  {c.telefono && ` · ${c.telefono}`}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

const pestanaActiva =
  'flex-1 py-2 rounded-lg bg-white text-marca-700 font-semibold text-sm shadow-sm transition'

const pestanaInactiva = 'flex-1 py-2 rounded-lg text-tinta-60 font-medium text-sm transition'

export const botonPri =
  'px-3 py-2 rounded-lg bg-marca-600 text-white font-semibold text-sm ' +
  'hover:bg-marca-700 active:scale-[0.98] transition disabled:opacity-40'

export const botonSec =
  'px-3 py-2 rounded-lg bg-white border border-borde text-tinta font-medium text-sm ' +
  'hover:border-marca-500 active:scale-[0.98] transition disabled:opacity-40'
