import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Ruta = { id: string; nombre: string }

type Props = {
  vendedorId: string
  onCerrar: () => void
  onCreado: () => void
}

/**
 * Valida cedula (10 digitos) o RUC (13) ecuatorianos.
 *
 * Solo verifica el formato y el codigo de provincia. El digito verificador
 * completo se podria calcular, pero un RUC valido mal tipeado es un problema
 * de datos, no de seguridad: mejor un aviso suave que un bloqueo.
 */
function validarIdentificacion(id: string): string | null {
  const limpio = id.trim()
  if (limpio === '') return null // opcional

  if (!/^\d{10}$|^\d{13}$/.test(limpio)) {
    return 'Debe tener 10 digitos (cedula) o 13 (RUC).'
  }

  const provincia = Number(limpio.slice(0, 2))
  if (provincia < 1 || provincia > 24) {
    return 'Los dos primeros digitos no corresponden a una provincia.'
  }

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
  const nombreValido = nombre.trim().length >= 2
  const puedeGuardar = nombreValido && !errorId && !guardando

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
      // El limite viaja como string: es NUMERIC en la base.
      limite_credito: limite.trim() ? limite.replace(',', '.') : null,
    })

    if (error) {
      // La restriccion unique (vendedor_id, identificacion) da un mensaje
      // tecnico; se traduce a algo que el vendedor pueda entender.
      setError(
        error.code === '23505'
          ? 'Ya tenes un cliente registrado con esa identificacion.'
          : error.message,
      )
    } else {
      onCreado()
      onCerrar()
    }
    setGuardando(false)
  }

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <button onClick={onCerrar} style={{ marginBottom: 12 }}>
        &larr; Cancelar
      </button>

      <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Nuevo cliente</h2>

      <label style={etiqueta}>Nombre comercial *</label>
      <input
        type="text"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Comercial San Jose"
        style={campo}
      />

      <label style={etiqueta}>RUC o cedula</label>
      <input
        type="text"
        inputMode="numeric"
        value={identificacion}
        onChange={(e) => setIdentificacion(e.target.value)}
        placeholder="1791234567001"
        style={{ ...campo, borderColor: errorId ? '#dc2626' : '#d1d5db' }}
      />
      {errorId && <p style={aviso}>{errorId}</p>}

      <label style={etiqueta}>Direccion</label>
      <input
        type="text"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
        placeholder="Av. Naciones Unidas y Amazonas"
        style={campo}
      />

      <label style={etiqueta}>Telefono</label>
      <input
        type="tel"
        inputMode="tel"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        placeholder="0991234567"
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
        type="text"
        inputMode="decimal"
        value={limite}
        onChange={(e) => setLimite(e.target.value)}
        placeholder="Opcional"
        style={campo}
      />
      <p style={{ ...aviso, color: '#666' }}>
        Si el saldo del cliente supera este monto, aparece una alerta en la lista.
      </p>

      <button
        onClick={guardar}
        disabled={!puedeGuardar}
        style={{ width: '100%', padding: 10, fontSize: 15, marginTop: 12 }}
      >
        {guardando ? 'Guardando...' : 'Guardar cliente'}
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
