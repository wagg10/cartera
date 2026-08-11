-- Corrige registrar_cobro: un deposito directo del cliente ya esta en el
-- banco al momento de registrarse, asi que debe llevar deposito_en. Sin ese
-- dato, la restriccion chk_datos_deposito_segun_estado rechaza la fila.

create or replace function registrar_cobro(
  p_cliente_id  uuid,
  p_monto       numeric,
  p_medio       medio_pago,
  p_recibido_en timestamptz default now(),
  p_notas       text default null,
  p_banco       text default null,
  p_comprobante text default null
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
  v_deposito_en timestamptz;
  f             record;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del cobro debe ser mayor a cero'
      using errcode = '23514';
  end if;

  select coalesce(sum(saldo), 0) into v_deuda_total
  from v_facturas_saldo
  where cliente_id = p_cliente_id and not anulada and saldo > 0;

  if v_deuda_total = 0 then
    raise exception 'El cliente no tiene facturas pendientes de pago'
      using errcode = '23514';
  end if;

  if p_monto > v_deuda_total then
    raise exception
      'El cobro excede la deuda del cliente en %. Deuda total: %. Verifique el monto recibido.',
      to_char(p_monto - v_deuda_total, 'FM999999990.00'),
      to_char(v_deuda_total, 'FM999999990.00')
      using errcode = '23514';
  end if;

  if p_medio = 'efectivo' then
    -- El vendedor tiene el dinero en su poder hasta depositarlo.
    v_estado := 'recibido';
    v_deposito_en := null;
  else
    -- El cliente ya deposito: el dinero esta en el banco.
    v_estado := 'confirmado';
    v_deposito_en := p_recibido_en;
  end if;

  insert into cobros (
    vendedor_id, cliente_id, monto, medio, estado, recibido_en, notas,
    deposito_en, deposito_banco, deposito_comprobante
  )
  values (
    auth.uid(), p_cliente_id, p_monto, p_medio, v_estado, p_recibido_en, p_notas,
    v_deposito_en,
    case when p_medio <> 'efectivo' then coalesce(p_banco, 'No especificado') end,
    case when p_medio <> 'efectivo' then coalesce(p_comprobante, 'S/N-' || substr(gen_random_uuid()::text, 1, 8)) end
  )
  returning id into v_cobro_id;

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

  if v_restante <> 0 then
    raise exception 'Error interno: quedaron % sin aplicar de un cobro de %',
      v_restante, p_monto
      using errcode = 'XX000';
  end if;

  return v_cobro_id;
end;
$$;

grant execute on function registrar_cobro(uuid, numeric, medio_pago, timestamptz, text, text, text)
to authenticated;