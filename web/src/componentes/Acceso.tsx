import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Modo = 'entrar' | 'registrar' | 'recuperar'

/**
 * Pantalla de acceso: login, registro y recuperacion de contrasena.
 *
 * El registro es abierto. RLS garantiza que cada cuenta nueva solo ve su
 * propia cartera: un desconocido que se registre encuentra una pantalla
 * vacia y no puede alcanzar los datos de nadie mas. Esa es la razon por la
 * que abrir el registro no compromete la seguridad.
 */
export function Acceso() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Debe coincidir con minimum_password_length del servidor. Validarlo aca
  // evita un viaje de ida y vuelta para decir algo que ya sabemos.
  const LARGO_MINIMO = 10
  const passwordCorta = password.length > 0 && password.length < LARGO_MINIMO

  function limpiar() {
    setError(null)
    setAviso(null)
  }

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo)
    limpiar()
    setPassword('')
  }

  async function entrar() {
    limpiar()
    setEnviando(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Mensaje deliberadamente vago: decir "ese correo no existe" le
      // confirmaria a un atacante que correos SI estan registrados.
      setError(
        error.message.includes('Invalid login')
          ? 'Correo o contrasena incorrectos.'
          : error.message.includes('not confirmed')
            ? 'Todavia no confirmaste tu correo. Revisa tu bandeja de entrada.'
            : error.message,
      )
    }
    setEnviando(false)
  }

  async function registrar() {
    limpiar()
    setEnviando(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // El nombre viaja en los metadatos; el trigger trg_crear_perfil lo
        // usa al crear el perfil. El ROL nunca viaja desde aca: siempre se
        // asigna 'vendedor' en el servidor.
        data: { nombre: nombre.trim() },
      },
    })

    if (error) {
      setError(
        error.message.includes('already registered')
          ? 'Ese correo ya tiene una cuenta. Proba iniciar sesion.'
          : error.message,
      )
    } else if (data.session) {
      // Hay sesion inmediata: el proyecto no exige confirmacion de correo.
      // No hace falta avisar nada, onAuthStateChange redirige solo.
    } else {
      setAviso(
        `Te enviamos un correo a ${email}. Abrilo y confirma tu cuenta para poder entrar.`,
      )
    }
    setEnviando(false)
  }

  async function recuperar() {
    limpiar()
    setEnviando(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })

    if (error) setError(error.message)
    else {
      // Se responde igual exista o no la cuenta, para no revelar que
      // correos estan registrados.
      setAviso('Si ese correo tiene una cuenta, vas a recibir un enlace para cambiar la contrasena.')
    }
    setEnviando(false)
  }

  const emailValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)

  const puedeEnviar =
    modo === 'recuperar'
      ? emailValido && !enviando
      : modo === 'registrar'
        ? emailValido && password.length >= LARGO_MINIMO && nombre.trim().length >= 2 && !enviando
        : emailValido && password.length > 0 && !enviando

  return (
    <div style={{ maxWidth: 340, margin: '60px auto', padding: 16, fontFamily: 'system-ui' }}>
      <h1 style={{ marginBottom: 4 }}>Cartera</h1>
      <p style={{ margin: '0 0 20px', color: '#666', fontSize: 14 }}>
        Control de cobranzas para agentes vendedores
      </p>

      {modo === 'registrar' && (
        <>
          <label style={etiqueta}>Nombre completo</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Carlos Andrade"
            style={campo}
          />
        </>
      )}

      <label style={etiqueta}>Correo</label>
      <input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@correo.com"
        style={campo}
      />

      {modo !== 'recuperar' && (
        <>
          <label style={etiqueta}>Contrasena</label>
          <input
            type="password"
            autoComplete={modo === 'registrar' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...campo, borderColor: passwordCorta ? '#dc2626' : '#d1d5db' }}
          />
          {modo === 'registrar' && (
            <p style={{ fontSize: 12, color: passwordCorta ? '#dc2626' : '#666', margin: '3px 0 0' }}>
              Minimo {LARGO_MINIMO} caracteres.
            </p>
          )}
        </>
      )}

      <button
        onClick={modo === 'entrar' ? entrar : modo === 'registrar' ? registrar : recuperar}
        disabled={!puedeEnviar}
        style={{ width: '100%', padding: 10, fontSize: 15, marginTop: 16 }}
      >
        {enviando
          ? 'Un momento...'
          : modo === 'entrar'
            ? 'Entrar'
            : modo === 'registrar'
              ? 'Crear cuenta'
              : 'Enviar enlace'}
      </button>

      {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}

      {aviso && (
        <p
          style={{
            fontSize: 13,
            color: '#15803d',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          {aviso}
        </p>
      )}

      <div style={{ marginTop: 20, fontSize: 13, color: '#666' }}>
        {modo === 'entrar' && (
          <>
            <p style={{ margin: '0 0 6px' }}>
              No tenes cuenta?{' '}
              <button onClick={() => cambiarModo('registrar')} style={enlace}>
                Crear una
              </button>
            </p>
            <p style={{ margin: 0 }}>
              <button onClick={() => cambiarModo('recuperar')} style={enlace}>
                Olvidaste tu contrasena?
              </button>
            </p>
          </>
        )}

        {modo !== 'entrar' && (
          <p style={{ margin: 0 }}>
            <button onClick={() => cambiarModo('entrar')} style={enlace}>
              &larr; Volver a iniciar sesion
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

const etiqueta: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  marginTop: 12,
  marginBottom: 3,
}

const campo: React.CSSProperties = { width: '100%', padding: 9, fontSize: 15 }

const enlace: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#1d4ed8',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 13,
}
