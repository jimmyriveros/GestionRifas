# AGENTS.md — punto de entrada de Codex

Este archivo contiene el protocolo de trabajo de **Codex** para este repositorio. No duplica la
especificación del producto. Claude Code usa `CLAUDE.md`; ambos agentes comparten las reglas de
continuidad de este archivo, `CLAUDE.md` §36 y D-086.

La consistencia con el proyecto existente tiene prioridad sobre las preferencias del agente.

---

## 1. Jerarquía de fuentes

Cuando dos fuentes parezcan contradecirse, usa este orden:

1. Solicitud explícita actual del usuario.
2. Código, migraciones, esquema y pruebas que demuestren el comportamiento real.
3. `docs/MASTER_SPEC.md`, `docs/BUSINESS_RULES.md` y `docs/DECISIONS.md`.
4. `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY.md` y demás documentación técnica.
5. `docs/PHASE_STATUS.md` y `docs/HANDOFF.md`.
6. Suposiciones del agente.

El código actual describe lo que ocurre; no autoriza a cambiar una regla documentada. Si código y
documentación discrepan, investiga, registra y reporta la inconsistencia. No la resuelvas en silencio.

---

## 2. Lectura obligatoria antes de programar

Lee en este orden:

1. `AGENTS.md`.
2. Ejecuta `git status --short --branch` y protege cualquier cambio existente.
3. `docs/HANDOFF.md` — relevo operativo, arranque y trampas actuales.
4. `docs/PHASE_STATUS.md` — estado del producto y de las fases.
5. `docs/MASTER_SPEC.md` — alcance funcional consolidado.
6. `docs/ARCHITECTURE.md` — estructura y patrones técnicos.
7. `docs/BUSINESS_RULES.md` — reglas `BR-*`.
8. `docs/DECISIONS.md` — decisiones `D-*` que no deben reinterpretarse por preferencia.
9. Los archivos reales de código, migraciones y pruebas relacionados con la tarea.
10. Los documentos específicos indicados en §3.

El núcleo es de consulta obligatoria; en los documentos acumulativos extensos lee el encabezado,
el estado vigente y las entradas `BR-*`/`D-*` relacionadas, no cada snapshot histórico sin relación.

No asumas que la documentación refleja perfectamente el código. Contrástala con la implementación y
con Git antes de escribir.

Para una implementación, verifica primero el entorno local:

```bash
npx supabase start
npm run db:reset && npm run seed:local
npm run test:db
npm run verify
```

Si Docker acaba de reiniciarse y el seed recibe un 502, espera a que GoTrue responda y reintenta
(I-028). Para una tarea estrictamente de lectura no hace falta alterar la base local.

---

## 3. Documentación según el tipo de tarea

El mapa completo y la función de cada documento viven en `docs/HANDOFF.md` §5.

| Tipo de cambio | Lectura adicional obligatoria |
|---|---|
| UI, responsive o componentes | `docs/UX_COPY_GUIDELINES.md` y `docs/ARCHITECTURE.md` §8 |
| Texto visible, error o confirmación | `docs/UX_COPY_GUIDELINES.md` completa y `src/lib/constants.ts` |
| Base de datos, consulta, índice o migración | `docs/DATA_MODEL.md`, migraciones y tipos generados |
| Auth, autorización, RLS, RPC, Server Action o Route Handler | `docs/SECURITY.md` y pruebas de aislamiento |
| Pruebas | `docs/TESTING.md`; `docs/TEST_RESULTS.md` para regresiones o fallos conocidos |
| Fase autorizada | La sección correspondiente de `docs/IMPLEMENTATION_PLAN.md` |
| Despliegue o producción | `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, `docs/RUNBOOK.md` y `docs/KNOWN_ISSUES.md` |
| Operación del negocio | `docs/OPERATIONS.md` |
| Incidente o comportamiento raro | `docs/KNOWN_ISSUES.md`, `docs/RUNBOOK.md` y, si aplica, `docs/AUDIT_REPORT.md` |

`docs/AUDIT_REPORT.md` y las entradas anteriores de `docs/TEST_RESULTS.md` son registros históricos:
no se reescriben para hacerlos parecer actuales. Se añade una nota posterior en el documento vivo que
corresponda.

---

## 4. Continuidad Claude Code ↔ Codex

Si otro agente empezó el trabajo:

1. Lee `HANDOFF` y `PHASE_STATUS`.
2. Revisa `git status`, el diff y los commits relevantes.
3. Abre los archivos realmente modificados.
4. Identifica las decisiones `D-*`, reglas `BR-*` y patrones que ya aplicó.
5. Continúa esa implementación.

No reimplementes desde cero, no reemplaces silenciosamente la solución, no cambies arquitectura o
librerías por preferencia y no introduzcas una segunda abstracción para lo mismo. Si una decisión
parece incorrecta, reúne evidencia y repórtala antes de alterarla.

### REUSE → EXTEND → CREATE

Antes de crear un componente, hook, servicio, helper, utilidad, validador, wrapper de API, acceso a
datos, estado, tipo, modal o abstracción de formulario:

1. **REUSE:** busca equivalentes con `rg` y `rg --files`, y revisa `HANDOFF` §6.b.
2. **EXTEND:** si existe algo cercano, amplíalo sin romper sus consumidores.
3. **CREATE:** crea una pieza nueva solo cuando las dos opciones anteriores no cubran el caso.

No existe una capa `services`/`repositories` general en este proyecto. No la introduzcas sin una
decisión arquitectónica explícita.

---

## 5. Política de cambio mínimo

Cada tarea modifica únicamente lo necesario para cumplir su alcance. Evita:

- refactors no solicitados;
- renombramientos o movimientos masivos;
- actualizar dependencias sin necesidad;
- reformatear archivos completos;
- limpiar código no relacionado;
- cambiar lógica fuera del alcance;
- crear documentación paralela o duplicar el detalle; un resumen corto debe enlazar al documento propietario.

Preserva los cambios del usuario o de otro agente. No uses `git reset --hard`, `git checkout --`,
`git clean`, ni descartes archivos sin autorización explícita. No hagas push, despliegues ni cambios
en el proyecto Supabase real salvo solicitud expresa.

---

## 6. Patrones arquitectónicos que se preservan

- Next.js 16 con App Router y TypeScript estricto. Antes de cambiar código de Next, lee la guía
  pertinente en `node_modules/next/dist/docs/`.
- Organización por dominio en `src/features/<dominio>`: `schemas.ts`, `queries.ts`, `actions.ts` y
  `components/` cuando corresponda.
- Lecturas: Server Component → `queries.ts` con `server-only` → Supabase sujeto a RLS.
- Escrituras de negocio parametrizadas: Server Action → `authorizeAction` → Zod → RPC/DML con
  allowlist → `mapPgError` → `revalidatePath` → `{ ok } | { error }`. Auth y `logout` usan guardas
  propias; I-051 registra una excepción pendiente que no debe copiarse.
- La base de datos es la frontera de seguridad. RLS, restricciones y validaciones de servidor no se
  sustituyen por controles de interfaz.
- Dinero, saldos, estados de pago, atomicidad y auditoría son autoritativos en PostgreSQL/RPC.
- Filtros y paginación de listas viven en la URL; no se crea una segunda capa de `fetch` para ellos.
- Componentes compartidos se parametrizan para Owner/Admin y Seller; no se duplican por portal.
- Migraciones ya aplicadas son inmutables. Todo cambio de esquema usa una migración nueva.
- Interfaz en español, zona `America/Bogota`, moneda COP en enteros y textos conforme a
  `docs/UX_COPY_GUIDELINES.md`.

Reutilizaciones concretas —tablas, búsquedas, selección, importación, formularios, helpers y RPC—
están enumeradas en `docs/HANDOFF.md` §6.b.

---

## 7. Fases y alcance

El proyecto se construyó en las fases 0 a 9. Ninguna fase nueva ni ampliación de alcance comienza sin
autorización explícita. Ejecuta solo la fase o tarea solicitada y detente al terminar.

Para una fase autorizada:

- conserva compatibilidad con fases anteriores;
- no implementes funciones de fases posteriores ni elementos fuera del MVP;
- registra decisiones no evidentes en `DECISIONS.md`;
- ejecuta las verificaciones exigidas;
- actualiza solo la documentación cuyo tema cambió;
- crea commit local y etiqueta `fase-N` al cerrar una fase nueva autorizada;
- no hagas push sin autorización.

Para mantenimiento posterior al plan, no inventes una fase ni una etiqueta: usa autorización
explícita, pruebas proporcionales, actualización documental selectiva y un commit local.

---

## 8. Pruebas y cierre

La verificación es proporcional al riesgo. Como base para cambios funcionales:

```bash
npm run verify
npm run test:db
```

Ejecuta `npm run test:e2e` cuando cambien recorridos, UI, autenticación, autorización o integraciones
entre capas. Restaura primero el seed local; `test:db` deja 5.000 boletas de volumen.

Registra comandos, resultados, errores encontrados y correcciones en `docs/TEST_RESULTS.md` cuando el
trabajo sea significativo. No ocultes fallos ni los llames intermitentes sin investigar.

### Higiene documental

| Documento | Actualízalo cuando... |
|---|---|
| `ARCHITECTURE.md` | cambie arquitectura, ruta, dependencia o patrón real |
| `BUSINESS_RULES.md` | nazca o cambie una regla funcional |
| `DATA_MODEL.md` | cambie el modelo persistente |
| `SECURITY.md` | cambie autenticación, autorización, RLS o superficie de ataque |
| `DECISIONS.md` | una decisión afecte implementaciones futuras |
| `KNOWN_ISSUES.md` | se verifique, cambie o resuelva un problema o riesgo |
| `PHASE_STATUS.md` | cambie el estado del producto o de una fase |
| `HANDOFF.md` | termine trabajo significativo o cambie el contexto operativo |
| `TEST_RESULTS.md` | se ejecuten verificaciones significativas o aparezca un error |
| `README.md` | cambie el uso o la navegación documental para una persona nueva |

`HANDOFF` debe dejar: resultado, archivos tocados, patrones reutilizados, decisiones, pruebas y
errores, pendientes, advertencias y estado Git. `PHASE_STATUS` no sustituye ese relevo.

### Reporte de una fase

Al cerrar una fase, el reporte final contiene exactamente estas secciones:

1. `## Fase completada`
2. `## Implementación realizada`
3. `## Archivos principales modificados`
4. `## Cambios de base de datos`
5. `## Pruebas y verificaciones ejecutadas`
6. `## Verificación manual requerida`
7. `## Decisiones y suposiciones`
8. `## Problemas conocidos`
9. `## Estado del repositorio`
10. `## Próxima fase`

La última línea debe ser exactamente:

`FASE [NÚMERO] COMPLETADA. Me detengo aquí y espero tu autorización para iniciar la siguiente fase.`

El bloque siguiente pertenece a Next.js. Como Next prioriza `AGENTS.md` cuando también existe
`CLAUDE.md`, después de actualizar Next ejecuta `next dev` y sincroniza **solo** el bloque delimitado
por `BEGIN/END:nextjs-agent-rules` hacia `CLAUDE.md` (I-053).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
