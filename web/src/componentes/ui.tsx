/**
 * Piezas de formulario compartidas.
 *
 * Centralizar las clases evita que cada formulario invente su propio estilo
 * de input, y hace que un ajuste al sistema visual se propague a todos.
 */

export const entrada =
  'w-full px-3 py-2.5 text-base bg-white border border-borde rounded-lg outline-none ' +
  'focus:border-marca-600 focus:ring-2 focus:ring-marca-600/20 ' +
  'placeholder:text-tinta-40 transition-colors ' +
  'disabled:bg-stone-100 disabled:text-tinta-40 disabled:cursor-not-allowed'

export const entradaError = 'border-mora-3 focus:border-mora-3 focus:ring-mora-3/20'

export const botonPrimario =
  'w-full py-3 rounded-lg bg-marca-600 text-white font-semibold text-base ' +
  'hover:bg-marca-700 active:scale-[0.99] transition ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-700'

export const botonVolver = 'text-sm text-marca-600 font-medium mb-3 hover:text-marca-700'

export function Campo({
  etiqueta,
  requerido,
  ayuda,
  error,
  children,
}: {
  etiqueta: string
  requerido?: boolean
  ayuda?: string
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <label className="block mt-4 first:mt-0">
      <span className="block text-xs font-semibold text-tinta-60 uppercase tracking-wide mb-1.5">
        {etiqueta}
        {requerido && <span className="text-mora-3 ml-0.5">*</span>}
      </span>
      {children}
      {error ? (
        <span className="block text-xs text-mora-3 mt-1">{error}</span>
      ) : ayuda ? (
        <span className="block text-xs text-tinta-60 mt-1">{ayuda}</span>
      ) : null}
    </label>
  )
}

export function TituloForm({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-xl font-bold leading-tight">{titulo}</h2>
      {subtitulo && <p className="text-sm text-tinta-60 mt-0.5">{subtitulo}</p>}
    </div>
  )
}

export function MensajeError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-sm text-mora-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {children}
    </p>
  )
}

export function Advertencia({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-custodia bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mb-4">
      {children}
    </p>
  )
}
