# Sistema de Gestión de Rifas

Aplicación web para administrar la operación de una empresa de rifas: organizaciones, rifas,
vendedores, clientes, boletas, asignaciones, abonos, pagos, saldos, reportes y auditoría.

> **Estado actual: Fase 1 completada — proyecto base y autenticación.**
> Login, logout, recuperación de contraseña y navegación por rol funcionan sobre una base de datos
> real. Todavía no existen rifas, boletas, clientes ni pagos: esas fases no han sido autorizadas.

---

## Qué resuelve

Reemplaza el control manual en papel y hojas de cálculo por un sistema con:

- **Boletas con doble número** (premio diario y premio semanal), de 1 a 4 dígitos, con ceros
  iniciales conservados y combinación única por rifa.
- **Aislamiento estricto por vendedor**: nadie ve la información de otro, ni siquiera manipulando
  URLs o consultando la API directamente.
- **Trazabilidad del dinero**: los abonos se registran, se auditan y nunca se eliminan; los saldos y
  estados de pago se calculan en la base de datos, no a mano.
- **Operación desde el teléfono** para los vendedores.

---

## Documentación

Toda la documentación vive en [`docs/`](docs/). Orden de lectura recomendado:

| Documento | Contenido |
|-----------|-----------|
| [`CLAUDE.md`](CLAUDE.md) | **Fuente principal de verdad.** Especificación maestra y forma de trabajo por fases |
| [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md) | Especificación funcional consolidada, glosario y flujos |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, carpetas, rutas, flujo de datos y despliegue |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Tablas, restricciones, índices, triggers y casos extremos |
| [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) | Reglas de negocio numeradas (`BR-*`) |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Matriz de permisos, RLS, secretos y modelo de amenazas |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | Plan detallado de las fases 0 a 9 |
| [`docs/PHASE_STATUS.md`](docs/PHASE_STATUS.md) | **Estado de las fases.** Leer antes de iniciar cualquier fase |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Registro de decisiones técnicas (`D-*`) |
| [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) | Problemas abiertos, riesgos y deuda técnica |
| [`docs/TESTING.md`](docs/TESTING.md) | Estrategia y matriz de pruebas |

---

## Stack previsto

Next.js 16 (App Router) · React 19 · TypeScript 5.9 estricto · Tailwind CSS 4 · shadcn/ui ·
Supabase (PostgreSQL, Auth, RLS) · React Hook Form · Zod · TanStack Table · date-fns ·
Vitest · Playwright.

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

`.env.local` nunca se versiona. Variables mínimas: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SEED_DEFAULT_PASSWORD`.
Detalle de cada una en [`.env.example`](.env.example).

Para tener usuarios de prueba (Owner, Admin, 2 Sellers) sobre una base de datos ya migrada:

```bash
npm run seed:users
```

Comandos disponibles:

```bash
npm run dev           # desarrollo (Turbopack)
npm run build         # build de producción
npm run typecheck     # tsc --noEmit
npm run lint           # eslint
npm run test           # vitest (unitarias)
npm run format:check   # prettier --check
npm run verify         # typecheck + lint + test + build
npm run seed:users     # crea org + Owner/Admin/2 Sellers de desarrollo
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
| 2 | Base de datos, restricciones y RLS | ⬜ Pendiente de autorización |
| 3 | Portal Owner y Admin | ⬜ |
| 4 | Portal Seller y clientes | ⬜ |
| 5 | Pagos, abonos y saldos | ⬜ |
| 6 | Dashboards, reportes y UI/UX | ⬜ |
| 7 | Pruebas, seguridad y endurecimiento | ⬜ |
| 8 | Despliegue y documentación operativa | ⬜ |
| 9 | Auditoría final independiente | ⬜ |

---

## Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` **nunca** llega al navegador.
- Ningún secreto se versiona: solo se publica `.env.example` con valores de marcador.
- RLS activo en todas las tablas de negocio; el frontend no es frontera de seguridad.

Detalle completo en [`docs/SECURITY.md`](docs/SECURITY.md).
