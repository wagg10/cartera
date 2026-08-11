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

/** Bancos habituales. El campo permite escribir otro. */
const BANCOS = ['Produbanco', 'Pichincha', 'Guayaquil', 'Pacifico', 'Bolivariano', 'Otro']

function tiempoTranscurrido(horas: number): string {
  if (horas < 1) return 'hace menos de una hora'
  if (horas < 24) return `hace ${Math.floor(horas)} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'hace 1 dia' : `hace ${dias} dias`
}

export function EfectivoEnTransito({ pendientes, onDepositado }: Props) {
  // Cobro cuyo formulario de deposito esta abierto.
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

    const bancoFinal = banco === 'Otro' ? bancoOtro.trim() : banco

    // El monto NO se envia: la funcion lo toma del cobro original, de modo
    // que la igualdad exacta entre cobro y deposito no puede violarse.
    const { error } = await supabase.rpc('registrar_deposito', {
      p_cobro_id: cobroId,
      p_banco: bancoFinal,
      p_comprobante: comprobante.trim(),
    })

    if (error) {
      setError(error.message)
    } else {
      setAbierto(null)
      onDepositado()
    }
    setGuardando(false)
  }

  if (pendientes.length === 0) return null

  return (
    <section
      style={{
        border: '1px solid #fbbf24',
        background: '#fffbeb',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ fontSize: 15 }}>Efectivo en tu poder</strong>
        <strong style={{ fontSize: 18, whiteSpace: 'nowrap' }}>{dinero(total)}</strong>
      </div>

      {conAlerta > 0 && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
          {conAlerta} cobro(s) con mas de 24 horas sin depositar
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        {pendientes.map((e) => (
          <div
            key={e.cobro_id}
            style={{
              background: '#fff',
              border: `1px solid ${e.alerta_deposito ? '#fca5a5' : '#fde68a'}`,
              borderRadius: 6,
              padding: 10,
              marginBottom: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{e.nombre_comercial}</strong>
                <div
                  style={{
                    fontSize: 12,
                    color: e.alerta_deposito ? '#dc2626' : '#92400e',
                    fontWeight: e.alerta_deposito ? 600 : 400,
                  }}
                >
                  Recibido {tiempoTranscurrido(e.horas_en_custodia)}
                </div>
              </div>

              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{dinero(e.monto)}</div>
                {abierto !== e.cobro_id && (
                  <button onClick={() => abrir(e.cobro_id)} style={{ marginTop: 4, fontSize: 12 }}>
                    Registrar deposito
                  </button>
                )}
              </div>
            </div>

            {abierto === e.cobro_id && (
              <div style={{ marginTop: 10, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#666' }}>
                  El deposito debe ser por{' '}
                  <strong style={{ color: '#111' }}>{dinero(e.monto)}</strong>, el monto
                  exacto del cobro. No se puede agrupar con otros.
                </p>

                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select
                    value={banco}
                    onChange={(ev) => setBanco(ev.target.value)}
                    style={{ padding: 8, flex: 1, minWidth: 0 }}
                  >
                    {BANCOS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>

                  {banco === 'Otro' && (
                    <input
                      type="text"
                      placeholder="Nombre del banco"
                      value={bancoOtro}
                      onChange={(ev) => setBancoOtro(ev.target.value)}
                      style={{ padding: 8, flex: 1, minWidth: 0 }}
                    />
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Numero de comprobante"
                  value={comprobante}
                  onChange={(ev) => setComprobante(ev.target.value)}
                  style={{ width: '100%', padding: 8, marginBottom: 8, fontSize: 15 }}
                />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => depositar(e.cobro_id)}
                    disabled={
                      guardando ||
                      comprobante.trim() === '' ||
                      (banco === 'Otro' && bancoOtro.trim() === '')
                    }
                    style={{ flex: 1, padding: 8 }}
                  >
                    {guardando ? 'Guardando...' : 'Confirmar deposito'}
                  </button>
                  <button onClick={() => setAbierto(null)} style={{ padding: 8 }}>
                    Cancelar
                  </button>
                </div>

                {error && (
                  <p style={{ color: '#dc2626', fontSize: 12, margin: '8px 0 0' }}>{error}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
