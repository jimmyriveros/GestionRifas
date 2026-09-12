# SEGURIDAD

- **Versión:** 2.13 · **Estado:** implementado · **Actualizado:** 2026-09-12
- **§4.15** describe el aislamiento de las cuentas de cobro, los recordatorios y **el motor que los
  dispara**, implementado en las migraciones **`0051`** (Etapa 1) y **`0052`** (Etapa 3, D-189) y
  verificado en local; su última parte —Web Push— sigue siendo diseño y lo dice. **§5.2**
  (dispatcher de Web Push) es **planificada**, Etapa 5.
- **§4.16** describe las **suscripciones Web Push** (`0053`, Etapa 4, D-190): de una persona, un
  dispositivo por fila y con las claves fuera del alcance de cualquier sesión.
- ⚠️ `0051`, `0052` y `0053` están aplicadas **en local**. **El proyecto real no las tiene**:
  promoverlas es la Etapa 7.
- **Estado:** las políticas y sus refuerzos viven en las migraciones `0005`, `0011`, `0014`,
  `0015`, `0016`, `0019`, `0020`, `0021`, `0036`, `0037`, `0038`, `0039`, `0042`, `0043` y `0044`; los privilegios base se fijan en `0009`/`0010`.
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
| Disparadores `payments_insert_positive` y `payment_allocations_insert_positive` (`0042`, D-158) | Desde que los `CHECK` de fila pasaron a `>= 0` para poder **corregir** un abono a cero, el `> 0` del **alta** lo mantienen estos dos: registrar un pago de $0 por PostgREST sigue siendo imposible (BR-F03, amenaza T18) |

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


## Fuentes alternativas de loterías (D-162, BR-L26)

Desde el 2026-09-02 el sincronizador consulta también dominios que **no son autoridades**. Las
defensas no se relajan: se duplican.

| Defensa | Cómo queda |
|---|---|
| Allowlist | **Dos listas separadas y que no se mezclan**: `ALLOWED_SOURCE_HOSTS` (oficial) y `ALLOWED_ALTERNATIVE_HOSTS`. Una ruta oficial nunca se resuelve contra la alternativa, ni al revés. Una prueba lo comprueba en las dos direcciones |
| HTTPS, timeout, tope de bytes, redirecciones acotadas | Los mismos de `fetchOfficialDocument`: es **la misma función**, con la lista inyectada |
| Redirecciones | Se valida el host en cada salto, también para las alternativas |
| URLs | **Nunca** vienen del cliente: se arman con el año y el sorteo de la programación oficial |
| Caché | `cache: 'no-store'` explícito. Una respuesta guardada traería la fecha de otro día y se aceptaría como buena |
| Escritura | `record_lottery_observations` es `SECURITY DEFINER`, con `search_path` fijo, **revocada de `public`, `anon` y `authenticated`**; solo `service_role`. No hay endpoint público para introducir un resultado |
| Lectura | `lottery_source_observations` tiene RLS forzada y **ninguna política de `SELECT`**: `authenticated` no la lee |
| `tickets_select` | **No se amplía.** El matching y su aislamiento no cambian |
| Elusión | No se resuelven CAPTCHA, no se usan proxies, no se falsifica un navegador con cabeceras, no se copian cookies de una sesión humana y no se ejecuta un navegador headless. Paga Todo responde 403 y **se acepta el 403** (I-093) |


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
| Corregir el valor de un abono vigente, **cero incluido** (BR-F16, BR-F17, D-158) | ✓ | ✓ | P |
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

La Etapa 5 (D-148, BR-L21) añade `GET|POST /api/lottery/sync`. Vive fuera de `(protected)`,
como la exportación de reportes. **No usa sesión**: el programador no tiene una. El proxy
deja pasar esa ruta; el handler compara `Authorization: Bearer` o `x-lottery-sync-secret`
contra `LOTTERY_SYNC_SECRET` (o `CRON_SECRET`) a tiempo constante. Sin secreto, o con uno de
menos de 16 caracteres, responde 401. Un query `?secret=` no autoriza. No acepta una URL
del cliente. Los intentos fallidos se limitan en memoria. Las RPC
`try_acquire_lottery_sync_lock` y `release_lottery_sync_lock` son `SECURITY DEFINER` **sin
EXECUTE para authenticated**. `lottery_sync_lock` tiene RLS forzada y cero políticas. El
tick usa `createAdminClient` solo para esas RPC internas (D-145). **El cron de
producción está activo (D-149):** `vercel.json` declara los jobs Hobby. Vercel envía
`CRON_SECRET` como Bearer, pero **no crea esa variable sola** (D-152): mientras no exista,
el programador recibe 401 en cada ejecución. Sin secreto, o con uno de menos de 16
caracteres, responde 401. Un `LOTTERY_SYNC_SECRET` distinto de `CRON_SECRET` haría 401 al
programador.

El mantenimiento de D-152 (BR-L22) acota lo que un tick autorizado puede hacer hacia
afuera: la consulta de resultados se limita a un horizonte reciente y a un número máximo y
determinista de descargas por ejecución. No es solo eficiencia — es la diferencia entre un
proceso acotado y cientos de peticiones automáticas a seis sitios oficiales desde una IP de
Vercel, que es como se consigue que a uno lo bloqueen (I-081). La migración `0041` no abre
superficie: añade una columna y un índice a `lottery_sync_runs`, que sigue sin política de
`SELECT` para `authenticated`.

El acta de Cundinamarca (D-153, BR-L23) añade **un host de salida y ni una superficie de
entrada**: no hay ruta nueva, ni RPC nueva, ni cambio de RLS, ni migración. Lo relevante:

| Riesgo | Cómo queda cerrado |
|---|---|
| Autorizar almacenamiento compartido de terceros | El host va con **su ruta** (`ALLOWED_SOURCE_PATHS`), comprobada en la URL inicial **y en cada redirección**. `blob.core.windows.net` no queda autorizado entero |
| Una URL elegida por el cliente | `cundinamarcaActaUrl(year, draw)` valida los dos y devuelve `null` si no son un año y un sorteo. El año y el sorteo salen de la programación, no de un formulario |
| Un HTML —o cualquier cosa— servido como PDF | Se exige el `content-type` **y** la firma `%PDF-` del archivo, que el servidor no elige |
| Bomba de descompresión | `inflateSync` con `maxOutputLength`, tope de bytes descomprimidos y tope de objetos recorridos |
| Un PDF cifrado | No se intenta abrir: `unsupported_type`. No se rompe una protección |
| Certificado vencido de la fuente anterior | El host se **retiró** de la allowlist. No se desactiva la verificación de certificados para hablar con nadie (I-085) |
| Guardar el documento | No se guarda: URL final, autoridad, hash y evidencia estructurada (BR-L16) |

La validación real de las fuentes (D-154, BR-L24) **no añade ni un host, ni una ruta, ni una
dependencia**: cambia cómo se lee lo que ya se descargaba. Lo que sí toca a seguridad:

| Riesgo | Cómo queda cerrado |
|---|---|
| **Publicar un número que no es el oficial** | Era real, no teórico: la página del Meta hacía que el adaptador publicara `6262` leído de una hoja de estilos (I-088). Ahora cada campo se lee anclado a un encabezado con sorteo y fecha, y una tirada de dígitos de largo distinto al esperado **no se publica**. Aquí un dígito equivocado marca boletas ajenas como coincidentes |
| Contenido que un usuario no ve tratado como texto | `<script>`, `<style>`, `<noscript>`, `<template>` y los comentarios se borran antes de leer nada |
| Un atributo con `>` que rompe el borrado de etiquetas | El borrado respeta las comillas; ya no se cuela medio `onkeyup` como si fuera contenido |
| Seguir un enlace-señuelo anti-robot | No se sigue —el módulo no navega enlaces— y además **deja de confundirse con un muro**: un señuelo oculto en una página servida no es un desafío (I-089) |
| Insistir contra un desafío | `cf-mitigated: challenge` se reconoce sea cual sea el estado; `decideResultFetch` sigue frenando tras dos `source_blocked` hasta la mañana |
| **Turnstile de Bogotá** | Se comprobó que su API exige `X-Antibot-Pass` y **no se resuelve**. Tampoco se cambia el `User-Agent`, ni se usa un proxy, ni un agregador. Se registra `source_blocked` y el resultado queda para revisión manual (I-087) |

El Panel sigue sin importar nada de esto, y hay una prueba que lo vigila para `queries.ts`,
`dashboard.ts` y ahora también `LotteryResultsSection.tsx`: ni el tick, ni `fetch`, ni los
adaptadores (BR-L20).

El aislamiento del recuadro (D-155, BR-L25) **no mueve ninguna frontera**. Es un límite de
Suspense dentro de la página; la lectura es la misma, con el cliente de sesión y sujeta a la RLS
de arriba. Lo que sí conviene tener presente al tocarlo:

| Riesgo | Cómo queda cerrado |
|---|---|
| **Una guarda dentro del límite** convertiría un redirect en un 200 a medias | `requireStaff` / `requireRole` se resuelven **antes** de que la página devuelva su árbol, así que corren antes de emitir el armazón. Una guarda de sesión nunca debe bajar dentro de un `<Suspense>`: cuando el primer trozo sale, el estado HTTP ya está enviado y no se puede cambiar (guía de streaming de Next.js 16, «The HTTP contract») |
| Cachear la lectura para «que vaya más rápido» | **No se cachea.** Las coincidencias dependen de quién pregunta (RLS): una caché compartida entre peticiones filtraría boletas de un vendedor a otro. El recuadro se lee en cada navegación, como antes |
| Una lectura colgada dejando la respuesta abierta | `LOTTERY_DASHBOARD_TIMEOUT_MS` (3 s) con `AbortSignal.timeout`, **compartido por las dos consultas**: cancela de verdad y cae en el aviso de error |
| Filtrar un error de la base en pantalla | No cambia: el `catch` devuelve `{ kind: 'error' }` y el texto visible es genérico. No se expone el mensaje de PostgREST |

### 4.9 «Ventas por fecha» (`0040`, BR-T05, D-151)

Una superficie de lectura nueva, y la más pequeña posible.

| Función | Quién | Qué comprueba |
|---|---|---|
| `report_sales_totals(from, to)` | Cualquier rol | `stable`, `SECURITY INVOKER`, `search_path` fijo. Hereda `tickets_select`: un vendedor agrega **sus** ventas y las de nadie más |

**Solo recibe dos fechas.** No hay `p_seller_id` ni `p_organization_id`: a diferencia de
`report_payment_totals` —donde el personal necesita acotar por vendedor—, este reporte es del portal
del vendedor y **no existe ningún parámetro de autoridad que un navegador pueda manipular**. Pasar el
id de otro no es que devuelva ceros: es que no se puede pasar.

**Las filas del detalle no añaden superficie.** Salen de una lectura normal de `tickets` con el
cliente incrustado, sujeta a `tickets_select` y `clients_select` como cualquier otro listado. **La
RLS no se amplió ni se tocó**: `tickets_select` sigue siendo exactamente la de `0014`.

**El CSV comparte las tres capas de §5.0**, con un ajuste: el reporte permitido ya no se comprueba
solo contra la lista del vendedor, sino contra la del **rol** (`reportKeysForRole`). Un vendedor
sigue recibiendo 403 al pedir «Por vendedor», y ahora el personal recibe 403 al pedir «Ventas por
fecha», que es un reporte de un portal que no es el suyo. Se rechaza en vez de caer al
predeterminado —que es lo que hace la pantalla— porque aquí el resultado es un **archivo**: devolver
un reporte distinto del pedido, con el mismo nombre, sería peor que decir que no.

---

### 4.10 Catálogo público (`0043`, BR-K01..BR-K12, D-159)

**Es la única lectura del proyecto que sirve datos sin sesión**, así que conviene ser explícito sobre
por qué no debilita nada.

Quien pide `/catalogo/<slug>` no tiene sesión: no hay `auth.uid()` del que colgar una política, de
modo que la RLS no puede decidir. Lo que acota la respuesta son dos funciones `SECURITY DEFINER` y,
en concreto, **su tipo de retorno**: lo que no está en el `returns table` no puede salir. La
alternativa —una política `SELECT` para `anon` sobre `tickets`— se descartó porque mete a `anon`
**dentro** de la tabla y PostgREST deja pedir columnas por nombre: cualquier columna futura quedaría
expuesta salvo que alguien se acuerde de excluirla.

| Función | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `public_catalog_membership(text)` | ✗ | ✗ | ✗ (no la ejecuta nadie, `0044`) |
| `public_catalog_seller(text)` | ✗ | ✗ | ✓ |
| `public_catalog_tickets(text, text, int, int)` | ✗ | ✗ | ✓ |

Se cumplen las cuatro reglas de §4.5: `search_path` fijo, `REVOKE` explícito a `public`, `anon` y
`authenticated`, parámetros tipados y sin SQL concatenado, y ningún `RAISE` con detalle interno.

⚠️ **`0043` no bastó, y es I-078 otra vez.** Al promoverla (2026-09-02) la comprobación por comportamiento
encontró `public_catalog_membership` **ejecutable por `service_role` en el proyecto real** y no en
local: `0032` conservó a propósito el privilegio por defecto de ese rol, así que toda función nueva
nace con él en producción. No era un agujero —`service_role` es la clave del servidor y omite la RLS
de todos modos—, pero la documentación y una prueba afirmaban de producción algo que solo era cierto
en local, que es justo lo que costó I-078. Lo cierra **`0044`**, con un `revoke` explícito.
**Consecuencia para quien escriba la próxima migración:** revocar de `public`, `anon` y
`authenticated` **no** deja una función inaccesible en producción; si de verdad no la debe ejecutar
nadie, hay que nombrar también a `service_role`.

**Lo que no puede manipularse.** Ninguna de las tres acepta vendedor, organización ni rifa como
parámetro: lo único que entra es el slug, y a quién pertenece lo decide la base. Enviar el slug de
otra persona devuelve el catálogo de esa persona —que es público— y nunca permite saltar a un tercero
ni ampliar lo que se ve de nadie.

**Los siete filtros** (BR-K10) viven una sola vez, en `public_catalog_membership`: organización
activa, perfil activo, membresía activa, rol `seller`, catálogo habilitado, rifa de la misma
organización y rifa `active`. Los siete fallos producen **la misma** respuesta: ninguna fila. La
página los traduce a un 404 genérico que no filtra ni el nombre del vendedor ni el de la rifa.

**Lo que NO cambia:** `tickets_select` sigue igual; `anon` sigue sin un solo privilegio sobre ninguna
tabla de negocio; no hay política nueva en ninguna tabla. La migración es aditiva.

**Configurar es del personal.** La escritura pasa por `memberships_update_staff` (`0014`), así que un
vendedor no puede publicarse ni cambiar el catálogo de otro; su Server Action además empieza por
`authorizeAction(['owner','admin'])`. Leer la propia configuración pasa por `memberships_select`
(`0022`), que a un vendedor solo le devuelve su fila (BR-K12). El cambio lo audita el disparador
`audit_memberships` que ya existía: no hace falta auditoría nueva.

**La clave de servicio no sale del servidor.** `createAdminClient` importa `server-only`, así que el
build falla si alguien lo importa desde un componente de navegador (§7).

### 4.11 Corregir el cliente de una boleta vendida (`0047`, BR-I13, D-168)

Una función nueva, `reassign_ticket_client(uuid, uuid, uuid, text)`, con la misma propiedad que las
de §4.6: **el navegador no aporta rol, organización, vendedor ni estado como autoridad**. Recibe
cuatro valores —boleta, cliente esperado, cliente nuevo y motivo— y la base revalida todo lo demás
con la fila bloqueada por `FOR UPDATE`.

| Comprobación | Qué impide |
|---|---|
| `is_org_staff(org)` o `seller_id = auth.uid()` | Que un vendedor toque la boleta de otro, o alguien la de otra organización. El mensaje es el mismo que si la boleta no existiera: no se filtra que existe |
| `inventory_status = 'assigned'` y `client_id not null` | Convertir esto en una vía alternativa de venta |
| `client_id = p_expected_client_id` | Que una pantalla desactualizada pise una corrección más reciente |
| Cliente de destino: misma organización, mismo vendedor, no archivado, distinto del actual | Saltar de cartera o de organización con un id manipulado (BR-C05, BR-C07) |
| Cero filas en `payment_allocations` | Dejar el historial de abonos —incluidos los anulados y los corregidos a $0— apuntando a la persona equivocada |
| Cero filas en `lottery_ticket_matches` | Contradecir una fotografía inmutable del sorteo (BR-L11) |
| Motivo de 5 caracteres o más | Una reescritura de propiedad sin justificación en la bitácora |

Cumple las cuatro reglas de §4.5: `search_path` fijo, `REVOKE` explícito de `public` y `anon`,
parámetros tipados sin SQL concatenado y mensajes de negocio sin detalle interno. El `GRANT` nombra a
`authenticated` **y también a `service_role`**, que las migraciones anteriores dejaban implícito: ese
rol hereda `EXECUTE` del privilegio por defecto **en producción y no en local** (D-128), y esa
divergencia es exactamente la que costó I-078 y obligó a la `0044`. Nombrarlo hace que los dos
entornos digan lo mismo, y `verify:remote` y `tests/db/catalog.test.ts` llevan la función en sus dos
listas blancas —las mismas que §4.5 obliga a tocar juntas—.

**Lo que NO cambia.** Ninguna política nueva. `tickets_update_seller` sigue sin alcanzar una boleta
`assigned`, de modo que un `UPDATE` directo del vendedor afecta cero filas; `tickets_update_staff`
sigue como estaba, y sobre él sigue el disparador `tickets_protect_client_change` (BR-I12), que esta
función **no esquiva** —no hay GUC, porque su propio listón es más alto—.

**La cartera se acota en el servidor.** La Server Action de búsqueda (`searchTicketClientOptions`)
recibe **la boleta**, no el vendedor, y resuelve la cartera leyendo `tickets` bajo RLS. Enviar el id
de otra boleta no amplía nada —la RLS sigue mandando— y tampoco sirve para reasignar, porque la RPC
comprueba la cartera contra la boleta de verdad. Cuando el personal crea un cliente desde ese
diálogo, `seller_id` sale de la boleta y nunca del formulario: `clients_insert` deja al personal
crear en cualquier cartera de su organización, así que la garantía tiene que estar aquí y la vuelve a
aplicar la RPC al comprobar `v_client.seller_id <> v_ticket.seller_id`.

### 4.12 Liberar una boleta vendida (`0048`, BR-I14, D-169)

`release_ticket_client(uuid, uuid, text)`, con la misma propiedad que las de §4.6 y §4.11: **el
navegador no aporta rol, organización, vendedor, estado ni precio como autoridad**. Recibe tres
valores —boleta, cliente esperado y motivo— y la base revalida todo lo demás con la fila bloqueada
por `FOR UPDATE`.

| Comprobación | Qué impide |
|---|---|
| `is_org_staff(org)` o `seller_id = auth.uid()` | Que un vendedor deshaga la venta de otro, o alguien la de otra organización. El mensaje es el mismo que si la boleta no existiera: no se filtra que existe |
| `inventory_status = 'assigned'` y `client_id not null` | Deshacer una venta que no existe, o tocar una boleta anulada, en borrador o pendiente |
| `client_id = p_expected_client_id` | Que una pantalla desactualizada deshaga una venta que ya cambió de dueño (D-168) o que se rehízo |
| `raffles.status = 'active'` | Dejar boletas «disponibles» en una rifa que ya no admite ventas (BR-R08) |
| Cero filas en `payment_allocations` | Dejar un abono —incluidos los anulados y los corregidos a $0— apuntando a una venta que ya no existe |
| Cero filas en `lottery_ticket_matches` | Contradecir una fotografía inmutable del sorteo (BR-L11) |
| Motivo de 5 caracteres o más | Borrar el precio y la fecha de una venta sin justificación en la bitácora |

Cumple las cuatro reglas de §4.5: `search_path` fijo, `REVOKE` explícito de `public` y `anon`,
parámetros tipados sin SQL concatenado y mensajes de negocio sin detalle interno. El `GRANT` nombra a
`authenticated` **y también a `service_role`**, por lo mismo que §4.11 (D-128, I-078), y la función
entra en las dos listas blancas —`verify:remote` y `tests/db/catalog.test.ts`— que §4.5 obliga a
tocar juntas.

**Lo que NO cambia.** Ninguna política nueva. `tickets_update_seller` sigue sin alcanzar una boleta
`assigned`, de modo que un `UPDATE` directo del vendedor afecta cero filas;
`tickets_validate_status_transition` sigue puesto sobre este `UPDATE`, con su propia comprobación de
pagos activos (BR-I11), y esta función **no lo esquiva**: su listón es más alto.

### 4.13 Entrega del paz y salvo (`0049`, BR-I15, D-170)

`set_ticket_clearance_delivery(uuid, boolean, timestamptz)`, con la misma propiedad que las de §4.6,
§4.11 y §4.12: **el navegador no aporta rol, organización, vendedor, estado, precio ni fecha nueva como
autoridad**. Recibe tres valores —boleta, si queda entregado o no, y la fecha que la pantalla creía— y
la base revalida todo lo demás con la fila bloqueada por `FOR UPDATE`.

| Comprobación | Qué impide |
|---|---|
| `is_org_staff(org)` → rechazo explícito | Que el Dueño o el Administrador registren una entrega que no hicieron. Ven el dato en modo lectura; **no** hay interruptor para ellos |
| `seller_id = auth.uid()` **y** `has_org_role(org, 'seller')` | Que un vendedor marque la boleta de otro, la de un integrante de su equipo (D-092) o la de otra organización — y que una **cuenta desactivada** siga operando (BR-A04). El mensaje es el mismo que si la boleta no existiera |
| `inventory_status = 'assigned'` y `client_id not null` | Registrar la entrega de una venta que no existe, o tocar una boleta anulada, en borrador o pendiente |
| `clearance_receipt_delivered_at = p_expected_delivered_at` | Que una pantalla desactualizada apague o encienda algo que quien pulsó no llegó a ver |
| La fecha la escribe `now()` **del servidor** | Un instante fabricado en el navegador dentro de un dato de bitácora |

Cumple las cuatro reglas de §4.5: `search_path` fijo, `REVOKE` explícito de `public` y `anon`,
parámetros tipados sin SQL concatenado y mensajes de negocio sin detalle interno. El `GRANT` nombra a
`authenticated` **y también a `service_role`**, por lo mismo que §4.11 y §4.12 (D-128, I-078), y la
función entra en las dos listas blancas —`verify:remote` y `tests/db/catalog.test.ts`— que §4.5 obliga
a tocar juntas.

**Lo que NO cambia.** Ninguna política nueva y **`tickets_update_seller` NO se amplía**: sigue sin
alcanzar una boleta `assigned`, así que un `UPDATE` directo del vendedor afecta cero filas. Ampliarla
para poder escribir un booleano habría abierto el precio, el cliente y las fechas de toda boleta
vendida. `tickets_update_staff` sigue como estaba —el personal administra su organización—, así que
esa política **no** es lo que impide al Dueño marcar la entrega: lo impide la RPC, que es el único
camino de la aplicación.

⚠️ La función de disparador `tickets_reset_clearance_receipt` nació **ejecutable por `PUBLIC`**,
como manda PostgreSQL con toda función nueva (I-020, I-078). Se revoca de `public`, `anon` y
`authenticated` en la propia migración: una función de disparador no necesita `EXECUTE` para
dispararse, porque el permiso se comprueba sobre la **tabla**.

### 4.14 Configuración de WhatsApp del vendedor (`0050`, BR-W01..BR-W03, BR-W07, D-176)

`set_seller_whatsapp_settings(text, boolean, text)` es **la única escritura de `memberships` que hace
alguien que no es personal**, y por eso merece leerse entera antes de tocarla.

**Por qué existe.** `memberships_update_staff` (0005/0014) es la única política de escritura de esa
tabla y solo deja pasar al Dueño y al Administrador. Un vendedor no puede escribir su propia
membresía — y **esa política no se amplía**. Ampliarla para tres columnas habría abierto la fila
entera: `role`, `is_active`, `parent_seller_id`, `commission_model`, `fixed_commission_amount` y las
cuatro `public_*`. Un vendedor podría **ascenderse a Dueño** o **subirse la ganancia** con una
petición a mano, porque PostgREST permite elegir las columnas del `UPDATE`.

**Lo que la hace segura no es una comprobación, es la firma.**

| Propiedad | Qué impide |
|---|---|
| **No tiene parámetro de vendedor** | Que alguien configure a otro. El perfil sale de `auth.uid()`; no existe el dato que manipular (BR-W07) |
| Escribe exactamente **tres columnas** de **una** fila | Que la RPC se convierta en un `UPDATE` general de `memberships` por descuido |
| `role = 'seller'` **y** `is_active` **y** `has_org_role(org, 'seller')` | Que la use el personal, o que una **cuenta desactivada** siga configurando (BR-A04). Un vendedor padre tampoco alcanza a un integrante de su equipo: el grupo es suyo |
| CHECK de formato del enlace, repetido en la función | Guardar un enlace que no es de WhatsApp, o uno con `http` que degradaría la conexión de quien lo abra |
| CHECK de coherencia del mensaje | Un vendedor cuya invitación sale vacía |

Cumple las cuatro reglas de §4.5: `search_path` fijo, `REVOKE` explícito de `public` y `anon`,
parámetros tipados sin SQL concatenado y mensajes de negocio sin detalle interno. El `GRANT` nombra a
`authenticated` **y también a `service_role`** (D-128, I-078), y la función entra en las dos listas
blancas —`verify:remote` y `tests/db/catalog.test.ts`— que §4.5 obliga a tocar juntas.

**La auditoría ya estaba.** `audit_memberships` (0006) anota cualquier `UPDATE` de la tabla con sus
valores anterior y nuevo. No se llama a `write_audit_log` aquí: sería una segunda fila describiendo el
mismo hecho.

**Quién puede LEER el enlace, dicho sin adornos.** `memberships_select` no cambia, así que la fila la
ven: su dueño, el **personal** de su organización y su **vendedor padre**, si lo tiene
(`current_team_seller_ids`). Es exactamente el mismo alcance que ya tenía `public_whatsapp_number`
desde `0043`. Un vendedor **ajeno** a ese equipo no ve nada, que es el aislamiento que exige el
encargo. Conviene saberlo antes de guardar aquí algo más sensible que un enlace de invitación a un
grupo: para eso haría falta una tabla aparte con su propia política, no una columna más.

**No hay superficie externa nueva.** La aplicación no habla con WhatsApp: construye una dirección
`https://wa.me/...` y la abre el usuario (BR-W08). Sin API, sin token, sin sesión, sin dependencia
nueva y sin ningún dato saliendo del navegador por iniciativa del servidor. El texto del mensaje se
guarda y se pinta **como texto** —`<textarea>` y nodos de texto—, nunca con `dangerouslySetInnerHTML`.

### 4.15 Cuentas de cobro y recordatorios del vendedor (`0051` y `0052`, BR-M, BR-S, BR-V01; D-185, D-189)

> **IMPLEMENTADO EN LA BASE**: la configuración el 2026-09-11 (`0051`, Etapa 1, 62 pruebas) y el
> **motor** el 2026-09-12 (`0052`, Etapa 3, 30 pruebas más). **Nada está aplicado al proyecto real**:
> eso es la Etapa 7 y necesita autorización propia. Lo que sigue describe el esquema **real**, salvo
> la última parte —Web Push—, que sigue siendo diseño de las etapas 4 y 5 y lo dice.

**El aislamiento que pide el contrato es más estrecho que cualquiera que este producto tenga hoy.**
No es «por organización» ni «por vendedor y su cadena de mando»: es **por vendedor, y nadie más**.

| Quién | Cuentas y recordatorios de un vendedor |
|---|---|
| El propio vendedor | Lee y escribe **lo suyo** |
| Dueño y Administrador | **Nada.** Ni lectura |
| Vendedor padre del equipo | **Nada.** Ni lectura |
| Cualquier otro vendedor | **Nada** |
| `anon` | **Nada**, ningún privilegio sobre ninguna de las tres tablas que existen (ni sobre las dos de push, cuando existan) |
| `service_role` | Sí: lo necesita el proceso. **Nunca llega al navegador** (`import 'server-only'`) |

#### Por qué NO puede ser una columna de `memberships`

§4.14 lo dejó escrito al cerrar D-176, antes de que existiera este encargo: `memberships_select` deja
leer la fila **al personal de la organización y al vendedor padre**, que es exactamente el alcance que
ya tenía `public_whatsapp_number` desde `0043`. Para un enlace de invitación a un grupo eso era
aceptable y estaba dicho. **Para una cuenta bancaria con el nombre de su titular, no.**

Una columna más en `memberships` publicaría el dato a tres roles el mismo día en que se aplicara la
migración, **sin que ninguna política cambiara** y sin que nada en la pantalla lo delatara. Por eso
son tablas nuevas con política propia (BR-M01).

#### El patrón, y por qué es el mismo de siempre

* **Una política, y es de `SELECT`**: `seller_id = (select current_profile_id())`, con RLS **forzada**
  (`force row level security`) en las dos tablas. Entre paréntesis, no la llamada suelta: se evalúa
  una vez por consulta y no una por fila (I-019, D-063).
* **No hay política de INSERT, ni de UPDATE, ni de DELETE, y `authenticated` solo tiene `SELECT`.**
  Se comprobó con una sesión real: los tres verbos directos devuelven `42501 permission denied`. Es
  más fuerte que acotar la escritura con una política, porque hace que las RPC sean la **única**
  puerta y que el tope, el orden y la bitácora sean inevitables en vez de ser cosas que la pantalla
  se acuerda de hacer.
* **La escritura real pasa por RPC `SECURITY DEFINER` que no reciben identificador de vendedor.** El
  perfil sale de `auth.uid()`, así que **no existe el dato que alguien pudiera manipular** para
  configurar a otro. Es la lección de `set_seller_whatsapp_settings`: lo que la hace segura no es una
  comprobación, es la firma.
* **`has_org_role(org, 'seller')`** en cada RPC, que comprueba de una vez el rol y que la membresía,
  el perfil y la organización sigan activos (BR-A04). Una cuenta desactivada no configura nada — y
  **tampoco se le procesan los recordatorios** (BR-S13), que es la mitad que se olvida.
* **Sin `DELETE`** en ninguna de las tablas de configuración: ni política ni privilegio (D-038). Se
  archiva. Las dos excepciones futuras son operativas y acotadas: `push_subscriptions`, que la
  persona puede quitar de su dispositivo, y la poda de la outbox, que son datos de transporte.
* **Auditoría.** Crear, editar y archivar una cuenta o un recordatorio se anota con
  `write_audit_log`, **sin copiar el número de la cuenta en `old_values`/`new_values`**: `audit_logs`
  lo consulta el personal entero (BR-D04), así que volcar ahí el dato desharía el aislamiento por la
  puerta de atrás. Se anota **qué cambió** —tipo, etiqueta, horario, estado—, y **no** el número, ni
  el titular, ni el mensaje. Hay una prueba que lee la última fila de la bitácora y falla si
  aparecen.
* **Cinco auxiliares que ninguna sesión ejecuta:** `require_seller_org()`, `next_reminder_run_at()`,
  `max_active_payment_reminders()` y, desde `0052`, `payment_reminder_grace()` y el propio motor. `REVOKE` explícito de `public` y `anon`, y **sin `GRANT` a
  `authenticated`** — PostgreSQL concede `EXECUTE` a PUBLIC en cada función nueva y las *default
  privileges* de `0015`/`0032` no alcanzan a lo que se cree después (I-020, I-078).

#### Lo que toca el proceso del cron — **`0052`, comprobado** (D-189)

`process_due_payment_reminders()` es `SECURITY DEFINER` y **no la ejecuta nadie con sesión**: está
revocada de `public` y `anon`, **no** se le concede a `authenticated`, y solo la llama el job de
`pg_cron`. Dejarla abierta permitiría a cualquiera con una cuenta forzar el procesamiento de toda la
base desde el navegador, tantas veces como quisiera; lo vigilan **dos** comprobaciones,
`catalog.test.ts` y `verify-remote.ts`, porque este es justo el privilegio que Supabase concede
distinto en el proyecto real que en local (I-078).

Escribe ocurrencias y avisos —las filas de outbox serán la Etapa 5— y **no lee ni una cuenta
bancaria**, porque no le hace falta: el mensaje se compone después, en la pantalla del vendedor
(BR-S08).

**La tercera tabla, `payment_reminder_occurrences`, repite el patrón exacto**: RLS forzada, **una
sola política y de `SELECT`**, `authenticated` con **solo `SELECT`**, y la única escritura desde una
sesión es `mark_reminder_occurrence_attended(id)`, que no recibe identificador de vendedor. Su
bitácora anota **solo el instante programado**, ningún dato de cobro.

**El esquema `cron` no es accesible desde una sesión**: ni `authenticated` ni `anon` tienen `usage`
sobre él. Hay una prueba que lo comprueba, porque la extensión la crea la migración y un privilegio
por defecto distinto en el proyecto real no se vería de ninguna otra forma.

#### Privacidad del push — **Etapas 4 y 5, todavía no existe**

El cuerpo que sale hacia el servicio de push es **genérico** (BR-V05). No lleva cuentas, ni números,
ni el mensaje personalizado, ni clientes, ni importes. La razón es la misma que impide al service
worker guardar el HTML de una pantalla (D-116): **dos vendedores compartiendo un teléfono no es un
caso raro aquí, es el caso normal**, y una notificación se lee en la pantalla bloqueada sin
desbloquear nada.

#### Superficie externa nueva, dicha con precisión

Hoy el servidor solo habla hacia afuera con las seis fuentes de loterías (§*Fuentes alternativas*).
Con esto aparece **una segunda**: el servicio de push del navegador (`*.push.services.mozilla.com`,
`fcm.googleapis.com`, `*.notify.windows.com` — la dirección la da **la propia suscripción**, no se
configura).

Tres consecuencias que hay que sostener al implementar:

1. **La CSP no se toca.** Al servicio de push lo llama el **servidor**, no el navegador. Sin Firebase
   no hay que abrir `connect-src` ni `script-src` a nada (D-187).
2. **El endpoint viene del navegador**, así que es entrada no confiable: se guarda, se usa para
   `POST` y **nunca** se interpola en otra cosa. Se acota por esquema `https` y se trata como opaco.
3. **Las claves VAPID son secretos de servidor.** `VAPID_PRIVATE_KEY` no sale del proceso ni aparece
   en el paquete del navegador; la pública sí viaja, que es su función. Van en `.env.example` y en
   `check:env` **cuando se implementen** (§7).

### 4.16 Suscripciones Web Push (`0053`, BR-V04..BR-V06, D-190)

> **IMPLEMENTADO EN LA BASE el 2026-09-12** (Etapa 4), verificado **en local** con 20 pruebas. **No
> aplicado al proyecto real**: eso es la Etapa 7. **El envío no existe**: es la Etapa 5.

**Qué se guarda, y por qué importa.** `endpoint`, `p256dh` y `auth` son lo único que hace falta para
cifrarle un mensaje a un dispositivo (RFC 8291). Quien los tenga puede mandarle notificaciones, si
además firma con la clave VAPID a la que la suscripción está atada. Se tratan en consecuencia:

| Quién | Qué ve |
|---|---|
| La propia persona | **Solo sus filas**, por RLS. La pantalla lee **únicamente el endpoint**, nunca las claves |
| Cualquier otra persona, incluido el personal | **Nada.** No es una decisión de producto sino de higiene: la lista de dispositivos de alguien, con su `user_agent`, dice desde dónde y con qué se conecta |
| `anon` | **Nada**, ningún privilegio sobre la tabla |
| `service_role` | Sí: lo necesitará el despachador. Nunca llega al navegador (`server-only`) |
| La bitácora | **Ni el endpoint ni las claves.** `audit_logs` la lee el personal entero (BR-D04), así que se anota que se activó y en qué fila, y nada más. Hay una prueba que busca `fcm.googleapis.com` en toda la bitácora y exige cero |

**El patrón es el de siempre**: RLS `enable` + `force`, **una sola política y de `SELECT`**,
`authenticated` con **solo `SELECT`**, y las dos RPC `SECURITY DEFINER` **sin identificador de
persona** como única puerta de escritura.

**El borrado real está acotado a esta tabla y ocurre dentro de la función.** Es una de las dos
excepciones a D-038 que §4.15 ya había anticipado; `authenticated` sigue sin privilegio de `DELETE` y
no hay ninguna política de `DELETE`, así que las dos comprobaciones de catálogo que lo vigilan siguen
en verde.

**Las claves VAPID no están en la base.** La pública viaja al navegador —es su función— y la privada
es de servidor, **no lleva el prefijo `NEXT_PUBLIC_`** y todavía no la lee nadie: llega con el
despachador de la Etapa 5. Se generan con `npm run vapid`, que **no escribe ningún archivo**.

#### Lo que queda abierto, dicho antes de que lo descubra alguien

**Cerrar sesión NO quita la suscripción de ese dispositivo** (D-190, Decisión 10). En un teléfono
compartido, quien cerró sesión sigue recibiendo sus avisos ahí hasta que otra persona active los
suyos. Tres cosas lo acotan y ninguna lo elimina:

* el aviso es **genérico** y no dice nada (BR-V05): ni cuentas, ni importes, ni nombres;
* tocarlo abre la aplicación, donde manda la sesión de quien esté dentro;
* y **activar desde la otra cuenta reasigna** la fila, porque el endpoint es único.

Cambiar el cierre de sesión para que además desuscriba está fuera del alcance de la Etapa 4 y toca
un camino que nadie pidió tocar. Queda escrito aquí para que sea una decisión y no un hallazgo.

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

### 5.2 El dispatcher de Web Push — **PLANIFICADO** (BR-V08, D-187)

> ⚠️ **NO EXISTE TODAVÍA.** Autorizado el 2026-09-11, se construye en la Etapa 5.

`POST /api/push/dispatch` vacía la cola `push_outbox`. **No usa sesión** y vive **fuera de
`(protected)`**, porque un Route Handler **no hereda la guarda de su layout** (§5.0, D-060): la
comprobación va dentro.

**No se inventa un patrón nuevo: se reutiliza el de `/api/lottery/sync`** (D-148, BR-L21), que ya
está escrito, probado y en producción.

| Propiedad | Qué impide |
|---|---|
| Secreto **por cabecera** (`Authorization: Bearer` o cabecera propia) | Que el secreto quede en registros de acceso, historiales y referers. **Nunca por query string** |
| Comparación a **tiempo constante**, sobre el hash del valor | Deducir el secreto midiendo, y filtrar su longitud |
| **Longitud mínima** y **fallo cerrado** sin secreto configurado | Que un despliegue mal configurado deje la ruta abierta. Sin secreto **no funciona**, no «funciona sin comprobar» |
| **Limitación de intentos por IP** (`checkRateLimit`) | Probar secretos a fuerza bruta |
| El proxy **deja pasar la ruta** | Que redirija a `/login` con 307 y el proceso nunca llegue a autenticarse |

**Qué puede hacer si alguien lo dispara con el secreto correcto:** vaciar la cola. Nada más. No
recibe destinatarios, ni contenido, ni endpoints: los toma de la outbox, que solo escribe el proceso
del cron. **Un lote con `for update skip locked`**, de modo que dos disparos simultáneos no envían el
mismo aviso dos veces.

**Quién lo despierta.** Un segundo job de `pg_cron` mediante `pg_net`. Si ese toque falla, no se
pierde nada: la outbox es la que manda y el siguiente toque recoge lo pendiente (BR-V02).

**El fallo del envío no es un fallo de seguridad, pero sí de higiene:** un `404` o un `410` significa
suscripción muerta y se **revoca sin reintentar** (BR-V07). Guardar endpoints muertos es acumular
direcciones de dispositivos que ya no son de nadie.

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
| `ticket.reassign_client` | `ticket` | RPC (`reassign_ticket_client`, `0047`, D-168). Cliente anterior y nuevo, vendedor, estado, precio, fecha de venta y **motivo**. La `ticket.update` automática de la fila se conserva |
| `ticket.release_client` | `ticket` | RPC (`release_ticket_client`, `0048`, D-169). Cliente, estado, precio, precio base, fecha de venta, `assigned_at` y los dos números **anteriores**, y el **motivo**. La `ticket.update` automática de la fila se conserva |
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
| T18 | **Abono de $0 registrado saltándose la RPC** | `authenticated` tiene `INSERT` sobre `payments` y `payment_allocations` (`0010`), así que un `POST` directo a PostgREST podría crear un pago de $0 desde que D-158 relajó los `CHECK` de fila a `>= 0` | Disparadores `BEFORE INSERT` `payments_insert_positive` y `payment_allocations_insert_positive` (`0042`): el `> 0` de BR-F03 lo sigue garantizando **la base** en el alta, y el cero solo entra por `update_payment_allocation` al corregir | `tests/db/payment-update.test.ts` › «tampoco por INSERT directo: el disparador de alta lo impide» |

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
