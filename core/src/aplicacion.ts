import { Money } from './money'

/**
 * Motor de aplicación de cobros.
 *
 * Decide cómo se reparte el dinero que entrega un cliente sobre las facturas
 * que tiene pendientes.
 *
 * Este módulo es una función pura: no consulta ni escribe en la base de datos.
 * Recibe datos, devuelve el resultado del cálculo. Eso permite probarlo con
 * cientos de casos en milisegundos y mantiene la lógica de negocio
 * independiente de dónde estén almacenados los datos.
 */

export type FacturaPendiente = {
  id: string
  numero: string
  /** Fecha de vencimiento. Determina el orden de aplicación. */
  fechaVencimiento: Date
  /** Saldo exigible: total menos nota de crédito menos lo ya aplicado. */
  saldo: Money
}

export type Aplicacion = {
  facturaId: string
  numeroFactura: string
  monto: Money
  /** Saldo que le queda a la factura después de esta aplicación. */
  saldoResultante: Money
  /** True si esta aplicación deja la factura en cero. */
  saldaFactura: boolean
}

export type ResultadoAplicacion = {
  aplicaciones: Aplicacion[]
  /** Total efectivamente distribuido. Siempre igual al monto del cobro. */
  totalAplicado: Money
  facturasSaldadas: number
}

/**
 * Error de negocio. Se distingue de un error de programación para que la
 * interfaz pueda mostrarlo directamente al usuario.
 */
export class ErrorAplicacion extends Error {
  constructor(
    message: string,
    readonly codigo: 'SOBREPAGO' | 'MONTO_INVALIDO' | 'SIN_FACTURAS' | 'FACTURA_NO_ENCONTRADA',
    readonly detalle?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ErrorAplicacion'
  }
}

/**
 * Ordena las facturas por vencimiento, la más antigua primero.
 *
 * El criterio es el VENCIMIENTO, no la fecha de emisión. Lo urgente es lo que
 * ya venció: una factura emitida antes pero con plazo más largo puede estar
 * al día, mientras otra emitida después ya está en mora.
 *
 * A igual vencimiento, desempata el número de factura para que el resultado
 * sea determinista (dos ejecuciones sobre los mismos datos dan lo mismo).
 */
function ordenarPorAntiguedad(facturas: readonly FacturaPendiente[]): FacturaPendiente[] {
  return [...facturas].sort((a, b) => {
    const diff = a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime()
    if (diff !== 0) return diff
    return a.numero.localeCompare(b.numero)
  })
}

function sumarSaldos(facturas: readonly FacturaPendiente[]): Money {
  return facturas.reduce((acc, f) => acc.plus(f.saldo), Money.zero())
}

/**
 * Aplica un cobro sobre las facturas pendientes, de la más vencida a la menos.
 *
 * Reglas de negocio:
 *   1. El cobro NO puede exceder la deuda total. Se rechaza con el excedente
 *      indicado. Un sobrepago registrado obliga a devolución y expone al
 *      vendedor a una sanción, así que el sistema lo impide antes de guardar.
 *   2. Se aceptan abonos parciales de cualquier monto positivo. No hay mínimo:
 *      un umbral artificial solo estorbaría el día que haya una excepción.
 *   3. Cada factura recibe hasta su saldo; el remanente pasa a la siguiente.
 *   4. La suma de las aplicaciones es EXACTAMENTE igual al monto del cobro.
 */
export function aplicarPorAntiguedad(
  montoCobro: Money,
  facturasPendientes: readonly FacturaPendiente[],
): ResultadoAplicacion {
  if (!montoCobro.isPositive()) {
    throw new ErrorAplicacion(
      'El monto del cobro debe ser mayor a cero.',
      'MONTO_INVALIDO',
    )
  }

  const conSaldo = facturasPendientes.filter((f) => f.saldo.isPositive())

  if (conSaldo.length === 0) {
    throw new ErrorAplicacion(
      'El cliente no tiene facturas pendientes de pago.',
      'SIN_FACTURAS',
    )
  }

  const deudaTotal = sumarSaldos(conSaldo)

  // Regla 1: sobrepago rechazado.
  if (montoCobro.greaterThan(deudaTotal)) {
    const excedente = montoCobro.minus(deudaTotal)
    throw new ErrorAplicacion(
      `El cobro excede la deuda del cliente en ${excedente.toFixed(2)}. ` +
        `Deuda total: ${deudaTotal.toFixed(2)}. Verificá el monto recibido.`,
      'SOBREPAGO',
      {
        deudaTotal: deudaTotal.toString(),
        montoCobro: montoCobro.toString(),
        excedente: excedente.toString(),
      },
    )
  }

  const ordenadas = ordenarPorAntiguedad(conSaldo)
  const aplicaciones: Aplicacion[] = []
  let restante = montoCobro

  for (const factura of ordenadas) {
    if (!restante.isPositive()) break

    // Se aplica el menor entre lo que queda del cobro y el saldo de la factura.
    const aplicar = restante.lessThan(factura.saldo) ? restante : factura.saldo
    const saldoResultante = factura.saldo.minus(aplicar)

    aplicaciones.push({
      facturaId: factura.id,
      numeroFactura: factura.numero,
      monto: aplicar,
      saldoResultante,
      saldaFactura: saldoResultante.isZero(),
    })

    restante = restante.minus(aplicar)
  }

  const totalAplicado = Money.sum(aplicaciones.map((a) => a.monto))

  // Invariante: nada se pierde ni se inventa por el camino. Si esto falla hay
  // un error de programación, no un dato inválido del usuario.
  if (!totalAplicado.equals(montoCobro)) {
    throw new Error(
      `Error interno: se aplicaron ${totalAplicado.toString()} de un cobro de ` +
        `${montoCobro.toString()}. La distribución no cuadra.`,
    )
  }

  return {
    aplicaciones,
    totalAplicado,
    facturasSaldadas: aplicaciones.filter((a) => a.saldaFactura).length,
  }
}

export type AplicacionManual = {
  facturaId: string
  monto: Money
}

/**
 * Aplica un cobro sobre facturas elegidas explícitamente por el vendedor.
 *
 * Se usa cuando el cliente indica contra qué factura va su pago, lo que puede
 * diferir del orden por antigüedad.
 *
 * Valida que ninguna aplicación exceda el saldo de su factura y que la suma
 * de todas iguale exactamente el monto del cobro.
 */
export function aplicarManual(
  montoCobro: Money,
  facturasPendientes: readonly FacturaPendiente[],
  seleccion: readonly AplicacionManual[],
): ResultadoAplicacion {
  if (!montoCobro.isPositive()) {
    throw new ErrorAplicacion(
      'El monto del cobro debe ser mayor a cero.',
      'MONTO_INVALIDO',
    )
  }

  if (seleccion.length === 0) {
    throw new ErrorAplicacion(
      'Seleccioná al menos una factura para aplicar el cobro.',
      'SIN_FACTURAS',
    )
  }

  const porId = new Map(facturasPendientes.map((f) => [f.id, f]))
  const aplicaciones: Aplicacion[] = []

  for (const item of seleccion) {
    const factura = porId.get(item.facturaId)

    if (!factura) {
      throw new ErrorAplicacion(
        `La factura seleccionada no está entre las pendientes del cliente.`,
        'FACTURA_NO_ENCONTRADA',
        { facturaId: item.facturaId },
      )
    }

    if (!item.monto.isPositive()) {
      throw new ErrorAplicacion(
        `El monto aplicado a la factura ${factura.numero} debe ser mayor a cero.`,
        'MONTO_INVALIDO',
      )
    }

    if (item.monto.greaterThan(factura.saldo)) {
      throw new ErrorAplicacion(
        `No se pueden aplicar ${item.monto.toFixed(2)} a la factura ` +
          `${factura.numero}: su saldo es ${factura.saldo.toFixed(2)}.`,
        'SOBREPAGO',
        {
          numeroFactura: factura.numero,
          saldo: factura.saldo.toString(),
          intento: item.monto.toString(),
        },
      )
    }

    const saldoResultante = factura.saldo.minus(item.monto)

    aplicaciones.push({
      facturaId: factura.id,
      numeroFactura: factura.numero,
      monto: item.monto,
      saldoResultante,
      saldaFactura: saldoResultante.isZero(),
    })
  }

  const totalAplicado = Money.sum(aplicaciones.map((a) => a.monto))

  if (!totalAplicado.equals(montoCobro)) {
    const diferencia = montoCobro.minus(totalAplicado)
    throw new ErrorAplicacion(
      diferencia.isPositive()
        ? `Faltan ${diferencia.toFixed(2)} por aplicar del cobro de ${montoCobro.toFixed(2)}.`
        : `Se aplicaron ${diferencia.abs().toFixed(2)} de más sobre el cobro de ${montoCobro.toFixed(2)}.`,
      'MONTO_INVALIDO',
      {
        montoCobro: montoCobro.toString(),
        totalAplicado: totalAplicado.toString(),
      },
    )
  }

  return {
    aplicaciones,
    totalAplicado,
    facturasSaldadas: aplicaciones.filter((a) => a.saldaFactura).length,
  }
}

/**
 * Días transcurridos desde el vencimiento. Negativo si aún no vence.
 */
export function diasVencida(fechaVencimiento: Date, hoy: Date = new Date()): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000
  const venc = Date.UTC(
    fechaVencimiento.getUTCFullYear(),
    fechaVencimiento.getUTCMonth(),
    fechaVencimiento.getUTCDate(),
  )
  const ref = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.round((ref - venc) / MS_POR_DIA)
}

export type RangoAntiguedad = '0-30' | '31-60' | '61-90' | '90+'

/**
 * Clasifica una factura en rangos de mora.
 *
 * Los rangos determinan la urgencia de cobro. En este negocio la mora tiene
 * consecuencia directa sobre el vendedor, así que la clasificación no es
 * informativa: es la señal de a quién hay que ir a ver primero.
 */
export function rangoAntiguedad(fechaVencimiento: Date, hoy: Date = new Date()): RangoAntiguedad {
  const dias = diasVencida(fechaVencimiento, hoy)
  if (dias <= 30) return '0-30'
  if (dias <= 60) return '31-60'
  if (dias <= 90) return '61-90'
  return '90+'
}
