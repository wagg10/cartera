import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Modo = 'entrar' | 'registrar' | 'recuperar'

/**
 * Pantalla de acceso: login, registro y recuperacion.
 *
 * El registro es abierto. RLS garantiza que cada cuenta nueva solo ve su
 * propia cartera, asi que abrir el registro no compromete los datos de nadie.
 */
export function Acceso() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

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
      // Mensaje vago a proposito: decir "ese correo no existe" le confirmaria
      // a un atacante que correos SI estan registrados.
      setError(
        error.message.includes('Invalid login')
          ? 'Correo o contraseña incorrectos.'
          : error.message.includes('not confirmed')
            ? 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada.'
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
      // El nombre viaja en metadatos y lo usa el trigger trg_crear_perfil.
      // El ROL nunca viaja desde aca: se asigna 'vendedor' en el servidor.
      options: { data: { nombre: nombre.trim() } },
    })

    if (error) {
      setError(
        error.message.includes('already registered')
          ? 'Ese correo ya tiene una cuenta. Probá iniciar sesión.'
          : error.message,
      )
    } else if (!data.session) {
      setAviso(`Te enviamos un correo a ${email}. Abrilo para confirmar tu cuenta.`)
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
    else
      setAviso(
        'Si ese correo tiene una cuenta, vas a recibir un enlace para cambiar la contraseña.',
      )
    setEnviando(false)
  }

  const emailValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)

  const puedeEnviar =
    modo === 'recuperar'
      ? emailValido && !enviando
      : modo === 'registrar'
        ? emailValido && password.length >= LARGO_MINIMO && nombre.trim().length >= 2 && !enviando
        : emailValido && password.length > 0 && !enviando

  const accion = modo === 'entrar' ? entrar : modo === 'registrar' ? registrar : recuperar

  return (
    <div className="min-h-screen bg-fondo flex flex-col">
      {/* Banda de marca: ancla la identidad sin robar espacio al formulario */}
      <div className="bg-marca-700 px-5 pt-10 pb-8">
        <div className="max-w-sm w-full mx-auto">
          <h1 className="font-display text-3xl font-bold text-white tracking-tight">Cartera</h1>
          <p className="text-marca-100 text-sm mt-1">Control de cobranzas en ruta</p>
        </div>
      </div>

      <div className="flex-1 px-5 py-6 max-w-sm w-full mx-auto">
        {modo === 'registrar' && (
          <Campo etiqueta="Nombre completo">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Carlos Andrade"
              className={entrada}
            />
          </Campo>
        )}

        <Campo etiqueta="Correo">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className={entrada}
          />
        </Campo>

        {modo !== 'recuperar' && (
          <Campo etiqueta="Contraseña">
            <input
              type="password"
              autoComplete={modo === 'registrar' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${entrada} ${passwordCorta ? 'border-mora-3' : ''}`}
            />
            {modo === 'registrar' && (
              <p className={`text-xs mt-1 ${passwordCorta ? 'text-mora-3' : 'text-tinta-60'}`}>
                Mínimo {LARGO_MINIMO} caracteres.
              </p>
            )}
          </Campo>
        )}

        <button onClick={accion} disabled={!puedeEnviar} className={`${botonPrimario} mt-5`}>
          {enviando
            ? 'Un momento…'
            : modo === 'entrar'
              ? 'Entrar'
              : modo === 'registrar'
                ? 'Crear cuenta'
                : 'Enviar enlace'}
        </button>

        {error && (
          <p className="mt-3 text-sm text-mora-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {aviso && (
          <p className="mt-3 text-sm text-pagado bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {aviso}
          </p>
        )}

        <div className="mt-7 text-sm text-tinta-60 space-y-1.5">
          {modo === 'entrar' ? (
            <>
              <p>
                ¿No tenés cuenta?{' '}
                <button onClick={() => cambiarModo('registrar')} className={enlace}>
                  Crear una
                </button>
              </p>
              <p>
                <button onClick={() => cambiarModo('recuperar')} className={enlace}>
                  ¿Olvidaste tu contraseña?
                </button>
              </p>
            </>
          ) : (
            <button onClick={() => cambiarModo('entrar')} className={enlace}>
              ← Volver a iniciar sesión
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block mt-4 first:mt-0">
      <span className="block text-xs font-semibold text-tinta-60 uppercase tracking-wide mb-1.5">
        {etiqueta}
      </span>
      {children}
    </label>
  )
}

const entrada =
  'w-full px-3 py-2.5 text-base bg-white border border-borde rounded-lg ' +
  'outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-600/20 ' +
  'placeholder:text-tinta-40 transition-colors'

const botonPrimario =
  'w-full py-3 rounded-lg bg-marca-600 text-white font-semibold text-base ' +
  'hover:bg-marca-700 active:scale-[0.99] transition ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-700'

const enlace = 'text-marca-600 font-medium underline underline-offset-2 hover:text-marca-700'
