import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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

  if (!/^\d{10}$|^\d{13}$/.test(limpio)) {
    return 'Debe tener 10 digitos (cedula) o 13 (RUC).'
  }
  const provincia = Number(limpio.slice(0, 2))
  if (provincia < 1 || provincia > 24) {
    return 'Los dos primeros digitos no corresponden a una provincia.'
  }
  return null
}

/**
 * Edicion de los datos de contacto de un cliente.
 *
 * Estos campos no afectan ningun calculo de dinero, asi que se pueden corregir
 * libremente. Las restricciones fuertes estan sobre facturas y cobros, que si
 * forman parte del registro contable.
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
        setLimite(c.limite_credito ?? '')
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
        error.code === '23505'
          ? 'Ya tenes otro cliente con esa identificacion.'
          : error.message,
      )
    } else {
      onGuardado()
      onCerrar()
    }
    setGuardando(false)
  }

  if (cargando) return <p>Cargando...</p>

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <button onClick={onCerrar} style={{ marginBottom: 12 }}>
        &larr; Cancelar
      </button>

      <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Editar cliente</h2>

      <label style={etiqueta}>Nombre comercial *</label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={campo} />

      <label style={etiqueta}>RUC o cedula</label>
      <input
        inputMode="numeric"
        value={identificacion}
        onChange={(e) => setIdentificacion(e.target.value)}
        style={{ ...campo, borderColor: errorId ? '#dc2626' : '#d1d5db' }}
      />
      {errorId && <p style={aviso}>{errorId}</p>}

      <label style={etiqueta}>Direccion</label>
      <input value={direccion} onChange={(e) => setDireccion(e.target.value)} style={campo} />

      <label style={etiqueta}>Telefono</label>
      <input
        type="tel"
        inputMode="tel"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        style={campo}
      />

      <label style={etiqueta}>Ruta</label>
      <select value={rutaId} onChange={(e) => setRutaId(e.target.value)} style={campo}>
        <option value="">Sin ruta asignada</option>
        {rutas.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
          </option>
        ))}
      </select>

      <label style={etiqueta}>Limite de credito</label>
      <input
        inputMode="decimal"
        value={limite}
        onChange={(e) => setLimite(e.target.value)}
        placeholder="Opcional"
        style={campo}
      />

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

const aviso: React.CSSProperties = { fontSize: 12, color: '#dc2626', margin: '3px 0 0' }
