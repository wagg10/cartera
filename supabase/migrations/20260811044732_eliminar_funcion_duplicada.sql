-- Al agregar parametros a registrar_cobro, `create or replace` no reemplazo
-- la version anterior: creo una sobrecarga. Con dos funciones compatibles con
-- la misma llamada, Postgres no puede resolver cual usar y falla con
-- "could not choose the best candidate function".
--
-- Se elimina la firma vieja de 5 parametros. Queda solo la de 7.

drop function if exists registrar_cobro(uuid, numeric, medio_pago, timestamptz, text);