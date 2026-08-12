# REGISTRO DE DECISIONES

Bitácora de decisiones técnicas y de producto. Formato: contexto → decisión → alternativas
descartadas → consecuencia. Cada decisión tiene un identificador estable citado desde otros
documentos.

- **Versión:** 1.16 · **Actualizado:** 2026-08-10 (D-001 a D-089)

Una decisión se presume vigente salvo que una entrada posterior la marque como sustituida, el usuario
solicite cambiarla, exista evidencia de obsolescencia o haga falta corregir un defecto real. Las notas
de vigencia se añaden sin reescribir el contexto histórico.

---

## D-001 — Documentación del proyecto en español
**Fase:** 0
**Contexto.** `CLAUDE.md` exige interfaz en español, pero no define el idioma de la documentación.
**Decisión.** Toda la documentación de `docs/` se escribe en español; el código, los nombres de
tablas, columnas y valores de enumeración se mantienen en inglés.
**Alternativas.** Documentación en inglés (descartada: el usuario y el negocio operan en español).
**Consecuencia.** Las etiquetas visibles se traducen en una única fuente (`lib/constants.ts`).

## D-002 — TypeScript 5.9.3 en lugar de 7.x
**Fase:** 0
**Contexto.** El `latest` de TypeScript es 7.0.2, pero `typescript-eslint@8.65.0` declara
`peerDependencies.typescript: ">=4.8.4 <6.1.0"`.
**Decisión.** Fijar TypeScript `5.9.3`, la última versión estable dentro del rango soportado por el
resto del tooling.
**Alternativas.** Usar 7.x y renunciar a las reglas de lint con tipos (descartada: `CLAUDE.md` §29
prohíbe silenciar el lint). Usar 7.x con `--ignore-peer-deps` (descartada: comportamiento no
soportado).
**Consecuencia.** Se revisará la migración a 7.x cuando `typescript-eslint` la soporte. Registrado en
`docs/KNOWN_ISSUES.md` como deuda técnica de seguimiento.

## D-003 — `CLAUDE.md` canónico junto al `.txt` original
**Fase:** 0
**Contexto.** La especificación llegó como `CLAUDE.md.txt`. `CLAUDE.md` §28 exige mantener
`CLAUDE.md`, y las herramientas del proyecto leen ese nombre exacto.
**Decisión.** Crear `CLAUDE.md` como copia byte a byte de `CLAUDE.md.txt` y conservar el `.txt` sin
tocarlo, como constancia del original.
**Alternativas.** Renombrar el archivo (descartada: elimina el original del usuario sin permiso).
**Consecuencia.** `CLAUDE.md` es la fuente de verdad operativa. Si el usuario lo prefiere, puede
borrar el `.txt` en cualquier momento; conviene no editar ambos por separado.

**Vigencia (2026-08-09).** La copia `.txt` se eliminó con autorización el 2026-08-05 (I-004). D-086
sustituye la consecuencia operativa: `CLAUDE.md` es la entrada de Claude Code, `AGENTS.md` la de
Codex y las fuentes funcionales comunes viven en `docs/`; ninguno de los dos archivos raíz es una
segunda especificación independiente.

## D-004 — Inicialización de Git en la Fase 0
**Fase:** 0
**Contexto.** La carpeta no era un repositorio Git. `CLAUDE.md` §1.14 exige un commit local al
finalizar cada fase «cuando el repositorio tenga Git configurado».
**Decisión.** Inicializar un repositorio Git local con `.gitignore` y crear el commit de la Fase 0.
No se configura ningún remoto ni se hace push.
**Alternativas.** No usar control de versiones hasta la Fase 1 (descartada: dejaría la Fase 0 sin
trazabilidad y sin punto de reversión).
**Consecuencia.** Cada fase termina con un commit local verificable.

## D-005 — `memberships` como tabla independiente
**Fase:** 0
**Contexto.** El rol y la organización podrían guardarse directamente en `profiles`.
**Decisión.** Modelar `memberships` (usuario × organización × rol × activo).
**Alternativas.** `profiles.organization_id` + `profiles.role` (descartada: impide la
multiorganización exigida por `CLAUDE.md` §7 y obligaría a migrar datos después).
**Consecuencia.** Una consulta adicional para resolver el rol, resuelta con índice y funciones
`STABLE`.

## D-006 — El rol se lee de la base de datos, no del JWT
**Fase:** 0
**Contexto.** Supabase permite guardar el rol en `app_metadata` dentro del JWT, lo que evita una
consulta por request.
**Decisión.** El rol y el estado activo se resuelven consultando `memberships` en el servidor y en
las políticas RLS.
**Alternativas.** Rol en el JWT (descartada: un usuario desactivado conservaría privilegios hasta que
expire el token, incumpliendo `CLAUDE.md` §9).
**Consecuencia.** Coste de una consulta indexada por request, a cambio de revocación inmediata.

## D-007 — `organization_id` denormalizado y claves foráneas compuestas
**Fase:** 0
**Contexto.** La organización es deducible siguiendo las relaciones padre.
**Decisión.** Todas las tablas de negocio llevan `organization_id` propio, y las relaciones se
declaran como FK compuestas que lo incluyen.
**Alternativas.** Deducir la organización por `JOIN` (descartada: políticas RLS más lentas y
complejas, y ninguna garantía estructural contra mezclas de organización).
**Consecuencia.** Es imposible relacionar entidades de organizaciones distintas, incluso con
`SERVICE_ROLE`.

## D-008 — `bigint` para todos los valores monetarios
**Fase:** 0
**Contexto.** `CLAUDE.md` §6 exige enteros. `integer` bastaría para una boleta, pero no para
acumulados.
**Decisión.** Usar `bigint` en toda columna monetaria y en las agregaciones.
**Alternativas.** `integer` (descartada: 1.000 boletas × $100.000 = $100.000.000 se acerca a límites
incómodos en acumulados históricos). `numeric` (descartada: `CLAUDE.md` exige enteros).
**Consecuencia.** Los valores permanecen muy por debajo de 2^53, por lo que se manejan como `number`
en TypeScript sin pérdida de precisión.

## D-009 — `paid_amount` materializado y `payment_status` generado
**Fase:** 0
**Contexto.** El estado de pago debe calcularse, y los listados no pueden agregar pagos en cada
consulta.
**Decisión.** `tickets.paid_amount` es una columna mantenida por trigger, y `tickets.payment_status`
es una columna generada (`STORED`) derivada de `paid_amount` y `sale_price`.
**Alternativas.** Calcular todo en vistas (descartada: impide `CHECK` de sobrepago e índices sobre el
estado). Calcular en el frontend (prohibido por `CLAUDE.md` §29).
**Consecuencia.** El sobrepago se vuelve imposible a nivel físico y los filtros por estado son
indexables. El trigger debe cubrir inserción, actualización, borrado y anulación.

## D-010 — Vistas con `security_invoker = true`
**Fase:** 0
**Contexto.** En PostgreSQL, una vista se ejecuta por defecto con los privilegios de su propietario y
omite las políticas RLS de las tablas base.
**Decisión.** Toda vista se crea con `WITH (security_invoker = true)`.
**Alternativas.** Vistas normales con filtros manuales (descartada: un descuido filtraría datos entre
vendedores).
**Consecuencia.** Punto de verificación obligatorio en las fases 2 y 9.

## D-011 — Pagos permitidos en rifas cerradas, no en canceladas
**Fase:** 0
**Contexto.** `CLAUDE.md` no define si una rifa cerrada admite el cobro de deudas pendientes.
**Decisión.** En estado `closed` se permite registrar pagos de boletas ya vendidas, pero no crear
boletas ni asignarlas. En estado `cancelled` no se permite ninguna operación nueva.
**Alternativas.** Bloquear todo al cerrar (descartada: dejaría deudas reales sin poder registrarse,
contradiciendo el objetivo de trazabilidad del dinero).
**Consecuencia.** Regla BR-R09; se valida en la RPC de pagos.

## D-012 — Cuadre pago ↔ asignaciones con *constraint trigger* diferido
**Fase:** 0
**Contexto.** `SUM(allocations) = total_amount` no se puede expresar como `CHECK` de fila.
**Decisión.** Usar un `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` que se evalúa al confirmar
la transacción.
**Alternativas.** Validar solo en la aplicación (descartada: la base de datos debe garantizarlo).
Validar en `AFTER INSERT` inmediato (descartada: fallaría al insertar el pago antes que sus
asignaciones).
**Consecuencia.** El pago y sus asignaciones pueden insertarse en cualquier orden dentro de la misma
transacción, pero no se puede confirmar un estado descuadrado.

## D-013 — La anulación de pagos es irreversible
**Fase:** 0
**Contexto.** `CLAUDE.md` §20 define la anulación pero no una posible reversión.
**Decisión.** Un pago anulado no se puede «desanular». Si fue un error, se registra un pago nuevo.
**Alternativas.** Permitir revertir la anulación (descartada: complica la auditoría y permite
manipular el historial).
**Consecuencia.** Regla BR-F15. El historial refleja fielmente lo ocurrido.

## D-014 — Formato de `internal_code`
**Fase:** 0
**Contexto.** `CLAUDE.md` §13 exige `internal_code` pero no define su formato.
**Decisión.** `{raffles.short_code}-{secuencia de 6 dígitos}`, por ejemplo `R001-000123`, único por
organización y generado por la base de datos.
**Alternativas.** UUID visible (descartada: imposible de dictar por teléfono). Secuencia global
(descartada: no indica a qué rifa pertenece).
**Consecuencia.** Búsqueda por código legible y sin colisiones entre rifas.

## D-015 — Un único Owner activo por organización
**Fase:** 0
**Contexto.** `CLAUDE.md` describe al Owner en singular, sin decirlo explícitamente.
**Decisión.** Índice único parcial que garantiza exactamente un Owner activo por organización.
**Alternativas.** Varios Owners (descartada: haría ambigua la protección «un Admin no puede
desactivar al Owner»).
**Consecuencia.** La transferencia de propiedad será una operación atómica dedicada.

## D-016 — Nombre de rifa único por organización
**Fase:** 0
**Contexto.** No se especifica unicidad del nombre.
**Decisión.** Único por organización, comparando sin distinción de mayúsculas y sin espacios
extremos.
**Alternativas.** Permitir nombres repetidos (descartada: los reportes por rifa serían ambiguos para
el operador).
**Consecuencia.** Regla BR-R11.

## D-017 — Las boletas en `draft` admiten números nulos
**Fase:** 0
**Contexto.** La creación masiva genera filas antes de capturar los números.
**Decisión.** `daily_number` y `weekly_number` pueden ser `NULL` **solo** en estado `draft`; son
obligatorios en cualquier otro estado.
**Alternativas.** Exigirlos siempre (descartada: imposibilita el guardado parcial exigido por
`CLAUDE.md` §15). Usar cadena vacía (descartada: `''` violaría la restricción de formato y rompería
la unicidad).
**Consecuencia.** Reglas BR-N09 y `tickets_numbers_required_unless_draft`.

## D-018 — `[0-9]` en lugar de `\d` en las restricciones
**Fase:** 0
**Contexto.** `CLAUDE.md` §13 sugiere `^\d{1,4}$`. En PostgreSQL, `\d` equivale a `[[:digit:]]`, que
en una intercalación Unicode puede aceptar dígitos de otros alfabetos.
**Decisión.** Usar `^[0-9]{1,4}$` en la base de datos y `/^[0-9]{1,4}$/` en Zod.
**Alternativas.** Mantener `\d` (descartada: aceptaría caracteres no ASCII imposibles de imprimir en
una boleta física).
**Consecuencia.** Equivalente a lo pedido, pero estricto sobre dígitos ASCII.

## D-019 — Prefijo de ruta `/owner` para Owner y Admin
**Fase:** 0
**Contexto.** `CLAUDE.md` §21 define rutas `/owner/*` para ambos roles, lo que podría interpretarse
como exclusivo del Owner.
**Decisión.** Se respeta el prefijo literal `/owner` para los dos roles administrativos. El rol se
verifica por operación, no por el segmento de la URL.
**Alternativas.** Renombrar a `/admin` (descartada: contradice la especificación).
**Consecuencia.** La documentación aclara que la URL no otorga privilegios.

## D-020 — `payment_method` como enumeración cerrada
**Fase:** 0
**Contexto.** `CLAUDE.md` exige el campo pero no sus valores.
**Decisión.** Enumeración `cash` (Efectivo), `transfer` (Transferencia), `other` (Otro), con las
notas del pago como texto libre para el detalle.
**Alternativas.** Texto libre (descartada: impide agrupar en reportes). Catálogo configurable
(descartada: complejidad innecesaria para el MVP).
**Consecuencia.** Ampliable con una migración si el negocio lo requiere.

## D-021 — El rol del vendedor de una boleta se valida por trigger
**Fase:** 0
**Contexto.** Se necesita garantizar que `tickets.seller_id` corresponde a una membresía con rol
`seller`. Podría lograrse con una columna generada constante dentro de una FK compuesta.
**Decisión.** Validarlo con un trigger `BEFORE INSERT/UPDATE`.
**Alternativas.** FK compuesta con columna constante (descartada: bloquearía cambiar el rol de una
persona que ya tiene boletas, un escenario legítimo del negocio).
**Consecuencia.** La validación se aplica al escribir la boleta, no retroactivamente.

## D-022 — Fechas de negocio como `date` en `America/Bogota`
**Fase:** 0
**Contexto.** `sale_date` y `payment_date` son días calendario, no instantes.
**Decisión.** Tipo `date`, con valor por defecto calculado por la función `today_bogota()`. Las
marcas de tiempo técnicas siguen siendo `timestamptz`. El proceso de Node se ejecuta con `TZ=UTC` y
la conversión a hora local es explícita en la capa de presentación.
**Alternativas.** `timestamptz` para todo (descartada: un pago del 31 a las 20:00 en Bogotá se
registraría como día 1 en UTC, desplazando los reportes diarios).
**Consecuencia.** Los cortes por día coinciden con la operación real del negocio.

## D-023 — `.env.example` creado en la Fase 0
**Fase:** 0
**Contexto.** `CLAUDE.md` §28 lo exige como documentación obligatoria; la Fase 1 lo incluye entre sus
tareas.
**Decisión.** Crearlo ya, únicamente con nombres de variable y valores de marcador. En la Fase 1 se
completará con lo que el proyecto realmente consuma.
**Alternativas.** Esperar a la Fase 1 (descartada: dejaría incompleta la documentación obligatoria de
la Fase 0).
**Consecuencia.** No contiene ningún secreto ni implica instalar dependencias.

## D-024 — Teléfono obligatorio, email opcional en clientes
**Fase:** 0
**Contexto.** `CLAUDE.md` §12 lo indica para clientes; §9 pide teléfono para usuarios.
**Decisión.** `clients.phone` y `profiles.phone` son `NOT NULL` con formato validado;
`clients.email` es opcional y `profiles.email` obligatorio (proviene de Auth).
**Alternativas.** Teléfono opcional (descartada: contradice la especificación).
**Consecuencia.** El seed y los formularios exigen teléfono.

## D-025 — Cliente duplicado por teléfono: advertencia, no error
**Fase:** 0
**Contexto.** Dos vendedores pueden atender a la misma persona; incluso un mismo vendedor puede
registrarla dos veces por error.
**Decisión.** No se impone unicidad de teléfono. Al crear un cliente con un teléfono ya existente en
la cartera del vendedor, la interfaz muestra una advertencia con el registro existente y permite
continuar.
**Alternativas.** Teléfono único por vendedor (descartada: familias que comparten un mismo número
quedarían bloqueadas). Teléfono único por organización (descartada: rompe la separación de carteras
exigida por `CLAUDE.md` §12).
**Consecuencia.** Regla BR-C05 y advertencia de UI en la Fase 4.

## D-026 — Seed en dos piezas
**Fase:** 0
**Contexto.** Los usuarios de `auth.users` no deben crearse con SQL plano; las contraseñas no pueden
versionarse.
**Decisión.** `scripts/seed-users.ts` crea los usuarios de autenticación con `SERVICE_ROLE` y
contraseñas tomadas de variables de entorno; `supabase/seed.sql` crea los datos de negocio y los
enlaza por email.
**Alternativas.** Insertar directamente en `auth.users` (descartada: frágil ante cambios internos de
Supabase y propenso a dejar cuentas inconsistentes).
**Consecuencia.** `supabase db reset` seguido de `npm run seed:users` reconstruye el entorno completo.

## D-027 — `src/proxy.ts` en lugar de `src/middleware.ts`
**Fase:** 1
**Contexto.** `docs/ARCHITECTURE.md` (Fase 0) especificaba `src/middleware.ts`. Al implementar, se
confirmó que Next.js 16 renombra la convención `middleware` a `proxy`: el archivo `middleware.ts` y
la función exportada `middleware` quedan obsoletos en favor de `proxy.ts` / `export function proxy()`.
**Decisión.** Usar `src/proxy.ts` con `export async function proxy(request)`, y renombrar el helper
`lib/supabase/middleware.ts` a `lib/supabase/proxy.ts`.
**Alternativas.** Mantener `middleware.ts` (funciona pero genera una advertencia de obsolescencia;
contradice CLAUDE.md §29 "no silenciar advertencias sin justificación").
**Consecuencia.** `docs/ARCHITECTURE.md` §5 y §6 actualizados para reflejar `proxy.ts`.

## D-028 — Variable de entorno `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
**Fase:** 1
**Contexto.** `docs/ARCHITECTURE.md` (Fase 0) usaba `NEXT_PUBLIC_SUPABASE_ANON_KEY`. La clave que
entregó el usuario desde el dashboard de Supabase es del nuevo formato `sb_publishable_...`, y la
documentación oficial actual de Supabase para Next.js usa el nombre `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
**Decisión.** Renombrar la variable en todo el proyecto. `@supabase/ssr` acepta indistintamente el
JWT anon clásico o la nueva publishable key como segundo argumento de `createBrowserClient`/
`createServerClient`.
**Alternativas.** Mantener `ANON_KEY` (descartada: divergiría de la terminología actual de Supabase y
de lo que el usuario ve literalmente en su dashboard).
**Consecuencia.** `.env.example`, `docs/ARCHITECTURE.md` §4/§12 y `docs/SECURITY.md` §7 actualizados.

## D-029 — `@supabase/supabase-js@2.109.0` + `@supabase/ssr@0.12.0` (no las últimas)
**Fase:** 1
**Contexto.** `@supabase/supabase-js` a partir de `2.110.0` exige Node `>=22.0.0` (confirmado con
`npm view`); el entorno de desarrollo tiene Node 20.20.2, igual que el mínimo documentado en
`docs/ARCHITECTURE.md` (`>=20.9.0`, ver Fase 0). Se necesitaba la última versión de `supabase-js`
compatible con Node 20, y la versión de `@supabase/ssr` cuyo rango de peer dependency la acepte.
**Decisión.** Fijar `@supabase/supabase-js@2.109.0` (última con `node >=20.0.0`) y
`@supabase/ssr@0.12.0` (única versión de `ssr` cuyo peer `^2.108.0` admite `2.109.0`; versiones
posteriores de `ssr` exigen `supabase-js >=2.110.x`).
**Alternativas.** Exigir Node 22 en todo el proyecto (descartada: contradice el mínimo ya documentado
y verificado en la Fase 0, y no aporta ninguna función necesaria para el MVP).
**Consecuencia.** Mismo patrón que D-002 (TypeScript/typescript-eslint): pin explícito documentado,
con revisión futura cuando el entorno pase a Node 22 o el ecosistema estabilice el soporte de Node 20.

## D-030 — `jsdom@29.1.1` (no `30.x`)
**Fase:** 1
**Contexto.** `jsdom@30.0.1` (el `latest`) exige Node `^22.22.2 || ^24.15.0 || >=26.0.0` a través de
sus propias dependencias (`@asamuzakjp/css-color`, `undici`, `whatwg-url`), incompatible con Node 20.
**Decisión.** Fijar `jsdom@29.1.1`, la última versión cuyo rango (`^20.19.0 || ...`) incluye Node 20.
**Consecuencia.** El mínimo real de Node para `npm install` en este repo es `20.19.0`, no `20.9.0`
(ese es el mínimo de Next.js en solitario). `package.json.engines.node` se ajustó a `>=20.19.0`.

## D-031 — ESLint 9.x, no 10.x
**Fase:** 1
**Contexto.** `eslint@10.8.0` rompe el lint con un `TypeError` real (`contextOrFilename.getFilename
is not a function`) proveniente de `eslint-plugin-react@7.37.5`, empaquetado internamente por
`eslint-config-next@16.2.12`. Esa versión de `eslint-plugin-react` declara
`peerDependencies.eslint: "^3 || ... || ^9.7"`: no admite ESLint 10 en absoluto, pese a que
`eslint-config-next` anuncia un peer `>=9.0.0` sin techo.
**Decisión.** Fijar `eslint@9.39.5` (última de la línea 9.x).
**Alternativas.** Ninguna: no existe una versión de `eslint-config-next@16.2.12` que resuelva esto sin
cambiar la versión de ESLint.
**Consecuencia.** Revisar cuando `eslint-config-next` actualice su `eslint-plugin-react` interno.

## D-032 — `typedRoutes` desactivado
**Fase:** 1
**Contexto.** Next.js 16 permite `typedRoutes: true` para validar en compilación los `href` de
`<Link>`. Al activarlo, cualquier `href` calculado en tiempo de ejecución (rutas de redirección según
rol, listas de navegación con datos) exige anotarlo como literal o convertirlo con `as Route`, en
cada punto donde se construye dinámicamente.
**Decisión.** No activar `typedRoutes`. `CLAUDE.md` exige TypeScript estricto (satisfecho por
`tsconfig.json`), no esta función opcional de Next.js.
**Alternativas.** Activarlo y anotar cada `href` dinámico (descartada por ahora: friction
desproporcionada frente al beneficio, y las fases siguientes multiplican los enlaces dinámicos —
detalle de boleta, cliente, rifa por `id`).
**Consecuencia.** Se revisará si el equipo lo pide explícitamente en una fase futura.

## D-033 — `ws` como dependencia de producción
**Fase:** 1
**Contexto.** `@supabase/supabase-js` construye un `RealtimeClient` en `createClient()` aunque no se
use ninguna función de tiempo real. En Node 20 (sin `WebSocket` global nativo) esto lanza
`Error: Node.js 20 detected without native WebSocket support` de forma no capturable, incluso para
uso exclusivo de `auth.admin`.
**Decisión.** Agregar `ws` como dependencia (no de desarrollo, porque `lib/supabase/admin.ts` puede
ejecutarse en el servidor de la aplicación) y pasarlo como `realtime.transport` al crear el cliente
administrador.
**Alternativas.** Exigir Node 22+ en todos los entornos (descartada, ver D-029).
**Consecuencia.** Sin efecto en runtimes con `WebSocket` nativo (Node 22+, Vercel); el cliente
administrador nunca abre conexiones de tiempo real en la práctica.

## D-034 — `database.types.ts` sigue escrito a mano en la Fase 1
**Fase:** 1
**Contexto.** `docs/ARCHITECTURE.md` §1.7 exige tipos generados. `supabase gen types typescript
--db-url` requiere Docker (`LegacyContainerRuntimeNotFoundError`) incluso apuntando a una base
remota, y no había `SUPABASE_ACCESS_TOKEN` para la variante `--project-id`. Docker no está instalado
en este entorno (ver `docs/KNOWN_ISSUES.md` I-002).
**Decisión.** Mantener `database.types.ts` escrito a mano para las 3 tablas de la Fase 1, verificado
manualmente columna por columna contra el esquema real aplicado (`information_schema`/`pg_catalog`).
**Alternativas.** Bloquear la fase hasta instalar Docker (descartada: Docker se instalará de todas
formas en la Fase 2 para Supabase local; no hay razón para bloquear la Fase 1 por esto).
**Consecuencia.** Regenerar con la CLI real en cuanto haya Docker disponible (Fase 2), y eliminar la
nota de advertencia del encabezado del archivo en ese momento.

## D-035 — El script de seed siempre confirma la contraseña con `updateUserById`
**Fase:** 1
**Contexto.** Se verificó empíricamente que `auth.admin.createUser({ password })` crea el usuario
pero deja la contraseña en un estado que rechaza `signInWithPassword` inmediatamente después
(`invalid_credentials`), mientras que un `auth.admin.updateUserById(id, { password })` posterior con
la misma contraseña sí permite iniciar sesión de inmediato, de forma consistente.
**Decisión.** `scripts/seed-users.ts` llama siempre a `updateUserById` con la contraseña objetivo
después de crear o localizar cada usuario, tanto en la primera ejecución como en las siguientes.
**Consecuencia.** El seed es más lento (una llamada adicional por usuario) pero deja contraseñas
utilizables de forma confiable. Documentado también como nota operativa en `docs/KNOWN_ISSUES.md`.

## D-036 — RLS de la Fase 1 limitada a lectura
**Fase:** 1
**Contexto.** `docs/SECURITY.md` (Fase 0) diseña políticas completas de `INSERT`/`UPDATE` para
`memberships` y `profiles`, incluida la protección del Owner ante un Admin. Ninguna pantalla de la
Fase 1 crea ni edita usuarios: esa funcionalidad pertenece a la Fase 3.
**Decisión.** La migración `0001_core_identity.sql` habilita y fuerza RLS en las 3 tablas, con
políticas de `SELECT` (propio registro + lectura de personal sobre su organización) y una única
política de `UPDATE` (perfil propio). Las políticas de gestión de usuarios (crear vendedores/admins,
proteger al Owner) se implementan en la Fase 2 junto con su interfaz en la Fase 3.
**Alternativas.** Implementar ya todas las políticas de `docs/SECURITY.md` (descartada: contradice
`CLAUDE.md` §1.6 "no construyas funcionalidades pertenecientes a fases posteriores"; además esas
políticas no podrían probarse de extremo a extremo sin la interfaz que las ejercita).
**Consecuencia.** Hoy, `organizations`, `profiles` y `memberships` solo se escriben desde
`scripts/seed-users.ts` con la service role, que omite RLS por diseño.

## D-037 — Privilegios `GRANT` explícitos, no heredados del entorno
**Fase:** 2
**Contexto.** Supabase concede privilegios a `anon`/`authenticated`/`service_role` con
`ALTER DEFAULT PRIVILEGES`. Ese mecanismo depende del rol que aplica la migración y **no se comporta
igual en todos los entornos**: verificado en la Fase 2, la instancia local dejó las tablas nuevas sin
`SELECT`/`INSERT`/`UPDATE` (el seed falló con «permission denied»), mientras que el proyecto alojado
sí las concedía —y de más: también `DELETE`.
**Decisión.** Declarar los privilegios explícitamente por tabla (`0009_grants.sql`) y, dado que
`GRANT` solo agrega, revocar primero para partir de un estado conocido (`0010_harden_grants.sql`).
**Alternativas.** Confiar en los valores por defecto (descartada: el mismo esquema se comportaba
distinto en local y en el proyecto real, que es exactamente el tipo de divergencia que causa
incidentes en producción).
**Consecuencia.** El estado de privilegios es idéntico y reproducible en cualquier entorno, y está
cubierto por pruebas de catálogo.

## D-038 — Ninguna tabla concede `DELETE` a `authenticated`
**Fase:** 2
**Contexto.** El borrado físico está prohibido por reglas de negocio (BR-C06 archivar, BR-F09 anular,
BR-D02 bitácora inalterable). La RLS ya lo impide al no definir ninguna política de `DELETE`.
**Decisión.** Además, no conceder el privilegio `DELETE` (ni `TRUNCATE`) sobre ninguna tabla.
**Alternativas.** Confiar solo en la ausencia de políticas (descartada: una única capa; si alguien
agregara mañana una política `DELETE` por error, el borrado quedaría abierto de inmediato).
**Consecuencia.** Dos capas independientes. Para borrar habría que modificar privilegios **y** añadir
una política, dos actos deliberados y visibles en una migración.

## D-039 — `short_code` e `internal_code` con `DEFAULT ''` + `CHECK <> ''`
**Fase:** 2
**Contexto.** Ambos los genera un trigger `BEFORE INSERT`. Declarados `NOT NULL` sin `DEFAULT`, el
generador de tipos los marca como **obligatorios** al insertar, obligando a que la aplicación envíe
un valor que en realidad produce la base de datos.
**Decisión.** Declararlos `NOT NULL DEFAULT '' CHECK (<columna> <> '')`. El `DEFAULT` los vuelve
opcionales para quien inserta (y así lo reflejan los tipos generados); el `CHECK` garantiza que el
trigger efectivamente los rellenó.
**Alternativas.** Hacerlos `NULL` (descartada: debilita la garantía). Castear los tipos en la
aplicación (descartada: repartiría el parche por todo el código de las fases 3 y 4).
**Consecuencia.** Si alguien deshabilitara el trigger, la fila se rechaza en vez de guardarse sin
código.

## D-040 — Las agregaciones monetarias de las vistas se castean a `bigint`
**Fase:** 2
**Contexto.** `sum(bigint)` devuelve `numeric` en PostgreSQL. `numeric` es exacto (no es punto
flotante, así que no viola `CLAUDE.md` §6), pero PostgREST lo serializa distinto que un `bigint`, de
modo que la misma cantidad llegaría al frontend con un tipo desde una tabla y con otro desde una
vista.
**Decisión.** Castear explícitamente a `bigint` toda agregación monetaria de las vistas.
**Consecuencia.** El tipo del dinero es uniforme en todo el sistema. Cubierto por una prueba de
catálogo que exige `bigint`/`integer` en toda columna con `amount` o `price` en el nombre, tablas y
vistas incluidas.

## D-041 — La bitácora ignora columnas de infraestructura y derivadas
**Fase:** 2
**Contexto.** El trigger genérico de auditoría registraba cada `UPDATE`. Crear boletas incrementa
`raffles.ticket_counter` una vez por boleta: un lote de 1.000 generaría 1.000 entradas
`raffle.update` que no describen ninguna decisión humana. Lo mismo con `paid_amount`, cuyo origen
real ya queda registrado como `payment.create`/`payment.void`.
**Decisión.** Excluir del diff `updated_at`, `ticket_counter`, `raffle_counter`, `paid_amount` y
`payment_status`. Si tras el filtro no cambió nada, no se registra la entrada.
**Alternativas.** Registrarlo todo (descartada: el ruido ahogaría la información útil y haría crecer
la bitácora sin control).
**Consecuencia.** La bitácora describe acciones, no efectos secundarios. Verificado por prueba.

## D-042 — Seed unificado en `scripts/seed.ts`, no en `supabase/seed.sql`
**Fase:** 2
**Contexto.** El plan de la Fase 0 preveía `supabase/seed.sql`. Pero los usuarios de `auth.users` no
deben crearse con SQL plano (D-026), y `supabase db reset` ejecuta `seed.sql` **antes** de que exista
ningún usuario, por lo que los datos de negocio no tendrían a quién pertenecer.
**Decisión.** Un único `scripts/seed.ts` que crea usuarios, organizaciones y datos de negocio en
orden. Las asignaciones y los pagos se ejecutan **iniciando sesión como el vendedor real y llamando a
las RPC**, no insertando filas con la clave de servicio.
**Alternativas.** Insertar los datos de negocio directamente con `service_role` (descartada: el seed
podría producir estados que la aplicación real nunca podría crear, ocultando defectos).
**Consecuencia.** El seed es también una prueba de humo del camino real. Se ejecuta con
`npm run seed` (proyecto de `.env.local`) o `npm run seed:local`.

## D-043 — Las pruebas de base de datos usan sesiones reales, nunca `service_role`
**Fase:** 2
**Contexto.** Es tentador preparar y verificar todo con la clave de servicio porque es más cómodo.
**Decisión.** La clave de servicio solo se usa para **preparar** datos y para **comprobar** el estado
final. El acto que se está probando siempre se ejecuta con una sesión real
(`signInWithPassword`) y la clave pública.
**Alternativas.** Usar `service_role` en las pruebas (descartada: omite RLS, así que una prueba de
aislamiento pasaría incluso con todas las políticas borradas — probaría exactamente nada).
**Consecuencia.** Las 111 pruebas de `tests/db/` reproducen lo que haría un atacante con acceso al
navegador.

## D-044 — `mapPgError` propaga los mensajes de negocio, pero nunca los de PostgreSQL
**Fase:** 3
**Contexto.** Las RPC y los triggers de la Fase 2 lanzan mensajes ya redactados en español y
pensados para el usuario final («La rifa no está activa. No se pueden asignar boletas.»).
Traducirlos otra vez por código los degradaba a un genérico inútil.
**Decisión.** Se propaga `error.message` cuando el código es `P0001`, `23514` o `42501` **y** el
mensaje no coincide con la firma de los mensajes que redacta PostgreSQL
(`violates … constraint`, `duplicate key value`, `permission denied`, …). Además, las restricciones
con significado de negocio se traducen por **nombre de restricción** (`tickets_combo_unique` →
«Ya existe una boleta con esa combinación…»).
**Alternativas.** (a) Propagar todo (descartada: filtraría nombres de tablas, columnas y valores de
fila, T14). (b) No propagar nada (descartada: convierte 20 mensajes útiles en «Ocurrió un error»).
**Consecuencia.** Los mensajes de negocio llegan intactos a la interfaz. Cubierto por pruebas
unitarias, incluida la que verifica que un `CHECK` real **no** se propaga.

## D-045 — El alta de usuarios es por invitación por correo, no por contraseña temporal
**Fase:** 3
**Contexto.** `CLAUDE.md` §9 exige un proceso seguro de invitación. La Fase 2 dejó documentada una
RPC `create_user_membership` que nunca llegó a existir, y `auth.admin` no es invocable desde SQL.
**Decisión.** `createUser` usa `auth.admin.inviteUserByEmail` con la service role (solo toca el
esquema `auth`) y luego inserta la **membresía con el cliente de sesión**, sujeto a RLS: es la
política `memberships_insert_staff` la que impide a un Admin crear un `owner`, no una comprobación
de TypeScript. Si la inserción de la membresía falla, se elimina la cuenta recién creada para que el
correo no quede bloqueado.
**Alternativas.** (a) `createUser` con contraseña temporal mostrada en pantalla (descartada: pone una
contraseña en texto plano en la interfaz y en los registros del navegador). (b) Crear la RPC
`create_user_membership` (descartada: no puede llamar a `auth.admin`, así que igualmente haría falta
la service role desde el servidor).
**Consecuencia.** Nunca existe una contraseña en texto plano. I-007 deja de aplicar al alta, porque
no se crea ninguna contraseña. En desarrollo los correos se leen en Mailpit (`:54324`).

## D-046 — Una boleta anulada conserva sus números; el resto sí se pueden corregir
**Fase:** 3
**Contexto.** La matriz de permisos permite a Owner y Admin editar los números de una boleta, sin
precisar en qué estados.
**Decisión.** Se pueden editar en cualquier estado **salvo `cancelled`**: una boleta anulada es
historia y su combinación queda reservada (BR-N08). Completar un borrador con sus dos números lo
pasa automáticamente a `available` (CLAUDE.md §15).
**Alternativas.** Permitir la edición solo antes de vender (descartada: impediría corregir un error
de digitación en una boleta ya asignada, un caso real del negocio).
**Consecuencia.** `updateTicketNumbers` comprueba el estado antes de escribir; la máquina de estados
de la base de datos sigue siendo la red final.

## D-047 — `npm run dev:local` para desarrollar y probar contra la base local
**Fase:** 3
**Contexto.** `.env.local` apunta al proyecto Supabase **real**. Las pruebas end-to-end crean rifas,
vendedores y miles de boletas: ejecutarlas contra ese proyecto lo llenaría de basura.
**Decisión.** `scripts/dev-local.ts` arranca `next dev` con las variables de la instancia local
inyectadas en el entorno del proceso (Next.js no las sobreescribe con `.env.local`). Playwright usa
ese comando como `webServer`.
**Alternativas.** (a) Editar `.env.local` a mano en cada cambio de contexto (descartada: propensa a
olvidos, y el olvido escribe en producción). (b) Un `.env.development.local` versionado (descartada:
redirigiría `npm run dev` de todo el mundo sin que se note).
**Consecuencia.** `npm run dev` sigue apuntando a donde diga `.env.local`; `npm run dev:local` y
`npm run test:e2e` siempre a local. Dos configuraciones en `.claude/launch.json`.

## D-048 — Las tablas son responsive ocultando columnas secundarias, no cambiando de diseño
**Fase:** 3
**Contexto.** `CLAUDE.md` §27 pide tablas responsive; el plan sugería degradar a tarjetas en móvil.
**Decisión.** Una sola tabla con contenedor de scroll horizontal y `meta.hideOnMobile` por columna:
bajo `md` se ocultan las columnas secundarias (vendedor, cliente, precio, fechas) y quedan las que
identifican la fila (código, números, estado).
**Alternativas.** Renderizar tarjetas en móvil y tabla en escritorio (descartada: duplica cada
celda, y la segunda versión se queda atrás en cuanto alguien toca la primera).
**Consecuencia.** Un único juego de columnas por tabla. Verificado por
`tests/e2e/owner-responsive.spec.ts`, que comprueba además que ninguna pantalla desborda
horizontalmente a 412 px.

## D-049 — El vendedor crea como máximo 100 boletas de una vez
**Fase:** 4
**Contexto.** `CLAUDE.md` §16 permite al vendedor «indicar una cantidad» sin fijar un límite; §15 fija
1–1.000 para la carga masiva del personal.
**Decisión.** `SELLER_TICKET_MAX = 100`. La creación del vendedor **no** pasa por
`bulk_create_tickets` —esa RPC es `is_org_staff` por dentro—, sino por un `INSERT` normal sujeto a
`tickets_insert_seller`, y su `internal_code` lo genera un trigger fila por fila que actualiza
`raffles.ticket_counter`: 1.000 filas serializarían ese contador (riesgo R-15).
**Alternativas.** (a) Escribir una segunda RPC para vendedores (descartada: duplicaría la lógica de
`bulk_create_tickets` para un caso que en la práctica son unas pocas boletas). (b) Dejar 1.000 sin
más (descartada: reintroduce R-15 justo donde se había resuelto).
**Consecuencia.** El formulario del vendedor no necesita virtualización. Si el negocio pide lotes
grandes para vendedores, la salida es ampliar la RPC, no subir el límite.

## D-050 — Si la asignación falla tras crear el cliente, el cliente se conserva
**Fase:** 4
**Contexto.** «Crear cliente y asignar» son dos operaciones: un `INSERT` en `clients` y la RPC
`assign_ticket`. Entre ambas, otro dispositivo puede haber tomado la boleta.
**Decisión.** No se revierte la creación del cliente. Se informa del fallo de la asignación y se
aclara que **el cliente sí quedó guardado**.
**Alternativas.** (a) Borrar el cliente para simular atomicidad (descartada: `clients` no concede
`DELETE` a nadie, por diseño, y además obligaría a reescribir unos datos que la persona acaba de
capturar delante del comprador). (b) Una RPC que hiciera las dos cosas en una transacción
(descartada por ahora: añade una función de base de datos para un caso de borde cuyo «mal» resultado
—un cliente registrado— es un dato legítimo y reutilizable).
**Consecuencia.** El mensaje de error lo dice explícitamente. Un cliente sin boletas no rompe nada:
se le asigna otra o se archiva.

## D-051 — Los componentes de tabla y filtros se parametrizan, no se duplican por portal
**Fase:** 4
**Contexto.** El portal del vendedor necesita las mismas tablas de boletas y clientes que el
administrativo, pero sin la columna «Vendedor», sin la aprobación en lote y enlazando a `/seller/*`.
**Decisión.** `TicketsTable` y `ClientsTable` reciben `basePath`, `showSeller` y `enableApproval`;
`TicketFilters` y `ClientFilters` reciben los selectores como props opcionales y ocultan los que no
aplican.
**Alternativas.** Duplicar cada componente por portal (descartada: son ~150 líneas de celdas cada
uno, y la segunda copia se queda atrás en cuanto alguien toca la primera).
**Consecuencia.** Un solo juego de columnas por entidad. La prueba
`la tabla no muestra la columna Vendedor ni casillas de aprobacion` fija ese contrato.

## D-052 — El reparto del abono se sugiere solo y se puede ajustar; la RPC decide
**Fase:** 5
**Contexto.** Un abono puede repartirse entre varias boletas del mismo cliente y la suma debe cuadrar
**exactamente** con el total (BR-F05). Obligar a teclear el reparto boleta por boleta convierte el
caso normal —«me dio $50.000»— en un ejercicio de aritmética delante del comprador.
**Decisión.** Al escribir el total se reparte automáticamente de la primera boleta a la última sin
pasarse del saldo de ninguna, y cada fila queda editable. Cambiar el total **rehace** el reparto.
El botón de guardar solo se habilita cuando la suma cuadra y ninguna boleta se sobrepasa.
**Alternativas.** (a) Reparto proporcional al saldo (descartada: produce importes con decimales que
habría que redondear, y el dinero es entero — BR-P02). (b) Sin sugerencia (descartada: obliga a
calcular a mano lo más común).
**Consecuencia.** `distributeAmount` y `validateAllocations` son funciones puras en
`features/payments/allocation.ts`, cubiertas por pruebas unitarias. **No deciden nada**: la palabra
final la tiene `create_payment`, que revalida el cuadre y el sobrepago dentro de la transacción.

## D-053 — `MoneyInput` deriva lo que muestra de `value`, sin estado propio
**Fase:** 5
**Contexto.** La primera versión guardaba estado interno (`raw`, `focused`) para mostrar los dígitos
crudos mientras el campo tenía el foco y el valor formateado al salir.
**Decisión.** El input muestra **siempre** el valor formateado, derivado únicamente de `value`. Sin
estado interno y sin cambiar de representación al enfocar.
**Alternativas.** Mantener el estado y esperar a que React se estabilice (descartada: no elimina la
condición de carrera, solo la hace menos frecuente).
**Consecuencia.** Se elimina una condición de carrera real (I-016): al enfocar, el componente
reescribía el contenido del input, de modo que una escritura programática —una prueba automatizada,
un gestor de contraseñas, el autocompletado de un teclado móvil— podía **concatenar** los dígitos en
vez de reemplazarlos («50000» + «30000» = «5000030000»). Lo destapó una prueba end-to-end.

## D-054 — En esta fase solo el vendedor tiene pantalla para registrar abonos
**Fase:** 5
**Contexto.** La matriz de permisos (`SECURITY.md` §2) permite a Owner y Admin registrar pagos, y la
RPC `create_payment` lo acepta. Pero el entregable 1 de la Fase 5 describe el registro **por el
vendedor**, y el 6 la **consulta** global del personal.
**Decisión.** El portal administrativo consulta y anula; no registra. La capacidad existe en la base
de datos y en la Server Action (que autoriza `owner`, `admin` y `seller`), pero no hay pantalla.
**Alternativas.** Construir también el registro administrativo (descartada: es alcance no pedido en
esta fase — `CLAUDE.md` §1.6).
**Consecuencia.** Si el negocio lo pide, es añadir una ruta reutilizando `PaymentForm`: la acción y
las consultas ya lo soportan. La prueba de base de datos F5-04 verifica que un pago registrado por
el personal se comporta bien y **es visible para el vendedor** (I-015).

## D-055 — Los siete reportes de `CLAUDE.md` §24 se entregan en cinco tablas
**Fase:** 6
**Contexto.** §24 enumera siete reportes. Tres de ellos —ventas por vendedor, recaudo por vendedor y
saldo pendiente por vendedor— son **la misma tabla mirada por tres columnas distintas**.
**Decisión.** Cinco reportes: «Por vendedor» (cubre los tres primeros), «Boletas por estado»,
«Boletas por rifa», «Clientes con saldo» y «Pagos por fecha».
**Alternativas.** Siete pantallas literales (descartada: obliga a abrir tres veces la misma consulta
para comparar tres columnas contiguas, y triplica el código de tablas y exportación).
**Consecuencia.** Los siete reportes exigidos están cubiertos y verificados por
`tests/e2e/reports.spec.ts`. Si el negocio pide las tres vistas por separado, son tres subconjuntos
de columnas de la tabla que ya existe.

## D-056 — El CSV se escribe para Excel en configuración regional de Colombia
**Fase:** 6
**Contexto.** El destinatario de la exportación es una persona que va a hacer doble clic en el
archivo, no otro programa.
**Decisión.** Separador `;`, BOM UTF-8, fin de línea CRLF, dinero ya formateado (`$100.000`) y
fechas como `DD/MM/AAAA`.
**Alternativas.** (a) Separador `,` (descartada: en configuración regional española/colombiana el
separador de listas de Excel es `;`, y un archivo con comas se abre con todas las columnas
amontonadas en la primera celda). (b) Exportar el dinero como entero crudo `100000` (descartada:
§24 pide formato de moneda correcto, y Excel es-CO interpreta `$100.000` como número, así que la
columna sigue siendo sumable). (c) Fechas ISO (descartada por lo mismo: `DD/MM/AAAA` es la que esa
configuración reconoce como fecha).
**Consecuencia.** `src/lib/csv.ts` concentra el formato y se prueba en `tests/unit/csv.test.ts`. Las
celdas que empiezan por `=`, `+`, `-` o `@` se neutralizan con una comilla simple para impedir la
**inyección de fórmulas** —un cliente llamado `=cmd|…` ejecutaría código en la máquina de quien abra
el archivo—, salvo cuando el valor entero es numérico, para no estropear un teléfono `+57 …`.
La exportación pide todas las filas con `fetchAllRows`, con un tope de 50.000 para no cargar una
tabla entera en memoria; si alguna vez se alcanzara, el archivo **lo dice en su última línea** en
lugar de parecer completo (R-19).

> **Nota de verificación.** `response.text()` **elimina** el BOM al decodificar, por especificación.
> Comprobar el BOM así da un falso negativo: hay que mirar los bytes (`arrayBuffer()`), como hace la
> prueba E2E. Por lo mismo, `BOM` se construye con `String.fromCharCode(0xfeff)` y no como carácter
> literal: siendo invisible, cualquiera podría borrarlo sin verlo, y una prueba que lo comparase con
> otro literal invisible seguiría pasando.

## D-057 — Los reportes de pagos se agregan con funciones, no con una vista
**Fase:** 6
**Contexto.** El resto de agregados del sistema son vistas (`v_seller_summary`, `v_raffle_summary`,
`v_client_balances`). Para «pagos por rango de fechas» una vista no sirve: no acepta parámetros, así
que tendría que agrupar también por vendedor, método y estado para que esas columnas siguieran
siendo filtrables, y la cardinalidad resultante (días × vendedores × 3 × 2) supera el límite de
1.000 filas de PostgREST.
**Decisión.** Dos funciones `stable security invoker` en la migración `0013`:
`report_payment_totals` (una fila con los totales exactos) y `report_payments_by_day` (una fila por
día). Filtran **antes** de agregar.
**Alternativas.** (a) Una vista de máxima granularidad (descartada por lo anterior). (b) Sumar en
TypeScript las filas de `v_payment_history` (descartada: con más de 1.000 pagos el total mostrado
sería silenciosamente falso — I-011).
**Consecuencia.** Son las primeras funciones **`SECURITY INVOKER`** del proyecto, al contrario que
las RPC de `0007`, que son `SECURITY DEFINER` porque existen para hacer cosas que la RLS del usuario
prohíbe. Estas solo leen, así que heredan `payments_select` y un vendedor obtiene sus propios
totales sin que la función filtre por `seller_id`. `p_seller_id` es una comodidad del portal
administrativo, **no** un control de seguridad: la prueba F6-04 comprueba que pedir el id de otro
vendedor devuelve ceros.

## D-058 — Los reportes agregados no se ordenan en el navegador
**Fase:** 6
**Contexto.** `DataTable` ordena en el cliente. En una tabla paginada en servidor eso ordena
**solo las filas de la página actual**, dando la impresión de un ranking completo que no lo es.
**Decisión.** Los reportes usan `ReportTable`, un Server Component sin ordenación: el orden lo fija
SQL (`pending_amount desc`, `total_sold desc`, `payment_date desc`).
**Alternativas.** Reutilizar `DataTable` (descartada por lo anterior; además enviaría JavaScript al
teléfono del vendedor para algo que no lo necesita).
**Consecuencia.** `DataTable` sigue siendo el componente de los listados operativos; `ReportTable`
el de los reportes. Ambos comparten la misma técnica responsive (contenedor con scroll y
`hideOnMobile`), verificada en `tests/e2e/reports-responsive.spec.ts`.

## D-059 — El portal del vendedor también tiene reportes
**Fase:** 6
**Contexto.** `CLAUDE.md` §22 lista cuatro rutas mínimas para el vendedor, sin `/seller/reports`.
Pero §24 exige que «los reportes del portal Seller no expongan datos de otros vendedores», lo que
presupone que existen, y la prueba 2 de la Fase 6 los da por hechos.
**Decisión.** Existe `/seller/reports` con cuatro de los cinco reportes. Se excluye «Por vendedor»,
que compara a unos vendedores con otros.
**Alternativas.** No construirlos (descartada: la prueba 2 del plan quedaría sin objeto y el
vendedor no podría exportar su propia cartera).
**Consecuencia.** Ambos portales usan `ReportsView` con distintos parámetros (D-051). La exclusión
es de producto, no de seguridad: aunque alguien pida `?report=sellers`, la pantalla cae al primer
reporte disponible y el endpoint de exportación responde **403**; y aun si no lo hiciera, las vistas
`security_invoker` solo devolverían sus propias filas.

## D-060 — La exportación es un Route Handler fuera de `(protected)`
**Fase:** 6
**Contexto.** Un Route Handler **no** pasa por el `layout.tsx` de su grupo de rutas. Colocarlo en
`(protected)/owner/` daría la falsa impresión de estar cubierto por `requireStaff()`.
**Decisión.** Vive en `src/app/api/reports/export/route.ts`, donde nadie puede suponer que hay una
guarda implícita, y comprueba sesión, membresía activa y rol en sus primeras líneas.
**Alternativas.** (a) Server Action que devuelva el texto (descartada: obliga a construir el archivo
en memoria del navegador y pierde `Content-Disposition`). (b) Ruta dentro de `(protected)`
(descartada por lo anterior).
**Consecuencia.** La descarga es un enlace normal: funciona con «abrir en pestaña nueva» y sin
JavaScript. El nombre del archivo se sanea antes de entrar en la cabecera, para que no pueda
inyectar encabezados HTTP.

## D-061 — CSP con nonce por request, no `unsafe-inline`
**Fase:** 7
**Contexto.** Next inyecta el payload de hidratación en scripts **en línea**. Una CSP que los permita
necesita `'unsafe-inline'` en `script-src`, que es tanto como no tener CSP para lo que más importa:
la inyección de scripts.
**Decisión.** `proxy.ts` genera un nonce aleatorio por request, lo pone en la cabecera CSP **del
request** —de ahí lo lee Next para firmar sus propios scripts— y en la de la respuesta. La política
usa `nonce` + `'strict-dynamic'`. Las cabeceras que no dependen del request (HSTS, X-Frame-Options,
Referrer-Policy, Permissions-Policy) van en `next.config.ts`, para que las reciban también los
archivos estáticos que el matcher del proxy excluye.
**Alternativas.** (a) CSP estática con `'unsafe-inline'` (descartada: deja pasar exactamente el
ataque del que protege). (b) No poner CSP (descartada: es un entregable de la fase).
**Consecuencia.** `style-src` **sí** conserva `'unsafe-inline'`: Next y `next/font` inyectan estilos
en línea y un estilo no ejecuta código. `'unsafe-eval'` se añade **solo** en desarrollo, porque
Turbopack lo necesita. HSTS se omite en desarrollo a propósito: anclar `localhost` a https deja el
navegador de quien programa roto durante meses, y el navegador lo recuerda aunque se quite la
cabecera.

> **Trampa al integrarlo.** La respuesta se construye leyendo `request.headers` **en cada llamada**,
> no una vez al principio: `request.cookies.set()` actualiza la cabecera `cookie`, y capturarla antes
> dejaría fuera la sesión que Supabase acaba de refrescar, con cierres de sesión intermitentes.

## D-062 — La limitación de intentos es en memoria, y se dice qué protege y qué no
**Fase:** 7
**Contexto.** El plan pide limitar los intentos de inicio de sesión y de las acciones sensibles. Sin
Redis ni servicios externos, lo único disponible es memoria del proceso.
**Decisión.** Ventana deslizante en memoria (`src/lib/rate-limit.ts`) aplicada a login (10 / 5 min,
por **correo**), recuperación de contraseña (3 / 15 min) e invitaciones (20 / hora, por
**organización**).
**Alternativas.** (a) Contador en PostgreSQL (descartada por ahora: añade una escritura a cada
intento de login; la firma de `checkRateLimit` permite cambiarlo sin tocar los llamadores).
(b) No implementarlo (descartada: es un entregable).
**Consecuencia y límites honestos.** En un despliegue con varias instancias cada una lleva su cuenta,
y un reinicio la borra. Por eso **no es la defensa principal del login**: esa es la de Supabase Auth,
que es global y persistente (I-008). Esta capa cubre lo que aquella no: frenar el goteo de correos
de recuperación y de invitaciones —que salen hacia terceros y cuestan cuota— y dar un mensaje claro
antes de que el proveedor devuelva uno opaco.
Se limita por correo y no por IP porque en una oficina o tras un dato móvil todos comparten IP, y
bloquear por IP dejaría fuera a un equipo entero por culpa de uno. Un login correcto **devuelve** el
cupo, para que unos fallos previos no bloqueen el siguiente intento legítimo.

## D-063 — Las políticas RLS no pueden llamar a una función por fila
**Fase:** 7
**Contexto.** `EXPLAIN ANALYZE` durante la revisión de rendimiento destapó que **toda** consulta
sobre `tickets` tardaba ~1,7 s con solo 7.278 filas. La causa: `is_org_staff(organization_id)` recibe
una **columna**, así que PostgreSQL no puede sacarla del bucle y la ejecuta una vez por fila; cada
llamada consulta `memberships`, `profiles` y `organizations`. 44.367 accesos a buffer para una tabla
de 566 páginas.
**Decisión.** Migración `0014`: se añade `current_staff_org_ids()` —el equivalente en conjunto de
`is_org_staff()`— y las 22 políticas afectadas pasan a `columna in (select current_staff_org_ids())`.
Por el mismo motivo, `current_profile_id()` se envuelve en `(select …)`.
**Alternativas.** (a) Marcar las funciones como `STABLE` (ya lo estaban: no era el problema).
(b) Añadir índices (medido: el planificador sigue eligiendo *seq scan*, porque el coste no estaba en
leer las filas sino en la función). (c) Dejarlo (descartada: el coste es **por fila**, así que crece
con los datos; con 100.000 boletas la aplicación sería inusable).
**Consecuencia.** Medido sobre la misma consulta: **1.667 ms → 1,18 ms**. En la aplicación, el
listado de boletas pasa de 1.607 ms a 4 ms y el conteo de 1.225 ms a 1,9 ms.
**No cambia ningún permiso**: `current_staff_org_ids()` devuelve exactamente las organizaciones donde
`is_org_staff()` decía que sí, y la prueba `F7-01` lo comprueba por equivalencia para cada
combinación de usuario y organización. La prueba `F7-03` impide que el patrón lento vuelva a entrar.

## D-064 — `server-only` se sustituye por un stub en las pruebas unitarias
**Fase:** 7
**Contexto.** `rate-limit.ts` es lógica pura y merece pruebas unitarias, pero importa `server-only`,
que **lanza** al cargarse fuera de un Server Component, de modo que Vitest (jsdom) no puede ni
importar el módulo.
**Decisión.** `vitest.config.mts` sustituye `server-only` por `tests/stubs/server-only.ts`.
**Alternativas.** (a) Quitar `import 'server-only'` del módulo (descartada: es la marca que impide
que acabe en el bundle del navegador). (b) Extraer la lógica a otro archivo sin la marca (descartada:
partir un módulo de 120 líneas en dos solo para poder probarlo).
**Consecuencia.** No debilita nada: la frontera real la impone el build de Next, que sigue fallando
si un Client Component importa uno de esos módulos.

## D-065 — El proyecto real se verifica, no se supone
**Fase:** 7 (posterior al despliegue de `0012`–`0014`)
**Contexto.** `npm run test:db` comprueba las invariantes del esquema contra la instancia **local**.
Eso deja un punto ciego que ya se ha materializado **dos veces**: Supabase concede privilegios con
`ALTER DEFAULT PRIVILEGES`, y el resultado depende del rol que aplique la migración, así que una
invariante puede ser cierta en local y falsa en producción sin que ninguna prueba lo note.

| Cuándo | Qué divergía | Se descubrió |
|---|---|---|
| Fase 2 (D-038) | `authenticated` conservaba `DELETE` | Al verificar tras aplicar |
| Fase 7 (I-020) | `anon` podía ejecutar **todas** las funciones | Al verificar tras aplicar |

**Decisión.** Existe `npm run verify:remote` (`scripts/verify-remote.ts`), que ejecuta contra el
proyecto real las mismas comprobaciones de catálogo que `catalog.test.ts` hace en local, en modo
**solo lectura**. Se ejecuta **después** de cada `db push`, no solo antes.
**Alternativas.** (a) Confiar en que local y remoto son equivalentes (descartada: es justo lo que
falló dos veces). (b) Ejecutar la suite de pruebas contra producción (descartada: escribe datos).
**Consecuencia.** `revoke … from public` **no** deshace un `GRANT` hecho nominalmente a un rol: hay
que revocar de `anon` **y** de `public`, que es lo que hace `0015`. La regla general que queda: un
privilegio no está quitado hasta que se ha comprobado en el entorno donde importa.

---

## D-066 — Un solo proyecto Supabase (producción), sin staging separado
**Fase:** 8
**Contexto.** `ARCHITECTURE.md` §12 (Fase 0) diseñó un proyecto Supabase de staging para los Preview
de Vercel, distinto del de producción. En la práctica solo se aprovisionó uno — "el proyecto real" —
usado durante las Fases 2 a 7 para todas las verificaciones contra datos reales.
**Decisión.** Para la Fase 8, mantenerlo como el único proyecto y usarlo directamente como
producción. Confirmado explícitamente con el usuario antes de diseñar el resto de la fase.
**Alternativas.** (a) Aprovisionar un segundo proyecto Supabase para staging, aplicarle las 15
migraciones, sembrarlo y apuntar los Preview de Vercel ahí (descartada por el usuario: más
aprovisionamiento y mantenimiento sin necesidad inmediata).
**Consecuencia.** Las variables de Supabase en Vercel solo se ponen en el scope Production, nunca en
Preview — si no, un Pull Request escribiría sobre datos reales (I-022). Migrar a un esquema de
staging real queda como trabajo futuro si el negocio lo necesita.

---

## D-067 — Reutilizar el proyecto Vercel existente en vez de crear uno nuevo
**Fase:** 8
**Contexto.** Al iniciar la Fase 8 ya existía un proyecto Vercel `gestion-rifas` (equipo
`jimmyriveros-projects`), creado automáticamente al conectar la cuenta de GitHub
(`importSource: "import-suggestions"`), conectado al repo `jimmyriveros/GestionRifas` rama `main`.
Su único despliegue a producción había fallado (`npm run build` salió con error 1, sin variables de
entorno configuradas) y apuntaba a un commit de varias fases atrás.
**Decisión.** Reutilizarlo — mismo nombre, ya conectado al repositorio correcto — en vez de crear un
proyecto Vercel nuevo. Confirmado con el usuario.
**Alternativas.** (a) Crear un proyecto nuevo y dejar el existente huérfano (descartada: duplica
configuración sin beneficio, y el nombre ya es el correcto).
**Consecuencia.** Solo hace falta configurar las variables de entorno (`docs/DEPLOYMENT.md` §3.1) y
disparar un despliegue con el código actual — no hay que reconectar nada en GitHub ni en Vercel.

---

## D-068 — `create-organization.ts` inserta la membresía de Owner con el cliente admin
**Fase:** 8
**Contexto.** Dar de alta la primera organización y su primer Owner (entregable explícito de la
Fase 8) no se puede hacer con una sesión de staff, porque la política `memberships_insert_staff`
exige `organization_id in (select current_org_ids())` — imposible para una organización que todavía
no existe para nadie.
**Decisión.** `scripts/create-organization.ts` usa el cliente de SERVICE ROLE para las tres
escrituras (organización, invitación, membresía), igual que ya hace `scripts/seed.ts`. Es el único
caso legítimo de alta de un `owner` sin sesión de staff previa; fuera de este bootstrap puntual, la
aplicación nunca inserta membresías sin pasar por RLS.
**Alternativas.** (a) Exigir que alguien inserte la fila a mano por SQL en el dashboard de Supabase
(descartada: propensa a errores, sin las validaciones ni la invitación por correo real). (b)
Construir una pantalla de "primer registro" en la aplicación (descartada: es una funcionalidad de
producto nueva, fuera del alcance de la Fase 8 — las organizaciones las da de alta el operador, no un
flujo de registro público).
**Consecuencia.** El script queda documentado como herramienta operativa (`docs/OPERATIONS.md` §1),
no como parte de la aplicación desplegada. El índice único `memberships_one_owner_per_org` respalda
en la base de datos la regla de un solo Owner por organización que el script ya comprueba antes de
escribir.

---

## D-069 — El CI cubre typecheck/lint/tests/build y la base de datos, no `test:e2e`
**Fase:** 8
**Contexto.** `docs/IMPLEMENTATION_PLAN.md` lista `.github/workflows/ci.yml` como entregable opcional
("si se habilita"). Dos de las pruebas que la Fase 8 exige —"despliegue limpio en un entorno nuevo" y
"migraciones aplicadas desde cero"— se demuestran automáticamente si el CI aplica las 15 migraciones
desde cero en cada corrida.
**Decisión.** Dos jobs paralelos. `verify` corre lo mismo que `npm run verify` (typecheck, lint,
unitarias, build). `db` levanta Supabase local con la CLI oficial (`supabase/setup-cli`), aplica las
15 migraciones desde cero y corre las 254 pruebas de base de datos. `test:e2e` (Playwright, 142
pruebas) queda fuera del pipeline por defecto.
**Alternativas.** (a) Incluir también `test:e2e` en CI (descartada por ahora: Playwright + Chromium +
servidor completo alarga notablemente cada corrida en runners compartidos, y ya se corre en local
antes de cerrar cada fase). (b) No tener CI (descartada: es la única forma de demostrar
automáticamente, en cada cambio, que el proyecto se puede levantar limpio desde cero — justo lo que
un tercero necesitaría para desplegarlo).
**Consecuencia.** Si `test:e2e` empieza a fallar solo en un entorno y no en otro, seguirá dependiendo
de que alguien lo corra en local — no hay red de seguridad automática para esa suite todavía.

---

## D-070 — Respaldo lógico manual (`supabase db dump`) mientras el proyecto sea plan Free
**Fase:** 8
**Contexto.** Al revisar Database → Backups del proyecto real se confirmó que está en el plan **Free**
de Supabase: sin scheduled backups, sin Point-in-Time Recovery (requiere Pro + add-on) y sin
restore-to-new-project (requiere Pro). No existe ningún backup restaurable desde el dashboard. El
usuario dio instrucciones explícitas y detalladas de cómo adaptar la estrategia de recuperación de la
Fase 8 a esta realidad.
**Decisión.** Respaldo lógico manual con la Supabase CLI: `supabase db dump` genera tres archivos
separados — `roles.sql` (`--role-only`), `schema.sql` (sin restringir esquema, porque restringirlo a
`public` rompe la recreación de la extensión `pg_trgm`) y `data.sql` (`--schema public --data-only`,
para excluir por completo el esquema `auth`). Los tres se guardan **fuera del repositorio Git y fuera
de Supabase**. La restauración se **prueba solo en local** (Docker); restaurar contra el proyecto real
exige mostrar el procedimiento exacto y recibir autorización explícita cada vez — nunca autorización
general de una conversación anterior. Verificado de punta a punta en la Fase 8: los tres archivos
recrean 9 tablas, 25 políticas RLS, 35 triggers, 5 vistas, 5 enums y todas las filas de negocio en una
instancia local limpia, sin errores.
**Hallazgo real durante la implementación:** la primera versión del volcado de datos, generada sin
`--schema public`, incluyó el esquema `auth` **completo** — `auth.users` con `encrypted_password` y
los tokens de recuperación/confirmación/reautenticación de cada cuenta real. Se detectó al restaurar
en local (un `ERROR` de restricción única de `auth.users`, no de ninguna tabla de negocio), se borraron
los tres archivos contaminados de inmediato y se regeneraron correctamente. Ninguno de los archivos
contaminados salió de la máquina local. Ver I-024.
**Alternativas.** (a) Confiar en backups automáticos de Supabase (descartada: no existen en este
plan). (b) Migrar a Pro inmediatamente para tener PITR (descartada por ahora: es una decisión de costo
del usuario, no técnica; queda como prerrequisito documentado antes de operar con datos reales). (c)
Incluir `auth` en el respaldo para tener una recuperación 100% autónoma (descartada: expondría
contraseñas y tokens en archivos de texto plano, justo lo que se pidió evitar).
**Consecuencia.** Restaurar este respaldo recupera el 100% de los datos de negocio pero **ninguna**
identidad de acceso: cada perfil recuperado necesita que se le reinvite o se le recupere el acceso por
separado (no hay auto-login posible con datos que nunca incluyeron contraseñas). Es el costo aceptado
de no guardar secretos en el respaldo. Mientras el proyecto siga en plan Free, este respaldo manual es
la única red de seguridad real — I-024 lo deja como requisito abierto antes de operar con dinero o
clientes reales.

---

## D-071 — El «al menos un Owner» se garantiza con un trigger diferido, no con el índice único
**Fase:** 9
**Contexto.** La auditoría final encontró (A-02) que `memberships_one_owner_per_org` garantiza **como
máximo** un Owner activo por organización, pero nunca garantizó **al menos uno**. Un Owner puede
degradarse o desactivarse a sí mismo con una llamada directa a PostgREST —la política
`memberships_update_staff` lo permite porque el rol resultante ya no es `owner`— y el estado es
irrecuperable desde la aplicación: el ex-Owner deja de ser staff y un Admin no puede ascender a nadie
a Owner (BR-U03). Reproducido y confirmado en local: quedan **0** Owners activos y solo `service_role`
puede repararlo.
**Decisión.** Migración `0016`: un *constraint trigger* `DEFERRABLE INITIALLY DEFERRED` sobre
`memberships`, disparado `after update of role, is_active`, que rechaza al COMMIT cualquier cambio que
deje la organización sin Owner activo.
**Por qué diferido.** Transferir la propiedad obliga a pasar por un estado intermedio sin Owner: el
índice único impide que existan dos Owners activos a la vez, así que hay que degradar a uno **antes**
de ascender al otro. Un trigger inmediato haría la transferencia imposible para siempre. Diferirlo la
permite dentro de **una** transacción y sigue rechazando el descuido, porque PostgREST ejecuta una
petición por transacción. Es el mismo mecanismo que `check_payment_balance` (D-012).
**Alternativas.** (a) Endurecer la política `memberships_update_staff` para que un Owner no pueda
tocar su propia fila (descartada: dejaría al Owner sin poder corregir su propio teléfono o nombre, y
no cubre el caso de desactivación desde otra ruta). (b) Comprobarlo solo en la Server Action
(descartada: el frontend no es una frontera de seguridad, `CLAUDE.md` §26, y el hallazgo se reprodujo
precisamente saltándose la interfaz). (c) Convertir el índice parcial en algo que exija exactamente
uno (descartada: un índice no puede expresar «al menos una fila»).
**Consecuencia.** Un Owner ya no puede quedarse sin organización por accidente. La transferencia de
propiedad —fuera del MVP como interfaz, BR-U04— sigue siendo posible desde un script o una RPC que
haga las dos actualizaciones en la misma transacción. Cubierto por `F9-01` en
`tests/db/audit-phase9.test.ts`, incluida la comprobación de que la transferencia en una transacción
**sí** funciona.

---

## D-072 — Guía de UX Writing importada desde `CLAUDE.md`, con anexos propios del proyecto
**Fase:** posterior a la 9 (mantenimiento; instrucción explícita del usuario, 2026-08-05)
**Contexto.** Las reglas de redacción estaban repartidas y eran incompletas: `CLAUDE.md` §27 fijaba
ocho etiquetas de estado y pedía «mensajes de error comprensibles», `ARCHITECTURE.md` §8.3 repetía
las etiquetas y `BUSINESS_RULES.md` BR-X05/X06 las mencionaba de pasada. Nada decía cómo escribir un
botón, una confirmación o un estado vacío para un vendedor con poca experiencia digital, que es el
usuario real.
**Decisión.** Crear `docs/UX_COPY_GUIDELINES.md` como fuente única de redacción e **importarla**
desde `CLAUDE.md` §35 con `@docs/UX_COPY_GUIDELINES.md`, para que esté en contexto en toda sesión sin
depender de que alguien recuerde abrirla. §35 añade cuándo aplica y seis reglas obligatorias
(revisión antes de cerrar, no reemplazar textos sin contexto, un término un nombre, cómo resolver
contradicciones, etiquetas de estado inmutables, primacía de la guía).
**Anexos añadidos a la guía.** El texto que entregó el usuario es normativo pero genérico; se le
sumaron cuatro anexos para que sea accionable aquí: A (glosario canónico), B (dónde vive cada texto
en el código), C (contradicciones detectadas y su resolución) y D (estado de aplicación).
**Contradicciones resueltas.** El ejemplo de la §8 de la guía dice «Eliminar vendedor», pero el
sistema **no borra nada** —no hay política ni privilegio de `DELETE` en ninguna tabla (D-038, `0010`)—:
se conserva la estructura del ejemplo y se cambian los verbos por desactivar, archivar y anular. La
§11 usa «comprador» y la §2 «Owner», mientras la interfaz dice **cliente** y **dueño**: manda el
glosario. Ambas quedan anotadas dentro de la propia guía, no en un documento aparte, para que quien
lea el ejemplo vea la corrección al lado.
**Alternativas.** (a) Dejar la guía en `docs/` sin importarla y citarla desde `HANDOFF.md` §5
(descartada: §5 existe precisamente para lo que **no** se lee siempre, y la redacción sí aplica
siempre). (b) Copiar la guía dentro de `CLAUDE.md` (descartada: duplica el contenido y contradice
§34.4, «enlaza en lugar de duplicar»). (c) Reescribir de una vez los textos actuales para cumplirla
(descartada: el usuario pidió explícitamente crear y configurar la guía sin tocar todavía la
aplicación).
**Consecuencia.** Cada sesión carga ~2,5k fichas más. A cambio, ninguna tarea de interfaz puede
alegar que no conocía las reglas. Los textos existentes **no** se han auditado contra la guía: lo
pendiente está registrado como I-029.

---

## D-073 — La revisión de textos corrige la aplicación, no la base de datos
**Fase:** posterior a la 9 (mantenimiento; autorizada por el usuario, 2026-08-05)
**Contexto.** Al crear la guía (D-072) quedó registrado que los textos visibles estaban escritos sin
tildes ni «ñ» (I-029). El usuario autorizó corregirlos. El problema es que esos textos viven en dos
sitios muy distintos: la aplicación (`src/`, ~300 cadenas) y el cuerpo de las funciones y triggers de
PostgreSQL (~46 `raise exception` en `0004`, `0007` y `0016`), que `mapPgError` propaga tal cual al
usuario porque son mensajes de negocio ya redactados en español (D-044).
**Decisión.** Corregir toda la capa de aplicación en este cambio y **dejar los mensajes de la base de
datos para un cambio propio**, registrado como I-030.
**Por qué se separan.** Las migraciones aplicadas son inmutables (`HANDOFF.md` §8.2): cambiar un
mensaje obliga a una migración `0017` que reescriba las funciones enteras, y a aplicarla al proyecto
real. Eso es una operación sobre producción —con respaldo previo y autorización explícita, D-070— y
su riesgo funcional no es cero: se reescribe el cuerpo de seis RPC para un cambio cosmético. Mezclarlo
con una corrección de ortografía del frontend habría convertido un cambio sin riesgo en uno con él.
Además, dejar `0017` creada pero sin aplicar reproduce exactamente la trampa de I-015: local y
producción divergiendo en silencio.
**Cómo se hizo la corrección.** Con un script que solo toca cadenas de texto y texto JSX —nunca
identificadores, rutas de importación, clases de Tailwind ni comentarios— y una lista de palabras
revisada a mano. Las palabras cuya tilde depende del significado (`esta`/`está`, `mas`/`más`,
`si`/`sí`, `este`/`esté`, `por que`/`por qué`) **no** se automatizaron: se listaron sus 292
ocurrencias y se corrigieron una por una las 25 que lo necesitaban. Aun así el script tocó dos
identificadores (`numeros`, `ultimo`) dentro de líneas que parecían prosa; los detectó `tsc` y se
revirtieron. De ahí que el orden fuera: corregir → `typecheck` → `lint` → unitarias → base de datos →
end-to-end.
**Alternativas.** (a) Corregir a mano archivo por archivo (descartada: 88 archivos, y el ojo humano
se salta justo las palabras frecuentes). (b) Añadir una regla de lint que prohíba palabras sin tilde
(descartada: no existe un diccionario fiable en el tooling y produciría falsos positivos en los
comentarios y en el código en inglés). (c) Incluir la migración `0017` aquí mismo (descartada: ver
arriba).
**Consecuencia.** La interfaz está escrita en español correcto. Un usuario que provoque un error de
negocio de la base de datos —sobrepago, boleta ajena, rifa cerrada— todavía leerá un mensaje sin
tildes; se distingue a simple vista de los demás, y esa inconsistencia es visible hasta que se
resuelva I-030.

---

## D-074 — El recorrido guiado se construye con Radix, sin librería de tours
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-05)
**Contexto.** Hacía falta un recorrido guiado que resalte elementos y explique cada uno en un globo.
Lo habitual es añadir `driver.js`, `react-joyride` o `shepherd.js`. Lo difícil de un recorrido no es
pintar el globo: es **colocarlo** —voltearlo cuando no cabe, mantenerlo dentro de la pantalla, seguir
al elemento mientras la página hace scroll—, y eso ya está resuelto en el proyecto.
**Decisión.** Construirlo con lo que ya hay: `radix-ui` (que trae `@radix-ui/react-popover`, y este a
su vez Floating UI) para posicionar el globo, y CSS para el foco. Cero dependencias nuevas.
**Cómo se resuelve cada parte.** El globo se ancla a un recuadro invisible del tamaño del elemento y
Radix se encarga de voltearlo y de no salirse (`collisionPadding`). El oscurecido lo dibuja la
**sombra** de ese mismo recuadro (`box-shadow: 0 0 0 9999px`), así que el hueco coincide exactamente
con el elemento sin recortar nada. La posición se sigue con un bucle de `requestAnimationFrame`, que
cubre de una vez el scroll suave, el giro del teléfono y cualquier cambio de tamaño; encadenar
`scroll` + `resize` + `ResizeObserver` habría sido más código y se habría perdido la animación del
scroll.
**Alternativas.** (a) `react-joyride` (descartada: ~40 kB, su propio motor de posicionamiento
duplicando el de Radix, y arrastra estilos que no siguen el tema de la aplicación). (b) `driver.js`
(descartada: la misma duplicación, y su recorte del foco es un SVG que hay que sincronizar aparte).
(c) Calcular la posición a mano (descartada: es justo la parte que se rompe en pantallas estrechas).
**Consecuencia.** El recorrido pesa lo que pesan sus textos. Si algún día hace falta algo que Radix
no dé —por ejemplo esperar a que el usuario haga clic en el elemento antes de avanzar—, se revisa.

## D-075 — Lo que ya se vio del recorrido se guarda en el navegador, no en la base de datos
**Fase:** posterior a la 9 (mantenimiento)
**Contexto.** El recorrido debe aparecer solo la primera vez. Eso exige recordar quién ya lo vio.
**Decisión.** Guardarlo en `localStorage`, con la clave `rifas.tour.<perfil>.<recorrido>`. Incluye el
id del perfil para que dos personas que compartan un teléfono no se hereden el recorrido.
**Por qué no en la base de datos.** Habría significado una columna nueva en `profiles`, una migración
`0017` y aplicarla al proyecto real (D-070: respaldo previo y autorización explícita cada vez), más
una Server Action por cada «ya lo vi». Todo eso para una preferencia de interfaz que no es un dato
del negocio, que no se audita y que no pasa nada si se pierde.
**Lo que se pierde.** Es **por dispositivo**: quien entre desde el teléfono y luego desde el
computador verá el recorrido dos veces. Para un recorrido de bienvenida es aceptable, y verlo de más
molesta menos que no verlo nunca. Si el negocio pide que sea por cuenta, se migra a `profiles` sin
tocar nada más que `storage.ts`.
**Detalle.** `localStorage` lanza excepción en el modo privado de Safari y con el almacenamiento
bloqueado; ahí se asume «ya lo vio» para no repetirlo en cada navegación.

## D-076 — La fila entera abre el detalle, pero el enlace de la primera columna se queda
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-06)
**Contexto.** Para abrir una boleta o un cliente había que acertarle al enlace de la primera celda.
En un teléfono es una diana de pocos milímetros dentro de una fila de 40 px de alto.
**Decisión.** `DataTable` acepta `rowHref(row)` —o `onRowActivate(row)` cuando la fila abre un
diálogo en vez de navegar— y da a la fila `cursor-pointer`, hover propio, `tabIndex={0}` y activación
con `Enter` y `Espacio`. **El enlace de la primera columna se conserva.**
**Por qué conservarlo.** Es lo único que da menú contextual, «abrir en otra pestaña», arrastrar el
enlace y una parada de teclado **con nombre** para un lector de pantalla. Un `<tr>` con `onClick` no
da nada de eso. El clic en la fila es una comodidad añadida, no un reemplazo.
**Por qué no envolver cada celda en un `<a>`** (la alternativa «correcta» de HTML): multiplica los
enlaces por columna, rompe la selección de texto, arrastra estilos a cada celda y obliga a que cada
tabla sepa construir su URL en todas partes. Se descartó.
**Cómo se evita el clic doble.** `src/components/data/row-activation.ts`: si el objetivo del clic
tiene un ancestro interactivo **dentro de la fila** (enlace, botón, casilla, `[role=menuitem]`), la
fila no hace nada. Y si el objetivo **no está dentro de la fila en el DOM**, tampoco: los menús de
Radix viven en un portal, pero React propaga su clic por el árbol de componentes y llegaba igual al
`onClick` de la fila. Ese caso —comprobar `row.contains(target)` **antes** de mirar si es
interactivo— es el que no es evidente y por eso está probado aparte.
**Detalles que parecen menores y no lo son.** Con el foco dentro de la fila (en el enlace o en la
casilla) la tecla la atiende ese elemento, no la fila: si no, `Enter` navegaría dos veces y `Espacio`
marcaría y navegaría a la vez. Y si hay texto seleccionado no se navega: arrastrar para copiar un
número de boleta termina en un `click`.
**Alcance.** La reciben las tablas que tienen a dónde ir: boletas, clientes, rifas, vendedores y
pagos (esta abre su diálogo). `UsersTable` **no**: no existe pantalla de detalle de usuario, y una
fila con puntero que no lleva a ninguna parte es peor que ninguna.

## D-077 — Los estados visuales se escriben excluyentes, no apilados
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-06)
**Contexto.** El cliente elegido al asignar una boleta se volvía ilegible al pasar el cursor: fondo
claro con texto claro (I-033). La causa: `hover:bg-accent` y `bg-primary text-primary-foreground`
escritos en la misma lista de clases. `:hover` añade una pseudoclase, así que gana al fondo de la
selección; el color del texto, que no tiene rival, se queda. Resultado: el fondo de un estado con el
texto de otro.
**Decisión.** Los estados se escriben como **ramas excluyentes**, y cada rama trae su propio hover:
elegido → `bg-primary text-primary-foreground hover:bg-primary/90`; sin elegir →
`hover:bg-accent hover:text-accent-foreground`. Nunca ambas.
**Por qué no resolverlo con especificidad** (`data-[selected]:hover:…`, `!important`, orden de
clases): funciona, pero deja la corrección a merced de cómo Tailwind ordene el CSS y de que quien
añada la siguiente clase entienda la jerarquía. Dos listas que no se tocan no pueden mezclarse.
**Dónde vive.** `src/components/form/OptionList.tsx`, usado por el diálogo de asignación y por el
selector de cliente de los abonos. `NavLinks` y `ReportNav` ya eran excluyentes; se les añadió el
hover que le faltaba a la rama activa.
**Donde sí hace falta la especificidad.** En `TableRow` los estados vienen de atributos
(`data-clickable`, `data-state=selected`) y no de un ternario, así que las reglas que deben ganar
llevan dos condiciones (`data-[state=selected]:hover:…`) y se imponen por especificidad, no por
orden. Queda anotado en el propio componente.
**Comprobación.** Se mide el contraste **calculado por el navegador**, no las clases escritas
(`tests/e2e/filas-seleccionables.spec.ts`): el fallo original era justamente que las clases parecían
correctas. Verificado además al revés — con el CSS defectuoso restaurado a propósito, las dos pruebas
de contraste fallan (1,01 y 1,04 sobre un mínimo de 4,5).

## D-078 — La búsqueda híbrida se monta sobre la URL, no sobre un `fetch`
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-06)
**Contexto.** Se pidió una búsqueda que salga sola al escribir, con debounce,
`AbortController` para cancelar la anterior y estados de carga. Esa receta da por supuesta una capa
de fetch en el navegador, y **este proyecto no la tiene**: el término vive en la URL, la pantalla es
un Server Component y `router.replace` **es** la petición.
**Decisión.** Traducir cada requisito al mecanismo equivalente en vez de construir la capa que
faltaba: el debounce retrasa la navegación; la cancelación la hace el router, que descarta la
navegación superada; el estado de carga es el `isPending` de `useTransition`.
**Por qué no añadir una capa de fetch.** Habría duplicado el camino de datos: la lista se seguiría
pintando desde el servidor y la búsqueda desde el navegador, con dos fuentes de verdad para la misma
tabla, dos formas de paginar y dos sitios donde aplicar los filtros. Y la dirección dejaría de ser
compartible, que es una propiedad que el proyecto ya tenía.
**`replace` y no `push`.** Con `push`, cada pausa al escribir dejaría una entrada en el historial y
el botón «atrás» iría devolviendo letra a letra.
**Dónde sí hace falta cancelar de verdad.** En los selectores de cliente, que llaman a una Server
Action. Una Server Action **no se puede abortar** —la petición la gestiona el runtime, no nuestro
código—, así que se usa un **testigo de secuencia**: cada consulta lleva un número y al volver se
compara con el último emitido; si no coincide, la respuesta se descarta. Es lo que pide el Paso 4 del
encargo cuando la cancelación no es posible, y está probado con una respuesta retrasada a propósito.
**Valores.** 350 ms de pausa; mínimo 2 caracteres para personas y códigos, 3 para texto libre;
`Enter` y el botón se saltan el mínimo. Centralizados en `src/lib/search.ts`, ajustables por pantalla.
**Consecuencia.** No hay `AbortController` en el proyecto y no debería aparecer uno sin cambiar antes
esta decisión: en las listas no hay nada que abortar, y en los selectores no se puede.

## D-079 — La normalización para buscar se guarda en la base de datos, con `translate`
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-06)
**Contexto.** Buscar «Jose» no encontraba a «José», y un teléfono escrito «300 555-0000» no encontraba
al mismo número guardado como «3005550000» (la columna `phone` admite `+`, espacios, paréntesis y
guion desde `0002`). Normalizar solo el término no arregla nada: hay que comparar contra algo
igualmente normalizado.
**Decisión.** Una columna **generada** `clients.search_text` con nombre, alias, teléfono —con y sin
separadores— y correo, todo en minúsculas y sin acentos, más un índice de trigramas sobre ella. La
consulta pasa de un `or` de cuatro ramas a un solo `ilike`.
**Generada y no mantenida por un trigger:** la calcula PostgreSQL en cada inserción y actualización,
no se puede desincronizar y no hay código que recordar.
**Corregido después (I-039).** La columna era necesaria pero no suficiente: normalizar el término a
*todos* sus dígitos dejaba fuera un caso real. Un teléfono guardado como `3101112233` no se
encontraba escribiendo `+57 (310) 111-2233`, porque el término resultante (`573101112233`) no es
subcadena de lo guardado. El fallo era **asimétrico** —al revés sí funcionaba— y por eso la prueba
original, que probaba justo la dirección que ya andaba, no lo vio; se descubrió verificando contra
producción. El término se reduce ahora a su número **nacional** (los últimos 10 dígitos), que sí es
subcadena de las dos formas de guardado. Sin migración nueva: el arreglo es del término, no de la
columna.
**Por qué `translate` y no la extensión `unaccent`.** `unaccent` es la respuesta habitual, pero se
instala en un esquema y **ese esquema no es el mismo en local que en Supabase alojado** (aquí
`pg_trgm` quedó en `public`; en Supabase lo normal es `extensions`). Una columna generada que
referencia `public.unaccent` se rompería al aplicar la migración sobre datos reales, que es el peor
momento para descubrirlo. `translate` es built-in, `IMMUTABLE`, no depende de ningún esquema y cubre
el español entero, que es el único idioma de la aplicación.
**La `ñ` se pliega a `n`** a propósito: quien escribe «munoz» espera encontrar a «Muñoz», y
`unaccent` hace lo mismo.
**La invariante que hay que cuidar.** `search_normalize()` en SQL y `foldForSearch()` en TypeScript
son dos implementaciones de la misma regla en dos lenguajes. Si una cambia y la otra no, la búsqueda
deja de encontrar y nadie se entera hasta que un vendedor no puede cobrar. Por eso hay una prueba que
compara las dos contra la misma lista de palabras (`tests/db/search.test.ts`).
**Índices.** Se añade además trigramas sobre `tickets.internal_code`, que se buscaba con
`ilike '%texto%'` **sin ningún índice**: barrido secuencial de la tabla más grande. Medido con 20.000
boletas: **13,9 ms y 446 páginas → 0,9 ms y 89**. Los cuatro índices trigrama de `0003` **no se
eliminan**: la regla del proyecto es no retirar un índice sin evidencia de que sobra.
**Aplicada al proyecto real el 2026-08-07** con autorización explícita del usuario, tras respaldo
lógico previo (`Rifas-backups/2026-08-07-antes-0017/`, verificado sin `auth.users`). Comprobada allí
de las dos formas: por catálogo (13 comprobaciones, incluida la de que `anon` y `public` no pueden
ejecutar `search_normalize` — la clase de divergencia de D-038 e I-020) y **por comportamiento**,
insertando «Jesús Peña Ñuñez» dentro de una transacción, comprobando que se encuentra por «jesus»,
«pena», «nunez», el alias sin tilde y el teléfono en dos formatos, y revirtiendo: 6 clientes antes y
6 después.

## D-080 — Una boleta se busca por sus números, y el orden lo decide SQL
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-08)
**Contexto.** La búsqueda de boletas miraba tres columnas: `internal_code` (parcial) y los dos
números (**exactos**). Eso no es como se trabaja. Vendedores y administradores identifican una boleta
diciendo «el 1234 con el 5678»; «R001-000019» lo genera el sistema y no lo memoriza nadie. Además, la
comparación exacta obligaba a escribir el número entero: escribir «123» no encontraba `1234`.
**Decisión.** BR-N11: se busca **solo** por `daily_number` y `weekly_number`, por coincidencia
**parcial**, y los resultados se ordenan por relevancia con el diario por delante del semanal. El
código interno sale de la búsqueda y de las listas; se conserva en el detalle, bajo «Información
administrativa».

**Por qué una función de base de datos y no PostgREST.** Dos exigencias que un `.or()` no cumple a la
vez: coincidencia parcial y orden por relevancia. PostgREST solo ordena por **columnas**, y la
relevancia depende del término buscado, así que no es una columna. La alternativa —reordenar en el
navegador— no sirve con paginación de servidor: solo recolocaría las filas de la página que ya se
está viendo, dejando la coincidencia más relevante escondida en la página 7. Lo decide SQL, en
`search_tickets` (migración `0018`), y por eso la búsqueda sigue siendo server-side cuando la tabla
crezca.

**`SECURITY INVOKER`, como las funciones de reporte de `0013` y al revés que las RPC de `0007`.** Solo
lee: hereda `tickets_select` y un vendedor sigue encontrando únicamente sus boletas. Los parámetros
(`p_seller_id`, `p_raffle_id`, …) son de usabilidad, no de seguridad; pasar el id de otro vendedor
devuelve cero filas porque la RLS ya lo impide, y hay una prueba que lo comprueba.

**Un término que no es un número devuelve cero filas, no «todo».** Los números son de 1 a 4 dígitos
(BR-N02), así que «R001», «12A4» o un código interno completo no pueden coincidir con ninguno. Se
podría haber extraído los dígitos de «R001» y buscar «001», pero eso reintroduciría por la puerta de
atrás justo lo que se quitaba: encontrar boletas escribiendo un código. La pantalla dice por qué no
hay resultados en vez de dejar una lista vacía sin explicación.

**Dos rutas de consulta, a propósito.** Sin término de búsqueda, el listado sigue por el camino de
PostgREST de siempre (orden por fecha de creación, conteo exacto, paginación). La función se usa
**solo** cuando hay término. Es la ruta más caliente de la pantalla y no había ninguna razón para
reescribirla: el cambio se queda contenido en lo que de verdad cambia.

**Orden dentro del mismo escalón de relevancia: por número, no por fecha.** La primera versión
ordenaba por `created_at desc` y una búsqueda de «010» devolvía «0100, 0103, 0109, 0105…» —el orden
en que se crearon, que para quien mira la lista es ninguno—. Se vio en pantalla, no en una prueba.

**Índices.** Se añaden trigramas sobre `daily_number` y `weekly_number`: el patrón pasa a llevar
comodín inicial (`%123%`) y los B-tree de `0003` no sirven para eso. Medido con 7.278 boletas: con
**tres o más** cifras el planificador usa el índice (búsqueda de «123»: *bitmap index scan*, 58
páginas); con **dos** («00») no puede extraer ningún trigrama completo y vuelve al barrido secuencial
(165 páginas, 1,2 ms). Es una mejora parcial y conocida, no un remedio universal. Los B-tree de
`0003` **no se eliminan**: siguen sirviendo a la restricción de unicidad y a las comparaciones
exactas, y la regla del proyecto es no retirar un índice sin evidencia de que sobra.

**Efecto lateral que hay que conocer: cambia el orden del reparto de un abono.** Las boletas por
cobrar de un cliente se ordenaban por `internal_code`, es decir por antigüedad sin decirlo. Al salir
el código de esa consulta pasan a ordenarse por número, que es como se muestran en el formulario, y
el reparto automático —que llena de la primera fila a la última— sigue ese mismo orden. El
comportamiento es el mismo («llena la de arriba y pasa el resto a la siguiente»); lo que cambia es
cuál queda arriba. Lo destapó la prueba E2E «reparte un abono entre varias boletas», que daba por
hecho el orden de creación.

**Lo que NO cambia, y conviene decirlo:** `internal_code` se sigue generando por trigger, se sigue
guardando, conserva su índice único y su índice de trigramas de `0017`, y sigue siendo lo que
identifica la boleta en la base de datos, en la auditoría y en las URL. Las claves primarias y las
relaciones no se han tocado. Este cambio es de búsqueda y de presentación.

## D-081 — Importar boletas desde un archivo, reutilizando la carga masiva que ya existía
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-08)
**Contexto.** El usuario lleva sus boletas en Excel y las estaba tecleando una a una en la carga
masiva. Pedía poder subirlas en CSV o JSON, con un solo importador para los tres roles.
**Decisión.** BR-N12: un módulo `src/features/tickets/import/` con la lectura de archivos, la
revisión y la interfaz, montado sobre lo que ya existía. **No hay reglas de boletas nuevas**: la
validación por fila es `validateBulkRows` —el mismo motor de la carga manual y de la creación por el
vendedor— y el guardado usa `bulk_create_tickets` (personal) o el `insert` sujeto a
`tickets_insert_seller` (vendedor).

**Un componente, no tres.** `TicketImportDialog` no recibe el rol: recibe el **contexto** (rifa,
vendedor cuando aplica, a dónde volver). Quién puede hacer qué lo decide la Server Action y lo vuelve
a decidir la base de datos. Un vendedor no puede mandar `sellerId`: la acción lo ignora y usa el de
la sesión.

**Por qué hizo falta una migración para algo que parece de interfaz.** Dos cosas que la aplicación no
puede resolver por su cuenta:

* **`taken_ticket_combinations`.** La vista previa tiene que decir «esta combinación ya existe»
  *antes* de guardar. Para el personal basta una consulta normal, pero un vendedor **no ve las
  boletas de otros** (`tickets_select`): preguntando por su cuenta obtendría «disponible» para una
  combinación tomada y se llevaría la sorpresa al confirmar. La función es `SECURITY DEFINER` y
  devuelve **solo la combinación**: ni de quién es, ni en qué estado está. Es exactamente lo que el
  vendedor averiguaría igualmente al chocar contra la restricción única, pero sin gastar el intento
  y sin revelar nada de nadie.
* **`log_ticket_import`.** `authenticated` solo tiene `SELECT` sobre `audit_logs`; la bitácora la
  escriben funciones `SECURITY DEFINER` (0006).

**Auditoría en `audit_logs`, sin tabla nueva.** La pregunta era `audit_logs` o una tabla
`ticket_imports`. Los per-boleta ya existían (`ticket.create`, trigger de 0006); lo que faltaba era
el hecho administrativo, y eso es **una fila**: actor, organización, entidad (`raffle`) y un `jsonb`
con origen, vendedor y recuentos. Una tabla nueva habría traído su propia RLS, sus grants y su
mantenimiento para guardar lo mismo. **No se guarda el archivo**: solo el recuento.
**Se escribe después de guardar y no dentro de la misma transacción**, a propósito: lo que no puede
fallar es la creación de las boletas. Si el registro fallara, la pantalla lo dice —«las boletas
quedaron guardadas, pero no pudimos registrar la importación en el historial»— en vez de callarlo.

**Todo o nada, y qué significa aquí.** El envío final es **una sola llamada** con todas las filas, no
lotes de 100 como la carga manual. Una función de PostgreSQL es una transacción: si algo inesperado
falla, no queda media importación. Lo comprueba una prueba que hace fallar el lote a mitad y verifica
que **el contador de códigos de la rifa volvió a su sitio** — si no fuera transaccional, se habría
quedado gastado. Una combinación **ya tomada** no es un error inesperado: `on conflict do nothing` la
salta, se informa una por una, y eso es lo contrario de una importación parcial silenciosa. La carga
manual conserva sus lotes de 100 porque ahí sirven para mover una barra de progreso mientras alguien
teclea 1.000 filas; en una importación el archivo ya está listo y lo que importa es que entre entero.

**Doble envío: la garantía real es la base de datos.** El botón se deshabilita y un `ref` cierra la
ventana entre el clic y el render, pero lo que hace imposible duplicar es
`tickets_combo_unique`: reenviar el mismo archivo encuentra todas las combinaciones ya tomadas e
inserta cero. No hizo falta inventar una clave de idempotencia.

**Parser propio de CSV, sin librería.** Lo que hay que soportar es una tabla de dos columnas de
dígitos. Lo que de verdad rompe un CSV de Excel es la marca BOM, el salto de línea de Windows y el
separador `;` de la configuración regional colombiana, y eso cabe en un archivo de 170 líneas que
además respeta las comillas de RFC 4180. Una dependencia habría pesado más que el problema.

**El archivo de ejemplo usa `;`, no `,`.** El encargo lo pedía con comas, pero se genera con `toCsv`,
el mismo escritor de los reportes, que usa `;` y BOM porque es lo que Excel en configuración
colombiana abre **en columnas** (D-056). Un ejemplo separado por comas se abriría ahí con todo
amontonado en la primera celda, que es justo lo que un ejemplo no debe hacer. El importador acepta
las dos formas, así que no cierra ninguna puerta.

**Sin Web Worker ni virtualización.** Con 1.000 filas, revisar el archivo entero tarda milisegundos
(hay una prueba que lo mide) y la vista previa se pagina de 50 en 50. Añadir un worker habría sido
complejidad por adelantado para un problema que no existe.

**Un cambio en código compartido, y es aditivo.** `RowValidation` gana un campo `problem`
(`format` | `incomplete` | `duplicate` | `taken`). La importación necesita separar «repetida en el
archivo» de «ya existe en la rifa» para contarlas aparte, y deducirlo comparando textos de mensajes
sería frágil. Ni las reglas ni los mensajes cambian, y quien no lo mire funciona igual que antes.

---

## D-082 — La selección múltiple guarda identificadores, con un tope de 1.000
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-08)

**Contexto.** El encargo pedía evaluar un modelo de selección escalable y sugería, como idea, dos
modos: una selección explícita (`Set` de ids) y otra global descrita por un *filtro guardado* más una
lista de exclusiones, para que «seleccionar 1.000» no obligara a descargar 1.000 filas.

**Decisión.** Un solo modelo: **una lista de `ticket.id`**, con tope de `BULK_SELECTION_MAX = 1000`.
«Seleccionar las 537 que coinciden» se resuelve en el servidor y devuelve **solo los identificadores**.

**Por qué no el filtro guardado con exclusiones.** Suena más escalable y en este sistema es peor:

* **La pantalla no podría dibujarse.** Para pintar una fila marcada habría que saber si esa boleta
  pertenece al filtro guardado, y eso es una consulta al servidor por cada página que se mire. Con la
  lista de ids es una comprobación en memoria.
* **La operación necesita los ids de todas formas.** Todo es *todo o nada* (BR-B07): antes de tocar
  nada hay que bloquear las filas y revalidarlas una por una. El conjunto exacto acaba
  materializándose sí o sí; la única pregunta es dónde.
* **El coste que se quería evitar no era el de los ids.** Mil identificadores son unas decenas de
  kilobytes; mil filas completas, del orden de un megabyte. Lo que viaja al navegador son los ids.

**Por qué 1.000 y no «sin límite».** Es el mismo tope que ya usaban `bulk_create_tickets` y
`taken_ticket_combinations`, así que no añade un número nuevo que recordar. Y por encima de mil, ni
la persona puede revisar lo que va a cambiar ni tiene sentido resolverlo en una sola llamada. Cuando
el filtro devuelve más, se dice con todas las letras y se pide acotar, en vez de seleccionar un trozo
en silencio.

**Dónde vive la selección: fuera de React.** En `selection-store.ts`, sobre `sessionStorage` y leído
con `useSyncExternalStore`. Con `useState` bastaba **casi** siempre, y ese «casi» es el problema:
cualquier desmontaje —una recarga, un `loading.tsx` que se interponga— la borraría sin avisar, y la
sección 11 del encargo es tajante en que la selección debe sobrevivir a buscar y filtrar.
`sessionStorage` muere con la pestaña, así que tampoco persiste entre sesiones del navegador.
`getServerSnapshot` devuelve la lista vacía, de modo que no hay desajuste de hidratación.

**Resolver «todas las que coinciden» reutiliza la consulta del listado**, con el tope como tamaño de
página, en vez de escribir otra. Si filtrara aunque fuera un poco distinto de lo que la persona está
viendo, seleccionaría cosas que no aparecen en pantalla.

---

## D-083 — Una acción masiva es la individual repetida dentro de una transacción
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-08)

**Contexto.** El encargo lo pedía explícitamente: «una acción masiva utiliza las mismas reglas de
dominio que una acción individual». El riesgo evidente es escribir las reglas dos veces y que se
separen con el tiempo.

**Decisión.** Se **extrae** el cuerpo de `assign_ticket` y `cancel_ticket` (0007) a
`assign_ticket_row` y `cancel_ticket_row`, con el mismo texto y los mismos mensajes. A partir de ahí:

* `assign_ticket` y `cancel_ticket` **delegan** en ellas. Su firma y sus mensajes no cambian: lo
  comprueban las pruebas de la Fase 2 que ya existían.
* `bulk_assign_tickets` y `bulk_cancel_tickets` las llaman **en bucle** dentro de una sola
  transacción.

El cambio de vendedor va al revés: sus reglas vivían en TypeScript, en la Server Action. Ahora viven
en `bulk_change_ticket_seller` y la acción individual llama a esa misma función con un solo id. Es
mejor que antes: la regla deja de estar donde una llamada directa a la API podría saltársela.

**Todo o nada, y de dos maneras.** Una función PL/pgSQL es una transacción, así que cualquier `raise`
deshace lo hecho. Además, cada función **cuenta primero** cuántas boletas cumplen todas las
condiciones y aborta antes de tocar nada si falta una: eso es lo que permite dar el mensaje agregado
—«2 de las 12 ya no se pueden anular»— en vez de un error sobre una boleta suelta.

**Concurrencia.** `lock_ticket_batch` bloquea las filas **en orden de id** antes de comprobar nada.
El orden no es decorativo: dos lotes simultáneos que se solapen bloquean las filas comunes en la
misma secuencia y por tanto no pueden quedarse esperándose el uno al otro.

**La aprobación en lote se suma al mismo cuadro.** Existía desde la Fase 3 con sus propias casillas.
Se le quitan y pasa a compartir la única selección de la pantalla: dos formas distintas de marcar
boletas en la misma tabla serían una trampa. `approve_tickets` no se toca —salta por su cuenta lo que
no está pendiente—, pero el botón solo se habilita cuando todas las seleccionadas se pueden aprobar,
así que el resultado es el que la persona vio antes de confirmar.

---

## D-084 — Eliminar existe, es borrado físico, y no reemplaza a anular
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-08)

**Contexto.** El encargo pide una acción **Eliminar** para Dueño y Administrador, distinta de anular
y reservada a «registros agregados por error: importación incorrecta, archivo incorrecto, números
cargados accidentalmente». Choca de frente con dos cosas del proyecto: D-038 («ningún `DELETE`, ni
política ni privilegio») y el glosario, que hasta ahora prohibía la palabra «eliminar».

**Decisión.** Se implementa el borrado físico, acotado a lo que el propio encargo describe, y se
señala aquí la tensión en vez de resolverla por cuenta propia.

**Qué NO cambia.** `authenticated` sigue sin privilegio de `DELETE` sobre ninguna tabla y no hay
ninguna política de `DELETE`. El borrado ocurre **solo** dentro de `bulk_delete_tickets`, que es
`SECURITY DEFINER`. Eso es exactamente lo que D-038 pedía: «el borrado físico exige dos cambios
deliberados y visibles». Una prueba comprueba que un `DELETE` directo del Owner sigue fallando.

**Una boleta anulada nunca se elimina, y no por prudencia.** BR-N08 dice que la combinación de una
boleta anulada no puede reutilizarse dentro de la misma rifa. Borrar la fila liberaría la combinación
y rompería esa regla en silencio. Por eso `cancelled` queda fuera de los estados eliminables, junto
con cualquier boleta que tenga cliente, precio de venta o asignaciones de pago —incluso de un pago
anulado, porque eso es historial financiero—.

**La autorización es la que la aplicación ya usa para lo definitivo**: ser Dueño o Administrador,
confirmar en un diálogo y escribir un motivo de al menos cinco caracteres. El encargo pedía reutilizar
«el mismo mecanismo fuerte» que la anulación, y ese es. **Este proyecto no tiene reautenticación por
contraseña, PIN ni código**, así que no hay nada más fuerte que reutilizar: inventar uno solo para
esta acción habría sido una pieza nueva sin el resto del sistema que la sostiene (recuperación,
bloqueo por intentos, rotación). Queda anotado por si el negocio lo pide.

**Rastro.** El trigger `audit_tickets` (0006) ya escribía `ticket.delete` con la fila entera en
`old_values`; encima, `bulk_delete_tickets` añade una fila `ticket.bulk_delete` con el recuento, el
motivo y el detalle de cada boleta —rifa, vendedor, id y los dos números—, tomado **antes** de
borrar. No se guarda ninguna credencial porque aquí no se maneja ninguna.

**El glosario cambia, y primero.** «Eliminar» pasa a ser un término propio del Anexo A, con su
significado acotado, en vez de una palabra prohibida. La regla de la guía sigue viva: anular,
desactivar y archivar **no** se llaman eliminar.

---

## D-085 — El modo selección es del teléfono; en escritorio las casillas están siempre
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-08)

**Contexto.** El encargo insiste en que en un teléfono la diana no puede ser una casilla de veinte
píxeles, y que la fila entera debe poder tocarse. En escritorio, en cambio, quiere el patrón de
siempre: columna de casillas y la fila que abre el detalle.

**Decisión.** Dos comportamientos y una sola implementación.

* **Qué se ve** lo decide **Tailwind**, no JavaScript: la columna de casillas reutiliza el
  `hideOnMobile` que ya existía (`hidden md:table-cell`), y en modo selección deja de estar oculta.
  Así no parpadea al cargar ni depende de la hidratación.
* **Qué hace un toque** sí necesita JavaScript, y ahí se usa `useMediaQuery` con
  `useSyncExternalStore`, cuyo `getServerSnapshot` devuelve la rama móvil: la aplicación es
  mobile-first y equivocarse hacia el teléfono es lo barato.
* El modo se **deduce** (`compact && solicitado`) en vez de apagarse desde un efecto al ensanchar la
  ventana. Mismo criterio que `TourProvider` (D-074) y una razón concreta: el compilador de React
  marca como error llamar a `setState` dentro de un efecto, y con razón — cuesta un render de más.

**La casilla se ve de 20 px y se toca en 44.** `SelectionCheckbox` envuelve la casilla en un
contenedor de 44 px con margen negativo, de modo que ocupa lo mismo en la maqueta pero recibe el
toque en toda esa área. Lo comprueba una prueba que mide las dos cajas por separado.

**La pulsación larga es un atajo, nunca el camino.** El botón «Seleccionar» está siempre a la vista
(sección 4 del encargo). El gesto solo se dispara con el dedo —con ratón no significa nada— y se
cancela si el dedo se mueve más de 10 px, porque si no, bajar despacio por una lista larga acabaría
seleccionando filas solo. El `click` que el navegador emite después queda anulado para que la misma
pulsación no seleccione y además abra el detalle.

**Las seleccionadas no se suben arriba** (sección 9): mover una fila bajo el dedo provoca toques
equivocados. En su lugar, «Ver seleccionadas» cambia la lista entera y temporalmente, sin tocar los
filtros, que viven en la URL.

---

## D-086 — Un protocolo común de continuidad para Claude Code y Codex

**Fase:** mantenimiento posterior a la Fase 9 (auditoría documental, 2026-08-09)

**Contexto.** `AGENTS.md` apareció como una copia sin seguimiento de 1.232 líneas de `CLAUDE.md`,
mientras `HANDOFF`, `PHASE_STATUS`, `README` y las instrucciones preexistentes daban órdenes incompatibles sobre qué
leer y cuál archivo era canónico. El historial demuestra además que Claude Code construyó una
arquitectura consistente que otro agente no debe sustituir por sus preferencias. El plan terminó,
pero el repositorio no tenía reglas explícitas para mantenimiento posterior a la Fase 9.

**Decisión.** Se adopta un solo protocolo con seis piezas:

1. **Entradas separadas, fuentes comunes.** Codex entra por `AGENTS.md`; Claude Code conserva
   `CLAUDE.md`. Producto y comportamiento se consultan en `MASTER_SPEC`, `BUSINESS_RULES`,
   `DECISIONS`, arquitectura, código, migraciones y pruebas.
2. **Jerarquía:** solicitud actual → comportamiento demostrado por código/BD/pruebas → especificación,
   reglas y decisiones → documentación técnica → estado/relevo → suposiciones. Una contradicción se
   investiga y se reporta; no se resuelve en silencio.
3. **REUSE → EXTEND → CREATE.** Antes de crear una pieza se busca y reutiliza o amplía la existente.
   No se introduce una capa paralela (`services`, repositorio, store, wrapper, formulario) por gusto.
4. **Minimal Change Policy.** Sin refactors, renombramientos, movimientos, dependencias,
   reformateos ni limpieza fuera de alcance.
5. **Protección del trabajo ajeno.** `git status` se revisa antes de implementar. Todo cambio sin
   commit se presume del usuario u otro agente y no se resetea, descarta ni sobrescribe.
6. **Propiedad documental.** `PHASE_STATUS` es estado de producto; `HANDOFF` es relevo operativo;
   `KNOWN_ISSUES` registra problemas; `TEST_RESULTS`, evidencia; los snapshots históricos se
   conservan. Cada archivo se actualiza solo cuando cambia su materia.

**Alternativas.** (a) Mantener `AGENTS.md` como copia de `CLAUDE.md` (descartada: crea dos verdades y
deriva inevitable). (b) Reemplazar `CLAUDE.md` por una importación de `AGENTS.md` (descartada: borra
instrucciones específicas e historia útil de Claude Code). (c) Crear `/docs/ai` o un handbook nuevo
(descartada expresamente por el usuario: duplica el sistema existente).

**Consecuencia.** Un agente nuevo debe continuar la arquitectura real antes que imponer su estilo.
El mantenimiento posterior al plan usa autorización explícita, pruebas proporcionales, documentación
selectiva y commit local, pero no inventa una fase ni una etiqueta. `HANDOFF.md` §0 define el relevo.

---

## D-087 — La importación con cliente exige celular y resuelve identidades de forma conservadora

**Fase:** mantenimiento posterior a la Fase 9 (solicitado por el usuario, 2026-08-09)

**Contexto.** El importador de D-081 solo admitía los dos números de la boleta. El usuario pidió
extender CSV y JSON con datos de cliente, permitir filas mezcladas y evitar clientes duplicados. La
primera propuesta dejaba el celular opcional, pero eso contradecía BR-C02, D-024 y el `NOT NULL` de
`clients.phone`; el usuario confirmó expresamente que el celular debe seguir siendo obligatorio en
la carga masiva.

**Decisión.** «Cliente» y «Celular» son columnas opcionales para el archivo, pero **obligatorias
juntas por fila**. Si ambas faltan, la boleta sigue el comportamiento anterior. Si falta una, la
vista previa marca la fila y el esquema Zod y la RPC vuelven a rechazarla aunque se salte la
interfaz. Los alias equivalentes existen en CSV y JSON; el formato antiguo no cambia.

**Identidad conservadora dentro de una sola cartera.** Las filas se agrupan comparando nombre sin
acentos/mayúsculas/espacios redundantes y celular por sus dígitos nacionales; el texto visible no se
reescribe. En la cartera del vendedor seleccionado:

1. una coincidencia activa, exacta y única de nombre + celular reutiliza `clients.id`;
2. ninguna coincidencia por celular crea un cliente;
3. varias coincidencias exactas, un cliente archivado o el mismo celular con otro nombre son un
   conflicto: se pide corregir o resolver manualmente;
4. nunca se busca ni reutiliza un cliente de otro vendedor u otra organización.

No se añadió `client_ref`: al ser obligatorio el celular ya existe una clave operacional para este
alcance, y agregar otro identificador ampliaría esquema, reglas y UX sin una necesidad demostrada.

**Solo el portal administrativo asigna desde archivo.** Una boleta creada por Seller debe nacer
`pending_approval` y sin cliente (BR-I03/BR-I09); una boleta con cliente debe quedar `assigned`.
Permitir ambas cosas a la vez saltaría la aprobación. Por eso Seller conserva íntegro el importador
de dos números y una fila con cliente se marca como conflicto; Owner/Admin puede importarla para el
vendedor seleccionado.

**Una nueva RPC, no una segunda implementación de venta.** `import_tickets_with_clients` reserva
códigos e inserta el lote como `bulk_create_tickets`, resuelve o crea cada cliente una sola vez y
llama a `assign_ticket_row` para cada boleta con cliente. Todo ocurre en la misma transacción: un
conflicto de identidad o una asignación inválida revierte clientes, boletas y contador. Las
combinaciones ya tomadas conservan la semántica de D-081: se omiten y se informan, sin crear un
cliente que no haya recibido ninguna boleta. `match_ticket_import_clients` alimenta la vista previa
con el mismo ámbito y sin exponer otras carteras.

**Consecuencia operativa.** La migración `0021_ticket_import_clients.sql` debe preceder al frontend
que consume estas funciones. Se aplicó al proyecto real el 2026-08-09, con autorización expresa,
respaldo lógico externo, `db push --dry-run`, verificación remota y sonda transaccional revertida.

---

## D-088 — «Mis boletas» oculta rifa; se parametriza, no se borra
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-10)

**Contexto.** El negocio operará **una sola rifa**. En `/seller/tickets` el filtro «Rifa» ofrecía
elegir entre una única opción y la columna «Rifa» repetía ese mismo valor en todas las filas: dos
controles que ocupan sitio —el filtro, uno de cuatro huecos; la columna, ancho en una tabla que en el
teléfono ya va justa— sin acotar ni distinguir nada.

**Decisión.** Se ocultan los dos **solo en el portal del vendedor**, reutilizando el mecanismo que ya
existía en vez de crear uno nuevo:

* `TicketFilters` pasa a recibir `raffles` como **opcional**, igual que `sellers` y `clients`. Era ya
  la convención del componente —«oculta los selectores que no se le pasan»—, así que no hay bandera
  nueva ni rama de rol dentro del componente.
* `TicketsTable` gana `showRaffle`, hermano exacto de `showSeller`, con el mismo valor por defecto
  `true`. Quien no diga nada sigue viendo la columna.
* `TicketListSlot` lo propaga a «Ver seleccionadas»: es la misma pantalla y debe enseñar las mismas
  columnas.

**El portal administrativo no cambia.** Owner y Admin conservan filtro y columna: son quienes crean
rifas y siguen necesitando distinguirlas. Esto no es una regla de negocio nueva —no toca BR-N ni
BR-B— sino una elección de presentación por portal, y por eso vive en las props y no en la consulta.

**La consulta sigue aceptando `raffleId` por la URL.** Ocultar el control no lo desconecta:
`listTickets` recibe el parámetro igual que antes, así que un enlace guardado sigue funcionando y
`/seller/tickets?raffleId=…` sigue filtrando. Por eso `raffleId` se queda además en la lista que
enciende «Limpiar filtros» y en la que ese botón borra: si un enlace trae el parámetro, el vendedor
tiene que poder quitárselo de encima. Un filtro invisible **y** sin salida sería peor que el filtro.

**Alternativas.** (a) Borrar el filtro y la columna del componente compartido (descartada: los usa
también el portal administrativo, que sí los necesita — habría hecho falta duplicar la tabla,
justo lo que D-051 evita). (b) Decidirlo dentro del componente mirando el rol (descartada: mete
autorización en una pieza de presentación y contradice el patrón `basePath`/`showSeller`).
(c) Ocultarlo cuando la organización tenga una sola rifa (descartada: la interfaz cambiaría sola al
crear la segunda, sin que nadie lo pidiera; hoy la regla es del negocio, no del dato).

**Consecuencia.** Si algún día el vendedor vuelve a manejar varias rifas, se revierte pasándole
`raffles` a `TicketFilters` y `showRaffle` a la tabla en `seller/tickets/page.tsx`; no hay que tocar
componentes compartidos ni consultas.

---

## D-089 — Flecha de volver en las pantallas de detalle, con historial real y destino de repuesto
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-10)

**Contexto.** Cada pantalla de detalle (boleta, cliente, vendedor, rifa) tenía, cuando tenía algo, un
botón o enlace de texto suelto tipo «Volver a las boletas» al final de la página, con una URL fija que
además perdía los filtros que traía el listado de origen (`owner/tickets/[ticketId]` solo conservaba
`raffleId`, nunca `sellerId`, `q`, `inventoryStatus` ni `paymentStatus`). El usuario pidió un patrón
único: una flecha junto al título, arriba, con la consecuencia adicional explícita de que abrir el
detalle por URL directa —sin pantalla anterior real— nunca debía sacar de la aplicación ni fallar en
silencio.

**Decisión.** Se extiende `PageHeader` con `backHref` (destino de repuesto) y `backLabel` (nombre
accesible opcional), en vez de crear un componente `DetailHeader` aparte. `PageHeader` sigue siendo
usable desde Server Components: la parte interactiva vive en `BackButton`
(`src/components/data/BackButton.tsx`, `'use client'`), que `PageHeader` renderiza solo si `backHref`
llega. Las 23 pantallas que no lo pasan no cambian de aspecto ni de comportamiento.

**El historial se prefiere sobre el destino de repuesto**, y se detecta con un contador de módulo
—`navigation-history.ts`—, no con `sessionStorage`. El diseño y el motivo del cambio están en
`ARCHITECTURE.md` §8.6; en resumen: `sessionStorage` sobrevive a una carga dura y eso es exactamente
lo que NO hace falta aquí —hacía que abrir un detalle por URL justo después de iniciar sesión
heredara el historial del login—; una variable de módulo se reinicia sola en cada carga dura, sin
código adicional.

**Un solo mecanismo, sin distinguir por entidad.** `BackButton` no sabe si está en una boleta o un
vendedor; solo recibe `fallbackHref`. Elegir el destino de repuesto correcto por pantalla es
responsabilidad de quien llama a `PageHeader`, no del componente compartido.

**Se migró también `account/password`**, que ya tenía a mano una flecha (`ArrowLeftIcon` + «Volver al
panel») pero como bloque separado ARRIBA del título —el anti-patrón exacto que el encargo pedía
evitar («← Volver, salto de línea, Detalle de boleta»)—. Usar `PageHeader` ahí también corrige esa
estructura de regalo y deja un solo patrón en toda la aplicación, no dos.

**Deliberadamente sin tocar** (con el porqué, no solo la lista):

| Caso | Por qué no |
|---|---|
| «Volver a los resultados» de `TicketSelectionToolbar` (D-082) | Alterna un estado local —qué lista se ve—, no navega entre pantallas |
| «Cancelar» de `RaffleForm`/`ClientForm`/`PaymentForm`/`TicketForm` | Cancela una edición en curso con `router.back()` directo; semántica distinta, y este proyecto no tiene protección de cambios sin guardar que preservar ni romper al tocarlo |
| El botón «Volver a mis boletas» dentro del `EmptyState` de `seller/tickets/new` | Es la guía de qué hacer cuando no hay nada que hacer aquí, como cualquier otra acción de `EmptyState`; el encabezado de esa misma pantalla sí gana la flecha |
| `forgot-password` («Volver a iniciar sesión») | Pantalla pública fuera del portal, no una pantalla de detalle |

**Alternativas.** (a) Un componente `DetailHeader` separado de `PageHeader` (descartada: o duplica el
bloque título/descripción, o produce dos piezas visualmente desconectadas —justo lo que el encargo
pide evitar en la sección de jerarquía del header—). (b) Detectar el historial con
`window.history.length` comparado contra una marca guardada al iniciar la pestaña (descartada:
probada primero, falla exactamente en el caso más pedido por el encargo —abrir por URL directa—
cuando ya hubo cualquier navegación previa en la pestaña, incluida la del propio login). (c) Un
sistema de navegación con pila propia en `sessionStorage`, replicando el historial del navegador
(descartada: exactamente el «sistema de estado innecesariamente complejo» que el encargo pide evitar,
cuando el historial real del navegador ya hace ese trabajo).

**Consecuencia.** Si una pantalla nueva necesita este patrón, pasa `backHref` (y opcionalmente
`backLabel`) a su `PageHeader`; no hace falta tocar `BackButton` ni `navigation-history.ts`. Si
alguna vez este proyecto añade protección de cambios sin guardar a un formulario, esa protección debe
interceptar su propio `router.back()`/`backHref` antes de navegar, no vivir dentro de `BackButton`.

---

## D-090 — El panel reemplaza «Rifa activa» por un resumen de cobranza, con una sola fuente de verdad
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-11)

**Contexto.** El negocio opera una sola rifa activa a la vez (mismo supuesto que D-088), así que la
tarjeta «Rifa activa» de los dos paneles (nombre, precio, botón) dejó de aportar información que el
usuario no tuviera ya en otro sitio. Pidió sustituirla por un resumen ejecutivo de cobranza
(recaudado, pendiente, barra de progreso, porcentaje, boletas por cobrar), con la condición explícita
de que usara la misma fuente de verdad que las tarjetas de cobranza existentes, sin duplicar cálculos
ni disparar consultas nuevas.

**Decisión.** El nuevo `CollectionSummaryCard` (`src/components/data/CollectionSummaryCard.tsx`) no
calcula nada financiero: recibe `totalSold`, `totalCollected`, `pendingAmount` y
`pendingTicketsCount` — los mismos campos de `dashboard.totals` que ya alimentaban las tarjetas
«Total vendido/recaudado/Saldo pendiente» y que alimentan «Boletas por cobrar» en `/owner/payments` y
`/seller/payments` (`ticketsUnpaid + ticketsPartial`, la misma fórmula reutilizada aquí). Un helper
puro, `calculateCollectionSummary` (`src/features/dashboard/collection-summary.ts`), deriva el
porcentaje y acota `pendingAmount` a `[0, ∞)` y el porcentaje a `[0, 100]` — defensa de presentación,
no detección de inconsistencias: la base de datos ya impide el sobrepago (trigger + constraint), así
que no se construyó infraestructura nueva de auditoría para un caso que no puede ocurrir.

Se retiraron por redundancia las tres tarjetas de dinero (Total vendido/recaudado/Saldo pendiente) de
la fila «Cobranza» de ambos paneles: mostraban exactamente los mismos números que la tarjeta nueva,
más pequeños. Se conservan las tres de conteo (Sin pagar/Abonadas/Pagadas), que no son redundantes.

El botón «Crear boletas» de la tarjeta del vendedor se retiró sin reemplazo: ya es una acción fija en
el encabezado de `/seller/tickets` y vuelve a aparecer en su estado vacío (CLAUDE.md §16), así que el
panel no perdía ninguna capacidad real. Por simetría se retiró también el estado «no hay rifas
todavía» del panel del Dueño: `/owner/raffles` ya ofrece «Nueva rifa» siempre en su encabezado y en su
propio estado vacío.

Como consecuencia directa, `activeRaffle` y `canCreateTickets` (`SellerDashboard`) y `activeRaffle`
(`AdminDashboard`) se quedaron sin ningún consumidor: se retiraron de
`src/features/dashboard/queries.ts` y `seller-queries.ts`, junto con la consulta
`listRaffleOptions()` que solo existía para calcularlos en el panel del vendedor — una petición menos
por carga de `/seller/dashboard`.

**Alternativas.** (a) Mantener las tres tarjetas de dinero de «Cobranza» además del resumen nuevo
(descartada: el propio encargo señala el riesgo a evitar —dos números iguales en dos sitios que un
cambio futuro podría dejar de mostrar igual, aunque la fuente sea la misma—). (b) Calcular el resumen
con una consulta propia (descartada: exactamente la duplicación de lógica financiera que CLAUDE.md
§26/§29 prohíbe, y la que crea el riesgo de que un panel muestre un número distinto al otro).

**Consecuencia.** Si el negocio vuelve a operar varias rifas activas a la vez, este resumen no
necesita cambiar: ya agrega dinero de **todas** las rifas de la organización o del vendedor, igual que
las tarjetas de cobranza que reemplaza — nunca dependió de «cuál es la rifa activa».

---

## D-091 — Equipos de vendedores: una columna en `memberships`, no una entidad nueva
**Fase:** posterior a la 9 (mantenimiento; solicitado por el usuario, 2026-08-12)

**Contexto.** El usuario pidió que cualquier vendedor pueda formar su propio equipo creando otros
vendedores, verlos, ver sus ventas, recibir avisos y —en fases siguientes— ganar comisión por tramos.
El encargo insistía en dos cosas: reutilizar `Seller`/`User` en vez de inventar una entidad paralela, y
dejar el modelo preparado para más niveles sin tener que reconstruirlo.

**Decisión.** Un integrante de equipo **es** una membresía con rol `seller`; lo único que se agrega es
`memberships.parent_seller_id` (migración `0022`, BR-E01). Nulo significa lo que significaba antes de
que existiera la columna: un vendedor a cargo del Dueño o el Administrador. Ningún vendedor existente
cambia de estado al desplegar.

La integridad se apoya en el esquema, no en comprobaciones repetidas por consulta:

* **FK compuesta** `(parent_seller_id, organization_id) → memberships (profile_id, organization_id)`.
  Hace estructuralmente imposible un padre de otra organización — no es una condición que haya que
  acordarse de escribir cada vez.
* **CHECK** para «nadie es su propio jefe» y «solo un vendedor tiene vendedor padre».
* **Trigger** para lo que necesita mirar otra fila: el padre está activo, tiene rol vendedor y no
  pertenece a ningún equipo (BR-E03).

**Dos niveles hoy, más mañana.** La profundidad no está grabada en el modelo: la limitan una condición
del trigger y una de la política de alta. Ampliarla significa relajar esas dos y cambiar
`current_team_seller_ids()` por una versión recursiva; la columna, las FK, los índices y las pantallas
siguen valiendo. Se eligió la función **no recursiva** a propósito: se evalúa dentro de la RLS de
`tickets`, la tabla más grande del sistema, y un CTE recursivo ahí cuesta en cada consulta para
sostener una profundidad que hoy no existe (evitar sobre-ingeniería, encargo del usuario).

**Alcance de la visibilidad: solo ventas** (BR-E05, elegido por el usuario entre tres opciones). El
vendedor padre puede responder «cuánto vendió Pedro» pero no «a quién» ni «cuánto dinero recogió».

**Y se accede por función, no ampliando la RLS de boletas** — ver D-092, que corrige el primer diseño.

**Alta por el propio vendedor.** La política `memberships_insert_seller` abre una puerta estrecha: rol
`seller`, padre igual a quien llama, y quien llama debe ser un vendedor activo sin padre propio. La
cuenta de Auth se sigue creando por invitación desde el servidor con la service role (D-045): la
política gobierna el dato de negocio, que es lo que decide quién manda sobre quién.

**Dos errores reales encontrados al implementarla**, ambos detectados por las pruebas y no por lectura:

1. La primera versión de la política llevaba dentro un `not exists (select … from memberships …)` y
   PostgreSQL respondió `infinite recursion detected in policy for relation "memberships"`. Es el
   motivo por el que existen `current_org_ids()` y `has_org_role()` desde `0001`. Se resolvió con
   `current_profile_leads_team(org)`, `SECURITY DEFINER` como sus hermanas.
2. `profiles_select` y `memberships_select` se reescribieron partiendo del texto de `0001`/`0011` en
   vez del vigente de `0014`, lo que **reintrodujo I-019** —`is_org_staff(<columna>)` y
   `current_profile_id()` sin envolver, es decir una llamada por fila—. Lo cazaron las comprobaciones
   de catálogo F7-03. Lección para cualquier migración futura que toque una política: partir de la
   **definición vigente**, que puede no estar en la migración que la creó.

**Alternativas.** (a) Tabla `seller_teams` (descartada: dos fuentes para el mismo hecho y repetir el
aislamiento por organización en sus propias políticas). (b) Rol `team_leader` en el enum `app_role`
(descartada: contradice la regla principal del encargo —todos los vendedores son iguales— y obligaría
a revisar cada política que discrimina por rol). (c) Filtrar el equipo en el servidor sin tocar RLS
(descartada: el frontend y la Server Action no son frontera de seguridad; sin RLS, un `select` directo
a PostgREST seguiría sin devolver las boletas del equipo, o peor, habría que abrirlas del todo).

---

## D-092 — Las ventas del equipo se leen por función, no ampliando la RLS de boletas
**Fase:** posterior a la 9 (mantenimiento, 2026-08-12). **Corrige el primer diseño de D-091.**

**Qué se intentó primero.** La versión inicial de `0022` agregaba una tercera vía a `tickets_select`:

```sql
or seller_id in (select current_team_seller_ids())
```

Funcionaba, pasaba sus 15 pruebas y parecía la solución natural: `v_seller_summary` y
`v_ticket_balances` son `security_invoker` sobre `tickets`, así que el panel y el detalle del equipo
habrían funcionado **sin escribir una sola consulta nueva**.

**Por qué se descartó.** Al ir a construir la pantalla del equipo se revisó qué más leía boletas, y
apareció el problema real: media docena de caminos del portal del vendedor no filtran por vendedor
**a propósito**, porque hasta ahora la RLS ya lo hacía. Sus comentarios lo dicen con todas las letras
—«No se filtra por `sellerId`: `tickets_select` ya limita las filas»—. Con la política ampliada, todos
habrían empezado a incluir boletas del equipo sin que nadie lo pidiera:

| Camino | Qué habría pasado |
|---|---|
| `/seller/tickets` | «Mis boletas» mostrando también las del equipo |
| `/seller/dashboard` | Sus totales e indicadores sumando los del equipo |
| `/seller/reports` | Los cinco reportes contando boletas ajenas |
| `search_tickets` (`0018`) | La búsqueda encontrando boletas de otros |
| Selección múltiple | «Seleccionar todas» abarcando boletas que no puede operar |
| `/seller/tickets/[id]` | El detalle de una boleta del equipo, con botón «Asignar» incluido |

Y lo más grave no es la lista, sino que es **abierta**: cualquier consulta futura del portal del
vendedor heredaría la misma trampa, y el fallo sería silencioso —números de más, no un error—.

**Decisión.** `tickets_select` **no se toca**. El acceso del vendedor padre es explícito y acotado:
`team_sales_summary(raffle)` y `team_member_sales(member, limit)`, `SECURITY DEFINER`, cuya
autorización no es un parámetro manipulable sino el `where m.parent_seller_id = auth.uid()` de su
cuerpo: **no existe forma de preguntar por el equipo de otro**. Es el patrón que el proyecto ya usa
para todo lo que la RLS no expresa bien (`assign_ticket`, `bulk_*`, `report_*`, D-057).

Sí se amplían `profiles_select` y `memberships_select`, que es lo mínimo para mostrar el nombre y el
estado de un integrante y no llevan dinero. Se comprobó que ningún camino del vendedor lee esas dos
tablas esperando «solo yo»: `getActiveMembership` filtra por `profile_id` explícitamente y
`sellerNameMap` solo resuelve nombres.

**Coste aceptado.** El panel del equipo no puede reutilizar `v_seller_summary` ni `listTickets`, y
necesita una lista propia (`TeamMemberSales`) en vez de `TicketsTable`. Se consideró peor
reutilización: aquella tabla lleva columna de cliente —que el vendedor padre no ve—, enlace al detalle
de la boleta —que no debe abrir— y casillas de selección —que no debe operar—. Una tabla con la mitad
de las columnas vacías no es reutilizar, es disfrazar.

**Regla que queda.** `E1-10` afirma explícitamente que un vendedor padre **no** ve las boletas de su
equipo por consulta directa. Es una prueba que parece decir lo contrario de la funcionalidad, y por eso
lleva escrito el motivo: si algún día empieza a devolver una fila, la mitad del portal del vendedor
habrá cambiado de significado sin que nadie lo note.

---

## D-093 — Avisos: tabla propia, campanita, sin tiempo real, y el texto fuera de la base de datos
**Fase:** posterior a la 9 (mantenimiento, 2026-08-12)

**Contexto.** El encargo repetía cuatro veces «reutiliza el sistema de notificaciones existente, no
crees uno paralelo». **No existía ninguno.** La aplicación tenía *toasts* (`sonner`) —un mensaje
efímero en la pantalla que ya estás mirando, que no sobrevive a una recarga y solo lo ve quien acaba
de actuar— y `audit_logs`, que es una bitácora técnica para el personal, no la bandeja de nadie. Se
le presentó al usuario y eligió, entre tres opciones: **tabla + campanita, sin tiempo real**.

**Decisión.** Migración `0023`: tabla `notifications` con una fila por destinatario, escrita
únicamente por `notify_profiles` (`SECURITY DEFINER`, mismo diseño que `write_audit_log`: la tabla no
concede `INSERT` a ningún rol). Se dispara desde **triggers**, no desde las Server Actions, por dos
razones: el aviso ocurre en la misma transacción que el hecho, y no depende del camino —una boleta
llega a vendida por asignación individual, masiva o importación, y las tres avisan sin tener que
acordarse—.

**El texto no vive en la base de datos.** La fila guarda `kind` y un `data` con los nombres y números
ya resueltos; la frase la arma `features/notifications/text.ts`. No es preferencia de estilo: I-030
documenta que los mensajes escritos dentro de migraciones quedaron sin tildes y corregirlos exige una
migración nueva **y aplicarla a producción**. Con el texto en la aplicación, mejorar una redacción es
cambiar un archivo, como todo lo demás que lee un usuario (`UX_COPY_GUIDELINES`, Anexo B). Guardar el
nombre y los números en `data` tiene además una consecuencia necesaria: el vendedor padre **no puede
leer la boleta** de su equipo (D-092), así que el dato tiene que viajar con el aviso.

**Privilegio acotado a una columna.** `authenticated` recibe `grant update (read_at)`, no `update`.
Aunque la política dejara pasar la fila, no hay forma de reescribir el texto ni el destinatario de un
aviso propio. La acción `markNotificationsRead` no recibe ids: marca los del propio usuario, así que
no hay nada que validar ni nada que manipular.

**Quién recibe qué.** Agregar un integrante → el Dueño y los Administradores. Vender una boleta → el
vendedor padre de quien vendió, si lo tiene, **y** el personal. Quien vende no recibe aviso de su
propia venta.

⚠️ **Riesgo aceptado y fácil de revertir: volumen.** Avisar al personal de **cada** venta es lo que
pide literalmente el encargo (su prueba de notificaciones exige que la venta de un sub-vendedor llegue
al Admin), pero en una rifa de mil boletas son mil avisos por persona del personal. El Dueño y el
Administrador ya ven todas las ventas en su panel y en sus reportes, así que el aviso les aporta poco
y les cuesta atención. **Si molesta, se quita una línea**: `v_recipients := org_staff_profile_ids(...)`
en `notify_ticket_sold`, y el vendedor padre —que es quien no tiene otra forma de enterarse— sigue
recibiendo el suyo. Se deja implementado como se pidió y anotado aquí para que sea una decisión del
dueño, no un olvido.

**Alternativas.** (a) Supabase Realtime (descartada por el usuario: infraestructura y conexiones del
plan Free a cambio de que el número baje solo). (b) Reutilizar `audit_logs` como bandeja (descartada:
es de solo anexado, la lee únicamente el personal (BR-D04) y no tiene destinatario ni estado de
lectura; habría que ampliarle la RLS a todos los vendedores, justo el error que corrigió D-092).
(c) Notificar desde las Server Actions (descartada: tres caminos distintos llegan a una venta y el
aviso quedaría fuera de la transacción).

---

## D-094 — La comisión se deriva del estado, y el ledger la explica sin originarla
**Fase:** posterior a la 9 (mantenimiento, 2026-08-12)

**Contexto.** Comisiones por tramos retroactivos, con ajustes al subir y al bajar de nivel, y con la
exigencia explícita de que **nunca** haya doble comisión bajo reintentos, doble clic o eventos
repetidos. `CLAUDE.md` §31 las listaba como fuera del MVP; el usuario las pidió y eso cambia el
alcance (registrado aquí, no en silencio).

**La decisión de fondo: el dinero no se acumula sumando eventos.** El importe correcto es una función
del estado actual —`n × tarifa(n)`, con `n` = boletas pagadas por completo—, así que el motor
**recuenta y registra la diferencia** contra lo ya anotado, en vez de ir sumando incrementos. De ahí
salen dos propiedades que no hay que programar ni vigilar:

* **Idempotencia por construcción.** Un evento repetido vuelve a calcular el mismo `n × tarifa(n)`, la
  diferencia da cero y no se escribe nada. La doble comisión no es «improbable»: es imposible. Una
  prueba llama diez veces seguidas al recálculo y comprueba que no aparece ninguna fila nueva.
* **Autocorrección.** Si una fila del ledger se perdiera, el siguiente movimiento del vendedor volvería
  a cuadrar el total.

**El ledger es la explicación, no el origen** (BR-G09). Y aun así tiene que cuadrar exactamente:
`SUM(ledger) = earned` se comprueba en **cada** escenario de la suite, incluidos los que bajan de
tramo. La descomposición es la que pidió el encargo y la que entiende un vendedor —al pasar de 20 a
21: `sale +$25.000` y `tier_adjustment +$100.000`—, y cuadra por álgebra, no por casualidad:
`d·tarifa_nueva + n_antes·(tarifa_nueva − tarifa_vieja) = ganado_después − ganado_antes`.

**«Pagada», no «vendida»** (BR-G01), decisión del dueño entre tres opciones. Consecuencia que conviene
tener presente: la comisión **baja** cuando se anula un pago, que es el único camino real por el que
hoy puede caer —una boleta con abonos activos no se puede anular (BR-I11)—.

**Estado materializado + ledger.** `seller_commissions` existe por dos motivos distintos: el panel lee
una fila en vez de recorrer la historia (rendimiento), y **es la fila que se bloquea** (`for update`)
para serializar dos ventas simultáneas del mismo vendedor. Sin ella, dos transacciones podrían leer
«20 boletas» a la vez y creerse las dos la número 21. Es el mismo patrón que `tickets.paid_amount`
(D-009): derivado, mantenido por trigger, sin privilegio de escritura para nadie.

**Disparo por trigger sobre `tickets`**, no dentro de las funciones de negocio: el estado que importa
—«esta boleta está pagada»— cambia al registrar un abono, al anularlo, al anular la boleta y al
cambiarla de vendedor, y todos acaban en un `UPDATE` de `tickets`.

**Los tramos van en tabla, no en código** (BR-G03), por organización. Cambiar cuánto se paga es
cambiar filas. Un trigger sobre `organizations` los siembra en cada organización nueva: sin él, una
empresa nueva tendría comisión cero y nadie se enteraría hasta que alguien reclamara su dinero.

**Saldo de partida honesto.** Al instalar la migración ya hay boletas pagadas. No se inventa una
historia de ventas que nadie registró: se anota **un** movimiento `initial_balance` por vendedor y
rifa con lo que le corresponde hoy. Dice «aquí empezamos a contar» y deja la invariante cierta desde
el primer momento.

**Dos errores encontrados al implementarlo**, los dos por pruebas:

1. `coalesce(p_movement, case … then 'sale' … end)` falló con *«COALESCE types commission_movement and
   text cannot be matched»*: los literales de un `case` son `text` hasta que se castean al enum.
2. **La reasignación de una boleta vendida no es posible**, y no por la regla BR-B04 sino por el
   esquema: `tickets_client_seller_fk` es compuesta y no diferible (detalle en la nota de BR-G07). La
   prueba que iba a demostrar el recálculo acabó demostrando —con la *service role*, saltándose RLS y
   funciones— que **ni siquiera por debajo de la aplicación** se puede.

**Alternativas.** (a) Acumular incrementos en el ledger y leer el saldo de su suma (descartada: es la
que produce doble comisión bajo reintentos y no se autocorrige). (b) Calcular al vuelo sin estado
materializado (descartada: sin fila que bloquear no hay forma de serializar dos ventas simultáneas del
mismo vendedor, y el panel recorrería la historia en cada carga). (c) Tramos en código (descartada:
cambiar cuánto cobra la gente exigiría un despliegue).

---

## Ambigüedades pendientes de confirmación del usuario

No bloquean ninguna fase; se resolvieron con la opción más segura y podrán ajustarse.

| # | Tema | Resolución provisional | Decisión |
|---|------|------------------------|----------|
| A1 | ¿Puede un Admin anular boletas con pagos? | No; primero se anulan los pagos | BR-I11 |
| A2 | ¿Se reabren rifas cerradas? | Sí, solo el Owner y con auditoría | BR-R03 |
| A3 | ¿Un vendedor edita los números de una boleta ya aprobada? | No; solo en `draft`/`pending_approval` | Matriz de permisos |
| A4 | ¿Se notifica por correo al invitar usuarios? | Sí, mediante Supabase Auth; sin plantillas personalizadas en el MVP | Fase 3 |
| A5 | ¿Cuántas rifas activas simultáneas? | Varias permitidas; el dashboard muestra la más reciente activa | Fase 6 |
