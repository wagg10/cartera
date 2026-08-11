# Cartera

Sistema de gestión de cobranzas para agentes vendedores mayoristas.

Un vendedor de ruta maneja saldos de clientes por montos altos y necesita saber, en cualquier momento, cuánto le debe cada uno y a quién corresponde cobrar primero. Este sistema reemplaza el control manual — memoria y anotaciones en papel — por un registro que suma, ordena y no se olvida.

**Estado:** en desarrollo.

---

## El problema

El levantamiento se hizo entrevistando a un agente vendedor del sector de distribución de alimentos en Ecuador. Los hallazgos que definieron el diseño:

- Maneja saldos por cliente de **USD 4.000 a 30.000**.
- Los clientes pagan por depósito bancario o **en efectivo**, en cuyo caso el vendedor deposita después.
- Existe un sistema corporativo de cartera, **pero no lo usa**: el control vive en su memoria y en anotaciones.
- El respaldo ante un olvido es la presión de sus supervisores, no una alerta del sistema.
- El control interno exige que **cada depósito coincida exactamente con el cobro de un cliente**; agrupar cobros rompe la trazabilidad.

Ese último punto se convirtió en una restricción del modelo de datos, no en una validación de formulario.

---

## Decisiones de diseño

Las cuatro decisiones que definen el proyecto, con su razón.

### 1. Dinero en `NUMERIC(18,4)`, nunca en punto flotante

Los números de punto flotante no representan `0.1` de forma exacta: `0.1 + 0.2` da `0.30000000000000004`. Sobre miles de transacciones ese error se acumula y los saldos dejan de cuadrar.

`NUMERIC` es decimal exacto en Postgres. Del lado de la aplicación se usa `decimal.js` a través de un tipo `Money` que prohíbe la aritmética con floats.

Se guardan **cuatro** decimales, no dos: los precios y descuentos de mayoreo llevan más de dos, y redondear antes de tiempo introduce descuadres. La presentación redondea a dos; el almacenamiento conserva cuatro.

El redondeo usa el modo bancario (mitad al par) en lugar de mitad hacia arriba, que sesga sistemáticamente los totales al alza cuando se aplica muchas veces.

### 2. Los saldos se derivan, no se almacenan

No existe ninguna columna `saldo` en el esquema. El saldo de un cliente es la suma de sus facturas menos los cobros aplicados, calculada en el momento de la consulta mediante vistas.

Un campo `saldo` mutable se desincroniza en cuanto una operación falla a mitad de camino, y el error es **silencioso**: no hay excepción, solo un número que quedó mal. Derivarlo es correcto por construcción. El costo de cálculo se controla con índices parciales sobre las consultas frecuentes.

### 3. La autorización vive en la base de datos

Las reglas de acceso se implementan con Row Level Security de Postgres, no en el código de la aplicación.

Si la autorización estuviera en el frontend, olvidar una cláusula `where` en una sola de las consultas expondría los datos de todos los vendedores. Con RLS, la consulta se escribe sin filtro y Postgres lo aplica:

```sql
create policy clientes_vendedor_todo on clientes
  for all
  using (vendedor_id = auth.uid())
  with check (vendedor_id = auth.uid());
```

Toda tabla deniega por defecto; los permisos se conceden explícitamente. El rol de administrador **no tiene ninguna política** sobre las tablas de cartera: gestiona usuarios, no datos financieros. La protección es la ausencia de regla.

La matriz de permisos se verifica con pruebas automatizadas que **intentan** la violación y exigen que falle.

### 4. Las invariantes financieras son triggers, no validaciones de formulario

Las reglas que hacen confiable al sistema se aplican en la base de datos:

- La suma de las aplicaciones de un cobro nunca excede su monto.
- Una aplicación nunca deja el saldo de una factura en negativo.
- No se modifica el monto de una factura que ya tiene cobros aplicados; la corrección es por nota de crédito.
- El depósito de un cobro en efectivo debe coincidir **exactamente** con el monto cobrado, sin tolerancia.
- Los registros financieros no se eliminan: se anulan, conservando la trazabilidad.

Una validación en React se evade llamando la API directamente. Un trigger, no.

---

## Modelo de datos

| Tabla | Contenido |
|---|---|
| `perfiles` | Usuarios y su rol. El rol vive aquí, nunca en metadatos editables por el cliente |
| `rutas` | Agrupación de clientes por ruta de visita |
| `clientes` | Comercios a los que se vende |
| `facturas` | Obligaciones de cobro |
| `cobros` | Dinero recibido, con estado de depósito |
| `aplicaciones` | Imputación de un cobro sobre facturas |
| `auditoria` | Bitácora de operaciones, escrita por triggers |

El depósito bancario se modela como **columnas de `cobros`**, no como tabla aparte. La regla de negocio exige relación uno a uno; con columnas, violarla es estructuralmente imposible.

**Estados de un cobro:** `recibido` (efectivo en poder del vendedor) → `depositado`, o `confirmado` cuando el cliente depositó directamente.

El saldo del cliente se reduce al **recibir** el dinero, no al depositarlo: para el cliente la deuda quedó saldada. El depósito es una obligación posterior del vendedor.

---

## Tecnologías

| Capa | Herramienta |
|---|---|
| Base de datos | PostgreSQL 16 vía Supabase |
| Autenticación | Supabase Auth, con verificación de correo obligatoria |
| Frontend | React 19 + TypeScript, con Vite |
| Precisión decimal | decimal.js |
| Pruebas | Vitest (motor financiero), SQL (invariantes y RLS) |

---

## Puesta en marcha

Requisitos: Node.js 20+, Docker, Supabase CLI.

```bash
git clone https://github.com/wagg10/cartera.git
cd cartera

# Base de datos local
npx supabase start
npx supabase db reset

# Frontend
cd web
npm install
cp .env.example .env.local   # completar con las llaves de `npx supabase status`
npm run dev
```

La aplicación queda en `http://localhost:5173` y Supabase Studio en `http://localhost:54323`.

Los correos de verificación no salen a internet: quedan en Mailpit, en `http://localhost:54324`.

---

## Pruebas

```bash
# Invariantes financieras y aislamiento entre usuarios
npx supabase db reset
psql "$(npx supabase status -o env | grep DB_URL)" -f supabase/tests/001_pruebas.sql
```

Las pruebas de seguridad no verifican que las políticas existan: intentan leer datos de otro vendedor, escribir siendo supervisor y modificar el rol propio, y exigen que cada intento falle.

---

## Alcance

**Incluido:** clientes, facturas, cobros con control de efectivo en tránsito, priorización de cobranzas por antigüedad, panel de supervisión.

**Fuera de alcance:** integración con ERP o sistemas bancarios, facturación electrónica, inventario, toma de pedidos, optimización de rutas, operación sin conexión.

---

## Nota sobre los datos

Este es un proyecto personal, sin relación con ninguna empresa. Los datos de demostración son ficticios.
