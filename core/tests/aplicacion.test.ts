import { describe, it, expect } from 'vitest'
import { Money } from '../src/money'
import {
  aplicarPorAntiguedad,
  aplicarManual,
  ErrorAplicacion,
  diasVencida,
  rangoAntiguedad,
  type FacturaPendiente,
} from '../src/aplicacion'

/** Construye una factura de prueba. */
function factura(
  numero: string,
  saldo: string,
  diasDesdeVencimiento: number,
): FacturaPendiente {
  const fecha = new Date('2026-06-01T00:00:00Z')
  fecha.setUTCDate(fecha.getUTCDate() - diasDesdeVencimiento)
  return {
    id: `id-${numero}`,
    numero,
    fechaVencimiento: fecha,
    saldo: Money.of(saldo),
  }
}

const HOY = new Date('2026-06-01T00:00:00Z')

describe('aplicarPorAntiguedad — caso real', () => {
  it('reparte 12000 sobre facturas de 5000, 4000 y 6000 saldando las dos mas viejas', () => {
    const facturas = [
      factura('F-001', '5000', 45),
      factura('F-002', '4000', 10),
      factura('F-003', '6000', -10), // aun no vence
    ]

    const r = aplicarPorAntiguedad(Money.of('12000'), facturas)

    expect(r.aplicaciones.map((a) => [a.numeroFactura, a.monto.toString()])).toEqual([
      ['F-001', '5000'],
      ['F-002', '4000'],
      ['F-003', '3000'],
    ])
    expect(r.facturasSaldadas).toBe(2)
    expect(r.totalAplicado.toString()).toBe('12000')
    expect(r.aplicaciones[2]!.saldoResultante.toString()).toBe('3000')
  })

  it('ordena por vencimiento, no por emision', () => {
    // F-002 se emitio despues pero vencio antes: va primero.
    const facturas = [
      factura('F-001', '1000', 5),
      factura('F-002', '1000', 40),
    ]

    const r = aplicarPorAntiguedad(Money.of('1000'), facturas)

    expect(r.aplicaciones[0]!.numeroFactura).toBe('F-002')
  })

  it('prioriza lo vencido sobre lo que aun no vence', () => {
    const facturas = [
      factura('F-100', '2000', -20), // vence en 20 dias
      factura('F-200', '2000', 3),   // vencio hace 3 dias
    ]

    const r = aplicarPorAntiguedad(Money.of('2000'), facturas)

    expect(r.aplicaciones).toHaveLength(1)
    expect(r.aplicaciones[0]!.numeroFactura).toBe('F-200')
  })
})

describe('aplicarPorAntiguedad — sobrepago', () => {
  it('rechaza un cobro mayor a la deuda total', () => {
    const facturas = [factura('F-001', '5000', 30), factura('F-002', '10000', 10)]

    expect(() => aplicarPorAntiguedad(Money.of('20000'), facturas)).toThrow(ErrorAplicacion)
  })

  it('informa el excedente exacto en el mensaje', () => {
    const facturas = [factura('F-001', '15000', 30)]

    try {
      aplicarPorAntiguedad(Money.of('20000'), facturas)
      throw new Error('deberia haber lanzado')
    } catch (e) {
      const err = e as ErrorAplicacion
      expect(err.codigo).toBe('SOBREPAGO')
      expect(err.detalle?.excedente).toBe('5000')
      expect(err.message).toContain('5000.00')
    }
  })

  it('acepta un cobro exactamente igual a la deuda total', () => {
    const facturas = [factura('F-001', '5000', 30), factura('F-002', '10000', 10)]

    const r = aplicarPorAntiguedad(Money.of('15000'), facturas)

    expect(r.facturasSaldadas).toBe(2)
    expect(r.totalAplicado.toString()).toBe('15000')
  })

  it('rechaza un sobrepago aunque sea de un centavo', () => {
    const facturas = [factura('F-001', '5000', 30)]

    expect(() => aplicarPorAntiguedad(Money.of('5000.01'), facturas)).toThrow(ErrorAplicacion)
  })
})

describe('aplicarPorAntiguedad — pagos parciales', () => {
  it('acepta un abono muy inferior al saldo', () => {
    const facturas = [factura('F-001', '5000', 60)]

    const r = aplicarPorAntiguedad(Money.of('100'), facturas)

    expect(r.aplicaciones).toHaveLength(1)
    expect(r.aplicaciones[0]!.monto.toString()).toBe('100')
    expect(r.aplicaciones[0]!.saldoResultante.toString()).toBe('4900')
    expect(r.facturasSaldadas).toBe(0)
  })

  it('no toca las facturas siguientes si el monto se agota', () => {
    const facturas = [
      factura('F-001', '5000', 60),
      factura('F-002', '3000', 30),
    ]

    const r = aplicarPorAntiguedad(Money.of('2000'), facturas)

    expect(r.aplicaciones).toHaveLength(1)
    expect(r.aplicaciones[0]!.numeroFactura).toBe('F-001')
  })
})

describe('aplicarPorAntiguedad — validaciones', () => {
  it('rechaza monto cero o negativo', () => {
    const facturas = [factura('F-001', '5000', 30)]

    expect(() => aplicarPorAntiguedad(Money.zero(), facturas)).toThrow(ErrorAplicacion)
    expect(() => aplicarPorAntiguedad(Money.of('-100'), facturas)).toThrow(ErrorAplicacion)
  })

  it('rechaza si el cliente no tiene facturas pendientes', () => {
    expect(() => aplicarPorAntiguedad(Money.of('1000'), [])).toThrow(ErrorAplicacion)
  })

  it('ignora facturas con saldo cero', () => {
    const facturas = [
      factura('F-001', '0', 90),
      factura('F-002', '1000', 30),
    ]

    const r = aplicarPorAntiguedad(Money.of('1000'), facturas)

    expect(r.aplicaciones).toHaveLength(1)
    expect(r.aplicaciones[0]!.numeroFactura).toBe('F-002')
  })
})

describe('aplicarPorAntiguedad — exactitud decimal', () => {
  it('no pierde centavos con montos de muchos decimales', () => {
    const facturas = [
      factura('F-001', '1333.3333', 60),
      factura('F-002', '1333.3333', 30),
      factura('F-003', '1333.3334', 10),
    ]

    const r = aplicarPorAntiguedad(Money.of('4000'), facturas)

    expect(r.totalAplicado.toString()).toBe('4000')
    expect(r.facturasSaldadas).toBe(3)
  })

  it('la suma de aplicaciones siempre iguala el cobro', () => {
    const facturas = [
      factura('F-001', '0.01', 90),
      factura('F-002', '999.99', 60),
      factura('F-003', '0.1', 30),
      factura('F-004', '0.2', 10),
    ]

    for (const monto of ['0.01', '0.1', '500', '1000.3', '1000.30']) {
      const r = aplicarPorAntiguedad(Money.of(monto), facturas)
      expect(r.totalAplicado.toString()).toBe(Money.of(monto).toString())
    }
  })

  it('maneja montos altos sin perder precision', () => {
    const facturas = [
      factura('F-001', '29999.9999', 120),
      factura('F-002', '0.0001', 60),
    ]

    const r = aplicarPorAntiguedad(Money.of('30000'), facturas)

    expect(r.totalAplicado.toString()).toBe('30000')
    expect(r.facturasSaldadas).toBe(2)
  })
})

describe('aplicarManual', () => {
  it('aplica sobre las facturas elegidas por el vendedor', () => {
    const facturas = [
      factura('F-001', '5000', 60),
      factura('F-002', '4000', 30),
      factura('F-003', '6000', 10),
    ]

    const r = aplicarManual(Money.of('6000'), facturas, [
      { facturaId: 'id-F-003', monto: Money.of('6000') },
    ])

    expect(r.aplicaciones).toHaveLength(1)
    expect(r.aplicaciones[0]!.numeroFactura).toBe('F-003')
    expect(r.aplicaciones[0]!.saldaFactura).toBe(true)
  })

  it('rechaza aplicar mas que el saldo de una factura', () => {
    const facturas = [factura('F-001', '5000', 60)]

    expect(() =>
      aplicarManual(Money.of('6000'), facturas, [
        { facturaId: 'id-F-001', monto: Money.of('6000') },
      ]),
    ).toThrow(ErrorAplicacion)
  })

  it('rechaza si la suma no cubre el cobro completo', () => {
    const facturas = [factura('F-001', '5000', 60), factura('F-002', '4000', 30)]

    try {
      aplicarManual(Money.of('9000'), facturas, [
        { facturaId: 'id-F-001', monto: Money.of('5000') },
      ])
      throw new Error('deberia haber lanzado')
    } catch (e) {
      expect((e as ErrorAplicacion).message).toContain('Faltan 4000.00')
    }
  })

  it('rechaza una factura que no pertenece al cliente', () => {
    const facturas = [factura('F-001', '5000', 60)]

    expect(() =>
      aplicarManual(Money.of('100'), facturas, [
        { facturaId: 'id-INEXISTENTE', monto: Money.of('100') },
      ]),
    ).toThrow(ErrorAplicacion)
  })

  it('permite repartir un cobro entre varias facturas elegidas', () => {
    const facturas = [
      factura('F-001', '5000', 60),
      factura('F-002', '4000', 30),
    ]

    const r = aplicarManual(Money.of('7000'), facturas, [
      { facturaId: 'id-F-001', monto: Money.of('5000') },
      { facturaId: 'id-F-002', monto: Money.of('2000') },
    ])

    expect(r.facturasSaldadas).toBe(1)
    expect(r.totalAplicado.toString()).toBe('7000')
  })
})

describe('antiguedad', () => {
  it('calcula los dias vencidos', () => {
    expect(diasVencida(new Date('2026-05-01T00:00:00Z'), HOY)).toBe(31)
    expect(diasVencida(new Date('2026-06-01T00:00:00Z'), HOY)).toBe(0)
    expect(diasVencida(new Date('2026-06-15T00:00:00Z'), HOY)).toBe(-14)
  })

  it('clasifica en rangos de mora', () => {
    expect(rangoAntiguedad(new Date('2026-06-15T00:00:00Z'), HOY)).toBe('0-30')
    expect(rangoAntiguedad(new Date('2026-05-20T00:00:00Z'), HOY)).toBe('0-30')
    expect(rangoAntiguedad(new Date('2026-04-15T00:00:00Z'), HOY)).toBe('31-60')
    expect(rangoAntiguedad(new Date('2026-03-15T00:00:00Z'), HOY)).toBe('61-90')
    expect(rangoAntiguedad(new Date('2026-01-01T00:00:00Z'), HOY)).toBe('90+')
  })

  it('marca el limite exacto de cada rango', () => {
    const hace30 = new Date('2026-05-02T00:00:00Z')
    const hace31 = new Date('2026-05-01T00:00:00Z')
    expect(rangoAntiguedad(hace30, HOY)).toBe('0-30')
    expect(rangoAntiguedad(hace31, HOY)).toBe('31-60')
  })
})
