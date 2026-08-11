/**
 * Utilidades de presentacion compartidas.
 *
 * Los montos llegan desde Postgres como STRING, no como number. Eso es
 * deliberado: NUMERIC(18,4) tiene mas precision que un float de JavaScript,
 * asi que convertirlo a number perderia exactitud. Solo se convierte al
 * final, para mostrarlo en pantalla.
 */

/** Formatea un monto para mostrar. Solo para presentacion, nunca para calcular. */
export function dinero(valor: string | number): string {
  return Number(valor).toLocaleString('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Fecha corta legible. */
export function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Color segun gravedad de la mora.
 *
 * En este negocio la mora tiene consecuencia directa sobre el sueldo del
 * vendedor, asi que el color no es decorativo: es la senal de urgencia.
 */
export function colorMora(dias: number | null): string {
  if (dias === null || dias <= 0) return '#6b7280'
  if (dias <= 30) return '#ca8a04'
  if (dias <= 60) return '#ea580c'
  return '#dc2626'
}

export function textoMora(dias: number | null): string {
  if (dias === null) return 'Sin datos'
  if (dias < 0) return `Vence en ${Math.abs(dias)} dias`
  if (dias === 0) return 'Vence hoy'
  return `${dias} dias de mora`
}
