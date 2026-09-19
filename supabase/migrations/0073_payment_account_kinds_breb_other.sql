-- =============================================================================
-- 0073_payment_account_kinds_breb_other.sql
-- Cuentas para recibir pagos: dos formas nuevas, Bre-B y «Otros» — PASO 1 de 2
--
-- Referencia: docs/BUSINESS_RULES.md BR-M03, BR-M04, BR-M08 y BR-M10;
--             docs/DECISIONS.md D-185, D-188 y D-209; docs/DATA_MODEL.md 4.15.
--
-- QUE HACE: SOLO anade los dos valores al enumerado `payment_account_kind`,
-- tal como previo BR-M03 («anadir una forma futura es `alter type ... add
-- value` mas su CHECK, en una migracion nueva»). Nada mas, y es deliberado.
--
-- POR QUE VA SOLA. `alter type ... add value` deja el valor INUTILIZABLE hasta
-- que la transaccion confirma (la nota de la 0028 y la de la propia 0051).
-- Medido en la base local antes de escribir esto: usar el valor nuevo dentro de
-- la misma transaccion —en un SELECT o en un CHECK que lo nombra— falla con
-- 55P04 «unsafe use of new value». El CLI de Supabase aplica CADA archivo de
-- migracion en su propia transaccion, asi que todo lo que usa estos valores
-- —la columna, los CHECK, el indice y las RPC— va en la 0074, que confirma
-- despues de esta.
--
-- LO QUE NO CAMBIA: ninguna fila, tabla, funcion, politica ni privilegio. Las
-- cuentas que ya existen siguen siendo exactamente las mismas, y hasta que se
-- aplique la 0074 ninguna escritura puede usar los valores nuevos: el CHECK de
-- forma de la 0051 los manda a la rama del telefono y el formulario no los
-- ofrece.
--
-- `if not exists`, como la 0028: aplicarla dos veces no falla. Los valores se
-- anaden AL FINAL, que es el orden en que se ofrecen: Nequi, Daviplata, cuenta
-- bancaria, Bre-B y «Otros».
--
-- SOBRE LAS TILDES. Los comentarios siguen sin tildes (I-030).
-- =============================================================================

alter type payment_account_kind add value if not exists 'breb';
alter type payment_account_kind add value if not exists 'other';

comment on type payment_account_kind is
  'BR-M03: forma de recibir un pago: nequi, daviplata, bank, breb (Bre-B) y other («Otros», 0073). Extensible con alter type ... add value en una migracion propia (0028, 0073).';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- PostgreSQL no quita un valor de un enumerado. Revertir exige crear el tipo de
-- nuevo sin ellos y convertir la columna, y SOLO es posible si ninguna fila usa
-- `breb` ni `other`. Antes, revertir la 0074.
-- =============================================================================
