import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, colorMora, textoMora } from '../lib/formato'

type CarteraVendedor = {
  vendedor_id: string
  vendedor_nombre: string
  saldo_total: string
  clientes_con_deuda: number
  saldo_0_30: string
  saldo_31_60: string
  saldo_61_90: string
  saldo_90_mas: string
  dias_mora_maxima: number | null
  efectivo_sin_depositar: string
}

type ClienteEquipo = {
  id: string
  vendedor_id: string
  nombre_comercial: string
  saldo_total: string
  facturas_pendientes: number
  dias_mora_maxima: number | null
  ruta_nombre: string | null
}

type Props = {
  onVerCliente: (cliente: { id: string; nombre_comercial: string }) => void
}

/** Barra proporcional del desglose por antiguedad. */
function BarraAntiguedad({ v }: { v: CarteraVendedor }) {
  const tramos = [
    { valor: Number(v.saldo_0_30), color: '#ca8a04', etiqueta: '0-30' },
    { valor: Number(v.saldo_31_60), color: '#ea580c', etiqueta: '31-60' },
    { valor: Number(v.saldo_61_90), color: '#dc2626', etiqueta: '61-90' },
    { valor: Number(v.saldo_90_mas), color: '#7f1d1d', etiqueta: '90+' },
  ]
  const total = tramos.reduce((s, t) => s + t.valor, 0)
  if (total === 0) return null

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
        {tramos.map(
          (t) =>
            t.valor > 0 && (
              <div
                key={t.etiqueta}
                title={`${t.etiqueta} dias: ${dinero(t.valor)}`}
                style={{ width: `${(t.valor / total) * 100}%`, background: t.color }}
              />
            ),
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, flexWrap: 'wrap' }}>
        {tramos.map(
          (t) =>
            t.valor > 0 && (
              <span key={t.etiqueta} style={{ color: t.color }}>
                <strong>{t.etiqueta}d</strong> {dinero(t.valor)}
              </span>
            ),
        )}
      </div>
    </div>
  )
}

export function PanelSupervisor({ onVerCliente }: Props) {
  const [equipo, setEquipo] = useState<CarteraVendedor[]>([])
  const [clientes, setClientes] = useState<ClienteEquipo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [enVivo, setEnVivo] = useState(false)
  const [ultimoCambio, setUltimoCambio] = useState<Date | null>(null)

  const cargar = useCallback(async () => {
    const [eq, cl] = await Promise.all([
      supabase.from('v_cartera_equipo').select('*').order('saldo_total', { ascending: false }),
      supabase.from('v_priorizacion_cobranza').select('*'),
    ])
    if (eq.error) setError(eq.error.message)
    else setEquipo(eq.data ?? [])
    setClientes(cl.data ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  /**
   * Suscripcion en tiempo real.
   *
   * Postgres emite un evento por cada cambio en 'cobros'. Supabase lo entrega
   * por WebSocket, respetando RLS: este supervisor solo recibe los cambios de
   * filas que tendria derecho a leer, es decir los de su propio equipo.
   *
   * Al recibir un evento recargamos las vistas en vez de intentar actualizar
   * el estado localmente: los saldos son agregados de varias tablas y
   * recalcularlos en el cliente los desincronizaria de la base.
   */
  useEffect(() => {
    const canal = supabase
      .channel('cartera-equipo')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cobros' },
        () => {
          setUltimoCambio(new Date())
          cargar()
        },
      )
      .subscribe((estado) => {
        setEnVivo(estado === 'SUBSCRIBED')
      })

    // Cerrar el canal al desmontar. Sin esto quedan WebSockets abiertos.
    return () => {
      supabase.removeChannel(canal)
    }
  }, [cargar])

  const totalEquipo = equipo.reduce((s, v) => s + Number(v.saldo_total), 0)
  const totalEfectivo = equipo.reduce((s, v) => s + Number(v.efectivo_sin_depositar), 0)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0 }}>Cartera del equipo</h2>
        <span
          style={{
            fontSize: 11,
            color: enVivo ? '#15803d' : '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: enVivo ? '#22c55e' : '#d1d5db',
              display: 'inline-block',
            }}
          />
          {enVivo ? 'En vivo' : 'Conectando...'}
        </span>
      </div>

      {ultimoCambio && (
        <p style={{ fontSize: 11, color: '#666', margin: '0 0 8px' }}>
          Actualizado {ultimoCambio.toLocaleTimeString('es-EC')}
        </p>
      )}

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            flex: 1,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div style={{ fontSize: 11, color: '#666' }}>Cartera total</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{dinero(totalEquipo)}</div>
        </div>
        <div
          style={{
            flex: 1,
            border: '1px solid #fbbf24',
            background: '#fffbeb',
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div style={{ fontSize: 11, color: '#92400e' }}>Efectivo sin depositar</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#92400e' }}>
            {dinero(totalEfectivo)}
          </div>
        </div>
      </div>

      {equipo.length === 0 && !error && <p>No hay vendedores asignados a tu equipo.</p>}

      {equipo.map((v) => {
        const abierto = expandido === v.vendedor_id
        const susClientes = clientes.filter((c) => c.vendedor_id === v.vendedor_id)

        return (
          <article
            key={v.vendedor_id}
            style={{
              border: '1px solid #e5e7eb',
              borderLeftWidth: 4,
              borderLeftColor: colorMora(v.dias_mora_maxima),
              borderRadius: 8,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <div
              onClick={() => setExpandido(abierto ? null : v.vendedor_id)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{v.vendedor_nombre}</strong>
                  <div
                    style={{
                      fontSize: 13,
                      color: colorMora(v.dias_mora_maxima),
                      fontWeight: 600,
                    }}
                  >
                    {textoMora(v.dias_mora_maxima)}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {v.clientes_con_deuda} cliente(s) con deuda
                  </div>
                  {Number(v.efectivo_sin_depositar) > 0 && (
                    <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                      {dinero(v.efectivo_sin_depositar)} en efectivo sin depositar
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{dinero(v.saldo_total)}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    {abierto ? 'ocultar' : 'ver clientes'}
                  </div>
                </div>
              </div>

              <BarraAntiguedad v={v} />
            </div>

            {abierto && (
              <div style={{ marginTop: 10, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                {susClientes.length === 0 && (
                  <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
                    Sin clientes con deuda pendiente.
                  </p>
                )}

                {susClientes.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => onVerCliente(c)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '6px 0',
                      borderBottom: '1px solid #f9fafb',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      {c.nombre_comercial}
                      <span
                        style={{
                          color: colorMora(c.dias_mora_maxima),
                          fontSize: 12,
                          marginLeft: 6,
                        }}
                      >
                        {textoMora(c.dias_mora_maxima)}
                      </span>
                    </div>
                    <strong style={{ whiteSpace: 'nowrap' }}>{dinero(c.saldo_total)}</strong>
                  </div>
                ))}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
