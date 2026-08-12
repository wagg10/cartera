import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'

export type EfectivoPendiente = {
  cobro_id: string
  nombre_comercial: string
  monto: string
  recibido_en: string
  horas_en_custodia: number
  alerta_deposito: boolean
}

type Props = {
  pendientes: EfectivoPendiente[]
  onDepositado: () => void
}

const BANCOS = ['Produbanco', 'Pichincha', 'Guayaquil', 'Pacifico', 'Bolivariano', 'Otro']

function tiempoTranscurrido(horas: number): string {
  if (horas < 1) return 'hace menos de una hora'
  if (horas < 24) return `hace ${Math.floor(horas)} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`
}

/**
 * Efectivo que el cliente ya pagó pero que el vendedor todavía no depositó.
 *
 * Se destaca en ámbar porque representa una obligación pendiente SUYA, no del
 * cliente: desde que recibe el dinero hasta que lo entrega al banco, es
 * responsable de esos billetes.
 */
export function EfectivoEnTransito({ pendientes, onDepositado }: Props) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [banco, setBanco] = useState('Produbanco')
  const [bancoOtro, setBancoOtro] = useState('')
  const [comprobante, setComprobante] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = pendientes.reduce((s, e) => s + Number(e.monto), 0)
  const conAlerta = pendientes.filter((e) => e.alerta_deposito).length

  function abrir(cobroId: string) {
    setAbierto(cobroId)
    setComprobante('')
    setBanco('Produbanco')
    setBancoOtro('')
    setError(null)
  }

  async function depositar(cobroId: string) {
    setError(null)
    setGuardando(true)

    // El monto NO se envía: la función lo toma del cobro original, de modo que
    // la igualdad exacta entre cobro y depósito no puede violarse.
    const { error } = await supabase.rpc('registrar_deposito', {
      p_cobro_id: cobroId,
      p_banco: banco === 'Otro' ? bancoOtro.trim() : banco,
      p_comprobante: comprobante.trim(),
    })

    if (error) setError(error.message)
    else {
      setAbierto(null)
      onDepositado()
    }
    setGuardando(false)
  }

  if (pendientes.length === 0) return null

  return (
    <section className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-semibold text-sm text-custodia">Efectivo en tu poder</h2>
          {conAlerta > 0 && (
            <p className="text-xs text-mora-3 font-medium mt-0.5">
              {conAlerta} sin depositar hace más de 24 h
            </p>
          )}
        </div>
        <span className="cifra text-xl font-bold text-custodia">{dinero(total)}</span>
      </div>

      <div className="mt-3 space-y-2">
        {pendientes.map((e) => (
          <div
            key={e.cobro_id}
            className={`bg-white rounded-lg border ${
              e.alerta_deposito ? 'border-red-300' : 'border-amber-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3 p-2.5">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{e.nombre_comercial}</div>
                <div
                  className={`text-xs ${
                    e.alerta_deposito ? 'text-mora-3 font-medium' : 'text-tinta-60'
                  }`}
                >
                  Recibido {tiempoTranscurrido(e.horas_en_custodia)}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="cifra font-bold">{dinero(e.monto)}</div>
                {abierto !== e.cobro_id && (
                  <button
                    onClick={() => abrir(e.cobro_id)}
                    className="mt-1 px-2 py-1 rounded-md bg-custodia text-white text-xs font-semibold
                               hover:brightness-110 active:scale-95 transition"
                  >
                    Depositar
                  </button>
                )}
              </div>
            </div>

            {abierto === e.cobro_id && (
              <div className="border-t border-amber-200 p-2.5">
                <p className="text-xs text-tinta-60 mb-2">
                  El depósito debe ser por{' '}
                  <strong className="text-tinta cifra">{dinero(e.monto)}</strong>, el monto
                  exacto del cobro. No se puede agrupar con otros.
                </p>

                <div className="flex gap-2 mb-2">
                  <select
                    value={banco}
                    onChange={(ev) => setBanco(ev.target.value)}
                    className={`${entrada} flex-1`}
                  >
                    {BANCOS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>

                  {banco === 'Otro' && (
                    <input
                      placeholder="Banco"
                      value={bancoOtro}
                      onChange={(ev) => setBancoOtro(ev.target.value)}
                      className={`${entrada} flex-1`}
                    />
                  )}
                </div>

                <input
                  placeholder="N° de comprobante"
                  value={comprobante}
                  onChange={(ev) => setComprobante(ev.target.value)}
                  className={`${entrada} w-full mb-2`}
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => depositar(e.cobro_id)}
                    disabled={
                      guardando ||
                      comprobante.trim() === '' ||
                      (banco === 'Otro' && bancoOtro.trim() === '')
                    }
                    className="flex-1 py-2 rounded-lg bg-custodia text-white font-semibold text-sm
                               hover:brightness-110 active:scale-[0.98] transition
                               disabled:opacity-40 disabled:active:scale-100"
                  >
                    {guardando ? 'Guardando…' : 'Confirmar depósito'}
                  </button>
                  <button
                    onClick={() => setAbierto(null)}
                    className="px-3 py-2 rounded-lg border border-borde bg-white text-sm text-tinta-60"
                  >
                    Cancelar
                  </button>
                </div>

                {error && <p className="text-xs text-mora-3 mt-2">{error}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

const entrada =
  'px-2.5 py-2 text-base bg-white border border-borde rounded-lg outline-none ' +
  'focus:border-marca-600 focus:ring-2 focus:ring-marca-600/20 transition-colors'
