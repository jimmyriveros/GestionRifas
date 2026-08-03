# REGISTRO DE DECISIONES

Bitácora de decisiones técnicas y de producto. Formato: contexto → decisión → alternativas
descartadas → consecuencia. Cada decisión tiene un identificador estable citado desde otros
documentos.

- **Versión:** 1.0 · **Actualizado:** 2026-08-02

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
