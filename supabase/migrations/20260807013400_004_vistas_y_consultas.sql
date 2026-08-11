-- ============================================================================
-- 004_vistas_y_consultas.sql
--
-- Los saldos NO se almacenan (RNF-04): se derivan de los movimientos.
-- Un campo `saldo` mutable se desincroniza en cuanto una operación falla a
-- medias, y el error es silencioso. Derivarlo es siempre correcto por
-- construcción; el costo se controla con índices.
--
-- Las vistas usan security_invoker: se evalúan con los permisos de quien
-- consulta, de modo que las políticas RLS de las tablas base siguen
-- aplicándose. Sin esta opción, una vista sería un agujero en la seguridad.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Saldo por factura
-- ---------------------------------------------------------------------------

create view v_facturas_saldo
with (security_invoker = true)
as
select
  f.id,
  f.vendedor_id,
  f.cliente_id,
  f.numero,
  f.fecha_emision,
  f.fecha_vencimiento,
  f.monto_total,
  f.monto_nota_credito,
  coalesce(ap.aplicado, 0) as monto_aplicado,
  f.monto_total - f.monto_nota_credito - coalesce(ap.aplicado, 0) as saldo,

  case
    when f.anulada then 'anulada'::estado_factura
    when f.monto_total - f.monto_nota_credito - coalesce(ap.aplicado, 0) <= 0
      then 'pagada'::estado_factura
    when coalesce(ap.aplicado, 0) > 0 then 'parcial'::estado_factura
    else 'pendiente'::estado_factura
  end as estado,

  -- Días vencidos. Negativo si aún no vence.
  (current_date - f.fecha_vencimiento) as dias_vencida,

  case
    when current_date <= f.fecha_vencimiento then '0-30'
    when current_date - f.fecha_vencimiento <= 30 then '0-30'
    when current_date - f.fecha_vencimiento <= 60 then '31-60'
    when current_date - f.fecha_vencimiento <= 90 then '61-90'
    else '90+'
  end as rango_antiguedad,

  f.anulada
from facturas f
left join lateral (
  select sum(a.monto) as aplicado
  from aplicaciones a
  join cobros c on c.id = a.cobro_id
  where a.factura_id = f.id
    and not c.anulado
) ap on true;

comment on view v_facturas_saldo is
  'Saldo derivado por factura, con clasificación de antigüedad para priorizar cobranzas.';

-- ---------------------------------------------------------------------------
-- Saldo consolidado por cliente
-- ---------------------------------------------------------------------------

create view v_clientes_saldo
with (security_invoker = true)
as
select
  c.id,
  c.vendedor_id,
  c.ruta_id,
  c.nombre_comercial,
  c.identificacion,
  c.limite_credito,

  coalesce(sum(vf.saldo) filter (where not vf.anulada and vf.saldo > 0), 0) as saldo_total,

  count(*) filter (where not vf.anulada and vf.saldo > 0) as facturas_pendientes,

  -- Antigüedad del saldo más viejo: el criterio de priorización.
  max(vf.dias_vencida) filter (where not vf.anulada and vf.saldo > 0) as dias_mora_maxima,

  min(vf.fecha_vencimiento) filter (where not vf.anulada and vf.saldo > 0) as vencimiento_mas_antiguo,

  -- Desglose por rango de antigüedad.
  coalesce(sum(vf.saldo) filter (where vf.rango_antiguedad = '0-30' and vf.saldo > 0), 0) as saldo_0_30,
  coalesce(sum(vf.saldo) filter (where vf.rango_antiguedad = '31-60' and vf.saldo > 0), 0) as saldo_31_60,
  coalesce(sum(vf.saldo) filter (where vf.rango_antiguedad = '61-90' and vf.saldo > 0), 0) as saldo_61_90,
  coalesce(sum(vf.saldo) filter (where vf.rango_antiguedad = '90+' and vf.saldo > 0), 0) as saldo_90_mas,

  c.activo
from clientes c
left join v_facturas_saldo vf on vf.cliente_id = c.id
group by c.id, c.vendedor_id, c.ruta_id, c.nombre_comercial,
         c.identificacion, c.limite_credito, c.activo;

-- ---------------------------------------------------------------------------
-- RF-28 a RF-31: priorización de cobranzas
-- ---------------------------------------------------------------------------

create view v_priorizacion_cobranza
with (security_invoker = true)
as
select
  cs.*,
  r.nombre as ruta_nombre,

  -- Supera el límite de crédito configurado para el cliente.
  (cs.limite_credito is not null and cs.saldo_total > cs.limite_credito) as excede_limite
from v_clientes_saldo cs
left join rutas r on r.id = cs.ruta_id
where cs.saldo_total > 0
  and cs.activo
order by cs.dias_mora_maxima desc nulls last, cs.saldo_total desc;

comment on view v_priorizacion_cobranza is
  'Clientes con deuda ordenados por antigüedad y monto. Responde: a quién cobrar primero.';

-- ---------------------------------------------------------------------------
-- RF-27f: efectivo pendiente de depositar
-- ---------------------------------------------------------------------------

create view v_efectivo_pendiente
with (security_invoker = true)
as
select
  co.id           as cobro_id,
  co.vendedor_id,
  co.cliente_id,
  cl.nombre_comercial,
  co.monto,
  co.recibido_en,

  -- Horas transcurridas desde la recepción: base para la alerta de RF-27g.
  extract(epoch from (now() - co.recibido_en)) / 3600 as horas_en_custodia,

  (now() - co.recibido_en) > interval '24 hours' as alerta_deposito
from cobros co
join clientes cl on cl.id = co.cliente_id
where co.estado = 'recibido'
  and not co.anulado
order by co.recibido_en;

comment on view v_efectivo_pendiente is
  'Efectivo en poder del vendedor. Evidencia del periodo de custodia (RS-20b).';

-- ---------------------------------------------------------------------------
-- RF-33 a RF-34: consolidado para supervisión
-- ---------------------------------------------------------------------------

create view v_cartera_equipo
with (security_invoker = true)
as
select
  p.id   as vendedor_id,
  p.nombre as vendedor_nombre,
  p.supervisor_id,

  coalesce(sum(cs.saldo_total), 0) as saldo_total,
  count(cs.id) filter (where cs.saldo_total > 0) as clientes_con_deuda,

  coalesce(sum(cs.saldo_0_30), 0)  as saldo_0_30,
  coalesce(sum(cs.saldo_31_60), 0) as saldo_31_60,
  coalesce(sum(cs.saldo_61_90), 0) as saldo_61_90,
  coalesce(sum(cs.saldo_90_mas), 0) as saldo_90_mas,

  max(cs.dias_mora_maxima) as dias_mora_maxima,

  coalesce((
    select sum(co.monto)
    from cobros co
    where co.vendedor_id = p.id and co.estado = 'recibido' and not co.anulado
  ), 0) as efectivo_sin_depositar
from perfiles p
left join v_clientes_saldo cs on cs.vendedor_id = p.id and cs.activo
where p.rol = 'vendedor' and p.activo
group by p.id, p.nombre, p.supervisor_id;

comment on view v_cartera_equipo is
  'Consolidado por vendedor para el panel de supervisión (se actualiza vía Realtime).';
