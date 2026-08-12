import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Campo, TituloForm, MensajeError, entrada, entradaError, botonPrimario, botonVolver } from './ui'

type Ruta = { id: string; nombre: string }

type Props = {
  vendedorId: string
  onCerrar: () => void
  onCreado: () => void
}

/**
 * Valida cédula (10 dígitos) o RUC (13) ecuatorianos.
 *
 * Verifica formato y código de provincia. El dígito verificador completo se
 * podría calcular, pero un RUC mal tipeado es un problema de datos, no de
 * seguridad: mejor un aviso claro que un bloqueo rígido.
 */
function validarIdentificacion(id: string): string | null {
  const limpio = id.trim()
  if (limpio === '') return null

  if (!/^\d{10}$|^\d{13}$/.test(limpio)) return 'Debe tener 10 dígitos (cédula) o 13 (RUC).'

  const provincia = Number(limpio.slice(0, 2))
  if (provincia < 1 || provincia > 24) return 'Los dos primeros dígitos no son una provincia válida.'

  return null
}

export function NuevoCliente({ vendedorId, onCerrar, onCreado }: Props) {
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [nombre, setNombre] = useState('')
  const [identificacion, setIdentificacion] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [rutaId, setRutaId] = useState('')
  const [limite, setLimite] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('rutas')
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setRutas(data ?? []))
  }, [])

  const errorId = validarIdentificacion(identificacion)
  const puedeGuardar = nombre.trim().length >= 2 && !errorId && !guardando

  async function guardar() {
    setError(null)
    setGuardando(true)

    const { error } = await supabase.from('clientes').insert({
      vendedor_id: vendedorId,
      nombre_comercial: nombre.trim(),
      identificacion: identificacion.trim() || null,
      direccion: direccion.trim() || null,
      telefono: telefono.trim() || null,
      ruta_id: rutaId || null,
      limite_credito: limite.trim() ? limite.replace(',', '.') : null,
    })

    if (error) {
      // El mensaje técnico de la restricción unique no le dice nada al
      // vendedor; se traduce a algo accionable.
      setError(
        error.code === '23505'
          ? 'Ya tenés un cliente registrado con esa identificación.'
          : error.message,
      )
    } else {
      onCreado()
      onCerrar()
    }
    setGuardando(false)
  }

  return (
    <div>
      <button onClick={onCerrar} className={botonVolver}>
        ← Cancelar
      </button>

      <TituloForm titulo="Nuevo cliente" />

      <div className="bg-white border border-borde rounded-xl p-4">
        <Campo etiqueta="Nombre comercial" requerido>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Comercial San José"
            className={entrada}
          />
        </Campo>

        <Campo etiqueta="RUC o cédula" error={errorId}>
          <input
            inputMode="numeric"
            value={identificacion}
            onChange={(e) => setIdentificacion(e.target.value)}
            placeholder="1791234567001"
            className={`${entrada} ${errorId ? entradaError : ''}`}
          />
        </Campo>

        <Campo etiqueta="Dirección">
          <input
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Av. Naciones Unidas y Amazonas"
            className={entrada}
          />
        </Campo>

        <Campo etiqueta="Teléfono">
          <input
            type="tel"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="0991234567"
            className={entrada}
          />
        </Campo>

        <Campo etiqueta="Ruta">
          <select value={rutaId} onChange={(e) => setRutaId(e.target.value)} className={entrada}>
            <option value="">Sin ruta asignada</option>
            {rutas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          etiqueta="Límite de crédito"
          ayuda="Si el saldo supera este monto, aparece una alerta en la lista."
        >
          <input
            inputMode="decimal"
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            placeholder="Opcional"
            className={`${entrada} cifra`}
          />
        </Campo>

        <button onClick={guardar} disabled={!puedeGuardar} className={`${botonPrimario} mt-5`}>
          {guardando ? 'Guardando…' : 'Guardar cliente'}
        </button>

        {error && <MensajeError>{error}</MensajeError>}
      </div>
    </div>
  )
}
