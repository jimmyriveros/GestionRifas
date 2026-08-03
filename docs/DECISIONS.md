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
