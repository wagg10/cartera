import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'

type FacturaEditable = {
  id: string
  numero: string
  fecha_emision: string
  fecha_vencimiento: string
  monto_total: string
  monto_aplicado: string
}

type Props = {
  facturaId: string
  onCerrar: () => void
  onGuardada: () => void
}

/**
 * Edicion de una factura.
 *
 * El vencimiento siempre es editable: el plazo se negocia con cada cliente y
 * puede renegociarse. El numero, la emision y el monto se bloquean en cuanto
 * entro dinero contra la factura, porque a partir de ahi forman parte del
 * registro contable. Para corregir un monto ya cobrado existe la nota de
 * credito, que resta sin borrar la historia.
 *
 * La base de datos aplica estas mismas reglas en editar_factura(). Bloquear
 * los campos aca es para no ofrecer una accion que fallaria.
 */
export function EditarFactura({ facturaId, onCerrar, onGuardada }: Props) {
  const [factura, setFactura] = useState<FacturaEditable | null>(null)
  const [cargando, setCargando] = useState(true)

  const [numero, setNumero] = useState('')
  const [emision, setEmision] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [montoTexto, setMontoTexto] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('v_facturas_saldo')
      .select('id, numero, fecha_emision, fecha_vencimiento, monto_total, monto_aplicado')
      .eq('id', facturaId)
      .single()
      .then(({ data }) => {
        const f = data as FacturaEditable | null
        if (f) {
          setFactura(f)
          setNumero(f.numero)
          setEmision(f.fecha_emision)
          setVencimiento(f.fecha_vencimiento)
          setMontoTexto(String(f.monto_total))
        }
        setCargando(false)
      })
  }, [facturaId])

  if (cargando) return <p>Cargando...</p>
  if (!factura) return <p>No se encontro la factura.</p>

  const aplicado = Number(factura.monto_aplicado)
  const tieneCobros = aplicado > 0

  const monto = Number(montoTexto.replace(',', '.'))
  const montoValido = montoTexto !== '' && !Number.isNaN(monto) && monto > 0
  const fechasValidas = vencimiento !== '' && vencimiento >= emision
  const puedeGuardar =
    numero.trim() !== '' && montoValido && fechasValidas && !guardando

  async function guardar() {
    setError(null)
    setGuardando(true)

    const { error } = await supabase.rpc('editar_factura', {
      p_factura_id: facturaId,
      p_fecha_vencimiento: vencimiento,
      p_numero: numero.trim(),
      p_fecha_emision: emision,
      p_monto_total: montoTexto.replace(',', '.'),
    })

    if (error) setError(error.message)
    else {
      onGuardada()
      onCerrar()
    }
    setGuardando(false)
  }

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <button onClick={onCerrar} style={{ marginBottom: 12 }}>
        &larr; Cancelar
      </button>

      <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Editar factura</h2>

      {tieneCobros && (
        <p
          style={{
            fontSize: 12,
            color: '#92400e',
            background: '#fffbeb',
            border: '1px solid #fbbf24',
            borderRadius: 6,
            padding: '8px 10px',
            margin: '0 0 12px',
          }}
        >
          Esta factura tiene {dinero(aplicado)} cobrados. Solo se puede cambiar la fecha
          de vencimiento. Para corregir el monto hace falta una nota de credito.
        </p>
      )}

      <label style={etiqueta}>Numero de factura</label>
      <input
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        disabled={tieneCobros}
        style={{ ...campo, ...(tieneCobros ? bloqueado : {}) }}
      />

      <label style={etiqueta}>Monto total</label>
      <input
        inputMode="decimal"
        value={montoTexto}
        onChange={(e) => setMontoTexto(e.target.value)}
        disabled={tieneCobros}
        style={{ ...campo, ...(tieneCobros ? bloqueado : {}) }}
      />

      <label style={etiqueta}>Fecha de emision</label>
      <input
        type="date"
        value={emision}
        onChange={(e) => setEmision(e.target.value)}
        disabled={tieneCobros}
        style={{ ...campo, ...(tieneCobros ? bloqueado : {}) }}
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

      {vencimiento !== factura.fecha_vencimiento && (
        <p style={{ ...aviso, color: '#666' }}>
          El cambio de vencimiento modifica los dias de mora y queda registrado en la
          bitacora.
        </p>
      )}

      <button
        onClick={guardar}
        disabled={!puedeGuardar}
        style={{ width: '100%', padding: 10, fontSize: 15, marginTop: 14 }}
      >
        {guardando ? 'Guardando...' : 'Guardar cambios'}
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

const campo: React.CSSProperties = { width: '100%', padding: 8, fontSize: 15 }

const bloqueado: React.CSSProperties = { background: '#f3f4f6', color: '#6b7280' }

const aviso: React.CSSProperties = { fontSize: 12, color: '#dc2626', margin: '3px 0 0' }
