import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'

type Props = {
  vendedorId: string
  clienteId: string
  nombreCliente: string
  onCerrar: () => void
  onCreada: () => void
}

/** Fecha de hoy en formato YYYY-MM-DD, para los campos date. */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function NuevaFactura({
  vendedorId,
  clienteId,
  nombreCliente,
  onCerrar,
  onCreada,
}: Props) {
  // El numero se copia de la factura fisica que emite la empresa: la app no
  // lo genera. Inventar un numero propio romperia la trazabilidad con el
  // sistema corporativo, que es justo lo que el vendedor necesita al reclamar.
  const [numero, setNumero] = useState('')
  const [emision, setEmision] = useState(hoyISO())
  const [vencimiento, setVencimiento] = useState('')
  const [montoTexto, setMontoTexto] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monto = Number(montoTexto.replace(',', '.'))
  const montoValido = montoTexto !== '' && !Number.isNaN(monto) && monto > 0

  const fechasValidas = vencimiento !== '' && vencimiento >= emision
  const numeroValido = numero.trim().length > 0

  const puedeGuardar = numeroValido && montoValido && fechasValidas && !guardando

  // El plazo se negocia con cada cliente, no sigue una regla fija.
  // Se muestra solo como referencia de lo que se acaba de elegir.
  const diasPlazo =
    fechasValidas
      ? Math.round(
          (new Date(vencimiento).getTime() - new Date(emision).getTime()) / 86400000,
        )
      : null

  async function guardar() {
    setError(null)
    setGuardando(true)

    const { error } = await supabase.from('facturas').insert({
      vendedor_id: vendedorId,
      cliente_id: clienteId,
      numero: numero.trim(),
      fecha_emision: emision,
      fecha_vencimiento: vencimiento,
      // Como string: es NUMERIC(18,4) en la base y convertirlo a number
      // perderia precision antes de llegar.
      monto_total: montoTexto.replace(',', '.'),
    })

    if (error) {
      setError(
        error.code === '23505'
          ? `Ya registraste una factura ${numero.trim()} para este cliente.`
          : error.message,
      )
    } else {
      onCreada()
      onCerrar()
    }
    setGuardando(false)
  }

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <button onClick={onCerrar} style={{ marginBottom: 12 }}>
        &larr; Cancelar
      </button>

      <h2 style={{ margin: '0 0 2px', fontSize: 20 }}>Nueva factura</h2>
      <p style={{ margin: 0, color: '#666', fontSize: 14 }}>{nombreCliente}</p>

      <label style={etiqueta}>Numero de factura *</label>
      <input
        type="text"
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        placeholder="FAC-001-2451"
        style={campo}
      />
      <p style={{ ...aviso, color: '#666' }}>Copialo de la factura fisica.</p>

      <label style={etiqueta}>Monto total *</label>
      <input
        type="text"
        inputMode="decimal"
        value={montoTexto}
        onChange={(e) => setMontoTexto(e.target.value)}
        placeholder="5000.00"
        style={campo}
      />
      {montoValido && (
        <p style={{ ...aviso, color: '#666' }}>{dinero(monto)}</p>
      )}

      <label style={etiqueta}>Fecha de emision *</label>
      <input
        type="date"
        value={emision}
        onChange={(e) => setEmision(e.target.value)}
        style={campo}
      />

      <label style={etiqueta}>Fecha de vencimiento *</label>
      <input
        type="date"
        value={vencimiento}
        min={emision}
        onChange={(e) => setVencimiento(e.target.value)}
        style={{
          ...campo,
          borderColor: vencimiento !== '' && !fechasValidas ? '#dc2626' : '#d1d5db',
        }}
      />

      {vencimiento !== '' && !fechasValidas && (
        <p style={aviso}>El vencimiento no puede ser anterior a la emision.</p>
      )}

      {diasPlazo !== null && (
        <p style={{ ...aviso, color: '#666' }}>
          Plazo acordado: {diasPlazo} dias.
        </p>
      )}

      <button
        onClick={guardar}
        disabled={!puedeGuardar}
        style={{ width: '100%', padding: 10, fontSize: 15, marginTop: 14 }}
      >
        {guardando ? 'Guardando...' : 'Guardar factura'}
      </button>

      {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}
    </div>
  )
}

const etiqueta: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  marginTop: 10,
  marginBottom: 3,
}

const campo: React.CSSProperties = {
  width: '100%',
  padding: 8,
  fontSize: 15,
}

const aviso: React.CSSProperties = {
  fontSize: 12,
  color: '#dc2626',
  margin: '3px 0 0',
}
