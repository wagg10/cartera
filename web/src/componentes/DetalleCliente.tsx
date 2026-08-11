import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, fecha, colorMora, textoMora } from '../lib/formato'

type FacturaSaldo = {
  id: string
  numero: string
  fecha_emision: string
  fecha_vencimiento: string
  monto_total: string
  monto_aplicado: string
  saldo: string
  estado: string
  dias_vencida: number
}

type Props = {
  clienteId: string
  nombreCliente: string
  onCerrar: () => void
  /** Se llama tras registrar un cobro, para que la lista se recargue. */
  onCobroRegistrado: () => void
}

/** Una linea de la previsualizacion: cuanto recibe cada factura. */
type Reparto = {
  numero: string
  aplicar: number
  saldoResultante: number
}

/**
 * Calcula como se repartiria un cobro, sin registrarlo.
 *
 * Replica la logica de la funcion registrar_cobro de Postgres para poder
 * mostrarla ANTES de confirmar. La base de datos sigue siendo la autoridad:
 * esto es solo una vista previa para que el vendedor sepa que va a pasar.
 */
function calcularReparto(monto: number, facturas: FacturaSaldo[]): Reparto[] {
  const ordenadas = [...facturas]
    .filter((f) => Number(f.saldo) > 0)
    .sort((a, b) => {
      const d = a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)
      return d !== 0 ? d : a.numero.localeCompare(b.numero)
    })

  const reparto: Reparto[] = []
  let restante = monto

  for (const f of ordenadas) {
    if (restante <= 0) break
    const saldo = Number(f.saldo)
    const aplicar = Math.min(restante, saldo)
    reparto.push({
      numero: f.numero,
      aplicar,
      saldoResultante: saldo - aplicar,
    })
    restante -= aplicar
  }

  return reparto
}

export function DetalleCliente({ clienteId, nombreCliente, onCerrar, onCobroRegistrado }: Props) {
  const [facturas, setFacturas] = useState<FacturaSaldo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const [montoTexto, setMontoTexto] = useState('')
  const [medio, setMedio] = useState<'efectivo' | 'deposito_directo'>('efectivo')
  const [registrando, setRegistrando] = useState(false)
  const [errorCobro, setErrorCobro] = useState<string | null>(null)

  async function cargarFacturas() {
    setCargando(true)
    const { data, error } = await supabase
      .from('v_facturas_saldo')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('anulada', false)
      .order('fecha_vencimiento')

    if (error) setError(error.message)
    else setFacturas(data ?? [])
    setCargando(false)
  }

  useEffect(() => {
    cargarFacturas()
  }, [clienteId])

  const pendientes = facturas.filter((f) => Number(f.saldo) > 0)
  const deudaTotal = pendientes.reduce((s, f) => s + Number(f.saldo), 0)

  const monto = Number(montoTexto.replace(',', '.'))
  const montoValido = montoTexto !== '' && !Number.isNaN(monto) && monto > 0
  const excede = montoValido && monto > deudaTotal
  const reparto = montoValido && !excede ? calcularReparto(monto, pendientes) : []

  async function registrar() {
    setErrorCobro(null)
    setRegistrando(true)

    // El monto se envia como string para no perder precision en el camino.
    const { error } = await supabase.rpc('registrar_cobro', {
      p_cliente_id: clienteId,
      p_monto: montoTexto.replace(',', '.'),
      p_medio: medio,
    })

    if (error) {
      setErrorCobro(error.message)
    } else {
      setMontoTexto('')
      await cargarFacturas()
      onCobroRegistrado()
    }
    setRegistrando(false)
  }

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <button onClick={onCerrar} style={{ marginBottom: 12 }}>
        &larr; Volver
      </button>

      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{nombreCliente}</h2>
      <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
        Deuda total: <strong style={{ color: '#111' }}>{dinero(deudaTotal)}</strong>
        {' · '}
        {pendientes.length} factura(s) pendiente(s)
      </p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {cargando && <p>Cargando facturas...</p>}

      {/* ---------- Registro de cobro ---------- */}
      {pendientes.length > 0 && (
        <section
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 8,
            padding: 12,
            margin: '16px 0',
          }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Registrar cobro</h3>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Monto recibido"
              value={montoTexto}
              onChange={(e) => setMontoTexto(e.target.value)}
              style={{ flex: 1, padding: 8, fontSize: 16 }}
            />
            <select
              value={medio}
              onChange={(e) => setMedio(e.target.value as typeof medio)}
              style={{ padding: 8 }}
            >
              <option value="efectivo">Efectivo</option>
              <option value="deposito_directo">Deposito del cliente</option>
            </select>
          </div>

          {excede && (
            <p style={{ color: '#dc2626', fontSize: 13, margin: '4px 0' }}>
              Excede la deuda en {dinero(monto - deudaTotal)}. El sistema no permite
              registrar un cobro mayor a lo adeudado.
            </p>
          )}

          {/* Previsualizacion: que va a pasar si confirma */}
          {reparto.length > 0 && (
            <div
              style={{
                background: '#f9fafb',
                borderRadius: 6,
                padding: 10,
                margin: '8px 0',
                fontSize: 13,
              }}
            >
              <strong style={{ display: 'block', marginBottom: 4 }}>
                Se aplicaria asi:
              </strong>
              {reparto.map((r) => (
                <div key={r.numero} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    {r.numero}
                    {r.saldoResultante === 0 && (
                      <span style={{ color: '#16a34a', fontWeight: 600 }}> (se salda)</span>
                    )}
                  </span>
                  <span>
                    {dinero(r.aplicar)}
                    {r.saldoResultante > 0 && (
                      <span style={{ color: '#666' }}> · queda {dinero(r.saldoResultante)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={registrar}
            disabled={!montoValido || excede || registrando}
            style={{ width: '100%', padding: 10, fontSize: 15 }}
          >
            {registrando ? 'Registrando...' : 'Registrar cobro'}
          </button>

          {errorCobro && (
            <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 0 }}>{errorCobro}</p>
          )}

          {medio === 'efectivo' && montoValido && !excede && (
            <p style={{ fontSize: 12, color: '#92400e', marginBottom: 0 }}>
              Queda como efectivo en tu poder hasta que registres el deposito.
            </p>
          )}
        </section>
      )}

      {/* ---------- Facturas ---------- */}
      <h3 style={{ fontSize: 15 }}>Facturas</h3>

      {facturas.map((f) => {
        const saldo = Number(f.saldo)
        const pagada = saldo <= 0
        return (
          <article
            key={f.id}
            style={{
              border: '1px solid #e5e7eb',
              borderLeftWidth: 4,
              borderLeftColor: pagada ? '#16a34a' : colorMora(f.dias_vencida),
              borderRadius: 8,
              padding: 10,
              marginBottom: 6,
              opacity: pagada ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{f.numero}</strong>
                <div style={{ fontSize: 12, color: '#666' }}>
                  Vence {fecha(f.fecha_vencimiento)}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: pagada ? '#16a34a' : colorMora(f.dias_vencida),
                  }}
                >
                  {pagada ? 'Pagada' : textoMora(f.dias_vencida)}
                </div>
              </div>

              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{dinero(f.saldo)}</div>
                {Number(f.monto_aplicado) > 0 && !pagada && (
                  <div style={{ fontSize: 11, color: '#666' }}>
                    de {dinero(f.monto_total)} · abonado {dinero(f.monto_aplicado)}
                  </div>
                )}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
