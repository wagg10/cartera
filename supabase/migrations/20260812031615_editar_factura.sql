-- ============================================================================
-- editar_factura: permite corregir una factura respetando la integridad
-- de los cobros ya aplicados.
--
-- Reglas:
--   1. La fecha de vencimiento SIEMPRE se puede cambiar. El plazo se negocia
--      con cada cliente y puede renegociarse. No afecta montos ni cobros.
--   2. Numero, fecha de emision y monto SOLO se pueden cambiar si la factura
--      no tiene cobros aplicados. Una vez que entro dinero contra ella, esos
--      datos son parte del registro contable.
--   3. Para corregir el monto de una factura ya cobrada existe la nota de
--      credito, que resta sin borrar la historia.
--
-- Todo cambio queda en la bitacora de auditoria via trg_auditoria_facturas.
-- Importa especialmente para el vencimiento: mover esa fecha cambia los dias
-- de mora, y la mora tiene consecuencias sobre el vendedor. Que la correccion
-- sea posible pero trazable protege a ambas partes.
-- ============================================================================

create or replace function editar_factura(
  p_factura_id       uuid,
  p_fecha_vencimiento date,
  p_numero           text default null,
  p_fecha_emision    date default null,
  p_monto_total      numeric default null
)
returns void
language plpgsql
as $$
declare
  v_factura  facturas%rowtype;
  v_aplicado numeric;
begin
  select * into v_factura from facturas where id = p_factura_id;

  if not found then
    raise exception 'La factura no existe o no pertenece a este vendedor'
      using errcode = '42501';
  end if;

  if v_factura.anulada then
    raise exception 'No se puede editar una factura anulada'
      using errcode = '23514';
  end if;

  -- Cuanto dinero vigente se aplico ya sobre esta factura.
  select coalesce(sum(a.monto), 0) into v_aplicado
  from aplicaciones a
  join cobros c on c.id = a.cobro_id
  where a.factura_id = p_factura_id and not c.anulado;

  -- --- Regla 1: el vencimiento siempre es editable ---
  if p_fecha_vencimiento is null then
    raise exception 'La fecha de vencimiento es obligatoria'
      using errcode = '23514';
  end if;

  -- --- Regla 2: el resto solo sin cobros aplicados ---
  if v_aplicado > 0 then
    if p_numero is not null and p_numero <> v_factura.numero then
      raise exception
        'No se puede cambiar el numero: la factura ya tiene % cobrados.',
        to_char(v_aplicado, 'FM999999990.00') ADD 
        using errcode = '23514';
    end if;

    if p_fecha_emision is not null and p_fecha_emision <> v_factura.fecha_emision then
      raise exception
        'No se puede cambiar la fecha de emision: la factura ya tiene cobros aplicados.'
        using errcode = '23514';
    end if;

    if p_monto_total is not null and p_monto_total <> v_factura.monto_total then
      raise exception
        'No se puede cambiar el monto: la factura ya tiene % cobrados. Registre una nota de credito.',
        to_char(v_aplicado, 'FM999999990.00')
        using errcode = '23514';
    end if;
  end if;

  -- El vencimiento no puede quedar antes de la emision.
  if p_fecha_vencimiento < coalesce(p_fecha_emision, v_factura.fecha_emision) then
    raise exception 'El vencimiento no puede ser anterior a la fecha de emision'
      using errcode = '23514';
  end if;

  if p_monto_total is not null and p_monto_total <= 0 then
    raise exception 'El monto de la factura debe ser mayor a cero'
      using errcode = '23514';
  end if;

  update facturas
  set fecha_vencimiento = p_fecha_vencimiento,
      numero            = coalesce(p_numero, numero),
      fecha_emision     = coalesce(p_fecha_emision, fecha_emision),
      monto_total       = coalesce(p_monto_total, monto_total)
  where id = p_factura_id;
end;
$$;

comment on function editar_factura is
  'Corrige una factura. El vencimiento siempre es editable; el resto solo sin cobros aplicados.';

grant execute on function editar_factura(uuid, date, text, date, numeric)
to authenticated;