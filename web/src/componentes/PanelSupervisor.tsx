import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'

type CarteraVendedor = {
  vendedor_id: string
  vendedor_nombre: string
  saldo_total: string
  clientes_con_deuda: number
  saldo_0_30: string
  saldo_31_60: string
  saldo_61_90: string
  saldo_90_mas: string
  dias_mora_maxima: number | null
  efectivo_sin_depositar: string
}

type ClienteEquipo = {
  id: string
  vendedor_id: string
  nombre_comercial: string
  saldo_total: string
  facturas_pendientes: number
  dias_mora_maxima: number | null
  ruta_nombre: string | null
}

type Props = {
  onVerCliente: (cliente: { id: string; nombre_comercial: string }) => void
}

function estiloMora(dias: number | null) {
  if (dias === null || dias <= 0) return { color: 'text-tinta-40', barra: 'bg-tinta-40' }
  if (dias <= 30) return { color: 'text-mora-1', barra: 'bg-mora-1' }
  if (dias <= 60) return { color: 'text-mora-2', barra: 'bg-mora-2' }
  return { color: 'text-mora-3', barra: 'bg-mora-3' }
}

/** Distribución del saldo por antigüedad, como barra proporcional. */
function BarraAntiguedad({ v }: { v: CarteraVendedor }) {
  const tramos = [
    { valor: Number(v.saldo_0_30), clase: 'bg-mora-1', etiqueta: '0-30' },
    { valor: Number(v.saldo_31_60), clase: 'bg-mora-2', etiqueta: '31-60' },
    { valor: Number(v.saldo_61_90), clase: 'bg-mora-3', etiqueta: '61-90' },
    { valor: Number(v.saldo_90_mas), clase: 'bg-red-900', etiqueta: '90+' },
  ]
  const total = tramos.reduce((s, t) => s + t.valor, 0)
  if (total === 0) return null

  return (
    <div className="mt-2.5">
      <div className="flex h-2 rounded-full overflow-hidden bg-stone-100">
        {tramos.map(
          (t) =>
            t.valor > 0 && (
              <div
                key={t.etiqueta}
                className={t.clase}
                style={{ width: `${(t.valor / total) * 100}%` }}
                title={`${t.etiqueta} días: ${dinero(t.valor)}`}
              />
            ),
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px]">
        {tramos.map(
          (t) =>
            t.valor > 0 && (
              <span key={t.etiqueta} className="text-tinta-60">
                <span className="font-semibold">{t.etiqueta}d</span>{' '}
                <span className="cifra">{dinero(t.valor)}</span>
              </span>
            ),
        )}
      </div>
    </div>
  )
}

export function PanelSupervisor({ onVerCliente }: Props) {
  const [equipo, setEquipo] = useState<CarteraVendedor[]>([])
  const [clientes, setClientes] = useState<ClienteEquipo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [enVivo, setEnVivo] = useState(false)
  const [ultimoCambio, setUltimoCambio] = useState<Date | null>(null)

  const cargar = useCallback(async () => {
    const [eq, cl] = await Promise.all([
      supabase.from('v_cartera_equipo').select('*').order('saldo_total', { ascending: false }),
      supabase.from('v_priorizacion_cobranza').select('*'),
    ])
    if (eq.error) setError(eq.error.message)
    else setEquipo(eq.data ?? [])
    setClientes(cl.data ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  /**
   * Suscripción en tiempo real.
   *
   * Postgres emite un evento por cada cambio en 'cobros'. Supabase lo entrega
   * por WebSocket respetando RLS: este supervisor solo recibe los cambios de
   * filas que tendría derecho a leer, es decir los de su propio equipo.
   *
   * Al recibir el aviso recargamos las vistas en vez de actualizar el estado
   * localmente: los saldos son agregados de varias tablas y recalcularlos en
   * el cliente los desincronizaría de la base.
   */
  useEffect(() => {
    const canal = supabase
      .channel('cartera-equipo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobros' }, () => {
        setUltimoCambio(new Date())
        cargar()
      })
      .subscribe((estado) => setEnVivo(estado === 'SUBSCRIBED'))

    // Cerrar el canal al desmontar. Sin esto quedan WebSockets abiertos.
    return () => {
      supabase.removeChannel(canal)
    }
  }, [cargar])

  const totalEquipo = equipo.reduce((s, v) => s + Number(v.saldo_total), 0)
  const totalEfectivo = equipo.reduce((s, v) => s + Number(v.efectivo_sin_depositar), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-tinta-60 uppercase tracking-wide">
          Cartera del equipo
        </h2>
        <span
          className={`flex items-center gap-1.5 text-[11px] ${
            enVivo ? 'text-pagado' : 'text-tinta-40'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${enVivo ? 'bg-marca-500' : 'bg-tinta-40'}`}
          />
          {enVivo ? 'En vivo' : 'Conectando…'}
        </span>
      </div>

      {ultimoCambio && (
        <p className="text-[11px] text-tinta-40 -mt-2 mb-3">
          Actualizado {ultimoCambio.toLocaleTimeString('es-EC')}
        </p>
      )}

      {error && (
        <p className="text-sm text-mora-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white border border-borde rounded-xl p-3">
          <div className="text-[11px] text-tinta-60 uppercase tracking-wide font-semibold">
            Cartera total
          </div>
          <div className="cifra text-xl font-bold mt-0.5">{dinero(totalEquipo)}</div>
        </div>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3">
          <div className="text-[11px] text-custodia uppercase tracking-wide font-semibold">
            Sin depositar
          </div>
          <div className="cifra text-xl font-bold text-custodia mt-0.5">
            {dinero(totalEfectivo)}
          </div>
        </div>
      </div>

      {equipo.length === 0 && !error && (
        <p className="text-sm text-tinta-60 bg-white border border-borde rounded-xl px-4 py-6 text-center">
          No hay vendedores asignados a tu equipo.
        </p>
      )}

      <div className="space-y-2">
        {equipo.map((v) => {
          const abierto = expandido === v.vendedor_id
          const susClientes = clientes.filter((c) => c.vendedor_id === v.vendedor_id)
          const m = estiloMora(v.dias_mora_maxima)
          const dias = v.dias_mora_maxima
          const enMora = dias !== null && dias > 0

          return (
            <article
              key={v.vendedor_id}
              className="bg-white border border-borde rounded-xl overflow-hidden flex"
            >
              <div className={`w-1.5 shrink-0 ${m.barra}`} />

              <div className="flex-1 min-w-0 p-3">
                <button
                  onClick={() => setExpandido(abierto ? null : v.vendedor_id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="shrink-0 text-center w-12">
                      <div className={`cifra text-2xl font-bold leading-none ${m.color}`}>
                        {enMora ? dias : '—'}
                      </div>
                      <div className={`text-[10px] font-semibold uppercase mt-0.5 ${m.color}`}>
                        {enMora ? 'días' : 'al día'}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[15px] truncate">
                        {v.vendedor_nombre}
                      </div>
                      <div className="text-xs text-tinta-60 mt-0.5">
                        {v.clientes_con_deuda} cliente{v.clientes_con_deuda !== 1 && 's'} con deuda
                      </div>
                      {Number(v.efectivo_sin_depositar) > 0 && (
                        <div className="text-xs text-custodia font-medium mt-0.5">
                          <span className="cifra">{dinero(v.efectivo_sin_depositar)}</span> sin
                          depositar
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="cifra text-lg font-bold">{dinero(v.saldo_total)}</div>
                      <div className="text-[11px] text-tinta-40">
                        {abierto ? 'ocultar' : 'ver clientes'}
                      </div>
                    </div>
                  </div>

                  <BarraAntiguedad v={v} />
                </button>

                {abierto && (
                  <div className="mt-3 pt-3 border-t border-borde">
                    {susClientes.length === 0 ? (
                      <p className="text-xs text-tinta-60">Sin clientes con deuda pendiente.</p>
                    ) : (
                      susClientes.map((c) => {
                        const mc = estiloMora(c.dias_mora_maxima)
                        return (
                          <button
                            key={c.id}
                            onClick={() => onVerCliente(c)}
                            className="w-full flex items-center justify-between gap-3 py-2
                                       border-b border-borde/50 last:border-0 text-left
                                       hover:text-marca-700 transition"
                          >
                            <span className="min-w-0 truncate text-sm">
                              {c.nombre_comercial}
                              {c.dias_mora_maxima !== null && c.dias_mora_maxima > 0 && (
                                <span className={`ml-1.5 text-xs ${mc.color}`}>
                                  {c.dias_mora_maxima} d
                                </span>
                              )}
                            </span>
                            <span className="cifra font-semibold text-sm shrink-0">
                              {dinero(c.saldo_total)}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
