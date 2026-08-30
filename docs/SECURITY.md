# SEGURIDAD

- **Versión:** 2.5 · **Estado:** implementado · **Actualizado:** 2026-08-30
- **Estado:** las políticas y sus refuerzos viven en las migraciones `0005`, `0011`, `0014`,
  `0015`, `0016`, `0019`, `0020`, `0021`, `0036`, `0037` y `0038`; los privilegios base se fijan en `0009`/`0010`.
- Verificado en Supabase **local** con 378 pruebas: la operación cuya RLS se prueba usa sesiones
  reales por rol y clave pública, nunca `service_role`. La clave de servicio sí puede preparar,
  comprobar o limpiar el escenario y las pruebas de catálogo usan PostgreSQL directo (D-043).
  Producción pasó `verify:remote` 13/13 y la sonda específica de `0021` el 2026-08-09; la sonda se
  revirtió completa y dejó 0 clientes y 0 boletas residuales.

### Refuerzos añadidos al implementar (Fase 2)

| Refuerzo | Efecto |
|---|---|
| Sin `DELETE` ni política ni privilegio en ninguna tabla | El borrado físico exige dos cambios deliberados y visibles (D-038). **Sigue siendo cierto**: desde 2026-08-08 se pueden eliminar boletas cargadas por error, pero solo dentro de `bulk_delete_tickets`, que es `SECURITY DEFINER`; `authenticated` no ganó ningún privilegio y una prueba comprueba que un `DELETE` directo del Owner sigue fallando (D-084) |
| `anon` sin ningún privilegio de tabla | Un visitante sin sesión no puede leer nada, ni siquiera si fallara una política |
| Privilegios `GRANT` explícitos | Estado idéntico en local y en el proyecto real, sin depender del entorno (D-037) |
| Trigger `tickets_guard_paid_amount` | `paid_amount` solo acepta el valor derivado real: un vendedor no puede declararse pagado |
| Política `payments_update_staff` con `voided_at is null` en `USING` | Un pago anulado deja de ser actualizable: la anulación es irreversible por RLS (D-013) |

---

## 1. Modelo de seguridad

Cuatro capas, cada una capaz de detener un ataque por sí sola:

| Capa | Responsabilidad | Qué **no** hace |
|------|-----------------|-----------------|
| 1. Interfaz | Ocultar acciones no disponibles, guiar al usuario | No es frontera de seguridad |
| 2. Proxy / layout de servidor | Refrescar sesión, exigir autenticación y rol para el segmento de ruta | No sustituye la verificación por operación |
| 3. Server Action / RPC | Verificar sesión, membresía activa, organización, rol y validar la entrada con Zod | No confía en IDs ni roles enviados por el cliente |
| 4. PostgreSQL (RLS + restricciones) | Última palabra: nadie ve ni escribe lo que no le corresponde | — |

**Premisa operativa:** si se elimina toda la capa de aplicación y un atacante consulta Supabase
directamente con la clave pública y una sesión de vendedor, no debe poder leer ni modificar un solo
registro ajeno.

---

## 2. Matriz de permisos

`✓` permitido · `✗` prohibido · `P` solo sobre sus propios registros

| Operación | Owner | Admin | Seller |
|-----------|:-----:|:-----:|:------:|
| **Organización** |
| Ver configuración de la organización | ✓ | ✓ | ✗ |
| Editar configuración de la organización | ✓ | ✗ | ✗ |
| Transferir la propiedad | ✓ | ✗ | ✗ |
| **Usuarios** |
| Crear administradores | ✓ | ✓ | ✗ |
| Crear vendedores | ✓ | ✓ | ✗ |
| Editar administradores | ✓ | ✓ | ✗ |
| Editar al Owner | ✓ | ✗ | ✗ |
| Desactivar administradores | ✓ | ✓ | ✗ |
| Desactivar al Owner | ✓ | ✗ | ✗ |
| Cambiar el rol de un usuario a `owner` | ✓ | ✗ | ✗ |
| Ver listado de usuarios | ✓ | ✓ | ✗ |
| Editar el propio perfil | ✓ | ✓ | ✓ |
| **Rifas** |
| Crear / editar rifas | ✓ | ✓ | ✗ |
| Cambiar estado de una rifa | ✓ | ✓ | ✗ |
| Reabrir una rifa cerrada | ✓ | ✗ | ✗ |
| Ver rifas | ✓ | ✓ | ✓ (lectura) |
| **Boletas** |
| Ver todas las boletas de la organización | ✓ | ✓ | ✗ |
| Ver boletas propias | ✓ | ✓ | P |
| Crear boletas (individual y masiva) | ✓ | ✓ | P, solo si `allow_seller_ticket_creation` |
| Editar números de una boleta | ✓ | ✓ | P, solo en `draft`/`pending_approval` |
| Aprobar boletas | ✓ | ✓ | ✗ |
| Anular boletas | ✓ | ✓ | ✗ |
| Asignar boleta a un vendedor | ✓ | ✓ | ✗ |
| Asignar boleta a un cliente | ✓ | ✓ | P |
| **Eliminar boletas físicamente** (solo sin cliente, sin venta y sin abonos — BR-B05) | ✓ | ✓ | ✗ |
| Seleccionar varias boletas y actuar sobre todas (BR-B01) | ✓ | ✓ | P, solo asignar a un cliente |
| **Clientes** |
| Ver todos los clientes de la organización | ✓ | ✓ | ✗ |
| Ver / crear / editar clientes propios | ✓ | ✓ | P |
| Archivar clientes | ✓ | ✓ | P |
| Eliminar clientes físicamente | ✗ | ✗ | ✗ |
| **Pagos** |
| Ver todos los pagos de la organización | ✓ | ✓ | ✗ |
| Registrar pagos | ✓ | ✓ | P |
| Corregir el valor de un abono vigente (BR-F16) | ✓ | ✓ | P |
| Anular pagos | ✓ | ✓ | ✗ |
| Eliminar pagos físicamente | ✗ | ✗ | ✗ |
| **Reportes y auditoría** |
| Reportes globales | ✓ | ✓ | ✗ |
| Reportes propios | ✓ | ✓ | P |
| Ver auditoría | ✓ | ✓ | ✗ |
| **Resultados de loterías** |
| Ver programación y resultado oficiales | ✓ | ✓ | ✓ (lectura; son nacionales) |
| Ver coincidencias de la organización | ✓ | ✓ | P (solo las de sus boletas) |
| Escribir programación, resultados o coincidencias | ✗ | ✗ | ✗ (proceso interno) |

Acciones exclusivas del Owner (BR-U02, BR-U03, BR-U04): eliminar o desactivar al Owner, asignar el
rol `owner`, transferir la propiedad, editar la configuración de la organización y reabrir rifas
cerradas.

**Lo que ni siquiera el Owner puede hacer (BR-U09, desde la Fase 9).** Dejar su organización sin
Owner activo. La política permitía que se degradara o se desactivara a sí mismo, y el resultado era
irrecuperable desde la aplicación: nadie más puede asignar el rol `owner`. Lo impide el trigger
diferido `memberships_require_active_owner` (`0016`, D-071). Ver `AUDIT_REPORT.md` A-02.

---

## 3. Autenticación y sesión

| Aspecto | Decisión |
|---------|----------|
| Proveedor | Supabase Auth, email + contraseña |
| Transporte de sesión | Cookies HTTP-only gestionadas por `@supabase/ssr` |
| Refresco | En `src/proxy.ts` y `src/lib/supabase/proxy.ts` en cada request protegido |
| Verificación de identidad en servidor | `supabase.auth.getUser()` (valida contra el servidor de Auth). **Nunca** `getSession()` para decisiones de autorización, porque su contenido proviene de la cookie y no está verificado |
| Origen del rol | Tabla `memberships` consultada en el servidor. No se confía en `app_metadata` del JWT para autorizar (D-006) |
| Usuario inactivo | El layout protegido y las políticas RLS verifican `is_active` en cada request; una sesión previa deja de servir de inmediato |
| Contraseñas | Gestionadas por Supabase Auth; la aplicación nunca las almacena, registra ni transmite a terceros |
| Alta de usuarios | Invitación por correo mediante `SERVICE_ROLE` solo en servidor; la persona define su contraseña desde el enlace |
| Cierre de sesión | Invalida la sesión en el servidor y limpia cookies |

---

## 4. Row Level Security

### 4.1 Funciones auxiliares

Marcadas `STABLE SECURITY DEFINER` con `SET search_path = public, pg_temp`. Son `SECURITY DEFINER`
**a propósito**: al omitir RLS evitan la recursión infinita que se produciría si una política de
`memberships` consultara `memberships`.

```sql
-- Perfil autenticado
CREATE FUNCTION current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT auth.uid() $$;

-- Organizaciones donde el usuario tiene membresía ACTIVA y perfil ACTIVO
CREATE FUNCTION current_org_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT m.organization_id
  FROM memberships m
  JOIN profiles p      ON p.id = m.profile_id
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.profile_id = auth.uid()
    AND m.is_active AND p.is_active AND o.is_active
$$;

-- ¿El usuario tiene alguno de esos roles en la organización dada?
CREATE FUNCTION has_org_role(p_org uuid, p_roles app_role[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN profiles p      ON p.id = m.profile_id
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.profile_id = auth.uid()
      AND m.organization_id = p_org
      AND m.role = ANY(p_roles)
      AND m.is_active AND p.is_active AND o.is_active
  )
$$;

CREATE FUNCTION is_org_staff(p_org uuid) RETURNS boolean  -- owner o admin
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT has_org_role(p_org, ARRAY['owner','admin']::app_role[]) $$;

-- Fase 7: el equivalente en CONJUNTO de is_org_staff(). Misma semántica, pero
-- utilizable como subselect, que es lo que permite evaluarlo una sola vez.
CREATE FUNCTION current_staff_org_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT m.organization_id
  FROM memberships m
  JOIN profiles p      ON p.id = m.profile_id
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.profile_id = auth.uid()
    AND m.role IN ('owner','admin')
    AND m.is_active AND p.is_active AND o.is_active
$$;

-- 0022: el equipo del usuario actual (integrantes directos). Como conjunto, por
-- el mismo motivo que current_staff_org_ids(): se usa dentro de tickets_select.
-- Incluye a los desactivados: sus ventas siguen existiendo (BR-E09).
CREATE FUNCTION current_team_seller_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT m.profile_id FROM memberships m WHERE m.parent_seller_id = auth.uid()
$$;

-- 0022: ¿quien llama puede tener equipo propio? Vendedor activo de ESA
-- organización y sin vendedor padre (BR-E03, BR-E04). Recibe la organización
-- como argumento, igual que has_org_role(): se evalúa sobre la fila que se
-- inserta, no sobre una tabla entera.
CREATE FUNCTION current_profile_leads_team(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN profiles p      ON p.id = m.profile_id
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.profile_id = auth.uid()
      AND m.organization_id = p_org
      AND m.role = 'seller'
      AND m.parent_seller_id IS NULL
      AND m.is_active AND p.is_active AND o.is_active
  )
$$;
```

`REVOKE EXECUTE … FROM PUBLIC, anon` y `GRANT EXECUTE … TO authenticated` en todas ellas.

⚠️ **Una función nueva nace ejecutable por `anon`** aunque las *default privileges* de `0015` digan lo
contrario (I-020): el `REVOKE` explícito es obligatorio en cada migración, **incluidas las funciones
de trigger**. Lo comprueba `tests/db/catalog.test.ts`.

### 4.2 Patrón general de política

Toda política de tabla de negocio combina **organización** y, para vendedores, **pertenencia**:

```sql
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <tabla> FORCE ROW LEVEL SECURITY;  -- aplica también al dueño de la tabla

-- Lectura
CREATE POLICY <tabla>_select ON <tabla> FOR SELECT TO authenticated
USING (
  organization_id IN (SELECT current_org_ids())
  AND (
    organization_id IN (SELECT current_staff_org_ids())
    OR seller_id = (SELECT current_profile_id())
  )
);
```

> ⚠️ **En políticas que recorren tablas, los valores de sesión se calculan con un `SELECT` o como
> conjunto.** Escribir `is_org_staff(organization_id)` obliga a PostgreSQL a ejecutarla **una vez por
> fila**: medido en la Fase 7, 1,46 ms pasaron a 1.667 ms sobre 7.278 boletas (I-019, D-063).
> `has_org_role` se conserva únicamente en el `WITH CHECK` de inserción del Seller: allí valida cada
> fila nueva y el lote ya está acotado (D-049). La prueba `F7-03` impide reintroducir el patrón lento
> en políticas de lectura/actualización.

Sin política aplicable, PostgreSQL **deniega**. Es el comportamiento deseado: se conceden permisos
de forma explícita, nunca por omisión.

### 4.3 Políticas por tabla (diseño)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `organizations` | Miembros activos de la organización | ✗ (solo `SERVICE_ROLE`) | Solo Owner | ✗ |
| `profiles` | El propio perfil; **el de su equipo** (`0022`); el personal (owner/admin) ve los de su organización | ✗ (trigger de Auth) | El propio perfil (campos limitados); personal sobre perfiles de su organización salvo el Owner si es Admin | ✗ |
| `memberships` | El propio registro; **los de su equipo** (`0022`); personal ve los de su organización | Personal, sin poder crear rol `owner` (solo Owner) · **Seller: solo integrantes de su propio equipo** (`0022`, BR-E04) | Personal; un Admin no puede tocar la membresía del Owner ni ascender a nadie a `owner`. **Un vendedor no tiene UPDATE**: no puede cambiar de equipo a nadie, ni a sí mismo (BR-E06) | ✗ |
| `raffles` | Todos los miembros activos de la organización | Personal | Personal | ✗ |
| `clients` | Personal: toda la organización · Seller: `seller_id = current_profile_id()` | Personal · Seller solo con `seller_id` propio | Igual que SELECT | ✗ (se archiva) |
| `tickets` | Personal: toda la organización · Seller: **solo las propias** (sin cambios; las del equipo van por función, D-092) | Personal · Seller solo si `allow_seller_ticket_creation` y estado `pending_approval` con `seller_id` propio | Personal · Seller: solo sus boletas y solo campos permitidos según estado | ✗ |
| `payments` | Personal: toda la organización · Seller: propios | Personal · Seller con `seller_id` propio y cliente propio | Solo personal (anulación). Seller: ✗ | ✗ |
| `payment_allocations` | Vía `EXISTS` sobre el pago padre | Igual que el pago padre | ✗ | ✗ |
| `audit_logs` | Solo personal de la organización | Solo funciones `SECURITY DEFINER` | ✗ | ✗ |

Ejemplo completo para la tabla más sensible:

```sql
-- tickets: lectura. NO cambió al llegar los equipos, y es deliberado (D-092):
-- medio portal del vendedor depende de que esto signifique «lo mío».
CREATE POLICY tickets_select ON tickets FOR SELECT TO authenticated
USING (
  organization_id IN (SELECT current_org_ids())
  AND (
    organization_id IN (SELECT current_staff_org_ids())
    OR seller_id = (SELECT current_profile_id())
  )
);

-- tickets: el vendedor solo crea boletas propias, pendientes de aprobación
-- y únicamente si la rifa lo permite y está activa
CREATE POLICY tickets_insert_seller ON tickets FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (SELECT current_org_ids())
  AND seller_id = (SELECT current_profile_id())
  AND has_org_role(organization_id, ARRAY['seller']::app_role[])
  AND inventory_status = 'pending_approval'
  AND EXISTS (
    SELECT 1 FROM raffles r
    WHERE r.id = tickets.raffle_id
      AND r.organization_id = tickets.organization_id
      AND r.status = 'active'
      AND r.allow_seller_ticket_creation
  )
);

-- payment_allocations: sigue al pago padre
CREATE POLICY alloc_select ON payment_allocations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM payments p
    WHERE p.id = payment_allocations.payment_id
      AND p.organization_id IN (SELECT current_org_ids())
      AND (
        p.organization_id IN (SELECT current_staff_org_ids())
        OR p.seller_id = (SELECT current_profile_id())
      )
  )
);
```

**Regla `USING` vs `WITH CHECK`:** `USING` filtra lo que se ve y lo que se puede tocar; `WITH CHECK`
valida el estado **resultante**. Toda política de `UPDATE` define ambas para impedir que un usuario
mueva un registro fuera de su propio ámbito (por ejemplo, reasignarse una boleta ajena o entregar la
suya a otro vendedor).

### 4.4 Vistas

Todas las vistas se crean con `WITH (security_invoker = true)`. Sin esa opción, una vista se ejecuta
con los privilegios de su propietario y **omitiría RLS**, exponiendo datos de otros vendedores. Esta
verificación es un punto obligatorio de la revisión de la Fase 2 y de la auditoría de la Fase 9.

### 4.5 Funciones `SECURITY DEFINER`

Reglas obligatorias para todas ellas:

1. `SET search_path = public, pg_temp` explícito (evita secuestro de esquema).
2. `REVOKE EXECUTE FROM PUBLIC, anon`; `GRANT` solo al rol que realmente deba invocarla.
3. Parámetros tipados; nunca SQL construido por concatenación de texto.
4. Sin `RAISE` de detalles internos: los mensajes de error son genéricos y traducibles.

⚠️ **La regla 2 estuvo siete fases incompleta, y costó I-078.** Decía `PUBLIC, anon` y **no
`authenticated`**, que es el rol con el que la aplicación habla con PostgREST. Desde `0032` (D-128)
el privilegio por defecto para las funciones de `public` ya no lo concede, así que:

> **Una función nueva que la aplicación deba poder llamar necesita su
> `grant execute … to authenticated` EXPLÍCITO.** Sin él no es invocable desde el navegador, ni en
> local ni en producción.

**Por qué nadie lo vio antes:** los privilegios por defecto de `postgres` **no eran iguales en los dos
entornos** —el proyecto alojado nace con `authenticated` concedido y la pila local no—, de modo que en
local el comportamiento correcto ya era el vigente y **ninguna prueba podía detectarlo**. Lo cierra
`npm run verify:remote`, que es lo único que mira el proyecto real; `tests/db/catalog.test.ts` fija la
misma lista blanca, pero **pasaría igual si el problema volviera**. Si se toca esa lista, se toca en
los dos sitios.

Las funciones de negocio que **mutan** datos además validan permisos internamente y auditan la
acción. Los helpers de sesión/lectura (`current_*`, `has_org_role`, `taken_ticket_combinations`) no
escriben una fila de auditoría por consulta; hacerlo convertiría cada lectura en una mutación.

### 4.6 Acciones masivas de boletas (`0020`, BR-B01..BR-B08)

Cinco funciones nuevas, con una propiedad común: **el navegador no aporta rol ni organización como
autoridad**. Reciben identificadores y, según la acción, cliente/fecha, motivo o vendedor de destino;
la sesión y la base revalidan todos esos valores. Enviar ids ajenos no cambia la autorización ni
revela si existen.

| Función | Quién | Qué comprueba, con las filas ya bloqueadas |
|---|---|---|
| `ticket_bulk_eligibility` | Cualquier rol | `SECURITY INVOKER`: hereda `tickets_select`, así que un vendedor solo recibe las suyas. Solo lee |
| `bulk_assign_tickets` | Vendedor (las suyas) o personal | Propiedad, estado `available`, rifa activa, cliente de la misma cartera y no archivado |
| `bulk_cancel_tickets` | Owner / Admin | `is_org_staff`, no anulada, sin abonos activos, motivo ≥ 5 caracteres |
| `bulk_change_ticket_seller` | Owner / Admin | `is_org_staff`, ni asignada ni anulada, destino vendedor activo de la organización |
| `bulk_delete_tickets` | Owner / Admin | `is_org_staff`, estado sin vender, sin cliente, sin `sale_price`, sin ninguna asignación de pago. Motivo obligatorio |
| `team_sales_summary` | Vendedor con equipo | Solo lee. **La autorización no es un parámetro**: el cuerpo filtra por `parent_seller_id = auth.uid()`, así que no existe forma de preguntar por un equipo ajeno (D-092) |
| `team_member_sales` | Vendedor con equipo | Igual, y además acota a un integrante. Devuelve boleta y dinero, **nunca el cliente** (BR-E05) |
| `team_update_member` | Vendedor padre | `team_member_guard`: el integrante es de **su** equipo y él sigue liderando uno. Escribe solo nombre, alias y celular. Autoriza el cambio de correo únicamente si `activated_at` es nulo y el correo está libre; **no lo escribe** (BR-E15, BR-E16) |
| `team_confirm_email_change` | Vendedor padre | Igual, y vuelve a comprobar que la cuenta siga pendiente. Solo escribe en `audit_logs`, después de que Auth ya cambió (BR-E16, BR-E19) |
| `team_delete_member` | Vendedor padre | Igual, más: cuenta nunca activada, sin boletas, sin clientes y sin pagos. Borra la membresía (BR-E17) |

**Por qué las tres del equipo son funciones y no políticas (`0026`, D-097).** `authenticated` tiene
`UPDATE` sobre **todas** las columnas de `profiles` (§4.5, `0009`/`0010`). Una política de escritura
para el vendedor padre le habría dejado además reescribir `is_active` de un integrante —expulsarlo de
la aplicación— o su `email` sin pasar por Auth. Por función el permiso es exactamente el pedido y ni
una columna más; la prueba BD **E2-08** comprueba que el `UPDATE` directo sobre `profiles` sigue
afectando cero filas. `team_member_guard` es interna: **no se concede a `authenticated`**.

**El correo lo cambia Auth, no la base de datos.** `profiles.email` es una copia; la fuente de verdad
es `auth.users` y el trigger `sync_profile_email` la propaga. Por eso el cambio necesita la service
role desde el servidor (D-045) y la decisión de **si se puede** vive en la base, evaluada con
`auth.uid()`. Que no queden dos invitaciones válidas lo garantiza el propio Auth al reinvitar a una
cuenta sin confirmar, comprobado extremo a extremo en BD **E2-10**.

Tres piezas internas (`assign_ticket_row`, `cancel_ticket_row`, `lock_ticket_batch`) **no se conceden
a `authenticated`**: solo las ejecutan las funciones públicas, que son `SECURITY DEFINER` y corren con
el dueño. Menos superficie sin perder nada.

**Todo o nada.** Cada función cuenta primero cuántas boletas cumplen todo y aborta antes de tocar
nada si falta una. Como una función PL/pgSQL es una transacción, un `raise` deshace lo hecho: no
existen resultados parciales silenciosos (BR-B07).

**Sin deadlocks.** `lock_ticket_batch` bloquea las filas **en orden de id**, de modo que dos lotes
simultáneos que se solapen las toman en la misma secuencia.

### 4.7 Importación administrativa con clientes (`0021`, BR-N12, D-087)

`match_ticket_import_clients` e `import_tickets_with_clients` son `SECURITY DEFINER`, fijan
`search_path` y revocan `EXECUTE` a `PUBLIC` y `anon`. Las dos exigen sesión, personal activo de la
organización de la rifa y un vendedor activo de esa misma organización. La primera solo devuelve
coincidencias de la **cartera indicada**; no consulta ni expone clientes de otro vendedor u otra
organización.

La RPC de escritura vuelve a validar el formato, el par obligatorio nombre/celular, los duplicados,
el estado de la rifa y la identidad existente. No acepta `organization_id`: lo deriva de la rifa y
comprueba el `seller_id` recibido. Solo Owner/Admin puede usarla; Seller conserva la creación
`pending_approval` sin cliente, de modo que el archivo no se convierte en una vía para saltarse la
aprobación (BR-I03/BR-I09).

La resolución es deliberadamente estricta: solo reutiliza una coincidencia activa y única de nombre
normalizado + celular nacional dentro de la cartera. El mismo celular con otro nombre, un cliente
archivado o más de una coincidencia producen error. Toda la función es una transacción y delega la
venta en `assign_ticket_row`; por tanto, una llamada manual tampoco puede dejar un cliente, una
boleta o un contador parcial.

### 4.8 Resultados de loterías (`0036`–`0038`, BR-L13, BR-L14, D-141, D-145)

`lottery_draw_schedules` y `lottery_results` no tienen `organization_id`. Las lee cualquier miembro
activo (`exists (select 1 from current_org_ids())`). No hay `INSERT`/`UPDATE`/`DELETE` para
`authenticated`.

`lottery_ticket_matches` sí está acotada:

```sql
organization_id IN (SELECT current_staff_org_ids())
OR (
  organization_id IN (SELECT current_org_ids())
  AND seller_id = (SELECT current_profile_id())
)
```

`tickets_select` **no se toca**. `match_lottery_result` es `SECURITY DEFINER` y solo tiene `EXECUTE`
para `service_role`. `lottery_sync_runs` tiene RLS forzada y **cero** políticas: una sesión recibe
cero filas, no un error de privilegio.

Las políticas usan conjuntos precalculados (I-019). Un `UPDATE` del número mayor confirmado no lo
cambia: el disparador deja `conflict`. Las coincidencias no se actualizan ni se borran, tampoco con
`service_role`.

La Etapa 2 añade una descarga de servidor (`fetchOfficialDocument`, `server-only`): solo HTTPS,
allowlist de CNJSA/Coljuegos y de las seis loterías, timeout 15 s, tope 2 MB y como máximo 5
redirecciones que no pueden abandonar la lista (D-144, BR-L17). Un Cloudflare, Imunify o SPA vacía
se registra como fallo; no se elude (I-081). El HTML o el xlsx no se persisten: solo URL, autoridad,
versión, hash y campos extraídos (BR-L16).

La Etapa 3 añade `sync_lottery_schedules`, `confirm_lottery_result` y
`notify_lottery_schedule_changes`: `SECURITY DEFINER`, **sin EXECUTE para authenticated**. Las
escrituras de avisos reutilizan `notifications` (`lottery.result`, `lottery.schedule_change`) con
índices únicos; `notify_profiles` no se sustituye, pero el proceso interno inserta con
`ON CONFLICT DO NOTHING`. Sigue **sin cron ni Route Handler**.

La Etapa 4 (D-147, BR-L20) no abre escritura ni políticas nuevas. El Panel hace `SELECT` de
programación, resultado y coincidencias con el cliente de sesión. No llama a las RPC internas
ni descarga fuentes oficiales durante la navegación. Un error de esa lectura se aísla del
resto del Panel.

---

## 5. Protección de Server Actions y Route Handlers

Toda Server Action parametrizada de negocio debe seguir esta secuencia. Las acciones públicas de
autenticación y `logout` tienen guardas propias; I-051 registra una excepción de negocio que todavía
debe endurecerse y no es un patrón para copiar:

```ts
'use server'
export async function accion(input: unknown) {
  const auth = await authorizeAction(['owner', 'admin'])         // 1 sesión + activo + rol
  if ('error' in auth) return auth
  const parsed = schema.safeParse(input)                         // 2 Zod: allowlist de campos
  if (!parsed.success) return { error: 'Revisa los datos ingresados.' }
  const supabase = await createClient()                          // 3 cliente con RLS
  const { error } = await supabase.rpc('...', { ... })           // 4 operación atómica
  if (error) return { error: mapPgError(error) }                 // 5 error legible
  revalidatePath('...')                                          // 6 refresco
  return { ok: true }
}
```

Reglas complementarias:

- **Sin mass assignment:** los esquemas Zod son listas explícitas de campos permitidos. Nunca se hace
  *spread* de la entrada del cliente hacia un `insert`/`update`.
- **IDs siempre verificados:** cualquier `id` recibido se usa dentro de consultas sujetas a RLS; no
  se confía en él como prueba de propiedad.
- **`organization_id` nunca se acepta del cliente**: sale de la membresía activa. Un `seller_id`
  enviado por una pantalla administrativa puede ser parte explícita del esquema Zod, pero nunca se
  confía en él: RLS/RPC verifica que sea un vendedor válido de la misma organización. Para Seller,
  el identificador siempre se deriva de la sesión.
- Las Server Actions son endpoints públicos por diseño: se autorizan una por una, no por la ruta
  desde la que se invocan.
- Los Route Handlers (`auth/callback`) validan origen y parámetros.

### 5.0 Un Route Handler NO hereda la guarda de su layout (Fase 6)

Es la trampa que aparece al añadir una descarga. `layout.tsx` protege las **páginas** de su grupo de
rutas, no los Route Handlers: un `route.ts` colocado dentro de `(protected)/owner/` **es público**,
aunque el layout hermano llame a `requireStaff()`.

Por eso la exportación de reportes vive en `src/app/api/reports/export/route.ts` —fuera del grupo,
donde nadie puede suponer una guarda implícita— y comprueba en sus primeras líneas (D-060):

1. **Sesión** (`getAuthUser`) → 401.
2. **Membresía activa** (`getActiveMembership`) → 403. Un usuario desactivado no descarga nada, ni
   siquiera con una sesión anterior (BR-A04).
3. **Reporte permitido para su rol** → 403. Un vendedor no puede pedir el reporte que compara
   vendedores.
4. **RLS**, que es la única capa que garantiza de verdad el aislamiento: las vistas y las funciones
   de reporte son `security_invoker`, así que el archivo solo puede contener filas que esa persona
   ya podía ver. Las tres comprobaciones anteriores dan mensajes claros; esta es la que protege.

Además, el nombre del archivo se **sanea** antes de entrar en `Content-Disposition` (lista blanca
`[a-zA-Z0-9_-]`): sin eso, un valor con `\r\n` podría inyectar cabeceras HTTP. Y los errores se
devuelven genéricos, sin el mensaje de PostgreSQL (D-044).

### 5.1 Ajustes de la implementación (Fase 3)

**`authorizeAction(roles)` en vez de `requireRole` dentro de acciones.** `requireRole` redirige a
`/denied`, lo que desde el envío de un formulario haría perder lo escrito y ocultaría el motivo.
`authorizeAction` devuelve `{ membership }` o `{ error }` mostrable. Sigue siendo la primera línea,
nunca la única: RLS y las restricciones son la frontera real.

**Un `UPDATE` bloqueado por RLS no produce error: produce cero filas.** Es la trampa más importante
que apareció al construir el portal. Si un Admin intenta editar o desactivar al Owner, la política
sencillamente no encuentra fila que actualizar y Supabase responde sin error. Toda acción que
dependa de una restricción de RLS **debe** comprobar el número de filas afectadas:

```ts
const { data, error } = await supabase.from('profiles').update({...}).eq('id', id).select('id')
if (error) return { error: mapPgError(error) }
if (!data || data.length === 0) return { error: 'No tienes permiso para editar a este usuario.' }
```

Verificado por `tests/db/phase3-admin.test.ts` (`F3-03`) y por `tests/e2e/owner-users.spec.ts`.

**Alta de usuarios (D-045).** La cuenta de Supabase Auth se crea con la service role — `auth.admin`
no existe de otra forma — y **solo** toca el esquema `auth`. La **membresía** se inserta con el
cliente de sesión, sujeto a RLS: es `memberships_insert_staff` la que impide a un Admin crear un
`owner`. Nunca existe una contraseña en texto plano: se invita por correo y la persona la define
desde el enlace. Si la inserción de la membresía falla, se elimina la cuenta recién creada.

**Un INNER JOIN en una vista `security_invoker` borra filas, no columnas (I-015, migración `0012`).**
`v_payment_history` unía `profiles` con INNER JOIN para resolver nombres. Como la vista hereda la RLS
de quien consulta, un vendedor —que solo ve su propio perfil— perdía la fila **entera** de cualquier
pago registrado por un administrador, aunque `payments_select` sí se la permitiera. La regla que se
desprende: en una vista `security_invoker`, todo `JOIN` contra una tabla con RLS es `LEFT JOIN` salvo
que se pueda demostrar que quien ve la fila principal ve también la unida. Un dato que no se puede
ver debe llegar como `NULL`, nunca hacer desaparecer el registro.

**Visibilidad de usuarios inactivos (I-011, migración `0011`).** `profiles_select` exigía que la
membresía **objetivo** estuviera activa, de modo que al desactivar a alguien desaparecía del listado
y era imposible reactivarlo. Ahora la visibilidad depende de que **quien consulta** sea personal
activo de la organización. El aislamiento entre organizaciones y el de vendedores no cambian, y un
usuario inactivo sigue sin poder ingresar ni operar (BR-A04/BR-A05).

---

## 6. Auditoría

Eventos mínimos registrados en `audit_logs` (BR-D01):

| Acción | `entity_type` | Origen |
|--------|---------------|--------|
| `user.create`, `user.activate`, `user.deactivate`, `user.role_change` | `membership` | Server Action + trigger |
| `raffle.create`, `raffle.update`, `raffle.status_change` | `raffle` | Trigger |
| `ticket.create`, `ticket.update`, `ticket.number_change` | `ticket` | Trigger |
| `ticket.assign_seller`, `ticket.assign_client` | `ticket` | RPC |
| `ticket.update_sale_price` | `ticket` | RPC (`update_ticket_sale_price`, D-137). Precio anterior y nuevo, cliente y vendedor |
| `ticket.approve`, `ticket.cancel` | `ticket` | RPC |
| `ticket.import` | `raffle` | RPC (`log_ticket_import`, 0019). Quién, cuándo, rifa, vendedor, tipo de archivo y recuentos. **Nunca el archivo** |
| `payment.create`, `payment.update`, `payment.void` | `payment` | RPC |
| `client.create`, `client.update`, `client.archive` | `client` | Trigger |

- Append-only: sin políticas de `UPDATE`/`DELETE`.
- Los triggers de auditoría no disparan otros triggers: `audit_logs` no tiene triggers propios, lo
  que descarta ciclos y recursión.
- Los triggers escriben mediante una función `SECURITY DEFINER`, de modo que RLS no los bloquea.
- No se registran contraseñas, tokens ni claves; los `jsonb` de valores omiten campos sensibles.

---

## 7. Gestión de secretos

| Variable | Ámbito | Riesgo si se filtra |
|----------|--------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Público | Ninguno |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Público (sujeta a RLS) | Bajo: sin RLS correcta, sería total |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** | **Crítico**: omite RLS por completo |

Controles:

1. `src/lib/supabase/admin.ts` declara `import 'server-only'`: el build falla si se importa desde el
   cliente.
2. Prohibido el prefijo `NEXT_PUBLIC_` en cualquier secreto.
3. `.env*` en `.gitignore`; solo se versiona `.env.example` con valores de marcador.
4. En Vercel, `SUPABASE_SERVICE_ROLE_KEY` se marca como sensible y se restringe al entorno de
   servidor.
5. La rotación de claves se documenta en el manual operativo (Fase 8).
6. Las contraseñas del seed provienen de variables de entorno locales; nunca se versionan.

---

## 8. Modelo de amenazas

| # | Amenaza | Vector | Mitigación | Verificación |
|---|---------|--------|------------|--------------|
| T1 | Vendedor lee datos de otro vendedor | Cliente Supabase con su propia sesión | RLS por `seller_id` en todas las tablas | Pruebas de BD con sesión real de vendedor |
| T2 | Fuga entre organizaciones | ID de otra organización en la URL | RLS por `organization_id` + FK compuestas | Prueba de aislamiento multiorganización |
| T3 | Escalada de privilegios | Un Admin se asciende a Owner | Política `UPDATE` sobre `memberships` que prohíbe el rol `owner` a los Admin | Prueba negativa |
| T4 | Manipulación de IDs | `ticket_id` ajeno en una Server Action | El `id` se usa dentro de consultas con RLS; nunca como prueba de propiedad | Prueba de acción con ID ajeno |
| T5 | Mass assignment | Campos extra en el formulario (`seller_id`, `paid_amount`) | Zod con allowlist; columnas derivadas no aceptan escritura directa | Prueba unitaria de esquema |
| T6 | Sobrepago por concurrencia | Dos abonos simultáneos | `FOR UPDATE` ordenado + `CHECK` sobre `paid_amount` | Prueba de concurrencia |
| T7 | Pago descuadrado | Cliente manipulado que envía asignaciones inconsistentes | Constraint trigger diferido + validación en RPC | Prueba de BD |
| T8 | Borrado de evidencia | Intento de `DELETE` sobre pagos o auditoría | Sin política `DELETE` en ninguna de las dos tablas | Prueba negativa |
| T9 | Fuga de la clave de servicio | Importación accidental en el cliente | `server-only` + revisión de lint | Build + revisión |
| T10 | Sesión de usuario desactivado | Cookie válida tras la desactivación | `is_active` verificado en cada request y en `current_org_ids()` | Prueba E2E |
| T11 | Vista sin `security_invoker` | Vista creada por descuido | Regla obligatoria + revisión en Fase 2 y auditoría en Fase 9 | Consulta de catálogo `pg_class.reloptions` |
| T12 | Secuestro de `search_path` | Función `SECURITY DEFINER` sin `search_path` fijo | `SET search_path` obligatorio | Revisión de catálogo `pg_proc.proconfig` |
| T13 | Fuerza bruta de contraseñas | Intentos repetidos en `/login` | Límites de Supabase Auth + limitación de intentos en la aplicación (Fase 7) | Prueba manual |
| T14 | Mensajes de error que revelan estructura | Error de PostgreSQL mostrado tal cual | `mapPgError` traduce a mensajes genéricos en español | Revisión de UI |
| T15 | Enumeración de recursos | Respuestas distintas para "no existe" y "sin permiso" | RLS hace que ambos casos devuelvan vacío | Prueba de BD |
| T16 | **Organización sin propietario** | El Owner se degrada o se desactiva a sí mismo con una llamada directa a PostgREST; nadie puede restaurarlo después | Trigger diferido `memberships_require_active_owner` (`0016`) | `F9-01` en `db/audit-phase9.test.ts`. **Encontrado por la auditoría de la Fase 9 (A-02), no por revisión de código** |
| T17 | Server Action nueva sin guarda | Alguien añade una acción y olvida `authorizeAction` | Prueba estructural que recorre **recursivamente** `src/features` y falla sola | `unit/server-actions-guard.test.ts`. Su recorrido a un solo nivel dejaba fuera 6 de 28 acciones hasta la Fase 9 (A-01) |

---

## 9. Cumplimiento de `CLAUDE.md` §26

| Requisito | Dónde se cumple |
|-----------|-----------------|
| RLS activado en todas las tablas de negocio | §4.3 (9 tablas, `ENABLE` + `FORCE`) |
| El frontend no es frontera de seguridad | §1 |
| Validar permisos en servidor y base de datos | §5 y §4 |
| Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` | §7 |
| No almacenar secretos en Git | §7, `.gitignore` |
| Usar variables de entorno | §7, `.env.example` |
| Validar todos los formularios | §5 (Zod compartido) |
| Validar operaciones sensibles en servidor | §5 |
| Evitar acceso por identificadores manipulados | §8 T4 |
| Evitar mass assignment | §8 T5 |
| Proteger Server Actions y Route Handlers | §5 y §5.0; verificado por `tests/unit/server-actions-guard.test.ts` y `tests/e2e/security.spec.ts` |
| Verificar organización y rol en cada operación sensible | §5 pasos 1–3 |
| Implementar restricciones de base de datos | `docs/DATA_MODEL.md` §4 |
| Manejar errores sin exponer información sensible | §8 T14; verificado en `tests/e2e/security.spec.ts` |
| Endurecer cabeceras HTTP | §10.1 |
| Limitar intentos en operaciones sensibles | §10.2 |

---

## 10. Endurecimiento HTTP (Fase 7)

### 10.1 Cabeceras

| Cabecera | Valor | Qué tapa |
|---|---|---|
| `Content-Security-Policy` | nonce por request + `strict-dynamic` | Inyección de scripts |
| `X-Frame-Options` | `DENY` | Clickjacking (junto con `frame-ancestors 'none'`) |
| `X-Content-Type-Options` | `nosniff` | Que el navegador ejecute como script algo servido como texto |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Filtrar a terceros las rutas, que llevan ids de boletas, clientes y pagos |
| `Permissions-Policy` | cámara, micrófono, ubicación y pagos apagados | Capacidades que la aplicación no usa |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Degradación a http. **Solo en producción** |

Las que no dependen del request las declara `next.config.ts`, para que las reciban también los
archivos estáticos que el matcher del proxy excluye. La CSP la pone `proxy.ts`, porque su nonce
cambia en cada respuesta (D-061).

**Por qué el nonce y no `'unsafe-inline'`.** Next inyecta el payload de hidratación en scripts en
línea. Permitirlos con `'unsafe-inline'` dejaría pasar exactamente el ataque del que la CSP protege.
Con nonce + `'strict-dynamic'`, solo se ejecuta lo que Next firma en esa respuesta.

`style-src` **sí** admite `'unsafe-inline'`, a propósito: `next/font` y el propio Next inyectan
estilos en línea, y un estilo no ejecuta código.

### 10.1.b `worker-src` y el precio de `'strict-dynamic'` (D-115)

Desde el 2026-08-26 la política declara además **`worker-src 'self'`** y `manifest-src 'self'`.

La primera **no es opcional ni decorativa**, y el motivo es una trampa que conviene tener escrita: la
cadena de respaldo de `worker-src` pasa por `child-src` y luego por `script-src`, y `script-src`
lleva `'strict-dynamic'`. Esa palabra hace que se **ignoren** las listas de orígenes, `'self'`
incluido. Sin declarar `worker-src` explícitamente, el navegador **rechaza el registro del service
worker** y la aplicación deja de ser instalable, sin que nada más se rompa ni dé señal. Hay prueba
unitaria en `tests/unit/security-headers.test.ts` para que aflojarla o quitarla no pase inadvertido.

### 10.1.b.2 REGLA: una pantalla que necesita JavaScript se renderiza por petición

`'strict-dynamic'` tiene una consecuencia que hay que tener presente al crear cualquier pantalla:
una página **prerenderizada** no puede llevar el nonce del request, porque su HTML se genera al
construir, y entonces el navegador bloquea **todos** sus scripts. La pantalla se ve perfecta y no
reacciona a nada.

**La regla, en una línea:** si una pantalla monta un componente de cliente del que dependa su
funcionamiento, necesita `export const dynamic = 'force-dynamic'`. Las pantallas **protegidas** ya lo
cumplen sin hacer nada —leen la sesión, así que Next las renderiza por petición—; el riesgo está en
las **públicas**.

| Pantalla | Modo | Por qué |
|---|---|---|
| `/login`, `/reset-password` | `ƒ` dinámica | Leen el request |
| `/forgot-password` | `ƒ` dinámica **desde D-121** | Estuvo **rota en producción desde la Fase 7** (I-070): el formulario caía a su envío nativo por GET y no enviaba ningún correo |
| `/offline` | `ƒ` dinámica | Escucha la vuelta de la conexión (D-116) |
| `/denied`, `/_not-found` | `○` estáticas, **a propósito** | Solo contienen un enlace, y un enlace funciona sin React. Hacer dinámica la de 404 despertaría una función en cada golpe de un rastreador |

⚠️ **Esto NO se ve en `next dev`**, donde Next renderiza todo por petición, y **ninguna prueba E2E
puede detectarlo**, porque el arnés arranca en modo desarrollo (**I-074**). Lo que hay es
`tests/unit/csp-dynamic-pages.test.ts`, que cubre la regresión concreta. Al añadir una pantalla
pública con formulario, **añádela también a esa lista**.

### 10.1.c Qué NO guarda el service worker

La aplicación instalable no abre ninguna superficie nueva de datos, y es una decisión explícita, no
una consecuencia (D-116): **ninguna respuesta autenticada entra en Cache Storage**. Ni el HTML de una
pantalla —que en esta aplicación ES el dato, renderizado en servidor con las filas de quien
consulta—, ni los payloads RSC, ni `/api`, ni `/auth`, ni nada que no sea `GET`. Solo se guardan
archivos con huella de contenido (`/_next/static/…`), los iconos y la pantalla `/offline`.

Consecuencias directas, las dos deseadas:

* **No hay filtración entre vendedores** que compartan teléfono, porque no hay nada que filtrar.
* **No hay nada que limpiar al cerrar sesión.** Si algún día se empieza a guardar una respuesta
  autenticada, el borrado en el cierre de sesión deja de ser innecesario y pasa a ser obligatorio.

Del matcher del proxy solo salieron dos rutas nuevas, `sw.js` y `manifest.webmanifest`: archivos
estáticos y públicos, la misma categoría que `_next/static` y las imágenes, que ya estaban fuera.
`/offline` **no** salió: sigue pasando por el proxy para recibir su CSP, y solo se declaró pública.

### 10.2 Limitación de intentos

| Operación | Límite | Clave | Por qué |
|---|---|---|---|
| Login | 10 / 5 min | correo | Equivocarse de contraseña es normal; el límite duro lo pone Supabase Auth |
| Recuperación de contraseña | 3 / 15 min | correo | Cada intento envía un correo real |
| Invitaciones | 20 / hora | organización | Cada una envía correo y consume cuota de Auth |

**Alcance real, sin adornos.** Es un contador **en memoria del proceso**: con varias instancias cada
una lleva la suya, y un reinicio la borra. No es la defensa principal del login —esa es la de
Supabase Auth, global y persistente (I-008)—, sino la capa que frena el goteo de correos hacia
terceros y da un mensaje claro antes de que el proveedor devuelva uno opaco (D-062).

Se limita por **correo y no por IP**: en una oficina o tras un dato móvil todos comparten IP, y
bloquear por IP dejaría fuera a un equipo entero de vendedores por culpa de uno.

Al superar el límite, la recuperación de contraseña sigue respondiendo `ok`: decir «demasiados
intentos» revelaría que ese correo existe, que es justo lo que ese flujo evita.

### 10.3 Rendimiento de la RLS: una regla de seguridad, no de estilo

Una política que recorre filas existentes **no debe llamar a una función de sesión pasándole una
columna**. PostgreSQL no puede sacarla del bucle y la ejecuta una vez por fila; medido en la Fase 7,
eso multiplicó por 1.400 el tiempo de cualquier consulta sobre `tickets` (I-019). La excepción
acotada de inserción del Seller está explicada en §4.2.

```sql
-- MAL: una llamada por fila
using ( is_org_staff(organization_id) )

-- BIEN: el conjunto se calcula una vez
using ( organization_id in (select current_staff_org_ids()) )
```

Lo mismo con `current_profile_id()`, que va siempre envuelto en `(select …)`.

Es una regla de **seguridad** y no solo de rendimiento: una consulta que tarda segundos invita a
quitarle la RLS «temporalmente» para salir del paso, y esa es la peor forma de romper el
aislamiento. La prueba `F7-03` impide que el patrón lento vuelva a entrar.
