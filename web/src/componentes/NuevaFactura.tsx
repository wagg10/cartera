import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'
import { Campo, TituloForm, MensajeError, entrada, entradaError, botonPrimario, botonVolver } from './ui'

type Props = {
  vendedorId: string
  clienteId: string
  nombreCliente: string
  onCerrar: () => void
  onCreada: () => void
}

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
  // El número se copia de la factura física que emite la empresa: la app no
  // lo genera. Inventar un número propio rompería la trazabilidad con el
  // sistema corporativo, que es lo que el vendedor necesita al reclamar.
  const [numero, setNumero] = useState('')
  const [emision, setEmision] = useState(hoyISO())
  const [vencimiento, setVencimiento] = useState('')
  const [montoTexto, setMontoTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monto = Number(montoTexto.replace(',', '.'))
  const montoValido = montoTexto !== '' && !Number.isNaN(monto) && monto > 0
  const fechasValidas = vencimiento !== '' && vencimiento >= emision
  const puedeGuardar = numero.trim() !== '' && montoValido && fechasValidas && !guardando

  // El plazo se negocia con cada cliente, no sigue una regla fija: se muestra
  // solo como confirmación de lo que se acaba de elegir.
  const diasPlazo = fechasValidas
    ? Math.round((new Date(vencimiento).getTime() - new Date(emision).getTime()) / 86400000)
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
      // perdería precisión antes de llegar.
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
    <div>
      <button onClick={onCerrar} className={botonVolver}>
        ← Cancelar
      </button>

      <TituloForm titulo="Nueva factura" subtitulo={nombreCliente} />

      <div className="bg-white border border-borde rounded-xl p-4">
        <Campo etiqueta="Número de factura" requerido ayuda="Copialo de la factura física.">
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="FAC-001-2451"
            className={entrada}
          />
        </Campo>

        <Campo etiqueta="Monto total" requerido ayuda={montoValido ? dinero(monto) : undefined}>
          <input
            inputMode="decimal"
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
            placeholder="5000.00"
            className={`${entrada} cifra text-lg`}
          />
        </Campo>

        <Campo etiqueta="Fecha de emisión" requerido>
          <input
            type="date"
            value={emision}
            onChange={(e) => setEmision(e.target.value)}
            className={entrada}
          />
        </Campo>

        <Campo
          etiqueta="Fecha de vencimiento"
          requerido
          error={
            vencimiento !== '' && !fechasValidas
              ? 'No puede ser anterior a la emisión.'
              : null
          }
          ayuda={diasPlazo !== null ? `Plazo acordado: ${diasPlazo} días.` : undefined}
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
          {guardando ? 'Guardando…' : 'Guardar factura'}
        </button>

        {error && <MensajeError>{error}</MensajeError>}
      </div>
    </div>
  )
}
