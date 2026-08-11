-- ============================================================================
-- seed.sql — Datos ficticios para desarrollo local
--
-- Se ejecuta automáticamente al final de `supabase db reset`.
--
-- IMPORTANTE: todos los datos son inventados. Nombres, identificaciones y
-- montos no corresponden a ninguna persona ni empresa real.
--
-- Los UUID son fijos para que el escenario sea reproducible: tras un reset,
-- los mismos usuarios y clientes existen con los mismos identificadores.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Usuarios
--
-- Se insertan directamente en auth.users porque el seed corre con privilegios
-- de servicio. La contraseña se hashea con crypt(), igual que hace Supabase Auth.
--
-- Credenciales de todos: Prueba2026Local
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'vendedor@local.test',
    crypt('Prueba2026Local', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Carlos Andrade"}',
    now(), now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'vendedor2@local.test',
    crypt('Prueba2026Local', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Marcela Vinueza"}',
    now(), now()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'supervisor@local.test',
    crypt('Prueba2026Local', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Rosa Chiliquinga"}',
    now(), now()
  );

-- Identidades: Supabase Auth las requiere para permitir login con contraseña.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', now(), now()
from auth.users u
where u.email like '%@local.test';

-- El trigger trg_crear_perfil ya creó los perfiles como 'vendedor'.
-- Ajustamos rol y asignación de equipo (en producción lo haría un administrador).
update perfiles set rol = 'supervisor'
where id = '33333333-3333-3333-3333-333333333333';

update perfiles set supervisor_id = '33333333-3333-3333-3333-333333333333'
where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

-- ---------------------------------------------------------------------------
-- Rutas
-- ---------------------------------------------------------------------------

insert into rutas (id, vendedor_id, nombre) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Centro Norte'),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Valle'),
  ('a2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Sur');

-- ---------------------------------------------------------------------------
-- Clientes del vendedor 1
-- ---------------------------------------------------------------------------

insert into clientes (id, vendedor_id, ruta_id, nombre_comercial, identificacion, direccion, telefono, limite_credito) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'Comercial San Jose', '1791234567001', 'Av. Naciones Unidas y Amazonas', '0991234567', 25000),

  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'Distribuidora El Ahorro', '1792345678001', 'Calle Rocafuerte 234', '0987654321', 30000),

  ('c1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002',
   'Minimarket La Union', '1793456789001', 'Av. Ilalo y Los Alamos', '0996543210', 15000),

  ('c1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002',
   'Abastos Santa Rosa', '1794567890001', 'Calle Quito 89', '0985432109', null),

  ('c1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'Bodega Central Ambato', '1795678901001', 'Av. Cevallos 1203', '0994321098', 20000);

-- Cliente del vendedor 2: sirve para comprobar el aislamiento entre vendedores.
insert into clientes (id, vendedor_id, ruta_id, nombre_comercial, identificacion) values
  ('c2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'a2000000-0000-0000-0000-000000000001',
   'Comercial Los Andes', '1796789012001');

-- ---------------------------------------------------------------------------
-- Facturas
--
-- Las fechas son relativas a current_date para que el escenario de mora se
-- mantenga vigente sin importar cuándo se ejecute el seed.
-- ---------------------------------------------------------------------------

insert into facturas (id, vendedor_id, cliente_id, numero, fecha_emision, fecha_vencimiento, monto_total) values
  -- Comercial San Jose: el caso del ejemplo (5000 + 4000 + 6000)
  ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000001',
   'FAC-001-2451', current_date - 75, current_date - 45, 5000.0000),
  ('f1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000001',
   'FAC-001-2478', current_date - 40, current_date - 10, 4000.0000),
  ('f1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000001',
   'FAC-001-2502', current_date - 20, current_date + 10, 6000.0000),

  -- Distribuidora El Ahorro: mora grave, supera los 90 días
  ('f1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000002',
   'FAC-001-2310', current_date - 140, current_date - 110, 12000.0000),
  ('f1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000002',
   'FAC-001-2389', current_date - 95, current_date - 65, 8500.0000),
  ('f1000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000002',
   'FAC-001-2495', current_date - 25, current_date + 5, 9800.0000),

  -- Minimarket La Union: al día, aún no vence
  ('f1000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000003',
   'FAC-001-2510', current_date - 12, current_date + 18, 3200.0000),

  -- Abastos Santa Rosa: pago parcial ya aplicado
  ('f1000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000004',
   'FAC-001-2401', current_date - 85, current_date - 55, 7500.0000),

  -- Bodega Central Ambato: saldada por completo, no debe aparecer en priorización
  ('f1000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000005',
   'FAC-001-2350', current_date - 100, current_date - 70, 4500.0000),

  -- Del vendedor 2
  ('f2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'c2000000-0000-0000-0000-000000000001',
   'FAC-002-1180', current_date - 50, current_date - 20, 6700.0000);

-- ---------------------------------------------------------------------------
-- Cobros
--
-- Escenarios cubiertos:
--   - Cobro en efectivo ya depositado
--   - Cobro en efectivo pendiente de depositar (efectivo en tránsito)
--   - Depósito directo del cliente
--   - Pago parcial
-- ---------------------------------------------------------------------------

-- Bodega Central Ambato pagó completo, por depósito directo.
insert into cobros (
  id, vendedor_id, cliente_id, monto, medio, estado,
  recibido_en, deposito_en, deposito_banco, deposito_comprobante
) values (
  'b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
  'c1000000-0000-0000-0000-000000000005', 4500.0000, 'deposito_directo', 'confirmado',
  now() - interval '15 days', now() - interval '15 days', 'Produbanco', 'DEP-884512'
);

insert into aplicaciones (cobro_id, factura_id, monto) values
  ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000009', 4500.0000);

-- Abastos Santa Rosa abonó parcialmente en efectivo, ya depositado.
insert into cobros (
  id, vendedor_id, cliente_id, monto, medio, estado,
  recibido_en, deposito_en, deposito_banco, deposito_comprobante
) values (
  'b1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
  'c1000000-0000-0000-0000-000000000004', 2500.0000, 'efectivo', 'depositado',
  now() - interval '8 days', now() - interval '8 days', 'Produbanco', 'DEP-891203'
);

insert into aplicaciones (cobro_id, factura_id, monto) values
  ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000008', 2500.0000);

-- Minimarket La Union pagó en efectivo HOY: todavía sin depositar.
-- Este es el caso de "efectivo en tránsito": el cliente ya no debe, pero el
-- vendedor tiene el dinero encima y debe depositarlo.
insert into cobros (
  id, vendedor_id, cliente_id, monto, medio, estado, recibido_en
) values (
  'b1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
  'c1000000-0000-0000-0000-000000000003', 3200.0000, 'efectivo', 'recibido',
  now() - interval '3 hours'
);

insert into aplicaciones (cobro_id, factura_id, monto) values
  ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000007', 3200.0000);

-- Cobro en efectivo de hace dos días, aún sin depositar: dispara la alerta.
insert into cobros (
  id, vendedor_id, cliente_id, monto, medio, estado, recibido_en
) values (
  'b1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
  'c1000000-0000-0000-0000-000000000001', 1500.0000, 'efectivo', 'recibido',
  now() - interval '2 days'
);

insert into aplicaciones (cobro_id, factura_id, monto) values
  ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 1500.0000);

-- ============================================================================
-- Escenario resultante para el vendedor 1 (vendedor@local.test):
--
--   Distribuidora El Ahorro  30.300,00  mora 110 días  <- prioridad máxima
--   Comercial San Jose       13.500,00  mora  45 días  (ya abonó 1.500)
--   Abastos Santa Rosa        5.000,00  mora  55 días  (abonó 2.500 de 7.500)
--   Minimarket La Union            0,00  al día
--   Bodega Central Ambato          0,00  saldada
--
--   Efectivo sin depositar:   4.700,00  (uno de ellos con más de 24h)
--
-- Contraseña de todos los usuarios: Prueba2026Local
-- ============================================================================
