import { describe, it, expect } from "vitest";
import { Money } from "../src/money";

describe("Money — precisión decimal", () => {
  it("suma 0.1 + 0.2 exactamente igual a 0.3 (el float no puede)", () => {
    // Prueba de que el problema existe:
    expect(0.1 + 0.2).not.toBe(0.3);
    // Prueba de que Money lo resuelve:
    expect(Money.of("0.1").plus("0.2").toString()).toBe("0.3");
  });

  it("no acumula error sobre 1000 sumas de 0.01", () => {
    let acc = Money.zero();
    for (let i = 0; i < 1000; i++) acc = acc.plus("0.01");
    expect(acc.toString()).toBe("10");
  });

  it("rechaza floats con decimales para evitar precisión falsa", () => {
    expect(() => Money.of(0.1)).toThrow(TypeError);
    expect(() => Money.of(19.99)).toThrow(/string/);
  });

  it("acepta enteros seguros y strings decimales", () => {
    expect(Money.of(100).toString()).toBe("100");
    expect(Money.of("19.99").toString()).toBe("19.99");
  });

  it("rechaza entradas inválidas", () => {
    expect(() => Money.of("")).toThrow(TypeError);
    expect(() => Money.of("abc")).toThrow(TypeError);
    expect(() => Money.of(NaN)).toThrow(RangeError);
    expect(() => Money.of(Infinity)).toThrow(RangeError);
  });

  it("nunca usa notación científica al serializar", () => {
    // Un satoshi. Con Number.toString() esto daría "1e-8".
    expect(Money.of("0.00000001").toString()).toBe("0.00000001");
    expect(Money.of("12345678901234567890").toString()).toBe("12345678901234567890");
  });
});

describe("Money — seguridad de moneda", () => {
  it("impide sumar monedas distintas", () => {
    const usd = Money.of("100", "USD");
    const eur = Money.of("100", "EUR");
    expect(() => usd.plus(eur)).toThrow(/monedas distintas/);
  });

  it("no considera iguales montos iguales en monedas distintas", () => {
    expect(Money.of("100", "USD").equals(Money.of("100", "EUR"))).toBe(false);
  });
});

describe("Money — reparto sin pérdida de centavos", () => {
  it("reparte $10 entre 3 sin perder el centavo residual", () => {
    const parts = Money.of("10").allocate(3);
    expect(parts.map((p) => p.toString())).toEqual(["3.34", "3.33", "3.33"]);
    expect(Money.sum(parts).toString()).toBe("10");
  });

  it("reparte $0.05 entre 3", () => {
    const parts = Money.of("0.05").allocate(3);
    expect(Money.sum(parts).toString()).toBe("0.05");
  });

  it("reparte montos negativos manteniendo el total", () => {
    const parts = Money.of("-10").allocate(3);
    expect(Money.sum(parts).toString()).toBe("-10");
  });

  it("la suma de las partes siempre iguala el original", () => {
    for (const amount of ["100", "0.01", "999.99", "1", "7.77"]) {
      for (const n of [2, 3, 6, 7, 11]) {
        const parts = Money.of(amount).allocate(n);
        expect(Money.sum(parts).toString()).toBe(Money.of(amount).toString());
      }
    }
  });

  it("rechaza cantidades de partes inválidas", () => {
    expect(() => Money.of("10").allocate(0)).toThrow(RangeError);
    expect(() => Money.of("10").allocate(2.5)).toThrow(RangeError);
  });
});

describe("Money — redondeo bancario", () => {
  it("redondea al par más cercano en el empate (no siempre hacia arriba)", () => {
    expect(Money.of("2.345").toFixed(2)).toBe("2.34"); // 4 es par
    expect(Money.of("2.355").toFixed(2)).toBe("2.36"); // 6 es par
  });
});

describe("Money — operaciones", () => {
  it("multiplica cantidad por precio sin error", () => {
    const precio = Money.of("1234.56789012");
    expect(precio.times("3").toString()).toBe("3703.70367036");
  });

  it("lanza al dividir por cero", () => {
    expect(() => Money.of("10").dividedBy(0)).toThrow(RangeError);
    expect(() => Money.of("10").ratioTo(Money.zero())).toThrow(RangeError);
  });

  it("suma una lista vacía como cero", () => {
    expect(Money.sum([]).toString()).toBe("0");
  });

  it("serializa a JSON como string, no como float", () => {
    const json = JSON.parse(JSON.stringify({ total: Money.of("0.00000001") }));
    expect(json.total.amount).toBe("0.00000001");
    expect(typeof json.total.amount).toBe("string");
  });
});
