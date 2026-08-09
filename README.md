# Sistema de Gestión de Rifas

Aplicación web para administrar la operación de una empresa de rifas: organizaciones, rifas,
vendedores, clientes, boletas, asignaciones, abonos, pagos, saldos, reportes y auditoría.

> **Estado actual: las 10 fases están completadas.** La aplicación está **en producción** y auditada.
> El MVP está funcionalmente completo y endurecido desde la Fase 7: crear rifas y boletas,
> repartirlas entre vendedores, venderlas a clientes, **cobrarlas con abonos** y **consultar y
> exportar** todo eso en reportes. Los estados de pago (Sin pagar / Abonada / Pagada) y los saldos
> los calcula siempre la base de datos; ningún importe se suma en el navegador.
> Verificado con **371 pruebas de base de datos** y **212 end-to-end** sobre un navegador real,
> incluido el ciclo completo de venta desde un teléfono y una prueba de volumen con 5.000 boletas.
> La auditoría final (Fase 9) sometió el sistema a **47 intentos deliberados de romperlo** con
> sesiones reales y sin privilegios especiales: ninguno consiguió leer ni escribir un dato ajeno, ni
> descuadrar un peso. Informe completo en [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md);
> procedimiento de despliegue en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
>
> ⚠️ **Antes de operar con dinero real** queda un requisito, y es decisión del dueño del negocio:
> resolver la ausencia de copias de seguridad automáticas del plan Free de Supabase
> (`docs/RUNBOOK.md` §5.3). No hay acciones de ingeniería pendientes.

---

## Qué resuelve

Reemplaza el control manual en papel y hojas de cálculo por un sistema con:

- **Boletas con doble número** (premio diario y premio semanal), de 1 a 4 dígitos, con ceros
  iniciales conservados y combinación única por rifa.
- **Aislamiento estricto por vendedor**: nadie ve la información de otro, ni siquiera manipulando
  URLs o consultando la API directamente.
- **Trazabilidad del dinero**: los abonos se registran, se auditan y nunca se eliminan; los saldos y
  estados de pago se calculan en la base de datos, no a mano.
- **Reportes con exportación a CSV**: ventas, recaudo y saldo por vendedor, boletas por estado y por
  rifa, clientes con saldo pendiente y recaudo por rango de fechas. El vendedor tiene los suyos, sin
  ver datos de nadie más. Los archivos se abren directamente en Excel en configuración regional
  colombiana.
- **Selección múltiple y acciones masivas**: se marcan varias boletas y se actúa sobre todas a la
  vez —venderlas al mismo cliente, aprobarlas, anularlas, cambiarles el vendedor o eliminar las que
  se cargaron por error—. En el teléfono hay un modo selección donde la fila entera es la diana.
- **Operación desde el teléfono** para los vendedores.

---

## Documentación

**Empieza por [`docs/HANDOFF.md`](docs/HANDOFF.md).** Reúne el estado actual, el arranque, las
credenciales necesarias y las trampas ya conocidas. Los demás documentos se consultan solo cuando la
tarea lo pide (`HANDOFF.md` §5 indica cuál).

| Documento | Contenido | Cuándo leerlo |
|-----------|-----------|---------------|
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Estado, arranque, credenciales, trampas | **Siempre, primero** |
| [`CLAUDE.md`](CLAUDE.md) | Especificación maestra y forma de trabajo por fases | **Siempre** |
| [`docs/PHASE_STATUS.md`](docs/PHASE_STATUS.md) | Qué quedó hecho por fase y qué revisar antes de empezar | **Siempre** |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Tablas, restricciones, índices, triggers | Al tocar el esquema o escribir consultas |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Matriz de permisos, RLS, secretos, amenazas | Al escribir RLS o Server Actions |
| [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) | Reglas numeradas (`BR-*`) | Al implementar una regla concreta |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, carpetas, rutas, despliegue | Al crear componentes o rutas |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | Alcance por fase (0 a 9) | Solo la sección de tu fase |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisiones técnicas (`D-*`) | Al preguntarte por qué algo está así |
| [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) | Problemas, riesgos y deuda técnica | Ante un comportamiento raro |
| [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md) | Resultados de pruebas por fase | Al revisar qué se probó |
| [`docs/TESTING.md`](docs/TESTING.md) | Estrategia de pruebas | Al escribir pruebas nuevas |
| [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md) | Especificación funcional consolidada | Para contexto de producto |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Procedimiento de despliegue, variables de Vercel y reversión | Al desplegar o promover una migración a producción |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Manual de operación del negocio (alta de organización, rifas, anulaciones) | Para operar la aplicación, no para programar |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Problemas frecuentes en producción y cómo resolverlos | Ante un incidente en producción |
| [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md) | Auditoría final: hallazgos, evidencia y lo que se intentó romper sin conseguirlo | Al evaluar el estado real del sistema |
| [`docs/UX_COPY_GUIDELINES.md`](docs/UX_COPY_GUIDELINES.md) | Guía de UX Writing: tono, glosario y reglas de redacción de todo texto visible | Al escribir o cambiar cualquier texto de la interfaz |

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 5.9 estricto · Tailwind CSS 4 · shadcn/ui ·
Supabase (PostgreSQL 17, Auth, RLS) · React Hook Form · Zod · date-fns · Vitest ·
TanStack Table y Virtual · Playwright.

Versiones exactas y su justificación en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §2.

---

## Configuración regional

| Parámetro | Valor |
|-----------|-------|
| Idioma | Español (es-CO) |
| Zona horaria | `America/Bogota` |
| Moneda | COP, almacenada como entero de pesos |
| Precio predeterminado de boleta | `$100.000` (`100000`) |

---

## Puesta en marcha

Requisitos previos: Node.js ≥ 20.19 (ver `docs/DECISIONS.md` D-030), npm, Git y —desde la Fase 2—
Docker Desktop para ejecutar Supabase en local.

```bash
npm install
cp .env.example .env.local   # completar con las claves reales del proyecto Supabase
npm run dev
```

Para **desarrollar** conviene usar `npm run dev:local`, que apunta siempre a la instancia local de
Supabase. `npm run dev` usa lo que diga `.env.local`, que puede ser el proyecto real.

`.env.local` nunca se versiona. Variables mínimas: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SEED_DEFAULT_PASSWORD`.
Detalle de cada una en [`.env.example`](.env.example).

Para tener usuarios de prueba (Owner, Admin, 2 Sellers) sobre una base de datos ya migrada:

```bash
npm run seed
```

Para desarrollar contra una base de datos local (necesita Docker):

```bash
npx supabase start
```

```bash
npm run db:reset && npm run seed:local
```

Comandos disponibles:

```bash
npm run dev           # desarrollo (Turbopack) contra lo que diga .env.local
npm run dev:local     # desarrollo contra la instancia local de Supabase
npm run build         # build de producción
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run test          # vitest (unitarias)
npm run test:db       # 371 pruebas contra la base de datos local (crea 5.000 boletas de volumen)
npm run test:e2e      # 212 pruebas end-to-end (Playwright, requiere base local RECIÉN sembrada)
npm run format:check  # prettier --check
npm run verify        # typecheck + lint + test + build
npm run seed          # datos de desarrollo en el proyecto de .env.local
npm run seed:local    # datos de desarrollo en la instancia local
npm run db:reset      # reaplica todas las migraciones desde cero (local)
npm run create-org -- --name "..." --owner-email ... --owner-name ... --owner-phone ...
                      # alta operativa de una organizacion y su primer Owner (docs/OPERATIONS.md)
```

---

## Forma de trabajo

El proyecto avanza **por fases** y cada una requiere autorización explícita
(ver `CLAUDE.md` §1). Antes de iniciar una fase:

1. Leer `CLAUDE.md`.
2. Leer la documentación de `docs/`.
3. Revisar `docs/PHASE_STATUS.md`.
4. Ejecutar únicamente la fase autorizada.

| Fase | Nombre | Estado |
|------|--------|--------|
| 0 | Arquitectura y planificación | ✅ Completada |
| 1 | Proyecto base y autenticación | ✅ Completada |
| 2 | Base de datos, restricciones y RLS | ✅ Completada |
| 3 | Portal Owner y Admin | ✅ Completada |
| 4 | Portal Seller y clientes | ✅ Completada |
| 5 | Pagos, abonos y saldos | ✅ Completada |
| 6 | Dashboards, reportes y UI/UX | ✅ Completada |
| 7 | Pruebas, seguridad y endurecimiento | ✅ Completada |
| 8 | Despliegue y documentación operativa | ✅ Completada |
| 9 | Auditoría final independiente | ✅ Completada |

---

## Producción

Desplegada en Vercel (proyecto `gestion-rifas`) contra el proyecto Supabase real, sin un entorno de
staging separado — decisión documentada en `docs/DECISIONS.md` D-066. Procedimiento completo,
variables de entorno y reversión en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md); manual de operación
del día a día en [`docs/OPERATIONS.md`](docs/OPERATIONS.md); problemas frecuentes en
[`docs/RUNBOOK.md`](docs/RUNBOOK.md).

Un `push` a `main` construye y despliega automáticamente (integración de Vercel con GitHub). Las
migraciones **no** se aplican solas — se promueven a mano con el procedimiento de tres pasos de
`DEPLOYMENT.md` §2.2.

---

## Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` **nunca** llega al navegador.
- Ningún secreto se versiona: solo se publica `.env.example` con valores de marcador.
- RLS activo en todas las tablas de negocio; el frontend no es frontera de seguridad.
- Cabeceras de endurecimiento en toda respuesta: CSP con **nonce por request**, HSTS (en producción),
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`.
- Limitación de intentos en inicio de sesión, recuperación de contraseña e invitaciones.
- `npm audit`: **0 vulnerabilidades**.

Detalle completo en [`docs/SECURITY.md`](docs/SECURITY.md).
