-- ============================================================================
-- 003_cobros_y_aplicaciones.sql
--
-- El corazón del sistema.
--
-- Modelo de tres piezas:
--   cobros        — el dinero que entregó el cliente
--   aplicaciones  — contra qué facturas se imputa ese dinero
--   (depósito)    — columnas del propio cobro, no tabla aparte
--
-- Por qué el depósito NO es una tabla separada: la regla de negocio exige
-- relación uno a uno y monto idéntico (RF-27c a RF-27e). Modelarlo como
-- columnas del cobro hace que esa cardinalidad sea estructuralmente
-- imposible de violar. Una tabla aparte permitiría, por descuido, insertar
-- dos depósitos para un mismo cobro; con columnas, no existe forma.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Cobros
-- ---------------------------------------------------------------------------

create table cobros (
  id            uuid primary key default gen_random_uuid(),
  vendedor_id   uuid not null references perfiles (id) on delete restrict,
  cliente_id    uuid not null references clientes (id) on delete restrict,

  monto         numeric(18,4) not null check (monto > 0),
  medio         medio_pago not null,
  estado        estado_cobro not null,

  -- Momento en que el cliente entregó el dinero. Determina la reducción del
  -- saldo del cliente, independientemente de cuándo se deposite.
  recibido_en   timestamptz not null default now(),

  -- --- Datos del depósito bancario (uno a uno con el cobro) ---
  deposito_en          timestamptz,
  deposito_banco       text,
  deposito_comprobante text,

  -- --- Anulación ---
  anulado          boolean not null default false,
  motivo_anulacion text,
  anulado_en       timestamptz,

  notas         text,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- RF-27: un comprobante bancario no se registra dos veces.
  -- El índice único parcial ignora los nulos (cobros aún sin depositar).
  constraint chk_comprobante_completo
    check (
      (deposito_en is null and deposito_banco is null and deposito_comprobante is null)
      or
      (deposito_en is not null and deposito_banco is not null and deposito_comprobante is not null)
    ),

  -- Coherencia entre medio y estado.
  constraint chk_estado_coherente_con_medio
    check (
      (medio = 'efectivo' and estado in ('recibido', 'depositado', 'anulado'))
      or
      (medio = 'deposito_directo' and estado in ('confirmado', 'anulado'))
    ),

  -- Un cobro 'depositado' o 'confirmado' debe tener los datos del depósito.
  constraint chk_datos_deposito_segun_estado
    check (
      (estado in ('depositado', 'confirmado') and deposito_en is not null)
      or
      (estado in ('recibido', 'anulado'))
    ),

  constraint chk_deposito_no_anterior_a_recepcion
    check (deposito_en is null or deposito_en >= recibido_en),

  constraint chk_motivo_si_anulado
    check (
      not anulado
      or (motivo_anulacion is not null and length(trim(motivo_anulacion)) > 0
          and anulado_en is not null)
    ),

  constraint chk_anulado_coherente
    check (anulado = (estado = 'anulado'))
);

comment on table cobros is
  'Dinero recibido del cliente. El depósito bancario se registra en las mismas '
  'filas para garantizar la relación uno a uno exigida por el control interno.';

comment on column cobros.recibido_en is
  'Marca el inicio del periodo de custodia del efectivo por parte del vendedor.';

-- RF-27: unicidad del comprobante bancario a nivel global.
create unique index idx_cobros_comprobante_unico
  on cobros (deposito_banco, deposito_comprobante)
  where deposito_comprobante is not null and not anulado;

create index idx_cobros_vendedor on cobros (vendedor_id, recibido_en desc)
  where not anulado;
create index idx_cobros_cliente on cobros (cliente_id, recibido_en desc)
  where not anulado;

-- RF-27f: consulta de efectivo pendiente de depositar. Índice parcial muy
-- estrecho: solo las filas en estado 'recibido', que son pocas y se consultan
-- constantemente.
create index idx_cobros_efectivo_pendiente
  on cobros (vendedor_id, recibido_en)
  where estado = 'recibido';

create trigger trg_cobros_actualizado
  before update on cobros
  for each row execute function tocar_actualizado_en();

create trigger trg_cobros_validar_cliente
  before insert or update of cliente_id, vendedor_id on cobros
  for each row execute function validar_cliente_del_vendedor();

-- ---------------------------------------------------------------------------
-- Aplicaciones: qué parte de un cobro salda qué factura
-- ---------------------------------------------------------------------------

create table aplicaciones (
  id          uuid primary key default gen_random_uuid(),
  cobro_id    uuid not null references cobros (id) on delete cascade,
  factura_id  uuid not null references facturas (id) on delete restrict,

  monto       numeric(18,4) not null check (monto > 0),

  creado_en   timestamptz not null default now(),

  -- Un cobro no se aplica dos veces a la misma factura: se acumula en una fila.
  unique (cobro_id, factura_id)
);

comment on table aplicaciones is
  'Imputación de un cobro sobre facturas. La suma de las aplicaciones de un '
  'cobro nunca excede su monto; el remanente queda como saldo a favor.';

create index idx_aplicaciones_factura on aplicaciones (factura_id);
create index idx_aplicaciones_cobro on aplicaciones (cobro_id);

-- ---------------------------------------------------------------------------
-- Invariantes de dinero
--
-- Estas son las reglas que hacen que el sistema sea confiable. Viven en la
-- base de datos, no en la aplicación: aunque el frontend tenga un bug o
-- alguien escriba directo por la API, no se pueden violar.
-- ---------------------------------------------------------------------------

-- Saldo exigible de una factura: total menos nota de crédito menos aplicado.
create or replace function saldo_factura(p_factura_id uuid)
returns numeric
language sql
stable
as $$
  select f.monto_total
       - f.monto_nota_credito
       - coalesce((
           select sum(a.monto)
           from aplicaciones a
           join cobros c on c.id = a.cobro_id
           where a.factura_id = f.id
             and not c.anulado
         ), 0)
  from facturas f
  where f.id = p_factura_id;
$$;

-- Monto ya aplicado de un cobro.
create or replace function aplicado_de_cobro(p_cobro_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(monto), 0)
  from aplicaciones
  where cobro_id = p_cobro_id;
$$;

-- INVARIANTE 1 (RF-25): la suma de aplicaciones nunca excede el cobro.
-- INVARIANTE 2: una aplicación nunca deja el saldo de la factura en negativo.
-- INVARIANTE 3: cobro y factura pertenecen al mismo cliente.
create or replace function validar_aplicacion()
returns trigger
language plpgsql
as $$
declare
  v_cobro           cobros%rowtype;
  v_factura         facturas%rowtype;
  v_aplicado_previo numeric;
  v_saldo_previo    numeric;
begin
  select * into v_cobro from cobros where id = new.cobro_id for update;
  select * into v_factura from facturas where id = new.factura_id for update;

  if v_cobro.anulado then
    raise exception 'No se puede aplicar un cobro anulado'
      using errcode = '23514';
  end if;

  if v_factura.anulada then
    raise exception 'No se puede aplicar un cobro sobre una factura anulada'
      using errcode = '23514';
  end if;

  -- INVARIANTE 3
  if v_cobro.cliente_id is distinct from v_factura.cliente_id then
    raise exception 'El cobro y la factura corresponden a clientes distintos'
      using errcode = '23514';
  end if;

  -- INVARIANTE 1
  select coalesce(sum(monto), 0) into v_aplicado_previo
  from aplicaciones
  where cobro_id = new.cobro_id
    and (tg_op = 'INSERT' or id <> new.id);

  if v_aplicado_previo + new.monto > v_cobro.monto then
    raise exception
      'La aplicación excede el monto del cobro (cobro: %, ya aplicado: %, intento: %)',
      v_cobro.monto, v_aplicado_previo, new.monto
      using errcode = '23514';
  end if;

  -- INVARIANTE 2
  v_saldo_previo := v_factura.monto_total - v_factura.monto_nota_credito
    - coalesce((
        select sum(a.monto)
        from aplicaciones a
        join cobros c on c.id = a.cobro_id
        where a.factura_id = new.factura_id
          and not c.anulado
          and (tg_op = 'INSERT' or a.id <> new.id)
      ), 0);

  if new.monto > v_saldo_previo then
    raise exception
      'La aplicación excede el saldo de la factura (saldo: %, intento: %)',
      v_saldo_previo, new.monto
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_validar_aplicacion
  before insert or update on aplicaciones
  for each row execute function validar_aplicacion();

-- INVARIANTE 4 (RF-18): no se altera el monto de una factura que ya tiene
-- cobros aplicados. La corrección se hace por nota de crédito.
create or replace function proteger_factura_con_aplicaciones()
returns trigger
language plpgsql
as $$
declare
  v_aplicado numeric;
begin
  if new.monto_total is not distinct from old.monto_total then
    return new;
  end if;

  select coalesce(sum(a.monto), 0) into v_aplicado
  from aplicaciones a
  join cobros c on c.id = a.cobro_id
  where a.factura_id = old.id and not c.anulado;

  if v_aplicado > 0 then
    raise exception
      'No se puede modificar el monto de una factura con cobros aplicados. '
      'Registre una nota de crédito.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_proteger_factura
  before update on facturas
  for each row execute function proteger_factura_con_aplicaciones();

-- INVARIANTE 5 (RF-27d): el depósito coincide EXACTAMENTE con el cobro.
-- No hay tolerancia. La comparación es decimal exacta, no de punto flotante.
create or replace function validar_deposito()
returns trigger
language plpgsql
as $$
begin
  -- Solo interesa la transición hacia 'depositado'.
  if new.estado <> 'depositado' or old.estado = 'depositado' then
    return new;
  end if;

  if old.estado <> 'recibido' then
    raise exception 'Solo un cobro en estado "recibido" puede pasar a "depositado"'
      using errcode = '23514';
  end if;

  if new.monto is distinct from old.monto then
    raise exception
      'El monto depositado debe ser exactamente igual al cobrado (cobrado: %, depositado: %)',
      old.monto, new.monto
      using errcode = '23514';
  end if;

  if new.deposito_comprobante is null then
    raise exception 'El depósito requiere número de comprobante'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_validar_deposito
  before update on cobros
  for each row execute function validar_deposito();

-- INVARIANTE 6 (RS-19): los cobros no se eliminan. Se anulan.
create or replace function impedir_borrado_financiero()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Los registros financieros no se eliminan. Utilice la anulación, que conserva la trazabilidad.'
    using errcode = '42501';
end;
$$;

create trigger trg_no_borrar_cobros
  before delete on cobros
  for each row execute function impedir_borrado_financiero();

create trigger trg_no_borrar_facturas
  before delete on facturas
  for each row execute function impedir_borrado_financiero();
