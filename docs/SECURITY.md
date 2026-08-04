# SEGURIDAD

- **Versión:** 2.0 · **Fase:** 2 (implementado) · **Actualizado:** 2026-08-03
- **Estado:** IMPLEMENTADO y verificado. Las políticas viven en
  `supabase/migrations/0005_rls_policies.sql` y los privilegios en `0009`/`0010`.
- Verificado con **111 pruebas** en `tests/db/`, todas ejecutadas con sesiones reales por rol y la
  clave pública, nunca con `service_role`: una prueba de aislamiento hecha con la clave de servicio
  omitiría RLS y pasaría aunque no hubiera ninguna política (D-043).

### Refuerzos añadidos al implementar (Fase 2)

| Refuerzo | Efecto |
|---|---|
| Sin `DELETE` ni política ni privilegio en ninguna tabla | El borrado físico exige dos cambios deliberados y visibles (D-038) |
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
| 2. Middleware / layout de servidor | Refrescar sesión, exigir autenticación y rol para el segmento de ruta | No sustituye la verificación por operación |
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
| **Clientes** |
| Ver todos los clientes de la organización | ✓ | ✓ | ✗ |
| Ver / crear / editar clientes propios | ✓ | ✓ | P |
| Archivar clientes | ✓ | ✓ | P |
| Eliminar clientes físicamente | ✗ | ✗ | ✗ |
| **Pagos** |
| Ver todos los pagos de la organización | ✓ | ✓ | ✗ |
| Registrar pagos | ✓ | ✓ | P |
| Anular pagos | ✓ | ✓ | ✗ |
| Eliminar pagos físicamente | ✗ | ✗ | ✗ |
| **Reportes y auditoría** |
| Reportes globales | ✓ | ✓ | ✗ |
| Reportes propios | ✓ | ✓ | P |
| Ver auditoría | ✓ | ✓ | ✗ |

Acciones exclusivas del Owner (BR-U02, BR-U03, BR-U04): eliminar o desactivar al Owner, asignar el
rol `owner`, transferir la propiedad, editar la configuración de la organización y reabrir rifas
cerradas.

---

## 3. Autenticación y sesión

| Aspecto | Decisión |
|---------|----------|
| Proveedor | Supabase Auth, email + contraseña |
| Transporte de sesión | Cookies HTTP-only gestionadas por `@supabase/ssr` |
| Refresco | En `middleware.ts` en cada request |
| Verificación de identidad en servidor | `supabase.auth.getUser()` (valida contra el servidor de Auth). **Nunca** `getSession()` para decisiones de autorización, porque su contenido proviene de la cookie y no está verificado |
| Origen del rol | Tabla `memberships` consultada en el servidor. No se confía en `app_metadata` del JWT para autorizar (D-006) |
| Usuario inactivo | El layout protegido y las políticas RLS verifican `is_active` en cada request; una sesión previa deja de servir de inmediato |
| Contraseñas | Gestionadas por Supabase Auth; la aplicación nunca las almacena, registra ni transmite a terceros |
| Alta de usuarios | Invitación por correo o contraseña temporal generada con `SERVICE_ROLE` en el servidor; obligación de cambiarla en el primer ingreso |
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
```

`REVOKE EXECUTE … FROM PUBLIC` y `GRANT EXECUTE … TO authenticated` en todas ellas.

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

> ⚠️ **Toda llamada a función va dentro de un `SELECT`.** Escribir
> `is_org_staff(organization_id)` —pasándole una columna— obliga a PostgreSQL a ejecutarla **una vez
> por fila**: medido en la Fase 7, 1,46 ms pasaron a 1.667 ms sobre 7.278 boletas, y el factor crece
> con los datos (I-019, D-063). Envuelto en un subselect se evalúa una sola vez.
> La prueba `F7-03` de `tests/db/security-phase7.test.ts` falla si alguien reintroduce el patrón.

Sin política aplicable, PostgreSQL **deniega**. Es el comportamiento deseado: se conceden permisos
de forma explícita, nunca por omisión.

### 4.3 Políticas por tabla (diseño)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `organizations` | Miembros activos de la organización | ✗ (solo `SERVICE_ROLE`) | Solo Owner | ✗ |
| `profiles` | El propio perfil; el personal (owner/admin) ve los perfiles de su organización | ✗ (trigger de Auth) | El propio perfil (campos limitados); personal sobre perfiles de su organización salvo el Owner si es Admin | ✗ |
| `memberships` | El propio registro; personal ve los de su organización | Personal, sin poder crear rol `owner` (solo Owner) | Personal; un Admin no puede tocar la membresía del Owner ni ascender a nadie a `owner` | ✗ |
| `raffles` | Todos los miembros activos de la organización | Personal | Personal | ✗ |
| `clients` | Personal: toda la organización · Seller: `seller_id = current_profile_id()` | Personal · Seller solo con `seller_id` propio | Igual que SELECT | ✗ (se archiva) |
| `tickets` | Personal: toda la organización · Seller: propias | Personal · Seller solo si `allow_seller_ticket_creation` y estado `pending_approval` con `seller_id` propio | Personal · Seller: solo sus boletas y solo campos permitidos según estado | ✗ |
| `payments` | Personal: toda la organización · Seller: propios | Personal · Seller con `seller_id` propio y cliente propio | Solo personal (anulación). Seller: ✗ | ✗ |
| `payment_allocations` | Vía `EXISTS` sobre el pago padre | Igual que el pago padre | ✗ | ✗ |
| `audit_logs` | Solo personal de la organización | Solo funciones `SECURITY DEFINER` | ✗ | ✗ |

Ejemplo completo para la tabla más sensible:

```sql
-- tickets: lectura
CREATE POLICY tickets_select ON tickets FOR SELECT TO authenticated
USING (
  organization_id IN (SELECT current_org_ids())
  AND (is_org_staff(organization_id) OR seller_id = current_profile_id())
);

-- tickets: el vendedor solo crea boletas propias, pendientes de aprobación
-- y únicamente si la rifa lo permite y está activa
CREATE POLICY tickets_insert_seller ON tickets FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (SELECT current_org_ids())
  AND seller_id = current_profile_id()
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
      AND (is_org_staff(p.organization_id) OR p.seller_id = current_profile_id())
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
2. Validación interna de permisos: la función **no** asume que quien la llama está autorizado.
3. `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO authenticated`.
4. Parámetros tipados; nunca SQL construido por concatenación de texto.
5. Sin `RAISE` de detalles internos: los mensajes de error son genéricos y traducibles.
6. Auditoría de la acción antes de retornar.

---

## 5. Protección de Server Actions y Route Handlers

Toda Server Action sigue esta secuencia, sin excepciones:

```ts
'use server'
export async function accion(input: unknown) {
  const { user, membership } = await requireActiveMembership()   // 1 sesión + activo
  requireRole(membership, ['owner', 'admin'])                    // 2 rol
  const data = schema.parse(input)                               // 3 Zod: allowlist de campos
  const supabase = await createServerClient()                    // 4 cliente con RLS
  const { error } = await supabase.rpc('...', { ... })           // 5 operación atómica
  if (error) return { error: mapPgError(error) }                 // 6 error legible
  revalidatePath('...')                                          // 7 refresco
  return { ok: true }
}
```

Reglas complementarias:

- **Sin mass assignment:** los esquemas Zod son listas explícitas de campos permitidos. Nunca se hace
  *spread* de la entrada del cliente hacia un `insert`/`update`.
- **IDs siempre verificados:** cualquier `id` recibido se usa dentro de consultas sujetas a RLS; no
  se confía en él como prueba de propiedad.
- **`organization_id` y `seller_id` nunca vienen del cliente**: se derivan de la sesión en el
  servidor. Si la entrada los trae, se ignoran.
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
| `ticket.approve`, `ticket.cancel` | `ticket` | RPC |
| `payment.create`, `payment.void` | `payment` | RPC |
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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Público (sujeta a RLS) | Bajo: sin RLS correcta, sería total |
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

Una política **no puede llamar a una función pasándole una columna**. PostgreSQL no puede sacarla del
bucle y la ejecuta una vez por fila; medido en la Fase 7, eso multiplicó por 1.400 el tiempo de
cualquier consulta sobre `tickets` (I-019).

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
