import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Campo, TituloForm, MensajeError, entrada, entradaError, botonPrimario, botonVolver } from './ui'

type Ruta = { id: string; nombre: string }

type ClienteEditable = {
  id: string
  nombre_comercial: string
  identificacion: string | null
  direccion: string | null
  telefono: string | null
  ruta_id: string | null
  limite_credito: string | null
}

type Props = {
  clienteId: string
  onCerrar: () => void
  onGuardado: () => void
}

function validarIdentificacion(id: string): string | null {
  const limpio = id.trim()
  if (limpio === '') return null
  if (!/^\d{10}$|^\d{13}$/.test(limpio)) return 'Debe tener 10 dígitos (cédula) o 13 (RUC).'
  const provincia = Number(limpio.slice(0, 2))
  if (provincia < 1 || provincia > 24) return 'Los dos primeros dígitos no son una provincia válida.'
  return null
}

/**
 * Edición de los datos de contacto de un cliente.
 *
 * Estos campos no afectan ningún cálculo de dinero, así que se corrigen
 * libremente. Las restricciones fuertes están sobre facturas y cobros, que
 * sí forman parte del registro contable.
 */
export function EditarCliente({ clienteId, onCerrar, onGuardado }: Props) {
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [cargando, setCargando] = useState(true)
  const [nombre, setNombre] = useState('')
  const [identificacion, setIdentificacion] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [rutaId, setRutaId] = useState('')
  const [limite, setLimite] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('clientes').select('*').eq('id', clienteId).single(),
      supabase.from('rutas').select('id, nombre').eq('activa', true).order('nombre'),
    ]).then(([cli, rut]) => {
      const c = cli.data as ClienteEditable | null
      if (c) {
        setNombre(c.nombre_comercial)
        setIdentificacion(c.identificacion ?? '')
        setDireccion(c.direccion ?? '')
        setTelefono(c.telefono ?? '')
        setRutaId(c.ruta_id ?? '')
        // Puede llegar como número desde Postgres: se normaliza a texto.
        setLimite(c.limite_credito != null ? String(c.limite_credito) : '')
      }
      setRutas(rut.data ?? [])
      setCargando(false)
    })
  }, [clienteId])

  const errorId = validarIdentificacion(identificacion)
  const puedeGuardar = nombre.trim().length >= 2 && !errorId && !guardando

  async function guardar() {
    setError(null)
    setGuardando(true)

    const { error } = await supabase
      .from('clientes')
      .update({
        nombre_comercial: nombre.trim(),
        identificacion: identificacion.trim() || null,
        direccion: direccion.trim() || null,
        telefono: telefono.trim() || null,
        ruta_id: rutaId || null,
        limite_credito: limite.trim() ? limite.replace(',', '.') : null,
      })
      .eq('id', clienteId)

    if (error) {
      setError(
        error.code === '23505' ? 'Ya tenés otro cliente con esa identificación.' : error.message,
      )
    } else {
      onGuardado()
      onCerrar()
    }
    setGuardando(false)
  }

  if (cargando) return <p className="text-sm text-tinta-60">Cargando…</p>

  return (
    <div>
      <button onClick={onCerrar} className={botonVolver}>
        ← Cancelar
      </button>

      <TituloForm titulo="Editar cliente" />

      <div className="bg-white border border-borde rounded-xl p-4">
        <Campo etiqueta="Nombre comercial" requerido>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={entrada} />
        </Campo>

        <Campo etiqueta="RUC o cédula" error={errorId}>
          <input
            inputMode="numeric"
            value={identificacion}
            onChange={(e) => setIdentificacion(e.target.value)}
            className={`${entrada} ${errorId ? entradaError : ''}`}
          />
        </Campo>

        <Campo etiqueta="Dirección">
          <input
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className={entrada}
          />
        </Campo>

        <Campo etiqueta="Teléfono">
          <input
            type="tel"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
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

        <Campo etiqueta="Límite de crédito">
          <input
            inputMode="decimal"
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            placeholder="Opcional"
            className={`${entrada} cifra`}
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
