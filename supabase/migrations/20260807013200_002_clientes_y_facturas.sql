-- ============================================================================
-- 002_clientes_y_facturas.sql
--
-- Núcleo del dominio: a quién se le vende y qué se le facturó.
--
-- Decisión de diseño: todos los montos son NUMERIC(18,4).
--   - NUMERIC es decimal exacto en Postgres; float8 no lo es.
--   - 18 dígitos totales cubren montos muy por encima del rango de operación.
--   - 4 decimales, no 2: los precios unitarios y descuentos de mayoreo suelen
--     llevar más de dos decimales, y redondear antes de tiempo introduce
--     descuadres. La presentación redondea a 2; el almacenamiento guarda 4.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rutas de visita
-- ---------------------------------------------------------------------------

create table rutas (
  id          uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references perfiles (id) on delete restrict,
  nombre      text not null check (length(trim(nombre)) between 2 and 80),
  activa      boolean not null default true,
  creado_en   timestamptz not null default now(),

  unique (vendedor_id, nombre)
);

create index idx_rutas_vendedor on rutas (vendedor_id) where activa;

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------

create table clientes (
  id              uuid primary key default gen_random_uuid(),
  vendedor_id     uuid not null references perfiles (id) on delete restrict,
  ruta_id         uuid references rutas (id) on delete set null,

  nombre_comercial text not null check (length(trim(nombre_comercial)) between 2 and 200),

  -- RUC (13) o cédula (10) ecuatorianos. Se valida formato, no dígito verificador:
  -- la validación completa vive en la aplicación, donde el error es explicable.
  identificacion  text check (identificacion ~ '^[0-9]{10}$|^[0-9]{13}$'),

  direccion       text,
  telefono        text,
  correo          text check (correo is null or correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  -- Umbral de alerta por cliente. Nulo = usar el umbral global del vendedor.
  limite_credito  numeric(18,4) check (limite_credito is null or limite_credito > 0),

  notas           text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  -- Un mismo vendedor no puede tener dos clientes con la misma identificación.
  unique (vendedor_id, identificacion)
);

comment on column clientes.identificacion is
  'RUC de 13 dígitos o cédula de 10. El dígito verificador se valida en la aplicación.';

create index idx_clientes_vendedor on clientes (vendedor_id) where activo;
create index idx_clientes_ruta on clientes (ruta_id) where activo;
-- Búsqueda por nombre desde el móvil, tolerante a acentos y mayúsculas.
create index idx_clientes_nombre_busqueda on clientes using gin (nombre_comercial gin_trgm_ops);

create trigger trg_clientes_actualizado
  before update on clientes
  for each row execute function tocar_actualizado_en();

-- La ruta debe pertenecer al mismo vendedor que el cliente.
create or replace function validar_ruta_del_vendedor()
returns trigger
language plpgsql
as $$
declare
  duenio uuid;
begin
  if new.ruta_id is null then
    return new;
  end if;

  select vendedor_id into duenio from rutas where id = new.ruta_id;

  if duenio is distinct from new.vendedor_id then
    raise exception 'La ruta no pertenece al vendedor del cliente'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_validar_ruta
  before insert or update of ruta_id, vendedor_id on clientes
  for each row execute function validar_ruta_del_vendedor();

-- ---------------------------------------------------------------------------
-- Facturas
-- ---------------------------------------------------------------------------

create table facturas (
  id             uuid primary key default gen_random_uuid(),
  vendedor_id    uuid not null references perfiles (id) on delete restrict,
  cliente_id     uuid not null references clientes (id) on delete restrict,

  numero         text not null check (length(trim(numero)) between 1 and 40),

  fecha_emision  date not null,
  fecha_vencimiento date not null,

  monto_total    numeric(18,4) not null check (monto_total > 0),

  -- Reducción por nota de crédito. Se resta del total para obtener lo exigible.
  monto_nota_credito numeric(18,4) not null default 0
    check (monto_nota_credito >= 0),

  anulada        boolean not null default false,
  motivo_anulacion text,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint chk_vencimiento_posterior
    check (fecha_vencimiento >= fecha_emision),

  constraint chk_nota_credito_no_excede
    check (monto_nota_credito <= monto_total),

  constraint chk_motivo_si_anulada
    check (not anulada or (motivo_anulacion is not null and length(trim(motivo_anulacion)) > 0)),

  -- RF-17: no se repite el número de factura para el mismo cliente.
  unique (cliente_id, numero)
);

comment on table facturas is
  'Obligaciones de cobro. El saldo NO se almacena: se deriva de las aplicaciones de cobro.';

create index idx_facturas_vendedor on facturas (vendedor_id) where not anulada;
create index idx_facturas_cliente on facturas (cliente_id) where not anulada;
-- Índice para la consulta de priorización: facturas vigentes por antigüedad.
create index idx_facturas_vencimiento on facturas (vendedor_id, fecha_vencimiento)
  where not anulada;

create trigger trg_facturas_actualizado
  before update on facturas
  for each row execute function tocar_actualizado_en();

-- El cliente debe pertenecer al vendedor de la factura.
create or replace function validar_cliente_del_vendedor()
returns trigger
language plpgsql
as $$
declare
  duenio uuid;
begin
  select vendedor_id into duenio from clientes where id = new.cliente_id;

  if duenio is distinct from new.vendedor_id then
    raise exception 'El cliente no pertenece al vendedor indicado'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_facturas_validar_cliente
  before insert or update of cliente_id, vendedor_id on facturas
  for each row execute function validar_cliente_del_vendedor();
