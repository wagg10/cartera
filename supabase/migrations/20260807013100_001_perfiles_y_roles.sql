-- ============================================================================
-- 001_perfiles_y_roles.sql
--
-- Identidad y control de acceso.
--
-- Decisión de diseño: el rol vive en una tabla del servidor, NUNCA en
-- auth.users.raw_user_meta_data. Los metadatos de usuario en Supabase son
-- escribibles por el propio cliente autenticado, así que guardar el rol ahí
-- permitiría que cualquiera se ascendiera a supervisor editando su perfil.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------------

create type rol_usuario as enum ('vendedor', 'supervisor', 'administrador');

create type medio_pago as enum (
  'efectivo',          -- el cliente entrega efectivo al vendedor
  'deposito_directo'   -- el cliente deposita por su cuenta
);

create type estado_cobro as enum (
  'recibido',    -- efectivo en poder del vendedor, pendiente de depositar
  'depositado',  -- efectivo ya depositado, con comprobante
  'confirmado',  -- depósito directo del cliente, ya verificado
  'anulado'      -- revertido; conserva el registro
);

create type estado_factura as enum (
  'pendiente',
  'parcial',
  'pagada',
  'anulada'
);

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------

create table perfiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  nombre        text not null check (length(trim(nombre)) between 2 and 120),
  rol           rol_usuario not null default 'vendedor',

  -- Supervisor a cargo. Solo aplica a vendedores.
  supervisor_id uuid references perfiles (id) on delete set null,

  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Un supervisor o administrador no puede tener supervisor asignado.
  constraint chk_supervisor_solo_vendedores
    check (supervisor_id is null or rol = 'vendedor'),

  -- Nadie es su propio supervisor.
  constraint chk_no_autosupervision
    check (supervisor_id is distinct from id)
);

comment on table perfiles is
  'Datos de aplicación del usuario. El rol se almacena aquí, no en los metadatos de auth.';

create index idx_perfiles_supervisor on perfiles (supervisor_id) where supervisor_id is not null;
create index idx_perfiles_rol on perfiles (rol);

-- ---------------------------------------------------------------------------
-- Creación automática del perfil al registrarse
-- ---------------------------------------------------------------------------

create or replace function crear_perfil_para_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    -- El rol NUNCA se toma de los metadatos del cliente: siempre 'vendedor'.
    -- La promoción de rol es una acción administrativa explícita.
    'vendedor'
  );
  return new;
end;
$$;

create trigger trg_crear_perfil
  after insert on auth.users
  for each row
  execute function crear_perfil_para_usuario_nuevo();

-- ---------------------------------------------------------------------------
-- Funciones auxiliares de autorización
--
-- SECURITY DEFINER para poder leer 'perfiles' sin quedar atrapadas en las
-- políticas RLS de esa misma tabla (recursión infinita).
-- STABLE permite al planificador cachear el resultado dentro de la consulta.
-- ---------------------------------------------------------------------------

create or replace function rol_actual()
returns rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from perfiles where id = auth.uid() and activo;
$$;

create or replace function es_supervisor_de(vendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from perfiles p
    where p.id = vendedor
      and p.supervisor_id = auth.uid()
      and p.activo
  );
$$;

-- Conjunto de vendedores visibles para el usuario actual.
-- Un vendedor se ve a sí mismo; un supervisor ve a su equipo.
create or replace function vendedores_visibles()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid()
  where rol_actual() = 'vendedor'
  union
  select p.id
  from perfiles p
  where p.supervisor_id = auth.uid()
    and rol_actual() = 'supervisor'
    and p.activo;
$$;

-- ---------------------------------------------------------------------------
-- Actualización automática de la marca de tiempo
-- ---------------------------------------------------------------------------

create or replace function tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger trg_perfiles_actualizado
  before update on perfiles
  for each row execute function tocar_actualizado_en();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table perfiles enable row level security;
alter table perfiles force row level security;

-- Cada usuario ve su propio perfil.
create policy perfiles_leer_propio on perfiles
  for select using (id = auth.uid());

-- El supervisor ve los perfiles de su equipo.
create policy perfiles_leer_equipo on perfiles
  for select using (supervisor_id = auth.uid());

-- El administrador ve todos los perfiles (gestiona usuarios).
create policy perfiles_leer_admin on perfiles
  for select using (rol_actual() = 'administrador');

-- Cada usuario edita su nombre, pero NO su rol ni su supervisor.
-- La comprobación se hace en un trigger porque una política USING/WITH CHECK
-- no puede comparar el valor viejo contra el nuevo.
create policy perfiles_editar_propio on perfiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy perfiles_editar_admin on perfiles
  for update using (rol_actual() = 'administrador');

create or replace function proteger_campos_privilegiados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Contexto de servidor (service_role, migraciones, seeds): no hay JWT, así
  -- que auth.uid() es nulo. Estas operaciones son de confianza por definición,
  -- ya que la clave de servicio nunca se expone al cliente (RS-17).
  if auth.uid() is null then
    return new;
  end if;

  -- El administrador puede cambiar rol y supervisor.
  if rol_actual() = 'administrador' then
    return new;
  end if;

  if new.rol is distinct from old.rol then
    raise exception 'No está permitido modificar el rol propio'
      using errcode = '42501';
  end if;

  if new.supervisor_id is distinct from old.supervisor_id then
    raise exception 'No está permitido modificar el supervisor asignado'
      using errcode = '42501';
  end if;

  if new.activo is distinct from old.activo then
    raise exception 'No está permitido modificar el estado de la cuenta'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_proteger_campos_privilegiados
  before update on perfiles
  for each row execute function proteger_campos_privilegiados();

-- No se define política de DELETE: los perfiles no se eliminan, se desactivan.
