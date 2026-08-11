-- ============================================================================
-- registrar_cobro: registra un cobro y lo aplica sobre las facturas pendientes,
-- todo dentro de una sola transaccion.
--
-- Por que una funcion y no varias llamadas desde el frontend:
-- crear el cobro y aplicarlo son cuatro o cinco operaciones. Si una falla a
-- mitad de camino queda un cobro sin aplicar y los saldos mienten. Una funcion
-- se ejecuta entera o no se ejecuta: no hay estado intermedio posible.
--
-- SECURITY INVOKER (el valor por defecto): la funcion corre con los permisos
-- de quien la llama, asi que las politicas RLS siguen aplicando. Un vendedor
-- no puede registrar cobros de otro ni aunque invoque esta funcion.
-- ============================================================================

create or replace function registrar_cobro(
  p_cliente_id  uuid,
  p_monto       numeric,
  p_medio       medio_pago,
  p_recibido_en timestamptz default now(),
  p_notas       text default null
)
returns uuid
language plpgsql
as $$
declare
  v_cobro_id    uuid;
  v_deuda_total numeric;
  v_restante    numeric;
  v_aplicar     numeric;
  v_estado      estado_cobro;
  f             record;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del cobro debe ser mayor a cero'
      using errcode = '23514';
  end if;

  -- Deuda total exigible del cliente. Solo facturas vigentes con saldo.
  select coalesce(sum(saldo), 0) into v_deuda_total
  from v_facturas_saldo
  where cliente_id = p_cliente_id and not anulada and saldo > 0;

  if v_deuda_total = 0 then
    raise exception 'El cliente no tiene facturas pendientes de pago'
      using errcode = '23514';
  end if;

  -- Sobrepago rechazado. Un cobro por encima de la deuda obliga a devolucion
  -- y expone al vendedor a una sancion, asi que se impide antes de guardar.
  if p_monto > v_deuda_total then
    raise exception
      'El cobro excede la deuda del cliente en %. Deuda total: %. Verifique el monto recibido.',
      to_char(p_monto - v_deuda_total, 'FM999999990.00'),
      to_char(v_deuda_total, 'FM999999990.00')
      using errcode = '23514';
  end if;

  -- El efectivo queda en poder del vendedor hasta que lo deposite.
  -- Un deposito directo del cliente ya esta en el banco.
  v_estado := case p_medio
    when 'efectivo' then 'recibido'::estado_cobro
    else 'confirmado'::estado_cobro
  end;

  insert into cobros (vendedor_id, cliente_id, monto, medio, estado, recibido_en, notas)
  values (auth.uid(), p_cliente_id, p_monto, p_medio, v_estado, p_recibido_en, p_notas)
  returning id into v_cobro_id;

  -- Aplicacion por antiguedad de VENCIMIENTO, no de emision: lo urgente es lo
  -- que ya vencio. Una factura emitida antes pero con plazo mas largo puede
  -- estar al dia mientras otra posterior ya esta en mora.
  v_restante := p_monto;

  for f in
    select id, saldo
    from v_facturas_saldo
    where cliente_id = p_cliente_id and not anulada and saldo > 0
    order by fecha_vencimiento, numero
  loop
    exit when v_restante <= 0;

    v_aplicar := least(v_restante, f.saldo);

    insert into aplicaciones (cobro_id, factura_id, monto)
    values (v_cobro_id, f.id, v_aplicar);

    v_restante := v_restante - v_aplicar;
  end loop;

  -- Invariante: todo el cobro quedo distribuido. Si sobra algo hay un error
  -- de logica, no un dato invalido; se aborta para no dejar datos corruptos.
  if v_restante <> 0 then
    raise exception 'Error interno: quedaron % sin aplicar de un cobro de %',
      v_restante, p_monto
      using errcode = 'XX000';
  end if;

  return v_cobro_id;
end;
$$;

comment on function registrar_cobro is
  'Registra un cobro y lo aplica por antiguedad de vencimiento, transaccionalmente.';

grant execute on function registrar_cobro(uuid, numeric, medio_pago, timestamptz, text)
to authenticated;