import Decimal from "decimal.js";

/**
 * Configuración global de precisión.
 *
 * 28 dígitos significativos cubre con holgura cualquier monto realista
 * (el PIB mundial en centavos son ~17 dígitos) y deja margen para
 * operaciones intermedias como potencias fraccionarias en CAGR/XIRR.
 *
 * ROUND_HALF_EVEN ("banker's rounding") es el modo estándar en finanzas:
 * a diferencia de ROUND_HALF_UP, no sesga sistemáticamente hacia arriba
 * cuando se redondean muchos valores. En un portafolio con miles de
 * operaciones ese sesgo se acumula y es visible.
 */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export type MoneyInput = string | number | Decimal | Money;

/**
 * Representa un monto monetario con precisión decimal exacta.
 *
 * Por qué existe esta clase en vez de usar `number`:
 * los floats IEEE-754 no representan 0.1 exactamente, así que
 * `0.1 + 0.2 === 0.30000000000000004`. En un tracker de patrimonio
 * ese error se acumula sobre miles de transacciones y produce saldos
 * que no cuadran. Un descuadre en dinero no es un detalle estético:
 * es un bug de auditoría.
 *
 * Money es inmutable: toda operación devuelve una instancia nueva.
 */
export class Money {
  private readonly value: Decimal;
  readonly currency: string;

  private constructor(value: Decimal, currency: string) {
    this.value = value;
    this.currency = currency;
  }

  /**
   * Construye un Money.
   *
   * Acepta `number` por ergonomía, pero solo si es un entero seguro.
   * Un literal como `0.1` ya llega corrupto desde el parser de JS,
   * así que aceptarlo daría una falsa sensación de precisión.
   * Para montos con decimales hay que pasar string: Money.of("0.1").
   */
  static of(input: MoneyInput, currency = "USD"): Money {
    if (input instanceof Money) {
      return new Money(input.value, input.currency);
    }
    if (input instanceof Decimal) {
      return new Money(input, currency);
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) {
        throw new RangeError(`Money.of: valor no finito (${input})`);
      }
      if (!Number.isInteger(input)) {
        throw new TypeError(
          `Money.of: se recibió el número decimal ${input}. ` +
            `Los floats pierden precisión antes de llegar aquí. ` +
            `Usá un string: Money.of("${input}").`,
        );
      }
      return new Money(new Decimal(input), currency);
    }
    const trimmed = input.trim();
    if (trimmed === "") {
      throw new TypeError("Money.of: string vacío");
    }
    let parsed: Decimal;
    try {
      parsed = new Decimal(trimmed);
    } catch {
      throw new TypeError(`Money.of: string no numérico (${input})`);
    }
    if (!parsed.isFinite()) {
      throw new RangeError(`Money.of: valor no finito (${input})`);
    }
    return new Money(parsed, currency);
  }

  static zero(currency = "USD"): Money {
    return new Money(new Decimal(0), currency);
  }

  /**
   * Construye desde la unidad mínima (centavos, satoshis, etc.).
   * Esta es la forma correcta de leer un entero que viene de una API
   * que reporta en unidades menores.
   */
  static fromMinorUnits(units: string | number | bigint, decimals = 2, currency = "USD"): Money {
    const d = new Decimal(units.toString()).dividedBy(new Decimal(10).pow(decimals));
    return new Money(d, currency);
  }

  private assertSameCurrency(other: Money, op: string): void {
    if (this.currency !== other.currency) {
      throw new TypeError(
        `${op}: no se pueden operar monedas distintas (${this.currency} vs ${other.currency}). ` +
          `Convertí primero con un tipo de cambio explícito.`,
      );
    }
  }

  plus(other: MoneyInput): Money {
    const o = Money.of(other, this.currency);
    this.assertSameCurrency(o, "plus");
    return new Money(this.value.plus(o.value), this.currency);
  }

  minus(other: MoneyInput): Money {
    const o = Money.of(other, this.currency);
    this.assertSameCurrency(o, "minus");
    return new Money(this.value.minus(o.value), this.currency);
  }

  /** Multiplica por un escalar adimensional (cantidad, tasa, factor). */
  times(factor: string | number | Decimal): Money {
    return new Money(this.value.times(new Decimal(factor.toString())), this.currency);
  }

  /** Divide por un escalar adimensional. */
  dividedBy(divisor: string | number | Decimal): Money {
    const d = new Decimal(divisor.toString());
    if (d.isZero()) {
      throw new RangeError("dividedBy: división por cero");
    }
    return new Money(this.value.dividedBy(d), this.currency);
  }

  /** Razón entre dos montos. Devuelve Decimal, no Money: el resultado es adimensional. */
  ratioTo(other: Money): Decimal {
    this.assertSameCurrency(other, "ratioTo");
    if (other.value.isZero()) {
      throw new RangeError("ratioTo: el denominador es cero");
    }
    return this.value.dividedBy(other.value);
  }

  negated(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.value.abs(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.lessThan(0);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(Money.of(other).value);
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other, "greaterThan");
    return this.value.greaterThan(other.value);
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other, "lessThan");
    return this.value.lessThan(other.value);
  }

  /** Suma una lista. Lanza si hay monedas mezcladas. */
  static sum(items: readonly Money[], currency = "USD"): Money {
    if (items.length === 0) return Money.zero(currency);
    return items.reduce((acc, m) => acc.plus(m), Money.zero(items[0]!.currency));
  }

  /**
   * Reparte un monto en N partes sin perder ni un centavo.
   *
   * El problema: $10 entre 3 no da tres montos de $3.33 — eso suma $9.99
   * y falta un centavo. Este método reparte el residuo distribuyendo
   * las unidades sobrantes de a una entre las primeras partes.
   * Garantía: la suma de las partes es exactamente igual al original.
   */
  allocate(parts: number, decimals = 2): Money[] {
    if (!Number.isInteger(parts) || parts <= 0) {
      throw new RangeError("allocate: parts debe ser un entero positivo");
    }
    const scale = new Decimal(10).pow(decimals);
    const totalUnits = this.value.times(scale).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
    const base = totalUnits.dividedBy(parts).toDecimalPlaces(0, Decimal.ROUND_DOWN);
    let remainder = totalUnits.minus(base.times(parts));

    const step = remainder.isNegative() ? new Decimal(-1) : new Decimal(1);
    const out: Money[] = [];
    for (let i = 0; i < parts; i++) {
      let units = base;
      if (!remainder.isZero()) {
        units = units.plus(step);
        remainder = remainder.minus(step);
      }
      out.push(new Money(units.dividedBy(scale), this.currency));
    }
    return out;
  }

  /** Redondea a la cantidad de decimales de presentación. */
  round(decimals = 2): Money {
    return new Money(
      this.value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_EVEN),
      this.currency,
    );
  }

  /** Representación exacta para persistir en Postgres NUMERIC. Nunca notación científica. */
  toString(): string {
    return this.value.toFixed();
  }

  /** String con decimales fijos, para mostrar en UI. */
  toFixed(decimals = 2): string {
    return this.value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_EVEN).toFixed(decimals);
  }

  toDecimal(): Decimal {
    return this.value;
  }

  /**
   * Convierte a `number`. PIERDE PRECISIÓN.
   * Solo para alimentar librerías de gráficas, jamás para cálculos ni persistencia.
   */
  toNumberUnsafe(): number {
    return this.value.toNumber();
  }

  /** Se serializa como string para que JSON.stringify no lo degrade a float. */
  toJSON(): { amount: string; currency: string } {
    return { amount: this.toString(), currency: this.currency };
  }
}
