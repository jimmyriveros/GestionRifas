-- =============================================================================
-- 0027_ticket_price_120000.sql
-- Corrección del precio de la boleta: $100.000 -> $120.000
--
-- Referencia: docs/BUSINESS_RULES.md BR-P01/BR-P07, docs/DECISIONS.md D-098.
--
-- QUÉ ES ESTO, Y QUÉ NO ES
--
-- NO es un aumento de precio. Es la corrección de un dato mal configurado: la
-- rifa en operación SIEMPRE debió costar $120.000. La diferencia importa, porque
-- decide qué se toca y qué no:
--
--   * Un aumento respetaría `sale_price` (BR-P04): quien compró a $100.000 compró
--     a $100.000. La rifa cambiaría solo hacia adelante.
--   * Una corrección arrastra el `sale_price` de las boletas de esa rifa, porque
--     ese número nunca fue el correcto.
--
-- LO QUE NO SE TOCA, EN NINGÚN CASO
--
-- Los movimientos de dinero. `payments.total_amount` y `payment_allocations.amount`
-- representan pesos que alguien entregó de verdad; corregir el precio de la boleta
-- no crea ni borra un solo peso. Una boleta con $100.000 abonados sobre un precio
-- corregido de $120.000 queda **Abonada con $20.000 pendientes**, no Pagada.
-- Esta migración no contiene ni un UPDATE sobre esas dos tablas.
--
-- CRITERIO EXACTO DE SELECCIÓN
--
-- Rifas:   `ticket_price = 100000` **y** `status in ('draft','active')`.
--          Una rifa cerrada o anulada es historia terminada y no se reescribe.
--          Una rifa con cualquier otro precio (la de control vale $50.000) tiene
--          ese precio por una razón legítima y queda intacta.
-- Boletas: las de esas rifas con `sale_price = 100000` exacto y
--          `inventory_status <> 'cancelled'`.
--          - `sale_price is null`  -> nunca se vendió; tomará los $120.000 de la
--            rifa cuando se venda (BR-P03). No hay nada que corregir.
--          - `sale_price` distinto -> precio legítimo distinto; no se toca.
--          - anulada               -> conserva el precio con el que se anuló; no
--            entra en ningún agregado de dinero (todos filtran por 'assigned').
--
-- Lo que queda fuera se cuenta y se informa por NOTICE: ninguna fila se corrige
-- en silencio y ninguna se descarta en silencio.
--
-- EL GUARDIÁN DEL PRECIO (BR-P05)
--
-- `tickets_protect_sale_price` prohíbe cambiar el precio de una boleta con pagos
-- registrados. Es correcto y se conserva: protege a la aplicación de alterar un
-- saldo ya cobrado por accidente. Esta corrección es justo el procedimiento
-- administrativo documentado que esa regla contempla, así que el trigger se
-- desactiva y se vuelve a activar dentro del mismo bloque atómico. La regla no
-- se debilita: sigue vigente para todo lo que venga por la aplicación.
--
-- CONSECUENCIA BUSCADA SOBRE LAS COMISIONES (BR-G15, D-096)
--
-- Quien no pertenece a un equipo cobra la mitad del precio VIGENTE de la rifa,
-- así que su tarifa pasa de $50.000 a $60.000 por boleta cobrada, con ajuste
-- retroactivo. Y una boleta que estaba Pagada con $100.000 deja de estarlo, así
-- que deja de contar para la comisión hasta que se complete el pago. No hay nada
-- que escribir aquí: `raffles_sync_commission` y `tickets_sync_commission` lo
-- recalculan solos, y la invariante `sum(ledger) = earned` se mantiene (D-094).
--
-- AUDITORÍA
--
-- Automática. `audit_raffles` y `audit_tickets` (0006) registran cada fila con su
-- valor anterior y el nuevo; el actor queda NULL porque lo ejecuta el sistema, no
-- una persona. Una migración de N boletas deja N+1 entradas consultables.
--
-- RECUPERACIÓN
--
-- No hay migración inversa: revertir a ciegas volvería a poner $100.000 sobre
-- ventas y cobros posteriores. El procedimiento es respaldo previo y restauración
-- (docs/RUNBOOK.md §5.4).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El valor predeterminado de la aplicación
-- -----------------------------------------------------------------------------
alter table raffles       alter column ticket_price         set default 120000;
alter table organizations alter column default_ticket_price set default 120000;

comment on column raffles.ticket_price is
  'Precio VIGENTE en pesos enteros, y única fuente del precio (BR-P01: $120.000). Cambiarlo NO afecta boletas ya vendidas (BR-R06); la excepción fue la corrección de 0027 (D-098).';

-- -----------------------------------------------------------------------------
-- 2. Corrección de los datos existentes
-- -----------------------------------------------------------------------------
do $$
declare
  v_rifas_corregidas    integer;
  v_rifas_fuera         integer;
  v_boletas_corregidas  integer;
  v_boletas_sin_precio  integer;
  v_boletas_otro_precio integer;
  v_boletas_anuladas    integer;
  v_con_pagos           integer;
  v_orgs                integer;
  v_anomalias           integer;
  v_rifa                record;
begin
  -- --- Precondición: nada anómalo que corregiríamos a ciegas ----------------
  -- Un pago por encima del precio corregido no puede existir (lo impide
  -- tickets_paid_amount_range), pero si existiera, subir el precio lo taparía en
  -- lugar de mostrarlo. Preferimos que la migración se niegue a correr.
  select count(*) into v_anomalias
    from tickets t
    join raffles r on r.id = t.raffle_id
   where r.ticket_price = 100000
     and r.status in ('draft', 'active')
     and t.paid_amount > 120000;

  if v_anomalias > 0 then
    raise exception
      'Migración detenida: % boleta(s) con más de $120.000 pagados. Revísalas antes de corregir el precio.',
      v_anomalias;
  end if;

  -- --- Fotografía previa ----------------------------------------------------
  raise notice '--- 0027: estado ANTES de corregir ---';
  for v_rifa in
    select r.id, r.name, r.status, r.ticket_price,
           count(t.id)                                                     as boletas,
           count(t.id) filter (where t.sale_price = 100000
                                 and t.inventory_status <> 'cancelled')    as a_corregir,
           count(t.id) filter (where t.sale_price is null)                 as sin_vender,
           count(t.id) filter (where t.sale_price is not null
                                 and t.sale_price <> 100000)               as otro_precio,
           count(t.id) filter (where t.inventory_status = 'cancelled'
                                 and t.sale_price is not null)             as anuladas,
           count(t.id) filter (where t.sale_price = 100000
                                 and t.paid_amount > 0)                    as con_pagos,
           count(t.id) filter (where t.sale_price = 100000
                                 and t.paid_amount = 100000)               as pagadas_a_100k
      from raffles r
      left join tickets t on t.raffle_id = r.id
     group by r.id, r.name, r.status, r.ticket_price
     order by r.name
  loop
    raise notice
      'rifa "%" (%, $%): % boletas · a corregir % · sin vender % · otro precio % · anuladas % · con pagos % · pagadas a $100.000 %',
      v_rifa.name, v_rifa.status, v_rifa.ticket_price, v_rifa.boletas,
      v_rifa.a_corregir, v_rifa.sin_vender, v_rifa.otro_precio,
      v_rifa.anuladas, v_rifa.con_pagos, v_rifa.pagadas_a_100k;
  end loop;

  -- --- Rifas dejadas fuera a propósito --------------------------------------
  select count(*) into v_rifas_fuera
    from raffles
   where ticket_price = 100000
     and status not in ('draft', 'active');

  if v_rifas_fuera > 0 then
    raise notice
      'AVISO: % rifa(s) a $100.000 quedan SIN corregir por estar cerradas o anuladas. Si alguna debía corregirse, hace falta una migración aparte.',
      v_rifas_fuera;
  end if;

  -- --- Boletas -------------------------------------------------------------
  -- Van antes que la rifa. El resultado final sería el mismo en cualquier orden
  -- —el motor de comisiones recalcula `n × tarifa` desde cero, no acumula—, pero
  -- así el recálculo que dispara el cambio de precio de la rifa ya encuentra los
  -- estados de pago definitivos y no hace el trabajo dos veces.
  select count(*) into v_con_pagos
    from tickets t
    join raffles r on r.id = t.raffle_id
   where r.ticket_price = 100000
     and r.status in ('draft', 'active')
     and t.sale_price = 100000
     and t.inventory_status <> 'cancelled'
     and t.paid_amount > 0;

  alter table tickets disable trigger tickets_protect_sale_price;

  with afectadas as (
    select t.id
      from tickets t
      join raffles r on r.id = t.raffle_id
     where r.ticket_price = 100000
       and r.status in ('draft', 'active')
       and t.sale_price = 100000
       and t.inventory_status <> 'cancelled'
  )
  update tickets t
     set sale_price = 120000
    from afectadas a
   where t.id = a.id;

  get diagnostics v_boletas_corregidas = row_count;

  alter table tickets enable trigger tickets_protect_sale_price;

  -- --- Rifas ----------------------------------------------------------------
  update raffles
     set ticket_price = 120000
   where ticket_price = 100000
     and status in ('draft', 'active');

  get diagnostics v_rifas_corregidas = row_count;

  update organizations
     set default_ticket_price = 120000
   where default_ticket_price = 100000;

  get diagnostics v_orgs = row_count;

  -- --- Verificación posterior, dentro de la misma transacción ---------------
  -- Si algo quedó inconsistente, esta migración no se guarda.
  if exists (
    select 1 from tickets
     where sale_price is not null and paid_amount > sale_price
  ) then
    raise exception 'Migración detenida: quedaron boletas con más pagado que su precio.';
  end if;

  if exists (
    select 1 from raffles
     where ticket_price = 100000 and status in ('draft', 'active')
  ) then
    raise exception 'Migración detenida: quedaron rifas en operación a $100.000.';
  end if;

  select count(*) into v_boletas_sin_precio
    from tickets t join raffles r on r.id = t.raffle_id
   where r.ticket_price = 120000 and t.sale_price is null;

  select count(*) into v_boletas_otro_precio
    from tickets t join raffles r on r.id = t.raffle_id
   where r.ticket_price = 120000
     and t.sale_price is not null
     and t.sale_price not in (100000, 120000);

  select count(*) into v_boletas_anuladas
    from tickets t join raffles r on r.id = t.raffle_id
   where r.ticket_price = 120000
     and t.inventory_status = 'cancelled'
     and t.sale_price is not null;

  raise notice '--- 0027: resultado ---';
  raise notice 'rifas corregidas a $120.000: %', v_rifas_corregidas;
  raise notice 'organizaciones con precio base corregido: %', v_orgs;
  raise notice 'boletas corregidas a $120.000: % (de ellas, % tenían pagos registrados)',
    v_boletas_corregidas, v_con_pagos;
  raise notice 'boletas sin vender (tomarán $120.000 al venderse): %', v_boletas_sin_precio;
  raise notice 'boletas con otro precio, intactas a propósito: %', v_boletas_otro_precio;
  raise notice 'boletas anuladas, intactas a propósito: %', v_boletas_anuladas;
  raise notice 'pagos modificados: 0 (esta migración no escribe en payments ni en payment_allocations)';
end
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- NO se ofrece migración inversa a propósito. Bajar el precio a $100.000 después
-- de que existan ventas o cobros hechos a $120.000 rompería `paid_amount <=
-- sale_price` o dejaría boletas Pagadas que no lo están. La vuelta atrás es
-- restaurar el respaldo previo (docs/RUNBOOK.md §5.4).
-- =============================================================================
