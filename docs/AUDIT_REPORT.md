# INFORME DE AUDITORÍA FINAL — FASE 9

**Fecha:** 2026-08-05 · **Alcance:** el sistema completo tal como está en `main` (`9531db5`) y en
producción (`https://gestion-rifas.vercel.app`).

> **Este informe es un snapshot de la Fase 9 y no se modifica.** La auditoría posterior del encargo
> de cobro (Etapa 6, D-192) se añadió **al final del archivo**, a partir de la §10.

Este informe **no oculta errores**. Incluye lo que se intentó romper y no cedió, porque un ataque que
falla también es un resultado: sin él, «no encontré nada» no se distingue de «no busqué».

---

## 1. Método

La auditoría **prueba el sistema, no lo relee**. Releer el código encuentra lo que su autor ya sabía;
ejecutarlo encuentra lo que creía y no era cierto — que es exactamente cómo aparecieron I-011, I-015,
I-019 e I-020 en fases anteriores.

| Técnica | Qué se hizo |
|---|---|
| Volcado independiente del catálogo | 15 consultas a `pg_class`, `pg_policies`, `pg_proc`, `pg_constraint`, `pg_indexes`, `pg_trigger` e `information_schema`, escritas desde cero, sin reutilizar las aserciones de `catalog.test.ts` |
| Sonda adversaria | **47 intentos** de romper el aislamiento con sesiones reales y **clave pública**, nunca `service_role` (D-043): lectura cruzada, escritura cruzada, RPC con parámetros ajenos, sobrepago, descuadre y numeración inválida |
| Verificación del proyecto **real** | `npm run verify:remote` (solo lectura) contra producción |
| Reejecución de la matriz completa | `test:db`, `verify` y `test:e2e` |
| Barrido de calidad | `any`, código muerto, N+1, sobrelectura, fugas de secretos, tamaño de archivos |

Todo lo ejecutado con escritura se hizo **contra la instancia local**. El proyecto real solo se tocó
en modo lectura.

---

## 2. Resumen de hallazgos

| ID | Hallazgo | Severidad | Estado |
|---|---|---|---|
| **A-01** | La red estructural de la prueba 25 dejaba fuera **6 de las 28** Server Actions | Media | ✅ **Corregido** en esta fase |
| **A-02** | Un Owner puede dejar su organización **sin ningún Owner**, de forma irrecuperable desde la aplicación | Media | ✅ **Corregido** (migración `0016`), aplicada en local **y en producción** |
| **A-03** | El aislamiento de pagos entre vendedores solo se probaba en **una dirección** | Baja | ✅ **Corregido** en esta fase (F9-02) |
| **A-04** | 25 tipos exportados sin ningún consumidor | Baja | Aceptado — es una convención uniforme, no un defecto |
| **A-05** | El título de una prueba prometía más de lo que comprobaba | Informativa | ✅ Corregido (título y comentario) |
| **A-06** | `CLAUDE.md.txt` sigue coexistiendo con `CLAUDE.md` (I-004, abierto desde la Fase 2) | Baja | Pendiente de autorización del usuario |

**Ningún hallazgo crítico ni alto.** No se encontró **ninguna** fuga de datos entre vendedores ni
entre organizaciones, ninguna vía de escalada de privilegios, ningún secreto alcanzable desde el
navegador y ningún camino para descuadrar el dinero.

---

## 3. Hallazgos detallados

### A-01 — La red que protege las Server Actions tenía un agujero (Media) ✅ corregido

**Qué pasaba.** `tests/unit/server-actions-guard.test.ts` es la prueba 25 de `CLAUDE.md` §30, y su
valor declarado está en el futuro: *«cuando alguien agregue una acción y se salte la guarda, esta
prueba falla sin que nadie haya tenido que escribir una prueba nueva»*.

Leía `src/features/<módulo>/actions.ts` recorriendo **un solo nivel**. El código ya había crecido más
allá de esa forma:

| Archivo | Acciones | ¿Analizado? |
|---|---|---|
| `features/{auth,clients,payments,raffles,tickets,users}/actions.ts` | 22 | Sí |
| `features/tickets/assign/actions.ts` | `assignTicket`, `assignTicketToNewClient` | **No** |
| `features/tickets/bulk/actions.ts` | `bulkCreateTickets`, `findExistingCombinations` | **No** |
| `features/tickets/seller/actions.ts` | `createSellerTickets`, `updateSellerTicketNumbers` | **No** |

**6 de 28 acciones (21 %) quedaban fuera** — precisamente las que asignan boletas a clientes y las
crean en lote. La comprobación de esquemas tenía la misma limitación (`tickets/assign/schemas.ts` y
`tickets/seller/schemas.ts` nunca se leían).

**Gravedad real: no había vulnerabilidad.** Las 6 acciones tienen su `authorizeAction` correcto hoy;
se verificó una por una. Lo que faltaba era la red, no el suelo.

**Corrección.** El recorrido pasa a ser recursivo, el módulo se identifica por su ruta
(`tickets/bulk`, no solo `tickets`), el mínimo de acciones sube de 15 a 28 y se añade una prueba que
compara la lista analizada contra el listado recursivo de archivos, para que el descuido no vuelva.

**Comprobado, no supuesto.** Se inyectó temporalmente una acción sin guarda en
`tickets/assign/actions.ts`: con la versión anterior habría pasado inadvertida; con la corregida la
prueba **falla**. El archivo se restauró de inmediato.

---

### A-02 — Una organización puede quedarse sin Owner (Media) ✅ corregido en local

**Qué pasaba.** `memberships_one_owner_per_org` es un índice único parcial sobre `(organization_id)
where role = 'owner' and is_active`. Garantiza **«como máximo un Owner»**. Nunca garantizó **«al menos
uno»**.

La política `memberships_update_staff` permite a un Owner actualizar su propia membresía siempre que
el rol resultante no sea `owner` — o lo sea y quien llama también. Un Owner puede, por tanto,
degradarse a `seller` o desactivarse a sí mismo.

**Reproducido** contra la instancia local, con la clave pública y la sesión real del Owner:

```
update memberships set role = 'seller' where profile_id = <owner>   ->  1 fila afectada
```

**Y el estado resultante es irrecuperable desde la aplicación:**

| Intento de reparación | Resultado |
|---|---|
| El ex-Owner (ahora vendedor) se restaura a sí mismo | 0 filas — ya no es staff |
| El Admin se asciende a Owner | `42501` — BR-U03 lo impide, correctamente |
| El Admin restaura al ex-Owner | `42501` — misma política |
| Owners activos que quedan | **0** |

Solo `service_role`, desde un script fuera de la aplicación, puede repararlo. Se pierden mientras
tanto las funciones exclusivas del Owner: configurar la organización (`organizations_update_owner`) y
reabrir una rifa (BR-R03).

**Alcance real, sin dramatizar.** No es una escalada de privilegios: nadie **gana** permisos, el
Owner los **pierde**. Exige sus propias credenciales y una petición hecha a mano, porque la interfaz
no expone el cambio de rol (`updateUser` solo toca nombre, alias y teléfono). Es un accidente
posible, no un ataque. Se corrige porque es **irreversible** y porque contradice una suposición que
todo el modelo da por cierta (BR-U04).

**Corrección — migración `0016_organization_keeps_owner.sql`.** Un *constraint trigger* **diferido**
sobre `memberships` que rechaza al COMMIT cualquier cambio de `role` o `is_active` que deje a la
organización sin Owner activo.

**Por qué diferido y no inmediato:** transferir la propiedad obliga a pasar por un estado intermedio
—el índice único impide dos Owners activos a la vez, así que hay que degradar a uno antes de ascender
al otro—. Un trigger inmediato haría la transferencia imposible. Uno diferido la permite dentro de
**una** transacción y sigue rechazando el descuido, porque PostgREST hace una petición por
transacción. Es el mismo mecanismo que ya usa `check_payment_balance` (D-012).

**Aplicada al proyecto real el 2026-08-05**, con autorización explícita del usuario y respaldo lógico
previo. Verificada allí en dos niveles, porque las dos divergencias local/remoto anteriores de este
proyecto (D-038, I-020) fueron ambas de **privilegios**, invisibles a simple vista:

| Nivel | Comprobación | Resultado |
|---|---|---|
| Catálogo | Función existe · `SECURITY DEFINER` · `search_path` fijo · **no ejecutable por `anon` ni `public`** · trigger existe · es `CONSTRAINT` · es `DEFERRABLE INITIALLY DEFERRED` · migración registrada · toda organización con exactamente un Owner | **9/9** |
| Comportamiento | Degradar al Owner de «Rifas Demo» **en producción**, forzando el trigger con `SET CONSTRAINTS ALL IMMEDIATE` dentro de una transacción | `La organizacion quedaria sin ningun Owner activo.` → `ROLLBACK`, estado idéntico antes y después |

La segunda comprobación es la que importa: la primera dice que el objeto está, la segunda dice que
**protege**. La alternativa era suponerlo, que es justo lo que esta auditoría existe para evitar.

---

### A-03 — El aislamiento de pagos solo se probaba en una dirección (Baja) ✅ corregido

**Qué pasaba.** El seed deja a `vendedor2` **sin ningún pago**: los 36 pagos de «Rifas Demo» son de
`vendedor1`. Eso hace que una aserción parezca más fuerte de lo que es:

```
report_payment_totals(vendedor1) == sum(payments where seller_id = vendedor1)
```

Como *todos* los pagos son de `vendedor1`, ese número es también el total de la organización entera:
la igualdad **no distingue** «filtrado por vendedor» de «sin filtrar en absoluto».

**La cobertura no era nula** —existe la prueba complementaria «un vendedor SIN pagos obtiene ceros»,
que sí fallaría si la RLS se rompiera— pero la dirección fuerte faltaba.

**Verificado a mano durante la auditoría:** se le creó a `vendedor2` un pago real, con su propia
sesión y por la RPC. Con datos en ambos lados, el aislamiento **se cumple en las cuatro superficies**:

| Superficie | vendedor1 ve | vendedor2 ve | Filas ajenas |
|---|---|---|---|
| `payments` | 36 | 1 | **0** |
| `payment_allocations` | 39 | 1 | **0** |
| `v_payment_history` | 36 | 1 | **0** |
| `report_payment_totals` | 1.592.001 | 7.777 | — (cada uno su verdad) |

**Corrección.** `tests/db/audit-phase9.test.ts` → `F9-02` monta ese escenario y añade la aserción que
faltaba: el total propio es **estrictamente menor** que el de la organización.

---

### A-04 — 25 tipos exportados sin consumidor (Baja) — aceptado

Un análisis de alcanzabilidad sobre `src/`, `tests/` y `scripts/` encuentra 25 exports sin un solo
uso. **Todos** son alias `z.infer` del mismo patrón (`CreateUserInput`, `AssignTicketInput`,
`VoidPaymentInput`…), consecuencia de que las acciones reciben `input: unknown` y validan dentro.

No se eliminan: son una convención aplicada de forma uniforme en los 9 módulos, cuestan cero en
tiempo de ejecución (se borran al compilar) y quitarlos rompería la simetría de `schemas.ts` sin
ganar nada. Se registra para que quien lo note sepa que ya se miró.

La superficie de `components/ui/` (re-exports de shadcn/ui sin usar) **no** se cuenta como hallazgo:
es la API de una librería vendorizada.

---

### A-05 — Un título de prueba que prometía de más (Informativa) ✅ corregido

La prueba se llamaba `'ninguna accion recibe organization_id o seller_id del cliente'` pero su
expresión regular solo buscaba `organization_id`.

**No es un defecto de seguridad, y el título era el error.** `sellerId` **sí** viaja desde el cliente
y es correcto que lo haga: el personal elige a qué vendedor asigna una boleta. No es un control de
seguridad — lo valida la FK compuesta contra `memberships(profile_id, organization_id)`. Comprobado:

| Intento | Resultado |
|---|---|
| Owner de Demo crea boletas para el vendedor de otra organización | `El vendedor indicado no es un vendedor activo de la organizacion.` |
| Owner de Demo reasigna una boleta al vendedor de otra organización | `23514 El usuario asignado no es un vendedor activo de la organizacion` |

Corregido el título y añadido el comentario que explica por qué `sellerId` es distinto.

---

### A-06 — `CLAUDE.md.txt` (Baja) — pendiente de autorización

I-004, abierto desde la Fase 2. Los dos archivos siguen en el repositorio; `CLAUDE.md` es el canónico
(D-003). Riesgo real: editar el equivocado. **No se borra sin autorización del usuario**, que es la
razón por la que lleva siete fases abierto.

---

## 4. Auditoría de seguridad (entregable 1)

### 4.1 RLS por tabla

Las **9** tablas de negocio tienen RLS **habilitada y forzada** (`relforcerowsecurity`), lo que
significa que ni el dueño de la tabla la omite:

| Tabla | RLS | Forzada | Políticas |
|---|---|---|---|
| `audit_logs` | ✅ | ✅ | 1 (solo SELECT) |
| `clients` | ✅ | ✅ | 3 |
| `memberships` | ✅ | ✅ | 3 |
| `organizations` | ✅ | ✅ | 2 |
| `payment_allocations` | ✅ | ✅ | 2 |
| `payments` | ✅ | ✅ | 3 |
| `profiles` | ✅ | ✅ | 3 |
| `raffles` | ✅ | ✅ | 3 |
| `tickets` | ✅ | ✅ | 5 |

**22 políticas, ninguna de `DELETE`.** `audit_logs` tiene únicamente `SELECT`: las escrituras entran
por funciones `SECURITY DEFINER`, así que la bitácora es *append-only* incluso para quien la consulta.

### 4.2 Funciones

**25 funciones propias.** Las **25** declaran `search_path = public, pg_temp` — la defensa contra el
secuestro de resolución de nombres en una función `SECURITY DEFINER` (R-04).

| Grupo | Nº | Seguridad |
|---|---|---|
| RPC de negocio, triggers y funciones de identidad | 23 | `DEFINER` |
| `report_payment_totals`, `report_payments_by_day` | 2 | `INVOKER` — heredan la RLS de quien consulta (D-057) |
| `require_auth`, `set_updated_at`, `today_bogota`, `tickets_protect_sale_price` | 4 | `INVOKER` — no acceden a datos ajenos; es el mínimo privilegio correcto |

Las funciones de `pg_trgm` (`gtrgm_*`, `similarity`, …) aparecen sin `search_path`: pertenecen a la
**extensión**, no al proyecto, y tocarlas sería meterse donde no toca (así lo decidió `0015`).

### 4.3 Vistas

Las **5** vistas llevan `security_invoker = true`. Sin eso, una vista se ejecutaría con los permisos
de quien la creó y un vendedor vería los saldos de todos (R-03).

### 4.4 Privilegios

| Comprobación | Resultado |
|---|---|
| Privilegios de tabla de `anon` | **ninguno** |
| Funciones **propias** ejecutables por `anon` o `PUBLIC` | **ninguna** (solo las de `pg_trgm`) |
| `DELETE` / `TRUNCATE` para `authenticated` | **ninguno** |
| `DELETE` / `TRUNCATE` concedidos | solo `postgres` y `service_role` |

### 4.5 Manejo de secretos

| Comprobación | Resultado |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` en el código | Una sola referencia, en `lib/supabase/admin.ts`, con `import 'server-only'` |
| Quién usa el cliente admin | Solo `features/users/actions.ts`, y solo contra `auth.admin` — nunca datos de negocio |
| Módulos con `server-only` | 15 |
| Componentes cliente que importan de `queries.ts` | 12, **todos con `import type`** — se borran al compilar; un import de valor habría roto el build |
| `.gitignore` | Cubre `.env` y `.env.*`, con excepción explícita de `.env.example` |

### 4.6 Protección de Server Actions y Route Handlers

**28 Server Actions.** Las 23 de negocio empiezan por `authorizeAction`; las 5 del flujo de
autenticación no lo llevan por diseño y están declaradas una a una con su motivo. Tras corregir A-01,
las 28 están dentro de la red estructural.

`/api/reports/export` vive **fuera** de `(protected)` a propósito (D-060): un Route Handler no pasa
por el `layout.tsx` de su grupo, así que ponerlo dentro daría una falsa sensación de cobertura.
Comprueba sesión, membresía activa y rol en sus primeras líneas.

### 4.7 La sonda adversaria — 47 intentos

**45 bloqueados. 2 «no bloqueados» que resultaron ser comportamiento correcto**, verificados uno a uno:

| Intento | Aparente | Realidad |
|---|---|---|
| Vendedor1 lee 39 `payment_allocations` | fuga | Las 39 son **suyas**: `vendedor2` no tiene ninguna en el seed (origen de A-03) |
| `report_payment_totals` devuelve el total de la organización | fuga | Los 36 pagos de la organización son **suyos** (mismo origen) |
| Reutilizar la combinación de una boleta anulada | permitido | La RPC la devolvió como **conflicto**, `inserted: 0`. Es su diseño (R-14, BR-N08) |

Muestra de lo que se intentó y no cedió:

| # | Intento | Cómo se detuvo |
|---|---|---|
| P-01…P-10 | Lectura cruzada de boletas, clientes, pagos, bitácora y vistas de saldo, entre vendedores y entre organizaciones | 0 filas |
| P-08 | Lectura anónima | `42501 permission denied for table tickets` |
| P-11 | Vendedor se autoasigna la boleta de otro | 0 filas |
| P-12 / P-13 | Vendedor edita `paid_amount` / `sale_price` de su propia boleta | 0 filas |
| P-14 / P-15 | Crear o transferir un cliente a nombre de otro vendedor | `42501` violación de RLS |
| P-16 | Insertar un pago sin la RPC | `23514` el cuadre diferido lo impide |
| P-17 | Anular un pago por UPDATE directo | 0 filas |
| P-18 / P-19 | Vendedor se asciende a admin / edita la organización | 0 filas |
| P-21 | Escribir en `audit_logs` | `42501 permission denied` |
| P-22 | Admin desactiva al Owner | 0 filas (BR-U02) |
| P-23 | Vendedor aprueba su propia boleta | `42501` violación de RLS |
| P-24…P-31 | Las 6 RPC invocadas con identificadores ajenos, y anónimamente | Mensaje de negocio o `42501` |
| P-33…P-35 | Sobrepago, reparto descuadrado, importe cero | Rechazados con su mensaje propio |
| Q-01…Q-03 | `sellerId` y `raffleId` de otra organización | FK compuesta y comprobación de la RPC |
| Q-04 / Q-05 | Crear o asignar boletas en una rifa cerrada | `La rifa esta closed y no admite boletas nuevas.` |
| Q-06 | Vendedor crea boletas con `allow_seller_ticket_creation = false` | `42501` |
| Q-07 | Cambiar el cliente de una boleta con pagos | `23514` (BR-I12) |
| Q-09 | Anular dos veces el mismo pago | `El pago ya esta anulado.` |
| Q-10 | Owner se degrada a sí mismo | **1 fila** → hallazgo A-02 |

### 4.8 El proyecto real

`npm run verify:remote` (solo lectura): **13 de 13 verificaciones en verde**, incluidas RLS forzada,
`search_path`, `security_invoker`, ausencia de `DELETE`, `anon` sin privilegios de tabla ni de
función, dinero en `bigint` y ninguna política llamando a una función por fila.

Producción y local **siguen siendo equivalentes** — la comprobación que ya evitó dos divergencias
reales (D-038, I-020).

---

## 5. Auditoría de integridad de datos (entregable 2)

**27 restricciones `CHECK`, 22 índices únicos, 26 claves foráneas, 21 triggers y 1 columna generada.**
Las 15 invariantes críticas del modelo, verificadas contra el catálogo y con intentos reales:

| # | Invariante | Cómo se garantiza | Estado |
|---|---|---|---|
| 1 | Combinación `(org, rifa, diario, semanal)` única | `tickets_combo_unique` | ✅ |
| 2 | La unicidad vale **entre vendedores** y para boletas **anuladas** | El índice no filtra por vendedor ni por estado | ✅ Q-08 |
| 3 | Números de 1 a 4 dígitos, solo cifras | `tickets_daily_number_check`, `tickets_weekly_number_check` (`^[0-9]{1,4}$`) | ✅ |
| 4 | Ceros iniciales conservados | Columnas `text`, no numéricas | ✅ |
| 5 | Números obligatorios salvo en borrador | `tickets_numbers_required_unless_draft` | ✅ |
| 6 | Todo el dinero en `bigint` | 6 columnas base + 8 derivadas; ninguna en punto flotante | ✅ |
| 7 | `sale_price > 0` y congelado tras la venta | `tickets_sale_price_check` + trigger `tickets_protect_sale_price` | ✅ P-13 |
| 8 | Sobrepago imposible | `tickets_paid_amount_range` (`paid_amount <= sale_price`) | ✅ P-33 |
| 9 | `paid_amount` no editable a mano | Trigger `tickets_guard_paid_amount` | ✅ P-12 |
| 10 | `payment_status` derivado, nunca escrito | Columna **generada** `ALWAYS` | ✅ |
| 11 | Pago y asignaciones cuadran exactamente | `check_payment_balance`, constraint trigger **diferido** | ✅ P-16, P-34 |
| 12 | Importes estrictamente positivos | `payments_total_amount_check`, `payment_allocations_amount_check` | ✅ P-35 |
| 13 | Un pago solo se aplica a boletas de **su** cliente | FK compuesta `alloc_ticket_client_fk (ticket_id, client_id)` | ✅ P-28 |
| 14 | Una boleta con pagos no cambia de cliente | Trigger `tickets_protect_client_change` | ✅ Q-07 |
| 15 | **Una organización tiene siempre exactamente un Owner activo** | `memberships_one_owner_per_org` (≤ 1) **+ `0016`** (≥ 1) | ⚠️ **Era la mitad** → A-02 |

Complementos verificados: **ningún `DELETE`** en ninguna tabla (ni política ni privilegio); toda FK
es `ON DELETE RESTRICT` salvo `profiles → auth.users`, que es `CASCADE` a propósito; y el
`organization_id` viaja en FK compuestas (`tickets_raffle_org_fk`, `clients_seller_org_fk`,
`payments_client_org_fk`…) de modo que cruzar organizaciones es estructuralmente imposible, no solo
prohibido por RLS.

**La invariante 15 era la única incompleta**, y llevaba así desde la migración `0001`.

---

## 6. Auditoría funcional (entregable 3)

### 6.1 Las 25 pruebas mínimas de `CLAUDE.md` §30

La matriz de `TESTING.md` §3 se recorrió fila por fila hasta el archivo citado — el mismo método con
el que la Fase 7 descubrió que tres filas mentían. **Esta vez las 25 filas apuntan a pruebas que
existen y comprueban lo que dicen.** La única debilidad encontrada es A-03 (la fila 4, aislamiento
entre vendedores, no cubría la dirección fuerte en el terreno de los pagos), ya corregida.

### 6.2 Reglas de negocio

**99 reglas `BR-*`** definidas en `BUSINESS_RULES.md`. Las verificadas por intento directo en esta
auditoría, además de las que ya cubren las suites: BR-N02/N03/N04/N05/N08 (numeración y unicidad),
BR-F03/F05/F09/F12 (importes, cuadre, anulación, sobrepago), BR-I12 (cambio de cliente),
BR-R08/R09 (rifa cerrada), BR-U02/U03 (protección del Owner frente al Admin), BR-C01/C05 (pertenencia
del cliente), BR-A04 (usuario inactivo).

**BR-U04** —«solo el Owner puede transferir la propiedad»— estaba garantizada solo a medias: nadie
podía **tomar** la propiedad, pero el Owner podía **perderla** sin querer y para siempre. Es A-02.

### 6.3 Cobertura de los requisitos de producto

Rutas de `CLAUDE.md` §21 y §22, dashboards de §23 y los 7 reportes de §24: presentes y en producción
desde las Fases 6 y 8. No se encontró ninguna pantalla que exista sin persistencia real, validación,
autorización o manejo de error (§32).

---

## 7. Auditoría de calidad (entregable 4)

| Criterio | Resultado |
|---|---|
| `any` sin justificar | **1** en todo `src/`, en `lib/supabase/admin.ts`, con `eslint-disable` y 4 líneas de comentario que explican el puente `ws` → WebSocket del navegador. Justificado |
| `@ts-ignore` / `@ts-expect-error` | **Ninguno** |
| Silenciar lint | 2 `eslint-disable-next-line`, ambos comentados y acotados a una línea |
| Archivos excesivos | El mayor escrito a mano es `ReportsView.tsx` con 506 líneas; solo 5 superan las 300. `database.types.ts` (1.197) es **generado** |
| Consultas N+1 | **Ninguna.** Los dos únicos `await` dentro de un bucle son intencionados y documentados: el guardado por lotes de la carga masiva (R-05) y la paginación de `fetchAllRows` (R-18) |
| Sobrelectura (`select('*')`) | 8 casos, **todos sobre vistas agregadas o `raffles`**, nunca sobre listados grandes |
| Truncamiento silencioso a 1.000 filas | **Ningún** `data.length` usado para contar. Se usa `count: 'exact', head: true` o `fetchAllRows` (I-011, R-18) |
| Paralelismo | `Promise.all` en 19 archivos; las páginas no encadenan consultas independientes |
| Código muerto | 25 tipos sin consumidor → A-04. Ninguna función ni componente sin uso |
| `console.*` | 2, ambos `console.error` en manejo de error legítimo |
| Cálculo de dinero en el frontend | **Ninguno.** Los agregados salen de SQL; lo único en TypeScript es el reparto sugerido de un abono, que `create_payment` revalida antes de escribir |

---

## 8. Qué queda pendiente

**No queda ninguna acción de ingeniería.** Lo abierto son decisiones del dueño del negocio:

| Asunto | Quién decide | Acción |
|---|---|---|
| **I-024** — plan Free sin backups automáticos | Usuario | Subir a Pro o automatizar el respaldo externo **antes de operar con dinero real** (`RUNBOOK.md` §5.3) |
| **I-021** — cuentas de demostración en producción | Usuario | Desactivarlas o rotar su contraseña (`OPERATIONS.md` §5) |
| **I-004 / A-06** — `CLAUDE.md.txt` | Usuario | Autorizar el borrado |
| **A-04** — tipos sin consumidor | — | Aceptado, no se actúa |

### 8.1 Cómo se aplicó `0016` al proyecto real (2026-08-05)

Registrado aquí porque es el procedimiento a repetir para cualquier migración futura.

| Paso | Comando | Resultado |
|---|---|---|
| 1. Respaldo lógico previo, **obligatorio** por I-024 | `supabase db dump` × 3 a `Rifas-backups/2026-08-05-pre-0016/` | 9 tablas de negocio, 228 líneas. `grep -c '"auth"' data.sql` → **0** |
| 2. Ensayo en seco | `npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"` | Una sola migración a aplicar: `0016`. Ninguna otra |
| 3. Aplicación | `npx supabase db push --yes --db-url "$SUPABASE_DB_URL"` | Sin error |
| 4. Verificación de catálogo | `npm run verify:remote` | **13/13** |
| 5. Verificación específica de `0016` | Consulta de solo lectura al catálogo remoto | **9/9** (ver A-02) |
| 6. Verificación de **comportamiento** | Transacción revertida contra producción | El trigger rechaza; estado intacto |

**Dos advertencias que ya costaron tiempo antes** y volvieron a aplicarse aquí:

* **No leer `SUPABASE_DB_URL` con `dotenv`.** Su aviso promocional por `stdout` se cuela dentro del
  valor capturado con `$(...)` y produce `LegacyDbConfigParseUrlError`. Usar `fs.readFileSync`
  (`RUNBOOK.md` §5.1).
* **`--schema public` es obligatorio en el volcado de DATOS**, y está prohibido en el de esquema. Sin
  él, `data.sql` arrastra `auth.users` completo con contraseñas cifradas y tokens; con él en
  `schema.sql`, la restauración se rompe por `pg_trgm`.

**El respaldo de la Fase 8 no se sobrescribió**: el nuevo fue a una carpeta con fecha. Comparados,
solo difieren en un token aleatorio que `pg_dump` genera por ejecución — es decir, **los datos de
producción no habían cambiado desde la Fase 8**.

**Riesgo de la migración: bajo, y así resultó.** Añade una función y un trigger; no modifica datos, ni
políticas, ni privilegios existentes.

---

## 9. Conclusión

El sistema resiste. **47 intentos deliberados de romperlo, con sesiones reales y sin privilegios
especiales, no consiguieron leer ni escribir un solo dato ajeno, ni descuadrar un peso.** Las tres
capas —restricciones, RLS y validación de servidor— están donde deben y ninguna depende de que las
otras funcionen.

Los dos hallazgos que importan comparten una forma: **no son fallos de lo que se construyó, sino de
lo que se dio por garantizado**. A-01 era una red que había dejado de cubrir un código que creció por
debajo de ella. A-02 era una restricción que aseguraba «como máximo uno» donde el modelo entero
suponía «exactamente uno» —y la documentación llevaba siete fases afirmando lo segundo—. Ninguno se ve
leyendo el código; los dos aparecen a la primera si se le pregunta al sistema en vez de a la
documentación.

Los dos están corregidos, y `0016` está aplicada y verificada también en producción. **No queda
ninguna acción de ingeniería pendiente.** Lo que resta son decisiones del dueño del negocio, y la más
importante es la de siempre: **el proyecto sigue en el plan Free de Supabase, sin ninguna copia de
seguridad automática. Eso hay que resolverlo antes de que entre el primer peso real** (I-024).

---

# AUDITORÍA INTEGRADA — Cuentas de cobro y recordatorios (Etapa 6, D-192)

**Fecha:** 2026-09-12 · **Alcance:** lo que construyeron las etapas 1 a 5 del encargo de D-185 —las
migraciones `0051` a `0054`, cinco tablas, tres `pg_cron`, tres pantallas nuevas, el service worker y
el despachador— tal como está en `feature/cuentas-y-recordatorios`. **Nada de esto está en
producción.**

Este informe tampoco oculta errores. Incluye lo que se intentó romper y no cedió, porque un ataque
que falla también es un resultado: sin él, «no encontré nada» no se distingue de «no busqué».

---

## 10. Método

Igual que la auditoría de la Fase 9: **se prueba el sistema, no se relee**. Releer encuentra lo que
su autor ya sabía; ejecutar encuentra lo que creía y no era cierto.

| Técnica | Qué se hizo |
|---|---|
| Sonda adversaria | **47 intentos** de romper el aislamiento de las cinco tablas nuevas, con sesiones reales y **clave pública**, nunca `service_role` (D-043). Escrita desde cero, sin reutilizar ninguna aserción de las suites |
| Medición con volumen | `EXPLAIN (ANALYZE)` sobre las seis consultas calientes, con **2.000 recordatorios, 5.000 filas de cola y 100.000 ocurrencias** — diez años de un vendedor con los catorce recordatorios al tope |
| Comparación de la función reescrita | Los dos cuerpos de `process_due_payment_reminders` —`0052` y `0054`— extraídos y comparados línea a línea |
| Coherencia documental | **Once comprobaciones** de afirmaciones concretas de los documentos contra el catálogo y contra las cifras reales de las suites |
| Barrido de textos | Los **119 textos** visibles de los cuatro archivos de copy, y el de reserva del service worker, contra las palabras prohibidas del glosario |
| Barrido de calidad | `any`, tamaño de archivos, secretos en el código, y qué sale hacia el proyecto real |
| Medición de los otros tres anchos | **375, 390 y 430 px** sobre las cuatro pantallas y los dos diálogos — el único criterio escrito de la Etapa 6 que estaba sin cumplir |
| Reejecución de la matriz | `verify`, `test:db` y la suite E2E completa |

Todo lo que escribió se hizo **contra la instancia local**, y lo que cargó volumen se deshizo con
`rollback`. **El proyecto real no se tocó en ningún momento de las seis etapas** — comprobado: la
rama sigue sin publicar y sin etiquetas nuevas.

---

## 11. Resumen de hallazgos de la Etapa 6

| ID | Hallazgo | Severidad | Estado |
|---|---|---|---|
| **A-07** | Quien conozca el `endpoint` de otra persona puede **quitarle el dispositivo** de avisos | Baja | ⚠️ **Aceptado con motivo** — **I-110**, con el arreglo propuesto escrito |
| **A-08** | Una tabla nueva en `public` **nace legible** por `authenticated` | Informativa | ✅ **Corregido** en la Etapa 5 para `push_outbox`; anotado como **I-111** para las futuras |
| **A-09** | La definición viva del motor **perdió sus comentarios** al reescribirse en la `0054` | Informativa | ✅ **Corregido** en esta etapa |
| **A-10** | Las **cuatro** sospechas del barrido de textos eran **falsos positivos de la propia sonda** | — | Sin acción sobre el producto: se corrigió la sonda, en dos vueltas |
| **A-11** | Un criterio escrito de esta etapa —**375, 390 y 430 px**— estaba **sin medir** | Informativa | ✅ **Medido** en esta etapa: 8/8, sin desbordamiento |

**46 de 47 sondas rebotaron.** La única que pasó es A-07.

---

## 12. Auditoría de seguridad de la Etapa 6

### 12.1 Aislamiento — 24 sondas, 24 bloqueadas

| Qué se intentó | Resultado |
|---|---|
| Otro vendedor, el Dueño, el Administrador y un visitante leyendo las **cinco** tablas (20 sondas) | **0 filas** en todos los casos; `42501` sobre `push_outbox`, que no concede nada |
| Sacar cuentas ajenas **por un recurso anidado** de PostgREST, desde `seller_payment_reminders` | `PGRST200`: la relación ni siquiera existe |
| Sacar el **mensaje** de un recordatorio ajeno desde `payment_reminder_occurrences` | 0 filas |
| Leer la **cola** desde la propia campana (`notifications → push_outbox`) | `42501` |
| Leer las **claves** de un dispositivo ajeno desde `profiles` | La fila del propio perfil, con la lista **vacía** |

Lo que importa de los cuatro últimos: **la RLS se aplica también al recurso anidado**, que es
precisamente donde una política floja se escapa sin que nadie lo note.

### 12.2 Escritura y manipulación de RPC — 14 sondas, 13 bloqueadas

| Qué se intentó | Resultado |
|---|---|
| Atender la ocurrencia de otro, siendo vendedor o siendo el Dueño | Rechazado, con la misma frase que si no existiera |
| Corregir la cuenta ajena, archivar el recordatorio ajeno | Rechazado |
| **Adelantar el reloj del propio recordatorio** para forzar un envío | `42501`: no hay privilegio de `UPDATE` |
| **Fabricar un aviso** en la propia campana | `42501` |
| **Meter algo en la cola de salida** | `42501` |
| Ejecutar `process_due_payment_reminders`, `claim_push_outbox`, `mark_push_outbox_sent`, `mark_push_outbox_failed`, `revoke_push_subscription` y `wake_push_dispatcher` | `42501` las seis |
| **Quitarle el dispositivo a otro conociendo su `endpoint`** (sonda 38) | **PASÓ** → A-07 |

### 12.3 A-07 — la única que pasó (Baja) ⚠️ aceptada con motivo

`upsert_push_subscription` reasigna la fila a quien llama cuando el `endpoint` ya existe, y eso es
**deliberado**: en un móvil compartido —el caso normal de este producto— el navegador entrega siempre
el mismo `endpoint`, así que activar los avisos tiene que **cambiar el dueño** en vez de duplicar la
fila (D-190, Decisión 2). El precio es que la reasignación se autentica **solo con conocer el
`endpoint`**.

**Qué hace falta para explotarlo.** Conocer una cadena opaca de ~100 caracteres que la aplicación
**no expone por ningún camino**: las sondas 4, 9, 14, 19 y 24 comprobaron que no la alcanzan ni otro
vendedor, ni el Dueño, ni el Administrador, ni un visitante, ni un recurso anidado; la sonda 42
comprobó que tampoco está en `audit_logs`. Exige, por tanto, una fuga **fuera** de la aplicación.

**Qué consigue quien lo explote: ninguna información.** Al reasignar pone sus propias claves, así que
los avisos siguen yendo al `endpoint` de la víctima cifrados con claves que su navegador no tiene. La
víctima deja de recibir avisos útiles; **el atacante no recibe ninguno**. Es una **denegación**, no
una fuga — y **la campana interna no se ve afectada** (BR-V01), que es lo único que el contrato
promete.

**El arreglo propuesto**, escrito en I-110 para quien lo tome: exigir que el `p256dh` y el `auth`
presentados **coincidan con los guardados** para aceptar el cambio de dueño. El caso legítimo los
presenta idénticos, porque es la misma suscripción del mismo navegador.

**Por qué no se aplicó aquí.** Este entorno **no puede ejercer el camino legítimo**: el navegador
integrado no registra service workers (D-190), así que un endurecimiento se entregaría sin haber
visto nunca funcionar lo que endurece. Si algún navegador rotara las claves conservando el
`endpoint`, la persona quedaría sin poder reactivar sus avisos y sin salida desde la pantalla — un
daño cierto a cambio de cerrar un ataque que exige una fuga previa. **Una auditoría que endurece a
ciegas un flujo que no puede probar deja algo peor que lo que arregla.** Queda con nombre, severidad
y arreglo escrito, y una prueba —`P-04b` en `push-subscriptions.test.ts`— que **se cae** si alguien
lo cambia sin leerlo.

### 12.4 Fugas — 6 sondas, 6 limpias

Se creó una cuenta bancaria con el número `999-888-777`, un recordatorio con el mensaje «Mi mensaje
privado de cobro» y un dispositivo, y se buscaron por todas partes:

| Dónde se buscó | Resultado |
|---|---|
| `audit_logs`, el número de cuenta | **0 filas** |
| `audit_logs`, el `endpoint` | **0 filas** |
| `audit_logs`, el mensaje del vendedor | **0 filas** |
| `notifications.data` | **0 filas** |
| `push_outbox.payload` | **0 filas** |
| El catálogo público | Nada de cobro |

Es la comprobación que sostiene BR-D04 y BR-V05 a la vez: **la bitácora la lee el personal entero**,
y el aviso del teléfono se lee en una pantalla bloqueada.

### 12.5 Integridad — 3 sondas

Con `service_role`, que salta la RLS pero **no** los CHECK: una cuenta en la posición 6 se rechaza
(`23514`), una ocurrencia omitida **con** campana se rechaza (`23514`), y una omitida **sin** campana
entra, que es lo correcto.

Y dos invariantes se hicieron notar sin que nadie las probara: el generador de carga de la sonda de
rendimiento fue rechazado **dos veces** —por el tope de catorce recordatorios y por la unicidad de
(vendedor, día, hora)— antes de conseguir insertar nada.

---

## 13. Auditoría de rendimiento de la Etapa 6

Con **2.000 recordatorios, 5.000 filas de cola y 100.000 ocurrencias** —diez años de un vendedor con
los catorce recordatorios al tope, un volumen que este producto no va a ver—:

| Consulta | Tiempo | Plan |
|---|---|---|
| Motor: recordatorios vencidos | **0,02 ms** | índice |
| Despachador: cola pendiente | **0,05 ms** | índice |
| Despachador: recuperar abandonadas | **0,01 ms** | índice |
| Pantalla: ocurrencias pendientes | **0,16 ms** | índice |
| Resumen: recuento de pendientes | **0,11 ms** | índice |
| Idempotencia: ¿ya existe la ocurrencia? | **0,01 ms** | índice |
| Motor completo, con 30 vencidos | **13 ms** | |
| `claim_push_outbox` de un lote de 50 | **4 ms** | |

**Ningún hallazgo.** Las dos consultas que resolvieron por recorrido —los dispositivos vivos de una
persona— lo hicieron sobre una distribución degenerada en la que **una sola persona tenía las 501
filas**; el planificador tiene razón en recorrer, y tardó 0,11 ms. En la realidad, una persona tiene
dos o tres dispositivos.

Lo que de verdad dice esta tabla: el trabajo que corre **cada minuto** —el motor y el despachador—
lee índices y termina en milisegundos.

---

## 14. Auditoría de regresiones de la Etapa 6

### A-09 — La definición viva del motor había perdido sus comentarios (Informativa) ✅ corregido

`create or replace` reescribe la función entera, así que no basta con leer el comentario que dice «el
resto es idéntico»: se extrajeron los dos cuerpos de `process_due_payment_reminders` —el de la `0052`
y el de la `0054`— y se compararon línea a línea.

Resultado de la primera pasada: **ninguna sentencia ejecutable perdida** —la única aparente era el
mismo `null` con su comentario recortado— pero **veintiocho líneas de comentario desaparecidas**. La
definición viva del motor había perdido las explicaciones de BR-S13, de por qué la campana es
durable, de por qué el reloj avanza siempre y **la advertencia sobre el disparador que lo dejaría en
bucle**. Para el siguiente que lea la `0054` —que es la definición real— ese «porqué» no existía.

**Corregido en esta etapa**: los comentarios están restaurados y la comparación vuelve a dar **cero
líneas perdidas**, ejecutables o no. El único añadido de la `0054` sigue siendo el bloque marcado
«AÑADIDO EN LA 0054 (BR-V02)».

---

## 15. Auditoría de textos y de lo que se ve en el teléfono (Etapa 6)

Los **119 textos** visibles de `PUSH_COPY`, `REMINDER_COPY`, `ACCOUNT_COPY` y `pushMessageFor`, más
el de reserva del service worker, contra las palabras que el glosario prohíbe —«notificación»,
«push», «token», «endpoint», «suscripción»—: **ninguno las usa**.

### A-10 — Cuatro falsos positivos, y los cuatro eran de la sonda

La primera versión de esta comprobación marcó tres sospechas, y las tres eran **suyas**: miraba el
archivo entero, así que contaba los comentarios —que citan `push` y `PushManager` precisamente para
explicar por qué no se escriben en pantalla— y los nombres de las constantes, como `PUSH_FALLBACK`.
Se corrigió para importar los objetos y mirar **los valores**, que es lo que se lee.

**Y la corrección se quedó corta, lo que da el cuarto.** El texto de reserva del service worker no es
un objeto importable —vive en `public/sw.js`—, así que esa rama siguió recortando el archivo, y el
recorte empieza justo en `const PUSH_FALLBACK`: se marcaba a sí mismo. Los valores de ese bloque son
`Rifas` y «Tienes un aviso nuevo. Ábrelo para verlo.», que no contienen ninguna palabra prohibida.
Corregido también, y **la misma comprobación estaba duplicada en la sonda de coherencia con la
versión mala**: se retiró de allí en vez de arreglarla dos veces, porque un mismo control en dos
sitios termina divergiendo.

Queda anotado con detalle porque es la clase de sonda que, mal escrita, produce hallazgos que no
existen — y porque **el primer arreglo no bastó**, que es justo lo que un informe tiende a callar.

Y se comprobó que **ningún texto visible vive fuera de su archivo de copy**: los dos componentes
nuevos no llevan ni una frase escrita dentro.

### Los otros tres anchos del encargo — el único criterio que estaba sin cumplir

`TESTING` §4.8 dejó escrito, **antes de construir nada**, que la Etapa 6 mediría **375, 390 y 430 px**
además de los 320 que la Etapa 2 ya medía. Al revisarlo, esos tres **no estaban medidos**: el archivo
móvil fijaba 320 en todas sus pruebas.

No se reescribió el criterio para que encajara con lo hecho — que es justo lo que este proyecto se
prohíbe—: se midió. `configuracion-cobro-movil.spec.ts` recorre ahora los tres anchos sobre las
**cuatro pantallas** del módulo y sobre **los dos diálogos**, que es donde vive el bloque más ancho
que pinta este módulo (el mensaje completo con las cuentas al final).

**8/8 en verde, sin desbordamiento en ninguno.** Es un resultado negativo y se escribe igual: un
ancho intermedio puede romperse donde el estrecho no, porque es donde cambian los puntos de corte y
una fila pasa de apilada a horizontal. Aquí no pasó.

---

## 16. Auditoría de calidad de la Etapa 6

| Qué | Resultado |
|---|---|
| `any` en los tres módulos del encargo | **Ninguno** |
| Archivo más grande | `webpush.ts`, **337 líneas**, la mayoría documentación del RFC |
| Secretos en el código | **Ninguno**: las coincidencias son nombres de variable, y el artefacto de Supabase está ignorado por Git |
| Textos visibles fuera de su archivo de copy | **Ninguno** |
| Dependencias nuevas en las cinco etapas | **Cero** |

---

## 17. Coherencia documental de la Etapa 6

Once comprobaciones contra el catálogo y contra las cifras reales:

* **31 reglas** del encargo (BR-M, BR-S, BR-V), **ninguna** sigue marcada como pendiente.
* **54 migraciones** en el repositorio, y `HANDOFF` dice «54 en local y 50 en el proyecto real».
* Los **tres** `pg_cron` existen y están activos.
* Las **cinco** tablas existen, y **ninguna** tabla del esquema está sin RLS forzada.
* **Ninguna** de las catorce funciones internas es ejecutable por `authenticated`.
* La suite unitaria entera da **1.004**, la cifra que `TESTING` y `TEST_RESULTS` declaran.
* El glosario define los tres términos nuevos.
* Los cuatro archivos de copy no usan palabras técnicas.

**Una corrección salida de aquí**: `TESTING` §4.8 decía `push-subscriptions.test.ts` **(20)** y la
prueba `P-04b` que esta auditoría añadió lo dejó en **21**. Corregido, con el total de base de datos.

---

## 18. Qué queda pendiente tras la Etapa 6

| Asunto | Quién decide |
|---|---|
| **I-110**, la reasignación por `endpoint` | El dueño del producto: aceptar como está, o endurecer con el arreglo escrito **y probarlo en un teléfono real** |
| **Nadie ha visto un aviso llegar a un teléfono** | La Etapa 7: es lo único que no se puede demostrar sin claves configuradas y un dispositivo |
| **I-024**, plan Free | Ahora con tres motivos: sin backups, y un proyecto pausado no corre **ninguno** de los tres cron |
| La promoción arrastra más que migraciones | Cuatro migraciones, **tres variables de entorno** y **dos secretos del vault**. Y es la primera vez en este encargo que algo **sale hacia afuera** |
| El par VAPID de las pruebas | Se generó en una sesión de trabajo y su clave privada quedó escrita ahí. **No se usa en producción**: la Etapa 7 genera uno nuevo con `npm run vapid` |

---

## 19. Conclusión de la Etapa 6

Las cinco etapas se sostienen. **46 de 47 sondas adversarias rebotaron**, las seis búsquedas de fugas
salieron limpias, el trabajo que corre cada minuto lee índices y termina en milisegundos, y los
textos respetan el glosario.

Lo que esta auditoría añade no es tranquilidad, sino **tres cosas escritas**: un ataque real aunque
remoto, con su arreglo redactado y una prueba que obliga a leerlo (**I-110**); una trampa del entorno
que ya mordió una vez y morderá a la siguiente tabla (**I-111**); y la restauración de los
comentarios que la definición viva del motor había perdido sin que nadie lo notara.

**Ninguno de los tres se habría encontrado releyendo el código.**
