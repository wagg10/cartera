import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, fecha } from '../lib/formato'

type FacturaSaldo = {
  id: string
  numero: string
  fecha_emision: string
  fecha_vencimiento: string
  monto_total: string
  monto_aplicado: string
  saldo: string
  estado: string
  dias_vencida: number
}

type CobroRegistrado = {
  id: string
  monto: string
  medio: 'efectivo' | 'deposito_directo'
  estado: 'recibido' | 'depositado' | 'confirmado' | 'anulado'
  recibido_en: string
  deposito_en: string | null
  deposito_banco: string | null
  deposito_comprobante: string | null
  notas: string | null
}

type Props = {
  clienteId: string
  nombreCliente: string
  onCerrar: () => void
  onCobroRegistrado: () => void
  soloLectura?: boolean
  onEditarFactura?: (facturaId: string) => void
}

type Reparto = { numero: string; aplicar: number; saldoResultante: number }

/**
 * Calcula cómo se repartiría un cobro, sin registrarlo.
 *
 * Replica la lógica de registrar_cobro para mostrarla ANTES de confirmar.
 * La base de datos sigue siendo la autoridad: esto es solo una vista previa
 * para que el vendedor sepa qué va a pasar antes de que pase.
 */
function calcularReparto(monto: number, facturas: FacturaSaldo[]): Reparto[] {
  const ordenadas = [...facturas]
    .filter((f) => Number(f.saldo) > 0)
    .sort((a, b) => {
      const d = a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)
      return d !== 0 ? d : a.numero.localeCompare(b.numero)
    })

  const reparto: Reparto[] = []
  let restante = monto

  for (const f of ordenadas) {
    if (restante <= 0) break
    const saldo = Number(f.saldo)
    const aplicar = Math.min(restante, saldo)
    reparto.push({ numero: f.numero, aplicar, saldoResultante: saldo - aplicar })
    restante -= aplicar
  }
  return reparto
}

function estiloMora(dias: number) {
  if (dias < 0) return { color: 'text-tinta-40', barra: 'bg-tinta-40' }
  if (dias === 0) return { color: 'text-mora-1', barra: 'bg-mora-1' }
  if (dias <= 30) return { color: 'text-mora-1', barra: 'bg-mora-1' }
  if (dias <= 60) return { color: 'text-mora-2', barra: 'bg-mora-2' }
  return { color: 'text-mora-3', barra: 'bg-mora-3' }
}

function textoMoraCorto(dias: number): string {
  if (dias < 0) return `Vence en ${Math.abs(dias)} d`
  if (dias === 0) return 'Vence hoy'
  return `${dias} d de mora`
}

/**
 * Presentación de cada estado de cobro.
 *
 * El caso que más importa distinguir es 'efectivo / recibido': el cliente ya
 * pagó, pero el dinero sigue en poder del vendedor.
 */
function estiloEstado(c: CobroRegistrado) {
  if (c.estado === 'anulado')
    return { etiqueta: 'Anulado', texto: 'text-tinta-40', fondo: 'bg-stone-50 border-borde' }
  if (c.medio === 'efectivo' && c.estado === 'recibido')
    return {
      etiqueta: 'Efectivo · sin depositar',
      texto: 'text-custodia',
      fondo: 'bg-amber-50 border-amber-300',
    }
  if (c.medio === 'efectivo')
    return {
      etiqueta: 'Efectivo · depositado',
      texto: 'text-pagado',
      fondo: 'bg-emerald-50 border-emerald-200',
    }
  return {
    etiqueta: 'Depósito del cliente',
    texto: 'text-blue-700',
    fondo: 'bg-blue-50 border-blue-200',
  }
}

export function DetalleCliente({
  clienteId,
  nombreCliente,
  onCerrar,
  onCobroRegistrado,
  soloLectura = false,
  onEditarFactura,
}: Props) {
  const [facturas, setFacturas] = useState<FacturaSaldo[]>([])
  const [cobros, setCobros] = useState<CobroRegistrado[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const [montoTexto, setMontoTexto] = useState('')
  const [medio, setMedio] = useState<'efectivo' | 'deposito_directo'>('efectivo')
  const [registrando, setRegistrando] = useState(false)
  const [errorCobro, setErrorCobro] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    const [fact, cob] = await Promise.all([
      supabase
        .from('v_facturas_saldo')
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('anulada', false)
        .order('fecha_vencimiento'),
      supabase
        .from('cobros')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('recibido_en', { ascending: false }),
    ])

    if (fact.error) setError(fact.error.message)
    else setFacturas(fact.data ?? [])
    setCobros(cob.data ?? [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
  }, [clienteId])

  const pendientes = facturas.filter((f) => Number(f.saldo) > 0)
  const deudaTotal = pendientes.reduce((s, f) => s + Number(f.saldo), 0)
  const cobrosVigentes = cobros.filter((c) => c.estado !== 'anulado')
  const totalCobrado = cobrosVigentes.reduce((s, c) => s + Number(c.monto), 0)

  const monto = Number(montoTexto.replace(',', '.'))
  const montoValido = montoTexto !== '' && !Number.isNaN(monto) && monto > 0
  const excede = montoValido && monto > deudaTotal
  const reparto = montoValido && !excede ? calcularReparto(monto, pendientes) : []

  async function registrar() {
    setErrorCobro(null)
    setRegistrando(true)

    // El monto viaja como string: convertirlo a number perdería precisión
    // antes de llegar al NUMERIC de Postgres.
    const { error } = await supabase.rpc('registrar_cobro', {
      p_cliente_id: clienteId,
      p_monto: montoTexto.replace(',', '.'),
      p_medio: medio,
    })

    if (error) setErrorCobro(error.message)
    else {
      setMontoTexto('')
      await cargar()
      onCobroRegistrado()
    }
    setRegistrando(false)
  }

  return (
    <div>
      <button onClick={onCerrar} className="text-sm text-marca-600 font-medium mb-3">
        ← Volver
      </button>

      <div className="bg-white border border-borde rounded-xl p-4 mb-4">
        <h2 className="font-display text-xl font-bold leading-tight">{nombreCliente}</h2>
        <div className="flex items-baseline justify-between gap-3 mt-2">
          <span className="text-xs font-semibold text-tinta-60 uppercase tracking-wide">
            Deuda total
          </span>
          <span className="cifra text-2xl font-bold">{dinero(deudaTotal)}</span>
        </div>
        <p className="text-xs text-tinta-60 mt-1">
          {pendientes.length} factura{pendientes.length !== 1 && 's'} pendiente
          {pendientes.length !== 1 && 's'}
        </p>

        {soloLectura && (
          <p className="mt-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
            Vista de supervisión: solo lectura.
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-mora-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}
      {cargando && <p className="text-sm text-tinta-60">Cargando…</p>}

      {/* ---------- Registrar cobro ---------- */}
      {!soloLectura && pendientes.length > 0 && (
        <section className="bg-white border border-borde rounded-xl p-3 mb-4">
          <h3 className="text-xs font-semibold text-tinta-60 uppercase tracking-wide mb-2">
            Registrar cobro
          </h3>

          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Monto recibido"
              value={montoTexto}
              onChange={(e) => setMontoTexto(e.target.value)}
              className={`${entrada} flex-1 min-w-0 cifra text-lg`}
            />
            <select
              value={medio}
              onChange={(e) => setMedio(e.target.value as typeof medio)}
              className={`${entrada} shrink-0`}
            >
              <option value="efectivo">Efectivo</option>
              <option value="deposito_directo">Depósito</option>
            </select>
          </div>

          {excede && (
            <p className="text-xs text-mora-3 mt-2">
              Excede la deuda en {dinero(monto - deudaTotal)}. No se permite registrar un cobro
              mayor a lo adeudado.
            </p>
          )}

          {/* Previsualización: qué va a pasar si confirma */}
          {reparto.length > 0 && (
            <div className="mt-2 bg-marca-50 border border-marca-100 rounded-lg p-2.5">
              <p className="text-xs font-semibold text-marca-700 mb-1.5">Se aplicaría así</p>
              {reparto.map((r) => (
                <div key={r.numero} className="flex justify-between gap-2 text-xs py-0.5">
                  <span className="truncate">
                    {r.numero}
                    {r.saldoResultante === 0 && (
                      <span className="text-pagado font-semibold"> · se salda</span>
                    )}
                  </span>
                  <span className="cifra shrink-0">
                    {dinero(r.aplicar)}
                    {r.saldoResultante > 0 && (
                      <span className="text-tinta-60"> · queda {dinero(r.saldoResultante)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={registrar}
            disabled={!montoValido || excede || registrando}
            className="w-full mt-2.5 py-2.5 rounded-lg bg-marca-600 text-white font-semibold
                       hover:bg-marca-700 active:scale-[0.99] transition
                       disabled:opacity-40 disabled:active:scale-100"
          >
            {registrando ? 'Registrando…' : 'Registrar cobro'}
          </button>

          {errorCobro && <p className="text-xs text-mora-3 mt-2">{errorCobro}</p>}

          {medio === 'efectivo' && montoValido && !excede && (
            <p className="text-xs text-custodia mt-2">
              Queda como efectivo en tu poder hasta que registres el depósito.
            </p>
          )}
        </section>
      )}

      {/* ---------- Facturas ---------- */}
      <h3 className="text-xs font-semibold text-tinta-60 uppercase tracking-wide mb-2">
        Facturas
      </h3>

      <div className="space-y-2 mb-5">
        {facturas.map((f) => {
          const saldo = Number(f.saldo)
          const pagada = saldo <= 0
          const m = estiloMora(f.dias_vencida)

          return (
            <article
              key={f.id}
              className={`bg-white border border-borde rounded-xl overflow-hidden flex ${
                pagada ? 'opacity-60' : ''
              }`}
            >
              <div className={`w-1.5 shrink-0 ${pagada ? 'bg-pagado' : m.barra}`} />

              <div className="flex-1 min-w-0 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{f.numero}</div>
                  <div className="text-xs text-tinta-60 mt-0.5">
                    Vence {fecha(f.fecha_vencimiento)}
                  </div>
                  <div
                    className={`text-xs font-semibold mt-0.5 ${
                      pagada ? 'text-pagado' : m.color
                    }`}
                  >
                    {pagada ? 'Pagada' : textoMoraCorto(f.dias_vencida)}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="cifra text-base font-bold">{dinero(f.saldo)}</div>
                  {Number(f.monto_aplicado) > 0 && !pagada && (
                    <div className="text-[11px] text-tinta-60">
                      de {dinero(f.monto_total)} · abonado {dinero(f.monto_aplicado)}
                    </div>
                  )}
                  {onEditarFactura && (
                    <button
                      onClick={() => onEditarFactura(f.id)}
                      className="mt-1 px-2 py-0.5 rounded-md border border-borde text-[11px]
                                 text-tinta-60 hover:border-marca-500 transition"
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {/* ---------- Historial de cobros ---------- */}
      {cobros.length > 0 && (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-xs font-semibold text-tinta-60 uppercase tracking-wide">
              Cobros registrados
            </h3>
            <span className="cifra text-sm font-semibold text-tinta-60">
              {dinero(totalCobrado)}
            </span>
          </div>

          <div className="space-y-2">
            {cobros.map((c) => {
              const est = estiloEstado(c)
              return (
                <article
                  key={c.id}
                  className={`border rounded-xl p-3 ${est.fondo} ${
                    c.estado === 'anulado' ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className={`inline-block px-2 py-px rounded-full bg-white border text-[10px]
                                    font-bold uppercase tracking-wide ${est.texto}`}
                      >
                        {est.etiqueta}
                      </span>

                      <div className="text-xs text-tinta-60 mt-1.5">
                        Recibido {fecha(c.recibido_en)}
                      </div>

                      {c.deposito_en && (
                        <div className="text-xs text-tinta-60">
                          Depositado {fecha(c.deposito_en)}
                          {c.deposito_banco && ` · ${c.deposito_banco}`}
                        </div>
                      )}

                      {c.deposito_comprobante && (
                        <div className="text-[11px] text-tinta-40">
                          Comprobante {c.deposito_comprobante}
                        </div>
                      )}

                      {c.medio === 'efectivo' && c.estado === 'recibido' && (
                        <div className="text-xs font-semibold text-custodia mt-0.5">
                          Pendiente de depositar
                        </div>
                      )}
                    </div>

                    <span className={`cifra text-lg font-bold shrink-0 ${est.texto}`}>
                      {dinero(c.monto)}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

const entrada =
  'px-3 py-2.5 text-base bg-white border border-borde rounded-lg outline-none ' +
  'focus:border-marca-600 focus:ring-2 focus:ring-marca-600/20 ' +
  'placeholder:text-tinta-40 transition-colors'
