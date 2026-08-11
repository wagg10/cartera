-- ============================================================================
-- registrar_deposito: marca un cobro en efectivo como depositado.
--
-- El control interno de la empresa verifica que cada deposito bancario
-- coincida exactamente con el cobro de un cliente. Agrupar cobros o depositar
-- montos parciales rompe la trazabilidad y hace imposible la conciliacion.
--
-- Por eso el monto no es un parametro: se toma del propio cobro. No hay forma
-- de depositar una cifra distinta, ni por error ni a proposito.
-- ============================================================================

create or replace function registrar_deposito(
  p_cobro_id    uuid,
  p_banco       text,
  p_comprobante text,
  p_deposito_en timestamptz default now()
)
returns void
language plpgsql
as $$
declare
  v_cobro cobros%rowtype;
begin
  select * into v_cobro from cobros where id = p_cobro_id;

  if not found then
    raise exception 'El cobro no existe o no pertenece a este vendedor'
      using errcode = '42501';
  end if;

  if v_cobro.estado <> 'recibido' then
    raise exception 'Solo se puede depositar un cobro en efectivo pendiente. Estado actual: %',
      v_cobro.estado
      using errcode = '23514';
  end if;

  if p_banco is null or length(trim(p_banco)) = 0 then
    raise exception 'Indique el banco del deposito'
      using errcode = '23514';
  end if;

  if p_comprobante is null or length(trim(p_comprobante)) = 0 then
    raise exception 'Indique el numero de comprobante del deposito'
      using errcode = '23514';
  end if;

  -- El monto NO se recibe como parametro: se conserva el del cobro.
  -- Asi la igualdad exacta es estructural, no una validacion que pueda fallar.
  update cobros
  set estado = 'depositado',
      deposito_en = p_deposito_en,
      deposito_banco = trim(p_banco),
      deposito_comprobante = trim(p_comprobante)
  where id = p_cobro_id;
end;
$$;

comment on function registrar_deposito is
  'Marca un cobro en efectivo como depositado. El monto se conserva del cobro original.';

grant execute on function registrar_deposito(uuid, text, text, timestamptz)
to authenticated;