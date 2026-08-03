# Sistema de Gestión de Rifas

Aplicación web para administrar la operación de una empresa de rifas: organizaciones, rifas,
vendedores, clientes, boletas, asignaciones, abonos, pagos, saldos, reportes y auditoría.

> **Estado actual: Fase 0 completada — planificación y arquitectura.**
> Todavía no existe código de aplicación. El repositorio contiene la especificación y el plan
> técnico completo. La Fase 1 (proyecto base y autenticación) aún no ha sido autorizada.

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

> Disponible **a partir de la Fase 1**. Hoy no hay `package.json` ni dependencias que instalar.

Requisitos previos: Node.js ≥ 20.9, npm, Git y —desde la Fase 2— Docker Desktop para ejecutar
Supabase en local.

```bash
npm install
cp .env.example .env.local   # completar con las claves del proyecto Supabase
npm run dev
```

Los comandos previstos (`dev`, `build`, `typecheck`, `lint`, `test`, `test:db`, `test:e2e`,
`verify`) se definen en [`docs/TESTING.md`](docs/TESTING.md) §7.

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
| 1 | Proyecto base y autenticación | ⬜ Pendiente de autorización |
| 2 | Base de datos, restricciones y RLS | ⬜ |
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
