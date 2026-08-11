-- ============================================================================
-- Permisos de tabla (GRANT)
--
-- Postgres tiene DOS capas de control de acceso y se evalúan en orden:
--   1. GRANT — ¿este rol puede tocar la tabla, en absoluto?
--   2. RLS   — de las filas de esa tabla, ¿cuáles puede ver?
--
-- Si la capa 1 niega, la capa 2 ni se consulta. Las políticas de la
-- migración 005 son inútiles sin estos GRANT.
--
-- 'authenticated' es el rol bajo el que Supabase ejecuta a todo usuario
-- con sesión iniciada.
-- ============================================================================

grant usage on schema public to authenticated;

-- Tablas de trabajo. Qué FILAS ve cada uno lo deciden las políticas RLS.
grant select, insert, update on
  perfiles, rutas, clientes, facturas, cobros, aplicaciones
to authenticated;

-- La bitácora es de solo lectura: la escriben los triggers (SECURITY DEFINER).
grant select on auditoria to authenticated;

-- Vistas derivadas (heredan RLS por security_invoker).
grant select on
  v_facturas_saldo, v_clientes_saldo, v_priorizacion_cobranza,
  v_efectivo_pendiente, v_cartera_equipo
to authenticated;

-- Sin DELETE en ninguna tabla: los registros financieros se anulan, no se
-- borran (RS-19). Los triggers ya lo impiden; no otorgar el permiso es la
-- segunda barrera. Defensa en profundidad.

grant execute on function
  rol_actual(), es_supervisor_de(uuid), vendedores_visibles(),
  saldo_factura(uuid), aplicado_de_cobro(uuid)
to authenticated;

-- El rol 'anon' (sin sesión) no recibe ningún permiso. Deliberado.