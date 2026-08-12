import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'
import {
  Campo,
  TituloForm,
  MensajeError,
  Advertencia,
  entrada,
  entradaError,
  botonPrimario,
  botonVolver,
} from './ui'

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
 * Edición de una factura.
 *
 * El vencimiento siempre es editable: el plazo se negocia con cada cliente y
 * puede renegociarse. El número, la emisión y el monto se bloquean en cuanto
 * entró dinero contra la factura, porque a partir de ahí forman parte del
 * registro contable. Para corregir un monto ya cobrado existe la nota de
 * crédito, que resta sin borrar la historia.
 *
 * La base aplica estas mismas reglas en editar_factura(). Bloquear los campos
 * acá es para no ofrecer una acción que fallaría.
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
          // La vista devuelve el NUMERIC como número, no como string.
          setMontoTexto(String(f.monto_total))
        }
        setCargando(false)
      })
  }, [facturaId])

  if (cargando) return <p className="text-sm text-tinta-60">Cargando…</p>
  if (!factura) return <p className="text-sm text-tinta-60">No se encontró la factura.</p>

  const aplicado = Number(factura.monto_aplicado)
  const tieneCobros = aplicado > 0

  const monto = Number(montoTexto.replace(',', '.'))
  const montoValido = montoTexto !== '' && !Number.isNaN(monto) && monto > 0
  const fechasValidas = vencimiento !== '' && vencimiento >= emision
  const cambioVencimiento = vencimiento !== factura.fecha_vencimiento
  const puedeGuardar = numero.trim() !== '' && montoValido && fechasValidas && !guardando

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
    <div>
      <button onClick={onCerrar} className={botonVolver}>
        ← Cancelar
      </button>

      <TituloForm titulo="Editar factura" subtitulo={factura.numero} />

      {tieneCobros && (
        <Advertencia>
          Esta factura tiene <strong className="cifra">{dinero(aplicado)}</strong> cobrados. Solo
          se puede cambiar la fecha de vencimiento. Para corregir el monto hace falta una nota de
          crédito.
        </Advertencia>
      )}

      <div className="bg-white border border-borde rounded-xl p-4">
        <Campo etiqueta="Número de factura">
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            disabled={tieneCobros}
            className={entrada}
          />
        </Campo>

        <Campo etiqueta="Monto total">
          <input
            inputMode="decimal"
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
            disabled={tieneCobros}
            className={`${entrada} cifra text-lg`}
          />
        </Campo>

        <Campo etiqueta="Fecha de emisión">
          <input
            type="date"
            value={emision}
            onChange={(e) => setEmision(e.target.value)}
            disabled={tieneCobros}
            className={entrada}
          />
        </Campo>

        <Campo
          etiqueta="Fecha de vencimiento"
          requerido
          error={
            vencimiento !== '' && !fechasValidas ? 'No puede ser anterior a la emisión.' : null
          }
          ayuda={
            cambioVencimiento
              ? 'Cambiar el vencimiento modifica los días de mora y queda registrado en la bitácora.'
              : undefined
          }
        >
          <input
            type="date"
            value={vencimiento}
            min={emision}
            onChange={(e) => setVencimiento(e.target.value)}
            className={`${entrada} ${vencimiento !== '' && !fechasValidas ? entradaError : ''}`}
          />
        </Campo>

        <button onClick={guardar} disabled={!puedeGuardar} className={`${botonPrimario} mt-5`}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>

        {error && <MensajeError>{error}</MensajeError>}
      </div>
    </div>
  )
}
