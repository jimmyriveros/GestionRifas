# SEGURIDAD

- **Versión:** 2.28 · **Estado:** implementado · **Actualizado:** 2026-09-19, más tarde (**§4.15**: `0073` y `0074`
  **en producción**, con su autocomprobación y `verify:remote` 46/46). Antes, ese mismo día (**§4.15**, Bre-B y «Otros» —D-209,
  `0073` y `0074`, **solo en local**—: las dos RPC de cuentas que escriben cambian de firma y conservan su matriz,
  dos funciones internas de la regla solo para `service_role`, una migración que comprueba sus propios privilegios y
  el ensayo con el privilegio por defecto de producción). Antes, el 2026-09-18 (**§4.24**, Etapa 3 del historial —la auditoría, D-208, **solo en local**—: la matriz de acceso medida por PostgREST con nueve personas, lo ajeno respondiendo como lo inexistente, la `0070` —el personal elige a quien ya no vende, sin cliente— la `0071` —`anon` obtenía el inicio operativo por un plan reutilizado, I-141— y la `0072` —con el privilegio por defecto del proyecto alojado, `current_seller_org_ids()` habría nacido ejecutable por `service_role`, I-143—). Antes, ese mismo día (**§4.24**, Etapa 2 del historial —D-208, `0069`, **solo en local**—: las pantallas leen con la sesión por las cuatro funciones, el personal no recibe ni envía un dato de cliente y la `0069` no cambia ningún privilegio). Antes, ese mismo día (**§4.24**: el **historial de premios ganados** —`0067`, D-208, **solo en local**—: ninguna lectura recibe alcance, el personal no ve datos de cliente ni toca `clients`, el vendedor solo ve lo suyo **sin equipo**, la tabla nueva concede solo `SELECT` y su única puerta es de la service role, las 10 funciones están clasificadas con su matriz exacta (I-132), y los números de una boleta con coincidencias no cambian por ninguna vía (BR-I16). Antes, ese mismo día, **§4.23**: la `0066` —D-207,
  I-132— fija quién ejecuta cada una de las 62 funciones de premios configurables: el proyecto alojado concede
  EXECUTE a `service_role` en toda función nueva y la pila local no, y el preflight de la Puerta 1 lo vio antes
  de escribir nada. Solo dos entradas de la service role —`transition_raffle_prize_mode` y
  `confirm_lottery_result`—, seis RPC de sesión, la proyección de D-198 y **53 internas que no ejecuta nadie**;
  `match_lottery_result` pasa a interno). Antes, el 2026-09-16 (**§4.22**: la `0065`
  —D-206 corregida— hace que el aviso de las fechas llegue también a quien las cambia, **sin tocar
  privilegios**, y el actor sigue saliendo solo de la sesión: la extensión real se hace con la sesión del
  Dueño, nunca con SQL sin sesión, una RPC que reciba el actor ni la service role con sus `claims`). Antes,
  ese mismo día (**§4.22**: la `0064`
  —D-206— añade la frontera del instante efectivo y el aviso de las fechas de una rifa activa: **seis
  piezas internas más, ninguna ejecutable por nadie**, el motor espera a una transición en curso y no
  mezcla sistemas, y el aviso no lleva nada de la cartera). Antes, ese mismo día (**§4.22**: la
  transición de una rifa existente —`0063`, D-204—: una función solo para la service role, una puerta
  que no se puede forjar y ninguna vía nueva hacia la cartera). Antes, ese mismo día (§4.21: la `0062` añade
  una pieza interna más, `raffle_prize_draw_cutoff`, **sin cambiar la superficie**). Antes, ese mismo
  día (**§4.21**: el motor de
  premios configurables —`0061`, D-203—: la superficie interna no crece, los enlaces a premios solo se
  leen y los lee quien lee la fotografía). Antes, ese mismo día (§4.20: el resolvedor
  central de capacidades y el origen cerrado de «Editar rifa», corrección de D-202, sin migración)
- **§4.19** describe **la cartera del vendedor fuera del alcance del personal** (`0057`, D-198,
  BR-Q01..BR-Q10): el Dueño y el Administrador ya no leen clientes, precios, abonos, saldos, pagos ni
  ganancias por ninguna vía, y lo que administran les llega por siete proyecciones de lista blanca.
  🚀 **En producción desde el 2026-09-15**: `0057` aplicada al proyecto real, con `46b7cf0`.
- **§4.18** describe **el mensaje propio de «Resultados de la semana»** (`0056`, D-197): la segunda
  escritura de `memberships` que hace un vendedor, con la forma de la primera y en su propio dominio.
  **Aplicada al proyecto real el 2026-09-13**: `verify:remote` 24/24 y la función cerrada a `anon` y a
  `PUBLIC`, comprobado en el catálogo de la base.
- **§4.15** describe el aislamiento de las cuentas de cobro, los recordatorios y **el motor que los
  dispara**, implementado en las migraciones **`0051`** (Etapa 1) y **`0052`** (Etapa 3, D-189) y
  verificado en local; su última parte —Web Push— sigue siendo diseño y lo dice. **§5.2**
  (dispatcher de Web Push) es **planificada**, Etapa 5.
- **§4.16** describe las **suscripciones Web Push** (`0053`, Etapa 4, D-190): de una persona, un
  dispositivo por fila y con las claves fuera del alcance de cualquier sesión.
- **§4.17** describe **la cola de avisos y su despachador** (`0054`, Etapa 5, D-191): una tabla que
  no lee nadie con sesión, un Route Handler que falla cerrado y un cifrado propio comprobado contra
  los vectores del RFC.
- **§4.20** describe **los premios configurables por rifa y la capacidad central** (`0058`, `0059`
  y `0060`; D-199 a D-202; BR-J01..BR-J16): **cuatro** tablas sin escritura directa, seis RPC
  autorizadas por `raffles.prizes.manage`, un resolvedor de capacidades con espejo en la
  aplicación y la **puerta acotada** para que una rifa nueva nazca configurable.
  ✅ Las tres están **en el proyecto real desde el 2026-09-17** —`0058`–`0066`, puerta 1 de `RUNBOOK` §8—, con
  `verify:remote` **41/41**.
- ✅ `0051`, `0052`, `0053`, `0054` y `0055` están **en el proyecto real desde el 2026-09-12**
  (Etapa 7, D-193), con `verify:remote` 24/24.
- **Estado:** las políticas y sus refuerzos viven en las migraciones `0005`, `0011`, `0014`,
  `0015`, `0016`, `0019`, `0020`, `0021`, `0036`, `0037`, `0038`, `0039`, `0042`, `0043`, `0044` y
  `0057`; los privilegios base se fijan en `0009`/`0010`.
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
| Política `payments_update_staff` con `voided_at is null` en `USING` | Un pago anulado deja de ser actualizable: la anulación es irreversible por RLS (D-013). **Retirada en `0057` (D-198)**: ninguna sesión actualiza `payments` directamente, y `void_payment` quedó sin `EXECUTE` para `authenticated` (§4.19) |
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
| **Premios configurables** (`0058` + `0059` + `0060`, §4.20) |
| Crear, editar, archivar, restaurar y reordenar premios — por la **capacidad** `raffles.prizes.manage`, no por el rol (BR-J10) | ✓ | ✓ | ✗ |
| Ver los premios de las rifas de su organización | ✓ | ✓ | ✓ (lectura) |
| Ver el historial de un premio (BR-J12) | ✓ | ✓ | ✗ |
| Crear una rifa **nueva** con premios configurables (BR-J13, D-202) | ✓ | ✓ | ✗ — y solo con la capacidad, no por ser personal |
| Cambiar el sistema de premios de una rifa **que ya existe** (`prize_mode`, BR-J13) | ✗ | ✗ | ✗ — **ninguna sesión** |
| **Boletas** |
| Ver todas las boletas de la organización — **sin cliente, precio ni cobros**, por las proyecciones de §4.19 | ✓ | ✓ | ✗ |
| Ver boletas propias | ✓ | ✓ | P |
| Ver el cliente, el precio de venta, lo abonado y el saldo de una boleta (BR-Q01) | ✗ | ✗ | P |
| Crear boletas (individual y masiva) | ✓ | ✓ | P, solo si `allow_seller_ticket_creation` |
| Editar números de una boleta | ✓ | ✓ | P, solo en `draft`/`pending_approval` |
| Aprobar boletas | ✓ | ✓ | ✗ |
| Anular boletas **sin vender** (BR-Q07) | ✓ | ✓ | ✗ |
| Asignar boleta a un vendedor | ✓ | ✓ | ✗ |
| Asignar boleta a un cliente, corregir su precio, cambiar o liberar su cliente (BR-Q06) | ✗ | ✗ | P |
| Importar boletas, **solo sin vender**: sin cliente y sin abono (BR-Q07) | ✓ | ✓ | P, solo si `allow_seller_ticket_creation` |
| **Eliminar boletas físicamente** (solo sin cliente, sin venta y sin abonos — BR-B05) | ✓ | ✓ | ✗ |
| Seleccionar varias boletas y actuar sobre todas (BR-B01) | ✓ | ✓ | P, solo asignar a un cliente |
| **Clientes** |
| Ver todos los clientes de la organización | ✗ | ✗ | ✗ |
| Ver / crear / editar clientes (BR-Q06) | ✗ | ✗ | P |
| Archivar clientes | ✗ | ✗ | P |
| Eliminar clientes físicamente | ✗ | ✗ | ✗ |
| **Pagos** |
| Ver todos los pagos de la organización | ✗ | ✗ | ✗ |
| Registrar pagos | ✗ | ✗ | P |
| Corregir el valor de un abono vigente, **cero incluido** (BR-F16, BR-F17, D-158) | ✗ | ✗ | P |
| Anular pagos — **suspendida**: `void_payment` sin `EXECUTE` para las sesiones (BR-Q06) | ✗ | ✗ | ✗ |
| Eliminar pagos físicamente | ✗ | ✗ | ✗ |
| **Reportes y auditoría** |
| Reportes globales — **solo recuentos de boletas**, sin dinero ni clientes (BR-Q08) | ✓ | ✓ | ✗ |
| Reportes de dinero y cartera: ventas, recaudo, saldos, clientes y pagos (BR-Q08) | ✗ | ✗ | P |
| Ver la ganancia y los movimientos de comisión de un vendedor (BR-G12, BR-Q08) | ✗ | ✗ | P (y el vendedor padre, la de su equipo) |
| Ver auditoría — redactada, por `admin_audit_log` (BR-Q10) | ✓ | ✓ | ✗ |
| **Resultados de loterías** |
| Ver programación y resultado oficiales | ✓ | ✓ | ✓ (lectura; son nacionales) |
| Ver coincidencias de la organización — **sin cliente**, por `admin_lottery_matches` (BR-Q09) | ✓ | ✓ | P (solo las de sus boletas) |
| Escribir programación, resultados o coincidencias | ✗ | ✗ | ✗ (proceso interno) |
| Ver «Resultados de la semana» y generar su imagen (BR-H05, §5.3) | ✗ | ✗ | P (con la rifa de su propio catálogo) |
| Configurar el mensaje de «Resultados de la semana» (BR-H10, §4.18) | ✗ | ✗ | P (solo el suyo) |

**Desde el 2026-09-14 (D-198, §4.19) el Dueño y el Administrador administran el inventario, no la
venta.** Las filas de clientes, pagos, venta y dinero cambiaron de `✓` a `✗` para los dos, y no es una
restricción de pantalla: las políticas de esas tablas son solo del vendedor. Volver a concederlas es
una migración nueva y el procedimiento de D-198.

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

⚠️ **Y la misma trampa, con `service_role` (I-132).** D-128 dejó en el privilegio por defecto
`{postgres=X, service_role=X}`: en producción **toda función nueva nace ejecutable por la service
role**, y en local no. Para las funciones de premios configurables la `0066` escribe la lista exacta
(§4.23). **Regla para una función nueva:** `revoke execute … from public, anon, authenticated,
service_role` y un `grant` explícito **solo** al rol que la llama de verdad; lo demás no lo ejecuta
nadie. El privilegio por defecto no se tocó: queda para la auditoría de I-132.

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

`tickets_select` **no se toca**. `match_lottery_result` es `SECURITY DEFINER` y solo tenía `EXECUTE`
para `service_role`; **desde la `0066` (D-207) no lo ejecuta nadie directamente**: lo alcanza
`confirm_lottery_result`. `lottery_sync_runs` tiene RLS forzada y **cero** políticas: una sesión recibe
cero filas, no un error de privilegio.

Las políticas usan conjuntos precalculados (I-019). Un `UPDATE` del número mayor confirmado no lo
cambia: el disparador deja `conflict`. Las coincidencias no se actualizan ni se borran, tampoco con
`service_role`. **Desde la `0061`** las de una rifa configurable llevan su premio en
`lottery_ticket_match_prizes`, con la misma lectura que la fotografía y ninguna escritura (§4.21).

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

`set_seller_whatsapp_settings(text, boolean, text)` es **una de las dos únicas escrituras de
`memberships` que hace alguien que no es personal** —la otra, desde `0056`, es la del mensaje de
«Resultados de la semana» (§4.18)—, y por eso merece leerse entera antes de tocarla.

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

#### Bre-B y «Otros» — **`0073` y `0074`, en producción desde el 2026-09-19** (D-209, BR-M10)

> **Promovidas el 2026-09-19 a las 17:53 UTC.** La autocomprobación de la `0074` no abortó —la matriz de `EXECUTE`
> cuadró también con los privilegios del proyecto alojado— y `verify:remote` dio **46/46**, con sus dos comprobaciones
> en verde (`TEST_RESULTS`, «la promoción de Bre-B y «Otros»»). Lo de abajo describe el diseño y sigue vigente.

Dos formas más, **con el mismo aislamiento y la misma puerta**: la tabla sigue con una sola política —de
`SELECT`— y `authenticated` sigue con solo `SELECT`; las dos RPC que escriben siguen sin recibir
identificador de vendedor. Lo nuevo, y lo que hay que saber antes de tocarlo:

* **Las dos RPC cambian de firma** (`p_identifier`, opcional y al final) y se **borran y se crean** en la
  misma transacción. Conservan su matriz —`authenticated` y `service_role`, nunca PUBLIC ni `anon`— y la
  `0074` **se comprueba a sí misma** al aplicarse: si el EXECUTE efectivo de las cinco RPC de cuentas o de
  las dos funciones nuevas no es el de la lista, o si queda la firma antigua como sobrecarga, falla y no deja
  nada (el patrón de la `0066` y la `0072`).
* **Las dos funciones de la regla** —`payment_account_identifier_trim` y
  `payment_account_identifier_problem`— son internas: **solo `service_role`** las ejecuta, revocadas por
  nombre a PUBLIC, `anon` y `authenticated`. La service role sí, y no por comodidad: los CHECK las llaman y
  se evalúan con los privilegios de quien escribe, y la service role tiene `grant all` sobre la tabla desde
  la `0051`. No le dan ningún poder que no tuviera. Una sesión no puede llamarlas ni por PostgREST (MI-29).
* **Ensayado con el privilegio por defecto del proyecto alojado** (I-132, I-143; «escenario B»): las 242
  funciones del esquema salen con los mismos permisos que en la reconstrucción desde cero, y
  `verify-remote` contra esa base local da 44/44. No depende del privilegio por defecto de ningún entorno.
* **La bitácora sigue sin guardar el dato**: ni la llave, ni el identificador, ni el titular (prueba
  MI-24).
* **Duplicados y concurrencia**: el índice único decide. Dos peticiones simultáneas con la misma llave no
  pueden entrar las dos —la segunda espera y falla con `23505`—, comprobado con dos transacciones reales.

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

#### Privacidad del push — **implementado** (etapas 4 y 5, `0053` y `0054`)

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

### 4.17 La cola de avisos y su despachador (`0054`, BR-V02, BR-V03, BR-V07, BR-V08, D-191)

> **IMPLEMENTADO el 2026-09-12** (Etapa 5), verificado **en local** con 39 pruebas de base de datos
> y 36 unitarias. **No aplicado al proyecto real**: eso es la Etapa 7.

#### `push_outbox` no la lee nadie con sesión

Es la primera tabla del producto **sin ningún privilegio** para `authenticated`. Es transporte: dice
qué avisos están saliendo y con qué error, y quien quiera saber si tiene uno mira la campana.

**Y hay un detalle del entorno que costó una prueba en rojo descubrir.** El esquema `public` tiene
un privilegio **por defecto** que concede `SELECT` a `authenticated` sobre **cada tabla nueva**:

```
postgres=arwdDxtm/postgres, authenticated=r/postgres, service_role=arwdDxtm/postgres
```

Es decir: **una tabla creada sin decir nada nace legible por cualquiera con sesión.** Aquí no se
filtró ningún dato —la RLS está activada y esa tabla no tiene ninguna política, así que devuelve
cero filas—, pero «sin privilegios» tiene que estar **escrito**, no supuesto. Por eso la `0054`
lleva un `revoke all ... from authenticated, anon` explícito y `verify:remote` lo comprueba en el
proyecto real. **Es exactamente la familia de I-020 e I-078**: lo que Supabase concede solo, y de
forma distinta en cada entorno.

#### El despachador falla cerrado (BR-V08)

`POST /api/push/dispatch` **reutiliza el patrón de `/api/lottery/sync`** (D-148), no uno nuevo:

| Defensa | Cómo |
|---|---|
| Secreto **por cabecera, nunca por la URL** | Una query string acaba en los registros del servidor, del proxy y en el historial |
| Comparación a **tiempo constante** | `secretsEqual`, sobre el hash, para no filtrar ni la longitud |
| Longitud mínima | 16 caracteres; uno más corto es como no tener ninguno |
| **Falla cerrado** | Sin secreto configurado no autoriza a nadie |
| Limitación de intentos | Con **cupo propio**: un goteo contra esta puerta no puede cerrar la de loterías |
| Sin sesión | Un Route Handler **no hereda la guarda de su layout** (D-060). Tener sesión —aunque sea la del Dueño— no sustituye al secreto |

**No acepta nada de quien llama.** Ni destinatarios, ni identificadores, ni cuerpos: lo único que
hace es vaciar la cola que ya está escrita. Un despachador que aceptara «a quién enviar» sería una
forma de mandar notificaciones a cualquiera. **Y no devuelve nada de nadie**: el resumen son
recuentos.

#### Las claves, y qué sale hacia afuera

`VAPID_PRIVATE_KEY` **no lleva el prefijo `NEXT_PUBLIC_`** y no sale del proceso. La pública sí
viaja, que es su función. **Sin las dos, el despachador no envía y no toca la cola** — así, el día
que se configuren, sale lo que estaba esperando.

La superficie externa nueva es la que §4.15 anticipó: **el servicio de push del navegador**, cuya
dirección la da la propia suscripción y nunca se configura. **La CSP no se toca**, porque a ese
servicio lo llama el servidor y no la página.

Y el `pg_cron` que despierta al despachador guarda su URL y su secreto en el **Vault de Supabase**,
no en la migración —un archivo versionado— ni en una tabla en claro.

#### Lo que el cifrado garantiza, y lo que no

El cuerpo va cifrado con `aes128gcm` (RFC 8291) y **solo el dispositivo puede leerlo**: ni el
servicio de push ni nadie por el camino. Eso no es lo que protege la privacidad aquí — lo que la
protege es que **el aviso no dice nada** (BR-V05). El cifrado evita que un intermediario lea el
texto; que el texto no tenga nada que leer evita que lo lea quien mire la pantalla bloqueada.

### 4.18 El mensaje propio de «Resultados de la semana» (`0056`, BR-H09, BR-H10, D-197)

`set_seller_weekly_results_message(boolean, text)` es **la segunda escritura de `memberships` que hace
alguien que no es personal**, y copia la forma de la primera (§4.14) para otras dos columnas. No se
amplió aquella: son dominios distintos, y guardar uno no puede pisar el otro.

| Propiedad | Qué impide |
|---|---|
| **No tiene parámetro de vendedor, perfil, organización ni membresía** | Que alguien configure a otro. El perfil sale de `auth.uid()`; con un identificador colado en la petición, PostgREST no encuentra ninguna función (`WM-13`) |
| Escribe exactamente **dos columnas** de las filas de vendedor **de quien llama** | Que la RPC se convierta en un `UPDATE` general de `memberships` |
| `role = 'seller'` **y** `is_active` **y** `has_org_role(org, 'seller')` | Que la use el personal, o que una **cuenta desactivada** siga configurando (BR-A04). Un vendedor padre tampoco alcanza a un integrante: no hay forma de nombrarlo |
| Coherencia y longitud repetidas antes de los CHECK | Un mensaje propio vacío o de más de 1.000 caracteres, con una frase legible en vez del nombre de una restricción |
| `REVOKE` de `public` y `anon`; `GRANT` a `authenticated` y `service_role` | Que se ejecute sin sesión (§4.5, regla 2; D-128) |

**`memberships_update_staff` no se amplía**, y un `UPDATE` directo del vendedor sobre su propia fila
sigue afectando a cero filas (`WM-19`). La función entra en las **dos** listas blancas que §4.5 obliga
a tocar juntas —`tests/db/catalog.test.ts` y `scripts/verify-remote.ts`— y en sus comprobaciones
positivas.

**La auditoría ya estaba.** `audit_memberships` (0006) anota el cambio con quién lo hizo y sus valores
anterior y nuevo; guardar lo mismo otra vez no anota nada, porque el disparador descarta un `UPDATE`
sin cambios (`WM-21`). No se llama a `write_audit_log`.

**Quién puede LEER el texto.** `memberships_select` no cambia: su dueño, el personal de su organización
y su vendedor padre. Es el mismo alcance que ya tienen el enlace del grupo y el mensaje de invitación
(§4.14), y aquí es aceptable por lo mismo: es un texto hecho para publicarse en un grupo con todos sus
clientes. **No es sitio para nada privado.** Un vendedor ajeno a su equipo no lo ve (`WM-20`).

**Qué se guarda y qué no.** Solo el interruptor y el texto: ni la imagen, ni los resultados, ni el
mensaje compuesto, ni ninguna copia del predeterminado (BR-H08). **Sin superficie externa nueva**: no
hay integración con WhatsApp, ni cron, ni IA, ni dependencia.

**El texto es texto.** Se pinta en un `<textarea>` y en un nodo de texto con `whitespace-pre-wrap`,
nunca con `dangerouslySetInnerHTML`; una prueba pinta `<img onerror>`, `<b>` y `<script>` escritos en el
mensaje y comprueba que ninguno llega a ser un elemento. **La lectura de la pantalla no recibe
identificadores**: sale de la sesión, como `getWhatsappSettings`, y un fallo al leer no se trata como
«sin personalizar» —la pantalla no ofrece guardar encima de lo que no ha podido ver—.

### 4.19 La cartera del vendedor, fuera del alcance del personal (`0057`, BR-Q01..BR-Q10, D-198)

Hasta `0056` el Dueño y el Administrador leían **filas completas** de toda su organización en ocho
tablas. La RLS limita filas, no columnas: con esa lectura bastaban una sesión del personal y la clave
pública para sacar por PostgREST `client_id`, `sale_price`, `paid_amount`, los clientes y los pagos,
pintara lo que pintara la pantalla. **Por eso la restricción no se hizo en la interfaz.**

**Políticas.** El vendedor conserva exactamente la expresión que ya tenía; el personal pierde la suya.

| Tabla | Hasta `0056` | Desde `0057` |
|---|---|---|
| `tickets` | `SELECT` de toda la organización y `tickets_update_staff` | `SELECT` solo del vendedor; **sin** `UPDATE` del personal; `tickets_insert_staff` solo admite filas sin cliente, precio, precio base, fecha de venta ni `assigned_at` |
| `clients` | `SELECT`, `INSERT` y `UPDATE` del personal | Solo el vendedor; el alta exige además `has_org_role(…, 'seller')` |
| `payments` · `payment_allocations` | `SELECT`, `INSERT` y `payments_update_staff` | Solo el vendedor; `payments_update_staff` ya no existe |
| `audit_logs` | `audit_logs_select_staff` | **Ninguna política**: con FORCE RLS una sesión lee cero filas; entera, solo `service_role` |
| `lottery_ticket_matches` | Toda la organización | Solo el vendedor (la fotografía guarda `client_id`) |
| `seller_commissions` | Personal, vendedor y vendedor padre | Vendedor y vendedor padre |
| `commission_ledger` | Personal y vendedor | Vendedor |

**Las siete proyecciones.** Lo que el portal administrativo sí necesita llega por `admin_list_tickets`,
`admin_ticket_detail`, `admin_ticket_bulk_eligibility`, `admin_update_ticket_numbers`,
`admin_ticket_inventory`, `admin_lottery_matches` y `admin_audit_log` —el patrón de D-092—.

| Propiedad | Qué impide |
|---|---|
| `SECURITY DEFINER`, dueño `postgres`, `SET search_path = public, pg_temp` y sin SQL dinámico | Secuestro de `search_path` (T12) e inyección |
| La organización sale de `current_staff_org_ids()`; ningún parámetro recibe organización ni perfil | Leer otra organización enviando su identificador (T2) |
| La lista blanca está **en el `returns table`**: ni `client_id`, ni precio, ni precio base, ni abonado, ni saldo, ni `partial` | Que un campo sensible llegue al navegador aunque ninguna pantalla lo pinte |
| Estado de pago `paid`/`unpaid`, y `null` en una boleta sin vender; paz y salvo y fecha de venta, solo de una vendida | Deducir «Abonada», o que una anulada tuvo cliente |
| Un id ajeno o inexistente devuelve cero filas; otra organización, lo mismo | Enumeración (T15) |
| Búsqueda solo con `^[0-9]{1,4}$`; cualquier otro término devuelve cero filas **sin consultar** | Confirmar que un cliente existe buscando su nombre o su teléfono |
| `p_payment_state` fuera de `paid`/`unpaid` es un error; el filtro se aplica **antes** del recuento y la paginación | Que `total_count` o el tamaño de una página distingan «Abonada» de «Sin pagar» |
| `REVOKE` de `public` y `anon`; `GRANT` a `authenticated` y `service_role` | Ejecución sin sesión (§4.5, regla 2; D-128) |

**Canales laterales cerrados.**

| Canal | Cómo se cierra |
|---|---|
| RPC de venta y cobro llamadas por el personal | `assign_ticket_row`, `bulk_assign_tickets`, `create_payment`, `update_payment_allocation`, `update_ticket_sale_price`, `reassign_ticket_client`, `release_ticket_client` y `ticket_sale_price_limits` autorizan solo al vendedor, **con el mismo mensaje** que un id inexistente o de un vendedor ajeno |
| Anular una boleta vendida | `cancel_ticket_row` y `bulk_cancel_tickets` la rechazan antes de mirar los pagos, **con el mismo mensaje** para Sin pagar, Abonada y Pagada |
| La FK compuesta de `tickets.client_id` | Se comprueba sin RLS: por eso el alta del personal no admite `client_id` |
| Aviso `team.sale` | Al personal, sin `sale_price`; los históricos se limpiaron y `memberships_redact_staff_notifications` lo quita al ascender a alguien. El del vendedor padre lo conserva (D-092) |
| Bitácora | `admin_audit_log`: solo `ticket`, `raffle`, `membership` y `user`; sin `ticket.assign_client`, `ticket.bulk_assign`, `ticket.update_sale_price`, `ticket.reassign_client` ni `ticket.release_client`; claves de lista blanca por `admin_audit_redact`, y **sin la fila que se queda vacía**. `audit_row_change` ya registraba solo columnas cambiadas y sin `paid_amount` ni `payment_status`, así que un cambio de precio o de cliente no deja rastro visible |
| Vistas y funciones `security_invoker` | Heredan la RLS nueva: al personal `v_seller_summary`, `v_raffle_summary`, `v_client_balances`, `v_payment_history`, `v_ticket_balances`, `report_*`, `commission_summary`, `search_tickets` y `ticket_bulk_eligibility` le devuelven cero o nada |
| Importador | La vista previa y la Server Action rechazan cliente y abono en los dos portales; el servidor no consulta clientes por nombre para el personal |

**RPC dormidas.** `void_payment`, `match_ticket_import_clients` e `import_tickets_with_clients` quedan
**sin `EXECUTE` para `authenticated`** y con él para `service_role`; sus cuerpos no cambian y siguen
exigiendo una sesión del personal. Las piezas internas `admin_audit_redact` y
`memberships_redact_staff_notifications` no las ejecuta ninguna sesión. Las **dos** listas blancas de
§4.5 cambiaron juntas: `tests/db/catalog.test.ts` y `scripts/verify-remote.ts`, que suma tres
comprobaciones —RPC dormidas ejecutables desde una sesión (0), proyecciones para `authenticated` y no
para `anon` (7) y políticas sobre `audit_logs` (0)—.

**La aplicación.** `/owner/clients`, `/owner/clients/[clientId]` y `/owner/payments` no existen (404);
las Server Actions de clientes, pagos, asignación, precio, cambio y liberación de cliente llaman a
`authorizeAction(['seller'])`; `/api/reports/export` toma el público de la membresía de la sesión y
nunca de la petición; los tipos de `src/features/tickets/admin-queries.ts` no declaran ningún campo de
la cartera, y una prueba estructural (`tests/unit/admin-privacy.test.ts`) falla si el portal
administrativo vuelve a importar las lecturas del vendedor.

**Qué no cambia.** Ninguna tabla, columna, enumerado, disparador financiero ni restricción; ningún dato
se borra salvo la copia de `sale_price` de los avisos del personal. `service_role` lo sigue leyendo
todo, como siempre (seed, auditoría interna).

**Verificación.** `tests/db/admin-privacy.test.ts` —con sesiones reales del Dueño, del Administrador,
de dos vendedores y de otra organización— y `tests/e2e/privacidad-admin.spec.ts` y
`privacidad-admin-movil.spec.ts`, que comprueban que los valores sembrados como secreto **no aparecen**
en el HTML, en la carga RSC ni en las respuestas de red. ✅ **En producción desde el 2026-09-15**:
`0057` aplicada al proyecto real y `verify:remote` **27/27**.

### 4.20 Premios configurables y la capacidad central (`0058` + `0059` + `0060`; BR-J01..BR-J16; D-199 a D-202)

> ✅ **En producción desde el 2026-09-17:** `0058`–`0066` aplicadas y el código desplegado en `da81663`
> (puertas 1 a 3 de `RUNBOOK` §8), con `verify:remote` **41/41** y la matriz de privilegios comprobada.

**La autorización deja de preguntar por el rol.** Las seis RPC preguntan
`has_org_capability(org, 'raffles.prizes.manage')`, que comprueba la capacidad **y** que la
membresía, el perfil y la organización sigan activos (BR-A04). La política inicial: el **Dueño**
tiene todas las capacidades del catálogo, el **Administrador** recibe esta por compatibilidad y el
**Vendedor** ninguna. Una capacidad que no está en el catálogo es «no» **también para el Dueño**.

El espejo de la aplicación es la primera línea, nunca la única. **Un solo resolvedor**,
`hasCapability` (`src/lib/auth/capability-resolver.ts`), recibe la membresía completa y decide; lo
consultan la guarda `authorizeCapability` —que usan las seis acciones de premios y `createRaffle`,
esta además acotada al personal— y las páginas del proceso para no ofrecer lo que la base va a
rechazar. **Ocultar un botón no autoriza nada**: la acción se autoriza sola y la RPC o el disparador
vuelven a preguntar a `has_org_capability`. La política por rol de `capabilities.ts` solo la lee el
resolvedor, y una prueba estructural lo vigila (D-202, corrección del 2026-09-16). **Dos pruebas de
base de datos comparan la aplicación con PostgreSQL**: la política rol a rol (J1-06) y la resolución
con la membresía real del Dueño, del Administrador y de un vendedor (J1-08). Si alguien toca una
sola mitad, fallan.

**Por qué las tablas no admiten escritura directa.** Ninguna de las **cuatro** tiene política de
`INSERT`, `UPDATE` ni `DELETE`, y `authenticated` solo tiene `SELECT`. Así el tope de premios, la
versión nueva, la bitácora y el aviso **no se pueden saltar**: no son cosas que la pantalla se
acuerda de hacer, son el único camino. Es el patrón de `0051`. `raffle_prize_reward_options`
(`0059`) entra con las mismas reglas: RLS forzada, una política de `SELECT`, y `service_role` con
`SELECT, INSERT` y nada más.

| Superficie | Cómo se cierra |
|---|---|
| Una rifa de otra organización, o sin la capacidad | El **mismo** mensaje que una rifa que no existe: no se distingue «no existe» de «no es tuya» |
| El historial de un premio ajeno | `raffle_prize_history` devuelve **cero filas**, igual que para un id inexistente |
| Cambiar el sistema de premios de una rifa que ya existe | Un disparador lo rechaza para **cualquier sesión**, sin excepción (BR-J13) |
| Crear una rifa nueva en modo `configurable` | El mismo disparador la admite **solo con la capacidad** `raffles.prizes.manage` y **solo en borrador** (`0060`, D-202). La aplicación lo comprueba antes, con la guarda central y la misma frase, y la base es la que manda |
| Volver de «Editar rifa» a una dirección elegida por quien escribe la URL | `?from=` solo admite `prizes`; cualquier otro valor vuelve al detalle, y el destino se compone con el id de la rifa leída con RLS. **No hay redirección abierta** (D-202, corrección) |
| Leer o cambiar los premios sin la capacidad | La pantalla lo explica en vez de pintar el panel, `raffle_prize_history` devuelve cero filas y las seis RPC rechazan. La frontera real sigue siendo la base |
| Activar una rifa configurable sin configuración válida | El mismo disparador la valida **en PostgreSQL**, no en React |
| Dos personas editando el mismo premio | Control optimista con la versión vigente, más un cerrojo de aviso por rifa: la segunda recibe una frase que dice qué hacer |
| Reescribir una versión ya publicada, sus períodos o su recompensa | Imposible: disparadores de inmutabilidad, también con `service_role` |
| Dejar una versión con una recompensa que no cuadra —un «Premio único» con dos alternativas, o una elección con una sola— | **Dos** disparadores de restricción diferidos, uno por cada lado: al crear la versión y al añadir una opción después. Ni la service role puede |
| Publicar o activar una configuración con **dos premios que se cruzan** | `raffle_prize_version_problem` la rechaza nombrando los dos premios y el día (BR-J08). Se comprueba **en PostgreSQL**, también al activar la rifa y al restaurar un premio archivado |
| Las piezas internas y los disparadores | Sin `EXECUTE` para `authenticated` ni `anon` (I-078, I-020) |

**Lo que no toca.** Ninguna política, tabla o función de la cartera (D-198): un premio no lleva
cliente, precio de venta, abonos ni saldos, y una prueba comprueba que **ninguna función nueva**
devuelve una columna de esa lista. El aviso que se escribe en la campana tampoco.

### 4.21 El motor de premios configurables (`0061`; BR-J06, BR-J07, BR-J09; D-203)

> ✅ **En producción desde el 2026-09-17**, como §4.20. La rifa «SORTEO CAMIONETA KIA 2027» es configurable
> desde las **17:40:12.566 UTC** de ese día: el motor resuelve con premios configurables los sorteos cuyo
> corte llega después de ese instante, y con el sistema de siempre los 45 anteriores (D-206). Todavía no ha
> resuelto ninguno: el primero es el de Bogotá del 17/09, sin resultado confirmado.

> **Desde la `0066` (D-207, §4.23)** `match_lottery_result` tampoco es ejecutable por `service_role`: la
> única entrada del motor es `confirm_lottery_result`.

**La superficie no crece.** `match_lottery_result` y `confirm_lottery_result` son proceso interno:
**sin `EXECUTE` para `anon` ni `authenticated`**, igual que en `0036`–`0038`. Con `service_role` hay
que distinguir dos momentos:

| Momento | `match_lottery_result` | `confirm_lottery_result` |
|---|---|---|
| **Histórico, hasta la `0065`** | `EXECUTE` directo para `service_role` | `EXECUTE` directo para `service_role` |
| **Definitivo, desde la `0066`** (D-207, §4.23) | **Interna**: no la ejecuta directamente ningún rol de la API —ni PUBLIC, ni `anon`, ni `authenticated`, ni `service_role`—; solo se alcanza dentro de `confirm_lottery_result` | **Conserva** `EXECUTE` para `service_role`, y es la única entrada del motor |

Las piezas nuevas —`raffle_prize_versions_at`, `raffle_prize_draw_prizes` y los tres disparadores, y
desde la `0062` `raffle_prize_draw_cutoff`, el corte de un sorteo (D-203, Decisión 9)— tampoco son
ejecutables desde una sesión. La `0062` volvía a escribir el privilegio histórico de
`match_lottery_result` —`EXECUTE` directo solo para `service_role`, que la `0064` repitió— sin conceder
ninguno nuevo. **Ese permiso queda revocado y sustituido por la `0066`.** Tener la capacidad
`raffles.prizes.manage` **no da ninguna puerta** hacia las coincidencias: ni el Dueño, que tiene todas,
puede ejecutar el motor o escribir un enlace.

| Superficie | Cómo se cierra |
|---|---|
| Escribir un enlace a un premio desde una sesión | `lottery_ticket_match_prizes` no concede `INSERT`, `UPDATE` ni `DELETE` a nadie y no tiene políticas de escritura. **Tampoco la service role escribe**: solo lee. Escribe únicamente el motor (`SECURITY DEFINER`) |
| Modificar o borrar un enlace o una fotografía | Disparadores de inmutabilidad, **también** con la service role y con PostgreSQL directo |
| Un enlace entre organizaciones, rifas, sorteos o números | FK compuestas reales hacia la fotografía, el premio y la versión (§4.21 de `DATA_MODEL`). No depende de la aplicación ni del motor |
| Un enlace que miente sobre la versión, el número, el calendario o la prioridad | Disparador de sentencia que lo valida con las definiciones canónicas y con la prioridad por cliente. Una fotografía de una rifa configurable sin su premio también se rechaza |
| Leer los enlaces de otro vendedor | La política **pregunta a la fotografía**, y la RLS de esta se aplica dentro: el vendedor lee los enlaces de SUS coincidencias y nada más |
| Que el personal lea clientes a través de los enlaces | Un enlace no lleva cliente, y el personal no lee ni la fotografía ni sus enlaces (D-198). Su lectura sigue siendo `admin_lottery_matches`, **sin cambios** y sin cliente |
| Otra organización | `organization_id in current_org_ids()` y la RLS de la fotografía: cero filas |
| Un resultado con dos premios imposibles | El motor **falla entero**, sin escribir nada. El `detail` lleva identificadores de rifa, premios y sorteo, **nunca** datos de clientes, y lo lee solo el proceso interno |

**Lo que no toca.** La cartera (D-198): ni una política, tabla o proyección del personal cambia, y una
prueba comprueba que ninguna columna de la tabla nueva ni ningún retorno de las funciones nuevas
nombra clientes, precios, abonos, pagos, alternativas o recompensas.

### 4.22 La transición de una rifa existente (`0063`; BR-J13; D-204)

> ✅ **Ejecutada en producción el 2026-09-17** (puerta 3 de `RUNBOOK` §8): «SORTEO CAMIONETA KIA 2027» pasó a
> premios configurables con la transición `af9cdbe2-0d50-43db-b12a-42ded57b1cae`, huella
> `43880580…3557` e instante efectivo **17:40:12.566 UTC**. Es la **única** rifa convertida, y la vía sigue
> siendo el script con la clave de servicio, nunca la aplicación.

**La superficie crece en una sola función, y solo para la service role.**
`transition_raffle_prize_mode` es `SECURITY DEFINER` con `search_path` fijo; `EXECUTE` **solo** para
`service_role`, revocado a `public`, `anon` y `authenticated`, y además **rechaza cualquier
`auth.uid()`**: aunque alguien concediera `EXECUTE` por error, una sesión no la usaría. Las piezas
internas —`raffle_prize_transition_apply`, `_configuration`, `_pending_draws`,
`_played_occurrence`, `_open` y los dos espejos de texto— **no las ejecuta nadie**, ni la service
role. Tener `raffles.prizes.manage` **no da ninguna puerta**: el Dueño tampoco puede.

| Superficie | Cómo se cierra |
|---|---|
| Cambiar el modo de una rifa desde la aplicación | `raffles_guard_prize_config` sigue rechazando **cualquier sesión**, con cualquier rol; un vendedor, otra organización o un visitante ni siquiera ven la fila (RLS) |
| Cambiar el modo de una rifa **activa** con la service role y un `UPDATE` suelto | El disparador sigue exigiendo el **borrador** fuera de la puerta |
| Forjar la puerta | La puerta es una fila de `raffle_prize_transitions` con el `xact_id` de **esa** transacción. La tabla tiene RLS forzada **sin políticas** y **ningún privilegio** —tampoco para la service role—: solo la escribe la función. Es única por rifa, así que la puerta se abre **una vez**; una fila de otra transacción no abre nada |
| Usar la puerta para algo más que el modo | Por la puerta no se cambia a la vez estado ni fechas, y la configuración tiene que estar completa y sin problemas |
| Convertir la rifa equivocada | Se elige por identificador **y** se comprueban organización, nombre exacto, estado y fechas; un estado de otra organización responde como una rifa inexistente |
| Dejar la rifa a medias | Una transacción: cualquier fallo deshace premios, versiones, períodos, alternativas, modo, aviso y bitácora. Las comprobaciones diferidas se fuerzan antes de escribir la fila de la puerta |
| Duplicar premios con un reintento, o cambiar premios por esta vía | La huella de la configuración: igual, no escribe nada; distinta, se rechaza. Dos a la vez se serializan por el cerrojo de la fila de la rifa |
| Que un sorteo jugado se resuelva con el motor equivocado | **Desde la `0064` (D-206)** no se espera: cada transición guarda su **instante efectivo** y el motor decide rifa por rifa con **una** frontera (`raffle_prize_draw_mode`): corte hasta el instante, el sistema de siempre; posterior, los premios. La transición solo se niega con un sorteo de **corte desconocido** en una semana empezada, activa o en borrador. Antes, `0063` se negaba también con un sorteo jugado sin resultado confirmado (D-204, Decisión 4) |
| Resolver un sorteo con el sistema de siempre mientras su rifa está cambiando de sistema | `match_lottery_result` toma el cerrojo de configuración de **todas** las rifas del sorteo —también las heredadas— antes de decidir; la transición lo tiene tomado, y el motor espera a que termine (prueba T4-03) |
| Mezclar los dos sistemas en un resultado | El motor se niega a completar un resultado con fotografías de una rifa guardadas con el otro sistema, y las dos defensas usan la misma frontera: **ningún enlace** apunta a un sorteo del lado de siempre, venga de donde venga la escritura (T6-07, T6-08) |
| Cambiar las fechas de una rifa activa sin que nadie se entere, o avisar con datos de la cartera | `raffles_notify_dates_changed` avisa en la **misma transacción** a cada membresía activa —**también a quien lo hizo**, desde la `0065`— con la rifa y sus fechas y **nada** de clientes, ventas, pagos ni cartera; cada persona lee solo el suyo (RLS de `notifications`). Guardar las mismas fechas no avisa. La función es interna y el disparador la invoca con el dueño (BR-R12) |
| Atribuir el cambio de fechas a quien no lo hizo | El actor del aviso y de la bitácora es **`auth.uid()` de la sesión** que hace el `UPDATE`: no hay parámetro que lo diga ni RPC que lo reciba, y el disparador no se ejecuta aparte. Sin sesión queda «Sistema», no otra persona. Por eso la fecha real la cambia **el Dueño con su sesión** (`RUNBOOK` §8.3): el SQL sin sesión perdería quién fue, y fijar sus `claims` con la service role sería suplantarlo (D-206, corrección) |
| Filtrar la cartera | La transición no lee boletas, clientes ni pagos. El aviso lleva rifa, nombre, cambio y número de premios; la bitácora, premios, fechas y cifras de la transición: **ni clientes, ni pagos, ni saldos, ni precios de venta** (prueba T2-10) |
| Mensajes que exponen algo | Los errores nombran la rifa, fechas y loterías; el `detail` de los sorteos pendientes, fechas y loterías. Nada de clientes |
| Ejecutarla contra producción por accidente | Desde la Entrega 5 (D-205), `scripts/raffle-prize-transition.ts` consulta una **puerta pura** antes de resolver el destino: el destino se dice siempre (`--local` o `--production`, nunca los dos); con `--production` el destino resuelto tiene que ser **de verdad remoto** (`https`, `*.supabase.co`, sin `SUPABASE_TARGET=local`); y **aplicar** exige a la vez la huella de una **vista previa anterior** —que tiene que coincidir con la que el script repite justo antes—, `--apply` y el identificador de la rifa **escrito otra vez**. Una opción desconocida o repetida se rechaza. Por omisión es una vista previa. **Ningún identificador de producción vive en el código**, y el script no imprime claves ni la dirección completa del proyecto |
| Repetir a ciegas una transición cuya respuesta se perdió | Al aplicar, solo un rechazo de PostgreSQL (SQLSTATE fuera de la clase `08`) se da por «no se cambió nada». La red, un tiempo de espera o una pasarela se dicen **inciertos**, y el script manda a consultar el estado antes de repetir (`RUNBOOK` §8.4) |

**Lo que no toca.** Ni una política, proyección, tabla de la cartera ni privilegio existente cambia.
`raffles_guard_prize_config` conserva sus revocaciones.

**La `0064` (D-206) no amplía la superficie.** `raffle_prize_transition_draw_mode`,
`raffle_prize_draw_mode`, `raffle_prize_transition_window_draws`, `_check_window`, `_legacy_summary`,
`_played_occurrence(versión, instante)` y `raffles_notify_dates_changed` **no las ejecuta nadie**, ni la
service role (T1-05b y `verify:remote`); `raffle_prize_transition_pending_draws` desaparece. Solo la
frontera pura no es `SECURITY DEFINER`, porque no lee tablas. `effective_at` vive en una tabla sin
privilegios, y solo la escribe la transición; la migración la rellena con el disparador apartado **solo
para ese relleno**. Las pruebas lo trasladan como superusuario para simular fechas: nadie más puede.

**La `0065` (D-206, corrección) tampoco.** Reemplaza solo el cuerpo de `raffles_notify_dates_changed` —quita
la exclusión del actor— y repite sus revocaciones: sigue sin ejecutarla nadie, ni la service role, y
`verify:remote` comprueba además que el cuerpo vigente ya no excluye a quien hizo el cambio.

### 4.23 Quién ejecuta cada función de premios (`0066`; D-207; I-132)

> ✅ **En producción desde el 2026-09-17**, como §4.20–§4.22. La matriz de las 62 funciones se comprobó contra
> el proyecto real después de aplicar las migraciones y después de la transición: exacta las dos veces.

**El hallazgo, antes de escribir en producción.** El preflight de la Puerta 1 (2026-09-17) comparó, en
solo lectura, la estructura del proyecto real con la pila local en `0057`: el privilegio por defecto de
`postgres` para las funciones de `public` es `{postgres=X, service_role=X}` allí y `{postgres=X}` aquí.
Con `0058`–`0065` aplicadas, **35 funciones de la entrega** habrían quedado ejecutables por la service
role —casi todas internas y `SECURITY DEFINER`; entre ellas `raffle_prize_insert_version` y
`raffle_prize_notify`, que escriben versiones y avisos—. La Puerta 1 se suspendió sin escribir nada.

**La lista, una sola vez** (`scripts/prize-function-grants.ts`), para las 62 funciones que crean o
redefinen `0058`–`0065`:

| Clase | Funciones | PUBLIC | anon | authenticated | service_role |
|---|---|---|---|---|---|
| RPC del panel | Las seis de §4.20 | — | — | ✅ | — |
| Proyección de D-198 | `admin_audit_log` (redefinida) | — | — | ✅ | ✅ |
| Entradas de la service role | `transition_raffle_prize_mode` (el script, D-205) y `confirm_lottery_result` (el sincronizador, D-145) | — | — | — | ✅ |
| Internas | Las otras **53**: capacidades, calendario y validación, escritura de versiones, avisos y auditoría, el motor —**con `match_lottery_result`**— y sus defensas, disparadores y piezas de la transición | — | — | — | — |

| Superficie | Cómo se cierra |
|---|---|
| Llamar con la clave de servicio a una pieza que escribe (`raffle_prize_insert_version`, `raffle_prize_notify`…) | Sin `EXECUTE`: **42501**, por PostgreSQL y por la API (P2-01..P2-03) |
| Correr el motor sobre un resultado sin confirmarlo | `match_lottery_result` ya no es ejecutable por nadie; el sincronizador entra por `confirm_lottery_result` (P2-05, P3-02) |
| Usar las RPC del panel con la clave de servicio | Sin `EXECUTE` para `service_role`: autorizan por `auth.uid()` y no tienen uso sin sesión (P2-05) |
| Insertar períodos directamente con la service role | Sus CHECK llaman a funciones internas: falla. Toda escritura de premios pasa por las RPC o por la transición |
| Que el privilegio por defecto vuelva a abrir una función | La `0066` **se comprueba a sí misma** —si el EXECUTE efectivo de alguna de las 62 no es exactamente el de la lista, o aparece una sobrecarga sin clasificar, falla y no deja nada— y `verify:remote` corre tres comprobaciones con la misma lista, que fallan si reaparece **cualquiera** de los 35 (P1-04, P1-05) |
| Que el catálogo dependa del entorno | La cadena desde `0057` se probó con los privilegios por defecto locales y con los de producción: **las 62 funciones, las seis tablas y sus políticas quedan idénticas** (`TEST_RESULTS`) |

**Por qué las internas pueden no tener a nadie.** Las llaman funciones `SECURITY DEFINER` —que
corren con los privilegios de su dueño—, los disparadores no comprueban `EXECUTE` al dispararse y los
CHECK de los períodos se evalúan dentro de `raffle_prize_insert_version`. Ninguna política de RLS usa
una función de la entrega.

**Lo que no toca, y queda en I-132.** El privilegio por defecto del esquema; las **50 funciones
anteriores a la entrega** que en producción tienen `EXECUTE` para `service_role` y en local no (37 de
ellas `SECURITY DEFINER`); los privilegios de **tabla** de la service role sobre las tablas de premios
(`SELECT` e `INSERT`, y `UPDATE` en `raffle_prizes`), explícitos desde `0058`/`0059` e iguales en los
dos entornos; y la secuencia de I-130.

### 4.24 El historial de premios ganados (`0067`–`0072`; BR-J17..BR-J23, BR-I16; D-208)

**Solo en local**: el proyecto real no tiene ninguna de las seis, y `verify:remote` lo dice —**tres**
comprobaciones en rojo, a propósito, hasta que se promuevan: la matriz de las 15 funciones de
`0067`/`0068`/`0070`/`0072`, el cuerpo de la cobertura de `0069` y el inicio operativo de `0071`—. **Comprobado
en producción el 2026-09-18** (Etapa 4, solo lectura): 41 en verde y exactamente esas 3 en rojo.

**La matriz no depende del privilegio por defecto** (`0072`, I-143). En el proyecto alojado toda función nueva
nace ejecutable por `service_role` (I-132), así que cada función que la lista le niega tiene un `revoke` que
la nombra después de su última creación —lo comprueba H7-05, estática— y la `0072` verifica la matriz de las
15 al aplicarse. Ensayado en local con ese privilegio reproducido: idéntica al escenario normal, y
`verify-remote` contra esa base, 44/44.

**Ninguna lectura recibe organización, vendedor ni actor.** El alcance sale de la sesión, como en D-198
y D-199: el vendedor, de `current_profile_id()` y `current_org_ids()`; el personal, de
`current_staff_org_ids()`.

| Frontera | Cómo se cierra |
|---|---|
| Un vendedor no ve lo de otro, ni lo de su equipo | El alcance es `current_seller_org_ids()` —vendedor **activo**— más `seller_id = current_profile_id()`, **sin** `current_team_seller_ids`. Una prueba lee la definición de la función y falla si aparece |
| Quien deja de ser vendedor deja de leer por esa vía | Exigir el **rol** y no solo el perfil es la corrección de **I-137**, que era un hueco **anterior** a este encargo: la política de `0057` dejaba a un ex vendedor ya Administrador leer las fotografías de sus antiguas ventas **con el `client_id` dentro** (BR-Q01). Las dos políticas —`lottery_ticket_matches` y `declared_prize_awards`— lo exigen ahora, y **acotan**: nadie gana acceso. Medido con `set role authenticated`, porque como `postgres` la RLS no se aplica |
| Otra organización no ve nada | La organización sale de la sesión; un identificador ajeno responde como uno inexistente |
| El personal no ve datos de cliente | El **tipo de retorno** de `admin_prize_awards` no declara cliente, y `prize_award_rows` no devuelve el nombre: la rama del personal **no toca `clients`**. El recuento de clientes distintos se calcula dentro de la base y sale como número. Lo vigilan `admin-privacy.test.ts` (la lista exacta de funciones `admin_*` y el barrido de columnas prohibidas) y una prueba que recorre las claves de cada fila |
| La cartera no se abre | El historial no consulta ni devuelve precio de venta, abonado, saldo, pagos ni comisiones (BR-Q01) |
| Nadie escribe la tabla desde una sesión | `declared_prize_awards` concede **solo `SELECT`**; la única puerta es `record_declared_prize_awards`, de la **service role**, como la transición (D-204). El vendedor y el personal reciben un error al llamarla |
| `anon` no alcanza nada | `revoke` explícito en las cuatro lecturas, en el cargador y en cada función de sesión. **Y frente a un plan reutilizado** (`0071`, I-141): una función que PostgreSQL puede plegar o insertar en el plan no queda protegida por su `REVOKE` cuando PostgREST reutiliza una sentencia preparada por otra sesión; por eso `prize_award_history_start()` es `stable security definer`. Medido con H13-02 y H13-06 |
| Privilegios explícitos | Las **15** funciones de `0067`, `0068` y `0070` están clasificadas en `scripts/prize-function-grants.ts` —8 de sesión, 1 de service role y 6 internas que **no ejecuta nadie**— y su matriz exacta se comprueba en `verify:remote` y en `prize-award-history.test.ts`. Es la lección de **I-132**: en el proyecto alojado toda función nueva nace ejecutable por `service_role` |

**Los números de una boleta con coincidencias (BR-I16).** Un **disparador** sobre `tickets` —no una
comprobación dentro de una RPC— cubre todas las vías: `admin_update_ticket_numbers`,
`tickets_update_seller`, cualquier RPC futura y la service role. Le acompaña uno **diferido**.

**Y la carrera con el motor está CERRADA** (I-134, `0068`). La conclusión anterior —«la clave ajena
serializa las escrituras»— era equivocada: solo hace **esperar** al motor. Reproducido con dos
conexiones, las dos operaciones confirmaban y dejaban la boleta con un número y la fotografía con otro.
La corrección mínima es un **disparador de restricción diferido** sobre `lottery_ticket_matches` que
exige, al COMMIT, que `matched_number` sea el número de la boleta en `match_field`. **El motor no se
tocó**: la defensa vive en su tabla, y en esa carrera el motor falla sin escribir nada, como ya hace
ante un conflicto de configuración (D-203).

**Las pantallas (Etapa 2).** La interfaz no añade ninguna puerta: lee con la **sesión** —nunca con la
clave de servicio— por las cuatro funciones y `prize_award_coverage()`, y no toca ninguna política.

| Frontera | Cómo se cierra en la interfaz |
|---|---|
| El personal no recibe datos de cliente | `readAdminPrizeAwards` llama **solo** a `admin_prize_awards` y `admin_prize_award_totals`; `AdminPrizeAward` no declara cliente y el mapeo copia columna a columna, sin esparcir la fila. Una prueba estructural (`admin-privacy.test.ts`) lo vigila, y la E2E busca nombres, alias, teléfonos, correos, notas e identificadores de clientes en el HTML, la carga RSC y cada respuesta de red del Dueño y del Administrador: cero |
| El personal no envía un identificador de cliente | `parsePrizeAwardFilters(…, 'staff')` descarta el `clientId` de la dirección antes de consultar; `/owner/prizes?clientId=…` responde lo mismo que sin él |
| El vendedor no enumera clientes ajenos | El nombre del cliente del filtro se lee con la RLS del vendedor (`getClientName`); uno ajeno o inexistente responde **«no encontrada»**, sin distinguirlos (T15) |
| Un rol equivocado no ve la pantalla | Cada página exige su rol además de su layout (`requireRole(['seller'])`, `requireStaff()`); aun sin eso, la base devuelve cero filas: `seller_prize_awards` exige vendedor activo y `admin_prize_awards`, personal |
| Quien dejó de vender y hoy es Administrador | Deja de ver su historial por el portal del vendedor (`/denied`) y ve sus premios por el del personal **sin cliente**; su nombre no se enlaza a una ficha de vendedor que ya no existe |
| La `0069` | `create or replace` del cuerpo de `prize_award_coverage()` con la misma firma, el mismo tipo y los **mismos privilegios**, repetidos: `authenticated` sí; `public`, `anon` y `service_role`, no. `verify:remote` comprueba el cuerpo |
| Quien vendió y hoy es del personal, en el desplegable (`0070`) | `admin_prize_award_sellers()` devuelve solo `seller_id` y `seller_name` —los que ya trae cada fila—, con el alcance de `current_staff_org_ids()`: un vendedor, otra organización y `anon` no obtienen nada (H9-07). La persona aparece como «Nombre (ya no vende)» y **no se enlaza** a una ficha que ya no tiene |

**La auditoría (Etapa 3).** Medido, no supuesto:

| Qué | Cómo | Resultado |
|---|---|---|
| La matriz de acceso | **H13-01** por PostgREST: vendedor propio, otro vendedor, Dueño, Administrador, quien pasó a Administrador, otra organización (Dueño y vendedor) y un vendedor desactivado, contra las cinco lecturas, la cobertura, el inicio y las tablas `lottery_ticket_matches`, `lottery_ticket_match_prizes` y `declared_prize_awards` | Cada uno recibe lo suyo y nada más; el personal, **0** filas de las tablas y ni un identificador ni un nombre de cliente en ninguna respuesta; `lottery_ticket_match_prizes` hereda la corrección de I-137 por su `EXISTS` |
| `anon`, lo interno y la escritura | **H13-02**, **H13-03** y **H13-04**: `anon` contra todo; `prize_award_rows`, `declared_prize_award_plan`, el cargador y el motor desde cuatro sesiones; `INSERT`, `UPDATE` y `DELETE` sobre las tres tablas | Todo rechazado, y ni una fila cambia |
| Lo ajeno frente a lo inexistente | **H13-05** —seis pares: cliente de otro vendedor, rifa y vendedor de otra organización, en listas y totales— y la E2E —estado HTTP y texto de la página— | Respuestas **idénticas** |
| El navegador del personal | La E2E con siete direcciones manipuladas y una navegación RSC, capturando HTML, carga RSC y red | Ni un dato de cliente |

**La promoción (Etapa 4).** El cargador escribe con la **service role** en producción, así que su puerta
(`scripts/record-prize-awards-guard.ts`) protege la orden antes de que llegue a la base, que sigue siendo la
autoridad:

| Riesgo | Cómo se cierra |
|---|---|
| Escribir contra el proyecto equivocado | `--production` exige `--project-ref` y que el host resuelto sea **exactamente** ese proyecto; nunca un destino local —ni por la URL, ni por `http`, ni por `SUPABASE_TARGET=local`—. Las comprobaciones de destino son las de la transición (D-205), **importadas**, no copiadas |
| La organización equivocada | `--organization` y `--confirm-organization` idénticas, también en la vista previa, y la organización tiene que existir en el destino |
| Aplicar algo distinto de lo revisado | Aplicar exige la **huella** de una vista previa anterior, en los dos destinos, y se compara con una vista previa repetida justo antes de escribir |
| Una errata que cambia la orden | Opciones desconocidas, repetidas, sin valor o contradictorias se rechazan |
| Filtrar secretos o datos de cliente | Ni claves, ni la dirección del proyecto —solo `zqwu…`—, ni un dato de cliente: la base no devuelve ninguno. Un error inesperado imprime solo su mensaje |
| Repetir a ciegas tras una respuesta perdida | Salida **3**, y el procedimiento obliga a mirar lo almacenado antes de repetir (`RUNBOOK` §9.7); repetir con todo reconocido no escribe nada |

**Las herramientas de puerta** (`scripts/gate-*.ts`, `scripts/prize-awards-probe.ts`) leen producción en **una
transacción `repeatable read read only`** y se niegan si `SUPABASE_DB_URL` no nombra el proyecto esperado. No
imprimen la cadena de conexión, y ni la foto ni sus informes guardan un identificador de cliente: la clave de
`clients` se guarda como md5 y la sonda cuenta los clientes distintos dentro de la base. `gate-mirror-privileges.ts`
solo puede escribir en la base **local**: su dirección está escrita en el código. **Un veredicto de puerta exige la
procedencia comprobada** (I-145): las dos fotos, `gate-snapshot/v2`, íntegras, del mismo proyecto y del que se pidió,
distintas y en orden, y la conexión con ese proyecto comprobada aunque no haya diferencias; si no, no hay veredicto.
Las fotos guardan el proyecto con el que se conectaron, nunca una credencial.

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

### 5.2 El dispatcher de Web Push (BR-V08, D-187, D-191)

> ✅ **EXISTE Y ESTÁ EN PRODUCCIÓN** desde el 2026-09-12 (`0054`, Etapa 5; promoción, Etapa 7, D-193).
> Esta sección describía el plan y sigue describiendo lo construido.

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

### 5.3 El PNG de «Resultados de la semana» (`/api/weekly-results/image`, BR-H05, D-194)

Route Handler **con sesión** que solo lee. Vive fuera de `(protected)` por lo mismo que la exportación
de reportes (§5.0): no hereda ninguna guarda, así que la comprueba él.

| Capa | Comprobación | Respuesta |
|---|---|---|
| Proxy | Sin sesión, redirige al login | 307 |
| 1 | `getAuthUser` | 401 |
| 2 | `getActiveMembership`: perfil, membresía y organización activos (BR-A04) | 403 |
| 3 | Rol `seller` | 403 |
| 4 | `week`, **el único parámetro**: fecha real, lunes, semana ya terminada | 400 |
| 5 | Rifa del catálogo de **su** membresía y seis resultados confirmados, **bajo RLS** | 409 |
| — | Fallo de lectura o de composición | 500 genérico; el detalle, solo al registro del servidor |

**No acepta identificadores.** Ni vendedor, ni organización, ni rifa: salen de la sesión, y la
lectura de la rifa va por `getCatalogSettings`, que con otro `profileId` no devuelve nada por la RLS de
`memberships` (comprobado en `tests/db/weekly-results.test.ts`). Programación y resultados son
nacionales (D-141), y **`anon` no tiene ni el permiso `SELECT`** sobre esas tablas: sin sesión la
lectura falla con `42501`.

**Caché.** `ImageResponse` trae por defecto `public, max-age=0, must-revalidate`; la ruta la sustituye
por **`private, no-store`** en todas sus respuestas, errores incluidos. La imagen lleva el nombre de la
rifa de quien la pide y no puede quedarse en una caché compartida.

**Qué puede salir.** El nombre de la rifa, la semana y seis números nacionales. Ni clientes, ni
boletas, ni coincidencias, ni saldos, ni datos del vendedor, ni auditoría: la composición no los recibe.

**Sin salida a internet.** Fondo y fuentes se leen del disco, y lo que la fuente no puede dibujar se
omite del nombre para que `@vercel/og` no lo pida afuera (D-195). Una prueba genera un PNG real con
`fetch` bloqueado.

**Sin limitador de intentos, a propósito** (D-194, Decisión 8). Cada imagen cuesta ~0,6 s de CPU a un
vendedor autenticado y activo, que ya puede gastar lo mismo recargando cualquier pantalla. Un
limitador en memoria por instancia (§10.2) no lo impediría en Vercel y sí haría fallar a quien
reintenta. **Riesgo aceptado**; si algún día se abusa, la salida es un contador compartido, no este.

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
- **Lectura, desde `0057` (D-198, BR-Q10):** `audit_logs` no tiene política de `SELECT`. El personal
  la lee redactada por `admin_audit_log` (§4.19) y la bitácora completa solo la lee `service_role`.

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
| T19 | **El personal lee la cartera de un vendedor** | Una sesión de Dueño o Administrador consulta `tickets`, `clients` o `payments` por PostgREST, llama a una RPC de venta, busca el nombre de un cliente, compara mensajes de rechazo o lee avisos y bitácora | Políticas solo del vendedor, siete proyecciones de lista blanca, RPC de venta con el mensaje de un id inexistente, anulación de vendidas rechazada igual para los tres estados, avisos y bitácora redactados (`0057`, §4.19, D-198) | `tests/db/admin-privacy.test.ts`, `tests/unit/admin-privacy.test.ts` y `tests/e2e/privacidad-admin*.spec.ts` |

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
