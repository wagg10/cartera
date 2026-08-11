-- ============================================================================
-- 005_rls_y_auditoria.sql
--
-- Control de acceso a nivel de fila.
--
-- Principio (RS-10): toda tabla deniega por defecto. Habilitar RLS sin
-- políticas bloquea todo; cada permiso se concede explícitamente.
--
-- FORCE ROW LEVEL SECURITY hace que las políticas apliquen incluso al dueño
-- de la tabla. Sin esto, el propietario las evade silenciosamente.
--
-- Matriz implementada:
--   vendedor      -> lectura/escritura sobre sus propios registros
--   supervisor    -> SOLO LECTURA sobre los registros de su equipo
--   administrador -> SIN acceso a datos de cartera (RS-13)
-- ============================================================================

alter table rutas         enable row level security;
alter table clientes      enable row level security;
alter table facturas      enable row level security;
alter table cobros        enable row level security;
alter table aplicaciones  enable row level security;

alter table rutas         force row level security;
alter table clientes      force row level security;
alter table facturas      force row level security;
alter table cobros        force row level security;
alter table aplicaciones  force row level security;

-- ---------------------------------------------------------------------------
-- Rutas
-- ---------------------------------------------------------------------------

create policy rutas_vendedor_todo on rutas
  for all
  using (vendedor_id = auth.uid() and rol_actual() = 'vendedor')
  with check (vendedor_id = auth.uid() and rol_actual() = 'vendedor');

create policy rutas_supervisor_lectura on rutas
  for select
  using (rol_actual() = 'supervisor' and es_supervisor_de(vendedor_id));

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------

create policy clientes_vendedor_todo on clientes
  for all
  using (vendedor_id = auth.uid() and rol_actual() = 'vendedor')
  with check (vendedor_id = auth.uid() and rol_actual() = 'vendedor');

create policy clientes_supervisor_lectura on clientes
  for select
  using (rol_actual() = 'supervisor' and es_supervisor_de(vendedor_id));

-- ---------------------------------------------------------------------------
-- Facturas
-- ---------------------------------------------------------------------------

create policy facturas_vendedor_todo on facturas
  for all
  using (vendedor_id = auth.uid() and rol_actual() = 'vendedor')
  with check (vendedor_id = auth.uid() and rol_actual() = 'vendedor');

create policy facturas_supervisor_lectura on facturas
  for select
  using (rol_actual() = 'supervisor' and es_supervisor_de(vendedor_id));

-- ---------------------------------------------------------------------------
-- Cobros
-- ---------------------------------------------------------------------------

create policy cobros_vendedor_todo on cobros
  for all
  using (vendedor_id = auth.uid() and rol_actual() = 'vendedor')
  with check (vendedor_id = auth.uid() and rol_actual() = 'vendedor');

create policy cobros_supervisor_lectura on cobros
  for select
  using (rol_actual() = 'supervisor' and es_supervisor_de(vendedor_id));

-- ---------------------------------------------------------------------------
-- Aplicaciones
--
-- No tienen vendedor_id propio: heredan la pertenencia del cobro. Esto evita
-- un campo redundante que podría desincronizarse.
-- ---------------------------------------------------------------------------

create policy aplicaciones_vendedor_todo on aplicaciones
  for all
  using (
    rol_actual() = 'vendedor'
    and exists (
      select 1 from cobros c
      where c.id = aplicaciones.cobro_id and c.vendedor_id = auth.uid()
    )
  )
  with check (
    rol_actual() = 'vendedor'
    and exists (
      select 1 from cobros c
      where c.id = aplicaciones.cobro_id and c.vendedor_id = auth.uid()
    )
  );

create policy aplicaciones_supervisor_lectura on aplicaciones
  for select
  using (
    rol_actual() = 'supervisor'
    and exists (
      select 1 from cobros c
      where c.id = aplicaciones.cobro_id and es_supervisor_de(c.vendedor_id)
    )
  );

-- Nota: no existe ninguna política que otorgue acceso al rol 'administrador'
-- sobre estas tablas. La ausencia es deliberada (RS-13): el administrador
-- gestiona usuarios, no cartera.

-- ---------------------------------------------------------------------------
-- RS-20: bitácora de auditoría
-- ---------------------------------------------------------------------------

create table auditoria (
  id           bigserial primary key,
  usuario_id   uuid,
  tabla        text not null,
  operacion    text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  registro_id  uuid,
  datos_antes  jsonb,
  datos_despues jsonb,
  ocurrido_en  timestamptz not null default now()
);

create index idx_auditoria_registro on auditoria (tabla, registro_id, ocurrido_en desc);
create index idx_auditoria_usuario on auditoria (usuario_id, ocurrido_en desc);

alter table auditoria enable row level security;
alter table auditoria force row level security;

-- La bitácora es de solo lectura para el usuario: la escriben los triggers,
-- que corren como SECURITY DEFINER. Nadie puede insertar ni alterar entradas.
create policy auditoria_leer_propia on auditoria
  for select using (usuario_id = auth.uid());

create or replace function registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into auditoria (usuario_id, tabla, operacion, registro_id, datos_antes, datos_despues)
  values (
    auth.uid(),
    tg_table_name,
    tg_op,
    case tg_op when 'DELETE' then old.id else new.id end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger trg_auditoria_cobros
  after insert or update on cobros
  for each row execute function registrar_auditoria();

create trigger trg_auditoria_facturas
  after insert or update on facturas
  for each row execute function registrar_auditoria();

create trigger trg_auditoria_aplicaciones
  after insert or update on aplicaciones
  for each row execute function registrar_auditoria();

-- ---------------------------------------------------------------------------
-- RF-35: publicación para Supabase Realtime
--
-- Solo se publican las tablas cuyo cambio debe reflejarse en el panel de
-- supervisión. Realtime respeta RLS: cada suscriptor recibe únicamente los
-- cambios de filas que tendría derecho a leer.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table cobros;
alter publication supabase_realtime add table facturas;
