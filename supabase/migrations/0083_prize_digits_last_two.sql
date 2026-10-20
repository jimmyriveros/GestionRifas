-- =============================================================================
-- 0083 — Un premio puede comparar las DOS ultimas cifras (D-261)
--
-- POR QUE VA SOLA. `alter type ... add value` deja el valor INUTILIZABLE hasta
-- que la transaccion que lo anade se confirma (lo mismo que la 0028 y la 0073):
-- la 0084, que ya lo usa en el motor y en las validaciones, va en su propia
-- transaccion, despues de esta.
--
-- QUE SIGNIFICA. `last_two` compara las dos ultimas cifras del numero de la
-- boleta con las dos ultimas del numero mayor: con el resultado 5387, `87`; con
-- 5307, `07`. Como las demas, es texto exacto: nunca se castea ni se rellena.
-- Las cuatro y las tres de siempre no cambian.
-- =============================================================================

alter type raffle_prize_digits add value if not exists 'last_two';

comment on type raffle_prize_digits is
  'BR-J06: cuantas cifras compara un premio. four = el numero mayor entero (4); last_three = las tres ultimas; last_two = las dos ultimas (0083, D-261). Nunca mas cifras que las del grupo de numeros que usa el premio (0084).';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- PostgreSQL no quita un valor de un enumerado. Revertir exige crear el tipo de
-- nuevo sin el y convertir las columnas que lo usan, y SOLO es posible si
-- ninguna version de premio usa `last_two`. Antes, revertir la 0084.
-- =============================================================================
