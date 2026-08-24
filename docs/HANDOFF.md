# HANDOFF — punto de entrada para una sesión nueva

Memoria operativa compartida entre Claude Code y Codex. Lee primero las instrucciones de tu agente
(`CLAUDE.md` o `AGENTS.md`), revisa Git y continúa aquí. `PHASE_STATUS.md` responde qué estado tiene el
producto; este archivo responde qué necesita saber el siguiente agente para trabajar sin romper la
continuidad.

## 0. Cómo entregar el relevo

Después de trabajo significativo, actualiza el bloque §1.a con una sola fotografía vigente:

| Campo | Contenido obligatorio |
|---|---|
| Resultado | Qué se terminó y qué quedó deliberadamente fuera |
| Archivos | Archivos o carpetas realmente tocados |
| Reutilización | Patrones y piezas existentes que se conservaron o ampliaron |
| Decisiones | `D-*`, `BR-*`, suposiciones y alternativas descartadas |
| Verificación | Comandos, resultados, errores encontrados y correcciones |
| Advertencias | Trampas, precondiciones y acciones que no deben ejecutarse sin autorización |
| Pendiente | Problemas, bloqueos, confirmación humana y siguiente acción exacta |
| Git | Rama, commit base observado y cambios sin commit. El hash de entrega puede quedar en el reporte final; no crees otro commit solo para que un documento cite a su propio commit |

No conviertas este archivo en otro historial: el detalle cronológico vive en `TEST_RESULTS.md`,
`KNOWN_ISSUES.md` y el historial de Git. No copies aquí el estado completo de las fases.

---

## 1. Estado actual

| | |
|---|---|
| Última fase completada | **9 — Auditoría final independiente. El plan de 10 fases está terminado** |
| Siguiente fase | Ninguna. Todo mantenimiento posterior requiere una tarea y priorización explícitas (ver §1.b) |
| **Precio de la boleta** | **$120.000** desde el 2026-08-15 (D-098, BR-P01). Era `$100.000` y **esa cifra nunca fue la correcta**. La fuente sigue siendo `raffles.ticket_price`; no escribas cifras de precio en el código |
| **Rebaja del vendedor** | Desde el 2026-08-17 (D-099) una boleta puede venderse **por debajo** del precio de la rifa. `sale_price` es lo que debe el cliente y `base_price` el precio oficial congelado; la rebaja es la resta y **no se guarda**. La asume entera la ganancia del vendedor. **Ya en producción** (`0028`, 2026-08-17) |
| **Buscar en «Boletas»** | Desde el 2026-08-21 (D-100, BR-N13) el **único** campo de búsqueda encuentra por los números de la boleta **y** por el nombre del cliente que la tiene, devolviendo siempre boletas. Migración **`0029`**. **Ya en producción** (`e1b2fe1`, 2026-08-21) |
| **Navegación en el teléfono** | Desde el 2026-08-23 (D-106) el móvil **no tiene cajón lateral**: tiene una **barra inferior fija** con Panel · Boletas · Clientes · Pagos, y el resto del menú se lee desde el **menú de usuario**. Escritorio sigue igual. Ninguna ruta ni permiso cambió. **Ya en producción** (`79e107b`, 2026-08-23) |
| **«Boletas» en el teléfono** | Desde el 2026-08-23 (D-107) la lista de boletas del móvil son **tarjetas**, no una tabla con Cliente, Pago y Precio ocultos. Los filtros van detrás de «Filtros (n)», en una hoja inferior; el buscador sigue siempre visible. **Escritorio no cambió.** Misma consulta, mismos permisos, sin migración. **Ya en producción** (`d3ee139`, 2026-08-23) |
| **Cabecera de «Boletas»** | Desde el 2026-08-24 (D-108) el título y **«Crear boletas»** comparten fila, el recuadro de filtros es **solo de escritorio**, el buscador mide **44 px** en el móvil y **«Filtros»** y **«Seleccionar varias»** son **una sola fila** de 44 px. La primera boleta sube de y = 448 a **y = 322**. Sin migración, sin consultas nuevas. **Ya en producción** (`4381f2b`, 2026-08-24) |
| **Cabecera del portal administrativo** | Desde el 2026-08-24 (D-109) `/owner/tickets` tiene el mismo bloque, con **una diferencia obligada**: sus **dos** acciones no caben junto al título —363 px sobre 288 a 320 px— y bajan juntas a una **fila propia de 44 px** de lado a lado. Las dos pantallas de boletas tienen encabezados distintos a propósito (`ARCHITECTURE` §8.11). **Sin desplegar** |
| Cambio funcional anterior | `7b26d99` — **corregir a un integrante pendiente** (D-097), 2026-08-14; migración `0026` aplicada al proyecto real, CI 2/2 y despliegue verificado por SHA |
| Último cambio promovido | **`4381f2b`** — **la cabecera de «Boletas» deja de ser cuatro bloques sueltos** (D-108), 2026-08-24; sin migración, CI 2/2 y despliegue verificado por SHA |
| Cambio promovido anterior | **`d3ee139`** — **las boletas del teléfono pasan a tarjetas** (D-107), 2026-08-23; sin migración, CI 2/2 y despliegue verificado por SHA |
| Cambio promovido anterior | **`ded4181`** — **Fluid Compute declarado en `vercel.json`**, 2026-08-23. Era un requisito duro de `DEPLOYMENT.md` §3.1.b que vivía solo en el panel y no dejaba rastro en Git. Se declara **solo** `fluid`: las cabeceras siguen en `next.config.ts` y `src/proxy.ts`, y se comprobó que las 6 siguen llegando |
| Cambio promovido anterior | **`79e107b`** — **la navegación del teléfono baja a una barra inferior** (D-106), 2026-08-23; sin migración, CI 2/2 y despliegue verificado por SHA |
| Último cambio funcional promovido | **`e1b2fe1`** — **buscar boletas por el cliente** (D-100, D-101), 2026-08-21; migración `0029` aplicada al proyecto real, despliegue verificado por SHA. La migración no escribe ni una fila |
| Punto de partida del último mantenimiento | `main` en `3f82c42`, con árbol limpio antes de implementar (2026-08-21) |
| Etiquetas | La última es `fase-9`, que apunta a `0becc47`. Solo `fase-0`, `fase-1` y `fase-2` están en el remoto; `fase-3` a `fase-9` siguen solo en local. No mover ni empujar etiquetas sin autorización |
| Remoto | `github.com/jimmyriveros/GestionRifas`. `main` local y `origin/main` coincidían en **`4381f2b`** el 2026-08-24, tras el push de D-108; a partir de ahí vuelve a comprobarse con Git, no se asume por este texto |
| **Producción** | **`https://gestion-rifas.vercel.app`** — proyecto Vercel `gestion-rifas`, desplegado y verificado (cabeceras, aislamiento de rutas, los 3 roles probados por el usuario) |
| App | Next.js 16: autenticación, portal administrativo, portal del vendedor, pagos/abonos y **reportes con exportación CSV**, todo funcionando **en producción** |
| **Rendimiento — datos** | Auditado con volumen real el **2026-08-22** (D-102, D-103): 100.005 clientes, 300.033 boletas y 1.000.006 pagos en base local. Las consultas de las cinco pantallas más usadas pasaron de **0,6–1,4 s** a **0,1–0,3 s**. Migración **`0030`** y código en producción. Con el volumen real de hoy —46 clientes, 121 boletas— **no se nota**: es preventiva. Techos pendientes: I-062 e I-063 |
| **Rendimiento — navegación** | Medida la cadena completa desde el clic (D-104, 2026-08-22): local **826 → 124 ms**; en Vercel, encadenada **~840 → ~350 ms** y **tras 60 s de lectura 2.900–5.900 → 847 ms** de mediana, ninguna por encima de 2 s. Tres causas: los `loading.tsx` (~300 ms de espera por el fallback), la precarga de las filas de tabla, y el **arranque en frío de Vercel**, que no era código y se resolvió activando **Fluid Compute** (I-067, resuelto). ⚠️ **Fluid Compute es ahora un requisito de despliegue** (`DEPLOYMENT.md` §3.1.b): si alguien lo desactiva, los tres segundos vuelven y ningún cambio de código los quitará |
| Base de datos | **30 migraciones en local y en el proyecto real.** **`0030` se promovió el 2026-08-22** con respaldo previo en `Rifas-backups/2026-08-22-pre-0030/`. **`0029` se promovió el 2026-08-21** con respaldo previo en `Rifas-backups/2026-08-21-pre-0029/`. `0028` se promovió el **2026-08-17** con respaldo previo en `Rifas-backups/2026-08-17-pre-0028/`. `0027` se promovió el **2026-08-15** con respaldo previo en `Rifas-backups/2026-08-15-pre-0027/`. `0022`–`0025` se promovieron el 2026-08-13 y **`0026` el 2026-08-14**, con respaldo previo en `Rifas-backups/`. **Plan Free: sin backups automáticos** (I-024), respaldo lógico manual en §3.b |
| Pruebas | **325 unitarias**, **518 de base de datos** (+6 de `read-performance`) y **291 E2E** (242 escritorio + 49 móvil), revalidadas el 2026-08-24 con `verify` en verde. La suite de base de datos aguanta pasadas seguidas sobre la misma base (I-057 e I-059); la de E2E **no**, y hay que sembrarla limpia antes de una pasada completa. CI en GitHub Actions desde la Fase 8 |

**Lo que existe hoy:** el producto completo del MVP **en producción real** — crear rifas y boletas,
repartirlas entre vendedores, venderlas a clientes, cobrarlas con abonos, y consultar y exportar todo
eso en reportes. Los saldos y los estados de pago los calcula la base de datos. Endurecido en la
Fase 7 (CSP por nonce, limitación de intentos, RLS ~1.400× más rápida), desplegado en la Fase 8 y
auditado en la Fase 9 con **47 intentos deliberados de romperlo**, ninguno de los cuales consiguió
leer ni escribir un dato ajeno. Informe: `docs/AUDIT_REPORT.md`.
Desde el 2026-08-08 la lista de boletas admite **selección múltiple y acciones masivas** (BR-B01..
BR-B08), ya **en producción**.
El importador CSV/JSON admite además filas opcionales con cliente + celular obligatorio (D-087).
La base real ya tiene `0021`; el push coordinado de `main` activa el frontend correspondiente.
**Lo que NO existe:** backups automáticos de Supabase (plan Free — I-024, prerrequisito antes de datos
reales).

---

## 1.a Último relevo significativo — la misma cabecera en el portal administrativo (2026-08-24)

| Campo | Estado |
|---|---|
| Resultado | `/owner/tickets` recibe el bloque de D-108, con **una diferencia obligada**: tiene **dos** acciones y no caben junto al título, así que **bajan juntas a una fila propia de 44 px** que va de lado a lado, igual que la de «Filtros» justo debajo. El resto de la sección ya lo tenía desde D-108, porque sale de `TicketFilters`, que las dos pantallas comparten. **Escritorio no cambia**: los botones vuelven a 36 px y a su ancho, a la derecha del título. `Query changes: None` · `New API calls: None` · `Business logic changes: None` · `New dependencies: None` (D-109) |
| Archivos | `src/app/(protected)/owner/tickets/page.tsx` (constante `HEADER_ACTION_CLASS` y las dos clases) · `components/data/PageHeader.tsx` (**solo un comentario**, sin cambio de comportamiento). Documentación: `DECISIONS` (D-109), `ARCHITECTURE` §8.2 y **§8.11**, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF`. **Ninguna prueba tocada** |
| Reutilización | Nada nuevo. `h-11 grow md:h-9 md:grow-0` es el mismo patrón de `SearchInput` (`touchSize`) y de la fila de «Filtros». `TicketFilters` ya servía a esta pantalla desde D-108 y no se tocó |
| Decisiones | **D-109**, y **la disposición la eligió el dueño** entre tres opciones planteadas con sus consecuencias. Lo no evidente: **(a)** las dos acciones miden 272 px y el título 79; a 320 px suman 363 sobre los 288 disponibles, y a 390 quedan 267 para 272 — solo entran a partir de 430. **(b)** Se descartó esconder «Crear en lote» tras un menú «···»: es la acción con la que se cargan las boletas de una rifa entera. **(c)** Las clases van en los botones y **no** en una segunda bandera de `PageHeader`, que comparten 27 pantallas |
| Verificación | **325/325** unitarias · `typecheck`, `lint` y `build` ✅ (los 2 avisos de siempre) · E2E **móvil 49/49** y **escritorio 242/242**, con `db:reset` + `seed:local` antes · medido a **320 px** (139 + 8 + 141 = 288, de lado a lado, 44 px de alto), **390 px** (174 + 8 + 176 = 358) y **1.280 px** (131 y 133 px, alto 36, x = 969) · `scrollWidth == clientWidth` en móvil |
| Advertencias | **1)** **`PageHeader` no impone tamaño a sus acciones y no debe empezar a hacerlo**: lo comparten 27 pantallas. **2)** Las dos pantallas de boletas tienen encabezados **distintos a propósito**; no las «unifiques» sin releer §8.11. **3)** ⚠️ **Al medir en el navegador tras cambiar clases, navega limpio (`?v=n`), no con `location.reload()`.** En este trabajo un árbol cacheado por el servidor de desarrollo dio dos veces medidas imposibles y llevó a escribir dos comentarios con una causa falsa —el orden de emisión del CSS— que hubo que corregir. La comprobación que lo delata: un clon del elemento, con el mismo `className`, mide distinto que el original |
| Pendiente | Lo de siempre (I-066, I-062, I-063, columna «Abono» del importador). De este trabajo: **nada bloqueante**. **Falta autorización del dueño para desplegar** |
| Git | Rama `main`, base observada `ab2cb07`, árbol limpio antes de empezar |

## 1.a.0 Relevo anterior — la cabecera de «Boletas» deja de ser cuatro bloques sueltos (2026-08-24)

| Campo | Estado |
|---|---|
| Resultado | La sección entre el título y la primera boleta se rehízo **como un bloque con ritmo**: título y **«Crear boletas»** en la misma fila · descripción de ancho completo · buscador de **44 px** sin recuadro · **«Filtros»** y **«Seleccionar varias»** en **una sola fila** de 44 px. A 390 px la primera boleta pasa de **y = 448 a y = 322** (126 px, una tarjeta entera más). **No se tocó** la cabecera de la aplicación, la lista de boletas, la barra inferior ni la tabla de escritorio. `Query changes: None` · `New API calls: None` · `Business logic changes: None` · `New dependencies: None` (D-108) |
| Archivos | **`src/features/tickets/selection/components/TicketSelectionModeButton.tsx` (nuevo)** · `components/data/PageHeader.tsx` (variante `inlineActions`) · `features/search/components/SearchInput.tsx` (bandera `touchSize`) · `features/tickets/components/TicketFilters.tsx` (recuadro solo `md`, hueco `secondaryAction`, fila de dos botones) · `features/tickets/selection/components/TicketSelectionToolbar.tsx` (deja de dibujar el botón de modo; vacía queda en `sr-only`) · `features/tickets/selection/TicketSelectionContext.tsx` (solo el comentario) · los dos `page.tsx` que listan boletas. Pruebas: `tests/e2e/seleccion-movil.spec.ts` y `tests/e2e/dialogos-alcanzables.spec.ts` (localizador del botón). Documentación: `DECISIONS` (D-108), `ARCHITECTURE` §8.2 y **§8.10**, `UX_COPY_GUIDELINES` anexos A y B, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni un componente nuevo salvo el botón de modo**, y ese solo porque era la única pieza que necesitaba el contexto de selección. `PageHeader` y `SearchInput` se **extendieron** con banderas opcionales que dejan intacto el comportamiento de las 27 pantallas restantes. `TicketFilters` recibe el botón como **nodo** (`secondaryAction`) y así sigue sin saber nada de la selección múltiple. Iconos de `lucide-react`, ya instalado |
| Decisiones | **D-108**. Lo no evidente: **(a)** `inlineActions` es **opcional a propósito** —el portal administrativo tiene dos acciones y a 320 px no caben junto al título—. **(b)** Los dos botones usan `grow` y **no mitades**: una mitad son 140 px a 320 px y «Seleccionar varias» necesita 160; el peor caso medido, «Filtros (5)», da 114 + 8 + 166 = **288 px** exactos. **(c)** La barra de selección vacía pasa a **`sr-only`, no se desmonta**: dentro está la región `aria-live` del recuento. **(d)** «Seleccionar varias», no «Seleccionar boletas»: estamos en «Boletas» y esa palabra no añade nada; lo que hay que decir es que se pueden marcar **varias** |
| Verificación | **325/325** unitarias · **518/518** de base de datos · `typecheck`, `lint` y `build` ✅ (los 2 avisos de siempre, de TanStack) · E2E **móvil 49/49** y **escritorio 242/242**, con `db:reset` + `seed:local` antes de la pasada · medido en el navegador a **320, 390 y 430 px**: `scrollWidth == clientWidth` en las tres, primera boleta a **y = 322** (390 px), buscador de **310 px de ancho y 44 px de alto**, los dos botones a **44 px** · peor caso de ancho comprobado con «Filtros (5)» a 320 px, sin desbordar · escritorio a 1.280 px con su borde, su `padding` y sus 3 desplegables intactos · **0 errores y 0 avisos de consola** en pestaña limpia |
| Advertencias | **1)** **No actives `inlineActions` en una pantalla con dos acciones**: a 320 px no caben junto al título. **2)** El botón de modo selección **ya no está en `TicketSelectionToolbar`**: lo coloca la página en el hueco `secondaryAction` de `TicketFilters`. Una tercera pantalla que liste boletas tendrá que pasarlo también, y con la misma condición `rows.length > 0`. **3)** **No conviertas la barra de selección vacía en `{cond ? … : null}`**: perdería la región `aria-live`. **4)** Un localizador de **`'Seleccionar'` exacto ya no encuentra nada**: el botón dice «Seleccionar varias». **5)** Un nodo pasado desde un componente de servidor a la lista de hijos de un cliente dispara el aviso de `key` de React; por eso `secondaryAction` va en su propio fragmento. **6)** La suite E2E **no aguanta pasadas seguidas** (I-055, I-060) |
| Publicación | **Desplegado el 2026-08-24 con autorización expresa.** Vercel `READY` sobre **`4381f2b`** (`dpl_2N8vtyRaxqLvzk4dPDVJKRLAb2SH`), alias `gestion-rifas.vercel.app`. CI **2/2**. `/login` en 200 con sus seis cabeceras, las cuatro rutas protegidas en 307, y **ninguna clave de servicio** en el HTML ni en los 16 recursos servidos. Comprobado que el código nuevo **está servido de verdad**: la CSS de producción trae `grid-template-columns:minmax(0,1fr) auto` —que solo genera la variante `inlineActions`— y las cinco clases `md:` nuevas, y es byte a byte la del build local salvo los hashes de las fuentes. Tiempo de **servidor** en 3 ciclos: **151–259 ms**, en línea con los 158–185 del despliegue anterior. **Sin migraciones** |
| Pendiente | Lo de siempre (I-066, I-062, I-063, columna «Abono» del importador). De este trabajo: **nada bloqueante**. Falta que el dueño lo mire en **un teléfono real**: entrar como vendedor exige una contraseña, y eso no lo maneja un agente |
| Git | Rama `main`, de `afd7bbf` a **`4381f2b`**, empujado a `origin/main` |

## 1.a.0 Relevo anterior — «Boletas» en el teléfono deja de ser una tabla (2026-08-23)

| Campo | Estado |
|---|---|
| Resultado | En el teléfono la lista de boletas ya **no es una tabla encogida**: cada boleta es una **tarjeta de 95–115 px** con los **seis** datos —los dos números, la leyenda «Diario · Semanal», el cliente, el precio y las dos insignias de estado—. Antes se ocultaban bajo `md` precisamente **Cliente, Pago y Precio**. Los filtros del móvil se guardan detrás de **«Filtros (n)»**, en una hoja inferior, y el buscador sigue siempre visible. **Escritorio no cambió nada**: misma tabla, mismas columnas, mismo orden. `Query changes: None` · `New API calls: None` · `Business logic changes: None` · `New dependencies: None` (D-107) |
| Archivos | **`src/features/tickets/components/TicketCardList.tsx` (nuevo)** · **`src/features/tickets/components/TicketsList.tsx` (nuevo)** · `features/tickets/components/TicketFilters.tsx` (hoja inferior + `filterFields`) · `features/tickets/components/TicketsTable.tsx` **sin tocar** · `features/tickets/selection/components/SelectedTicketsView.tsx` (esqueleto con alto de tarjeta) · los cuatro `page.tsx` que listaban boletas · `features/tour/tours.ts` (texto de dos pasos). Pruebas: **`tests/e2e/boletas-movil.spec.ts` (nueva, 5)**; adaptadas `seleccion-movil`, `owner-responsive` y `navegacion-movil`. Documentación: `DECISIONS` (D-107), `ARCHITECTURE` §8.2 y **§8.9**, `UX_COPY_GUIDELINES` anexos A y B, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **La misma consulta y el mismo contexto de selección.** `TicketCardList` no consulta, no tiene efectos y no guarda estado: recibe el `TicketListItem[]` que ya usaba la tabla. El comportamiento táctil sale entero de **`row-activation.ts`** y **`useLongPress`**, los módulos de `DataTable`; las insignias, de `StatusBadge`; la casilla, de `SelectionCheckbox`; el enlace, de `RowLink` (sigue sin precargar, D-104). La hoja de filtros usa **`components/ui/sheet.tsx`**, la primitiva que D-106 dejó sin uso y conservó a propósito |
| Decisiones | **D-107**. Lo no evidente: **(a)** quién elige la presentación es **Tailwind**, no `useIsCompactScreen()`: el servidor no conoce el ancho y con JavaScript escritorio parpadearía en cada carga. **(b)** El precio ausente **se calla** —un «—» en el sitio más visible no informa—, pero el cliente ausente **sí** se dice («Sin cliente»): eso es una boleta que aún se puede vender. **(c)** `TicketsList` sustituyó a `TicketsTable` en **las cuatro** pantallas que listan boletas, no solo en «Mis boletas» |
| Verificación | **325/325** unitarias · `typecheck` y `lint` ✅ (los 2 avisos de siempre, de TanStack) · E2E **movil 49/49** (5 nuevas) y **escritorio 242/242**, con `db:reset` + `seed:local` antes de la pasada · medido en el navegador a **320 y 375 px**: alto de tarjeta **95–115 px**, `scrollWidth == clientWidth` (cero desbordamiento), nada dentro de la tarjeta pasa de 291 px a 320 px de viewport, un nombre de 56 caracteres se recorta **sin** estirar la tarjeta, y la paginación termina **por encima** de la barra inferior · **0 errores de consola** y, cargando 25 boletas, **ninguna petición por tarjeta**: solo la navegación y los fragmentos estáticos |
| Advertencias | **1)** **Las dos presentaciones están en el DOM a la vez.** `display:none` las saca del árbol de accesibilidad, así que `getByRole` solo ve la del viewport actual —pero `getByText`, `getByLabel` y `getByPlaceholder` **no filtran por visibilidad**: en una prueba nueva, ancla por rol o acota con `getByRole('list', { name: 'Boletas' })`. **2)** El recorrido guiado busca `data-tour="data-table"` y descarta lo que mida 0 × 0: la marca va en el **envoltorio** `TicketsList`, no en cada presentación. Si la mueves hacia dentro, el paso «tus boletas» desaparece en silencio en la otra pantalla. **3)** La casilla de «toda esta página» la pone `TicketCardList`, no `DataTable`: sin ella se pierde además la oferta «Seleccionar las N boletas del filtro». **4)** `TicketsTable` sigue existiendo y **no se tocó**, pero ya no se llama desde ninguna pantalla: solo desde `TicketsList`. **5)** La suite E2E **no aguanta pasadas seguidas** (I-055, I-060): siémbrala limpia antes de creer un fallo de «strict mode violation» sobre un número de boleta repetido |
| Publicación | **Desplegado el 2026-08-23 con autorización expresa.** Vercel `READY` sobre **`d3ee139`** (`dpl_CrTdZBMtj5NbXxgDQ47YyBkw8xWc`), alias `gestion-rifas.vercel.app`. CI **2/2**. `/login` en 200 con sus seis cabeceras, las cuatro rutas protegidas en 307, y **ninguna clave de servicio** en los 15 fragmentos de JavaScript servidos. Comprobado que el código nuevo **está servido de verdad**: la CSS de producción trae `85dvh` y `ring-inset`, que solo generan la hoja de filtros y la tarjeta. **Sin migraciones** |
| Pendiente | Lo de siempre (I-066, I-062, I-063, columna «Abono» del importador). De este trabajo: **nada bloqueante**. A criterio del dueño, si la ficha de un cliente debería dejar de repetir su propio nombre en cada tarjeta —hoy lo repite, igual que la columna «Cliente» de la tabla en escritorio— |
| Git | Rama `main`, base observada `5000dfe`, árbol limpio antes de empezar |

## 1.a.0 Relevo anterior — la navegación del teléfono baja (2026-08-23)

| Campo | Estado |
|---|---|
| Resultado | En móvil el **cajón lateral desaparece** y lo sustituye una **barra inferior fija** con cuatro opciones: **Panel · Boletas · Clientes · Pagos**. Escritorio **no cambia**: sigue su barra lateral, y la inferior no existe ahí; las dos nunca conviven. Lo que no cabe abajo —**Reportes** en los dos portales, y además **Rifas, Vendedores y Administradores** en el administrativo y **Mi equipo** en el del vendedor— se lee desde el **menú de usuario**, solo en móvil. **Cambio de navegación y presentación:** `Route changes: None` · `Business logic changes: None` · `New API calls: None` · `New dependencies: None` (D-106) |
| Archivos | **`src/components/layout/BottomNav.tsx` (nuevo)** · **`src/components/layout/nav-active.ts` (nuevo)** · **`src/components/layout/MobileNav.tsx` (borrado)** · `components/layout/AppShell.tsx` · `components/layout/NavLinks.tsx` · `components/layout/UserMenu.tsx` · `components/layout/nav-items.ts` (`primary`, `shortLabel`) · `app/(protected)/owner/layout.tsx` y `.../seller/layout.tsx` · `app/globals.css` (`--bottom-nav-height`, `--bottom-nav-space`) · `features/tickets/selection/components/TicketSelectionToolbar.tsx` (se posa sobre la barra) · `features/tour/tours.ts` · `next.config.ts` (`devIndicators.position`). Pruebas: **`tests/unit/nav-active.test.ts`**, **`tests/e2e/navegacion-movil.spec.ts`** y **`tests/e2e/navegacion.spec.ts`** nuevas; adaptadas `owner-responsive`, `reports-responsive`, `seller-ciclo-movil`, `equipo-movil` y `tour-responsive`. Documentación: `DECISIONS` (D-106), `ARCHITECTURE` §8.1, §8.2 y **§8.8**, `UX_COPY_GUIDELINES` anexos A y B, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Una sola lista de rutas**: los `navItems` que ya declaraba cada portal, con una marca `primary` en cuatro. De ahí salen las tres barras. Se **extendió** el desplegable de usuario que ya existía en vez de construir un segundo menú. `isNavItemActive` se extrajo de `NavLinks` y ahora la comparten las dos barras. El aviso de «se está abriendo» sigue siendo `useLinkStatus` (D-104). Iconos de `lucide-react`, ya instalado |
| Decisiones | **D-106**. Lo no evidente: **(a)** el encargo nombró cuatro opciones pensando en el vendedor, pero el portal administrativo tiene **ocho** entradas; las otras cuatro se mandaron al menú de usuario en vez de eliminarlas o de añadir un quinto botón «Más», que habría dejado dos navegaciones vivas. **(b)** «Mis boletas» pasa a «Boletas» abajo vía `shortLabel`: a 320 px cada opción tiene ~72 px. **(c)** **No** se activó `viewport-fit=cover` |
| Verificación | **325/325** unitarias (5 nuevas) · `typecheck`, `lint` y `build` ✅ · E2E **44/44 móvil** (9 nuevas) y **242/242 escritorio** (3 nuevas) · **0 errores y 0 avisos de consola**, medidos en las 14 rutas de los dos portales · anchos **320, 375, 390 y 430 px** sin desbordamiento horizontal, con etiquetas enteras y dianas ≥ 44 × 44 px · comprobado que el final de la página termina **por encima** del borde de la barra · capturas a 320, 390, 430 y 1280 px |
| Advertencias | **1)** El indicador de `next dev` se movió a **`top-left`**: por defecto se dibuja abajo a la izquierda, **encima de «Panel»**, y se comía el toque. Solo afecta a desarrollo. **2)** Los márgenes inferiores **no se ponen pantalla por pantalla**: el hueco lo reserva `AppShell` con `--bottom-nav-space`. Si añades otra barra fija abajo, ánclala a esa variable como hizo la de selección múltiple. **3)** En una pantalla fuera de la barra —Mi equipo, Rifas— **no se enciende ninguna opción**, y es lo correcto. **4)** `components/ui/sheet.tsx` quedó **sin uso**; se conserva a propósito por ser una primitiva de shadcn/ui. **5)** Cuatro pruebas de móvil buscaban el botón del cajón y ya no existe: si aparece una nueva con `getByRole('button', { name: /menu/i })`, está copiada del patrón viejo |
| Publicación | **Desplegado el 2026-08-23 con autorización expresa.** Vercel `READY` sobre **`79e107b`** (`dpl_JDjCmJxuV69GTAUpwyBMaVwpCUcX`), alias `gestion-rifas.vercel.app`. CI **2/2**. `/login` en 200 con sus seis cabeceras, las tres rutas protegidas en 307, y **ninguna clave de servicio** en los 15 fragmentos de JavaScript servidos. Comprobado además que el código nuevo **está servido de verdad**: la CSS de producción trae las tres clases que solo existen en `BottomNav`. **Sin migraciones** |
| Pendiente | Lo de siempre (I-066, I-062, I-063, columna «Abono» del importador). **Nada abierto de este trabajo:** el dueño confirmó el 2026-08-23 que «Mi equipo» **se queda en el menú de usuario** y no baja a la barra |
| Git | Rama `main`, base observada `c9b72a7`, árbol limpio antes de empezar |

## 1.a.0 Relevo anterior — rediseño del detalle de boleta (2026-08-22)

| Campo | Estado |
|---|---|
| Resultado | La pantalla que más usa un vendedor desde el teléfono —el detalle de una boleta— se reordenó por **jerarquía de uso**: encabezado con los dos números y **«Registrar abono»** como acción principal (antes vivía *debajo* del historial), tarjeta de identidad (números · precio y rebaja · cliente), tarjeta de estado y cobro con **anillo de progreso, abonado y pendiente**, historial de abonos y, al final y en voz baja, fechas y código interno. **Cambio solo de presentación:** ni una consulta nueva, ni una regla de negocio distinta, ni una columna más (D-105) |
| Archivos | **`src/components/data/ProgressRing.tsx` (nuevo)** · **`src/features/tickets/components/TicketPaymentSummary.tsx` (nuevo)** · `app/(protected)/seller/tickets/[ticketId]/page.tsx` (reescrito) · `features/payments/components/TicketPaymentsCard.tsx` (lista responsive con «Registrado por» y «Nota», que ya venían en los datos y no se mostraban) · `features/clients/components/ClientLinkCard.tsx` (avatar y alto completo) · `features/tickets/assign/components/AssignTicketDialog.tsx` (botón de 44 px a lo ancho en el teléfono). Documentación: `DECISIONS` (D-105), `ARCHITECTURE` §8.2 y **§8.7**, `TEST_RESULTS`, `HANDOFF` |
| Reutilización | `PageHeader`, `Card`, `Badge`, `Button`, `ClientLinkCard`, `StatusBadge` y `formatCOP`/`formatDateEs` tal cual. El porcentaje lo calcula **`calculateCollectionSummary`**, la misma función del panel, en vez de una segunda división. **Sin dependencias nuevas:** el anillo es un `<svg>` con `stroke-dasharray` |
| Decisiones | **D-105**. Incluye lo que **no** se copió del diseño de referencia y por qué: «Notas rápidas» y el menú `···` no existen, la hora del abono no existe en los datos, y el título de la tarjeta sigue siendo **«Abonos de esta boleta»** —no «Historial de abonos», que es el del cliente entero (BR-F13)— |
| Verificación | **320/320** unitarias · `typecheck`, `lint` y `build` ✅ · E2E **239/239 escritorio** y **35/35 móvil** · capturas a **320, 390, 768, 1024 y 1440 px** con `scrollWidth == innerWidth` en todas (cero desbordamiento horizontal) · **0 errores de consola** · comprobados por prueba el `aria-valuenow` del anillo, el nombre accesible de «Registrar un abono de …» y los 44 px de la fila del cliente |
| Advertencias | **1)** El corte de tres columnas es **`xl`, no `lg`**: con la barra lateral, 1.024 px dejan 672 px y el nombre del cliente se corta (`ARCHITECTURE` §8.7). **2)** El botón dice «Registrar abono» pero su `aria-label` es «Registrar un abono de \<cliente\>»; hay pruebas que lo buscan por ese nombre. **3)** `TicketPaymentsCard` la comparten los **dos** portales: al tocarla, mira también `/owner/tickets/[ticketId]`. **4)** El detalle del portal administrativo **no** se rediseñó; sigue con la rejilla de cuatro columnas |
| Publicación | **Desplegado el 2026-08-22 con autorización expresa.** Vercel `READY` sobre **`be4a8be`** (`dpl_vzGmPGBx3X6r8gwyYXgXCKXfVd6J`), alias `gestion-rifas.vercel.app`. CI **2/2** (verify y migraciones desde cero). `/login` en 200 con sus seis cabeceras, `/seller/tickets`, `/owner/dashboard` y `/seller/dashboard` en 307, y **ninguna clave de servicio** en el paquete del navegador. **Sin migraciones:** este relevo no toca la base de datos, así que el orden con el despliegue no importaba |
| Pendiente | Lo de siempre (I-066, I-062, I-063, columna «Abono» del importador) y, **a decisión del dueño**, llevar la misma disposición al detalle de boleta del portal administrativo |
| Git | Rama `main`, de `c73dc9d` a **`be4a8be`**, empujado a `origin/main` |

## 1.a.0 Relevo anterior — la navegación, medida desde el clic (2026-08-22)

| Campo | Estado |
|---|---|
| Resultado | El dueño reportó que, pese a D-102 y D-103, seguía esperando **~3 s** al cambiar de menú. Tenía razón: aquellas cifras eran de **tiempo de respuesta del servidor**, no de lo que espera una persona. Medida la cadena completa —clic → petición → TTFB → descarga → render → pantalla utilizable— en un build de producción y en Vercel, aparecieron **tres causas superpuestas**: (1) el **arranque en frío** de la función en Vercel, de 1.600 a 5.000 ms, que es la dominante y **no es código** (I-067); (2) el fallback de Suspense de los `loading.tsx`, que imponía **~300 ms** de espera con la CPU parada y los datos ya en el navegador; (3) Next precargaba **la ficha de cada fila** de las tablas —16 de 42 invocaciones en una sesión de dos navegaciones—, lo que reparte el trabajo entre instancias nuevas y **alimenta la causa 1**. Corregidas la 2 y la 3. Navegación local **826 → 124 ms**; en Vercel con la función caliente **~840 → ~350 ms** |
| Archivos | **`src/components/data/RowLink.tsx` (nuevo)**; `components/layout/NavLinks.tsx` (aviso con `useLinkStatus`); las cinco tablas (`Tickets`, `Clients`, `Payments`, `Sellers`, `Raffles`); `features/users/queries.ts`. **Borrados:** los 14 `loading.tsx` y los tres componentes de esqueleto que quedaron huérfanos (`PageSkeleton`, `ReportSkeleton`, `TableSkeleton`). Pruebas: `tests/e2e/security.spec.ts` (lee el `body`, no `main`). Documentación: `DECISIONS` (D-104), `KNOWN_ISSUES` (I-067 nuevo, **I-014 resuelto**), `ARCHITECTURE` §8.2 y §10.1, `TESTING`, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | `useLinkStatus` es de `next/link` y su propia documentación señala este caso exacto. `RowLink` es un `Link` con un parámetro distinto, en un solo sitio para que la decisión no se repita cinco veces. `listOrgMembers` conserva su firma: lo que cambia es que el filtro por rol pasa a hacerse en memoria para que el memo de D-103 pueda compartir la consulta |
| Decisiones | **D-104**. La elección entre «esqueleto» e «indicador en el menú» **la tomó el dueño**, no el agente: afecta a lo que se ve |
| Verificación | **320/320** unitarias · **518/518** de base de datos · `typecheck`, `lint` y `build` ✅ · E2E **269/274** y las **5 afectadas 48/48 en aislado** · carga dura con F5 **sin degradación** (271 → 253 ms) · **0 errores de consola** en producción. Desplegado y medido en Vercel |
| Advertencias | **1)** **No vuelvas a añadir un `loading.tsx`** sin medir: cuesta ~300 ms de espera por el fallback de Suspense. El aviso lo da `NavPending`. **2)** **No pongas `<Link>` a pelo en una fila de tabla**: usa `RowLink`. **3)** Una pantalla de «no encontrado» ahora se pinta **sin el menú lateral** y responde **404** de verdad; una prueba que lea `main` no encontrará nada, hay que leer el `body`. **4)** **Fluid Compute tiene que seguir activo** en Vercel: sin él vuelven los tres segundos y ningún cambio de código los quita (I-067, `DEPLOYMENT.md` §3.1.b). **5)** El doble `getUser()` por petición (~80 ms) se dejó a propósito: es la validación de sesión en capas y no se toca por 80 ms. **6)** **Al medir rendimiento en Vercel, no midas en el minuto siguiente a un despliegue**: todo está frío y las cifras no valen |
| Publicación | Desplegado el 2026-08-22 con autorización expresa. Vercel `READY` sobre **`97e1984`** y, tras activar Fluid Compute, redesplegado sobre **`a854e8a`** —la opción solo se aplica a despliegues nuevos—. Alias `gestion-rifas.vercel.app`. Sin migraciones: este relevo no toca la base de datos |
| Pendiente | **1)** Rotar la contraseña de las cuentas de demostración (I-066). **2)** I-062 e I-063, los techos de escala de D-102. **3)** La columna «Abono» del importador sigue sin empezarse |
| Git | Rama `main`, de `0e99da9` a **`a854e8a`**, empujado a `origin/main` |

## 1.a.0 Relevo anterior — auditoría de rendimiento con volumen real (2026-08-22)

| Campo | Estado |
|---|---|
| Resultado | Se midió la aplicación **con el volumen que espera alcanzar** —100.005 clientes, 300.033 boletas, 1.000.006 pagos, en base local— y se corrigió lo que la medida señaló. Cuatro consultas eran barridos de tabla por la misma razón: *se ordena o se agrega sobre todo y solo después se recortan 25 filas.* Migración **`0030`** con seis índices y dos vistas reescritas (D-102), más cuatro cambios en la aplicación para que ninguna pantalla pida dos veces lo mismo (D-103). Las cinco pantallas más usadas pasaron de **0,6–1,4 s** a **0,1–0,3 s**. **Fuera a propósito:** ni una regla de negocio, ni un cálculo de dinero, ni un permiso. Y **no se tocó producción en ningún momento**: toda la medición fue local |
| Archivos | Migración **`0030_read_performance.sql`** (nueva); `features/users/queries.ts` (`listOrgMembers` memoizado), `features/sellers/queries.ts` (`readSellerSummary`, nueva y memoizada), `features/dashboard/queries.ts` (`getOrganizationTotals`, nueva; se elimina `AdminDashboard.raffles`), `features/tickets/queries.ts` (`applyTicketFilters` y `listTicketIds`, nuevas), `features/tickets/selection/queries.ts`, `app/(protected)/owner/payments/page.tsx`. Pruebas: **`tests/db/read-performance.test.ts` (6, nueva)**. Documentación: `DECISIONS` (D-102, D-103), `KNOWN_ISSUES` (I-062 a I-065), `DATA_MODEL`, `ARCHITECTURE` §10, `TESTING` §4.2, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **No se creó ninguna capa nueva.** Los índices son índices; las dos vistas conservan nombre, columnas y tipos; `cache()` de React ya se usaba en `lib/auth/session.ts` y se aplica igual. `getOrganizationTotals` lee la vista que ya existía y `readSellerSummary` extrae la lectura que `listSellersWithTotals` ya hacía, para que dos consumidores compartan una consulta en vez de hacer dos. `applyTicketFilters` sale del cuerpo de `listTickets` sin cambiar ni una condición |
| Decisiones | **D-102** (índices y vistas; por qué los índices de orden NO llevan `organization_id` delante) y **D-103** (memoización por petición, una sola fuente para las cifras del panel, ids en vez de filas). Sin reglas `BR-*` nuevas: no cambia ninguna regla de negocio |
| Verificación | **518/518** de base de datos (+6) · **320/320** unitarias · `typecheck`, `lint` y `build` ✅ · **0 errores y 0 advertencias de consola** en las 16 pantallas medidas, y ninguna petición fallida. Equivalencia de las vistas comprobada **fila a fila sobre 100.005 clientes: 0 diferencias**, y el historial devuelve las mismas 1.000.006 filas. Cuatro errores encontrados durante la propia medición, detallados en `TEST_RESULTS.md` |
| Advertencias | **1)** **`0030` NO está en producción.** A diferencia de `0029`, el orden con el despliegue **no importa**: sin la migración las pantallas simplemente siguen tardando lo que tardaban. **2)** **No añadas `organization_id` al principio de los índices de orden.** Parece lo correcto y es justo lo que no funciona: la política compara esa columna contra un CONJUNTO y eso rompe el orden del índice (medido: 120 ms frente a 2 ms). **3)** **Los tres índices parciales dependen por completo de su `where`.** Quitarlo deja un índice con el nombre correcto que no sirve para nada, y la pantalla vuelve a tardar un segundo sin ningún síntoma; por eso la prueba compara el **texto** de la definición. **4)** **`create or replace view` no hereda `security_invoker`**: si tocas cualquiera de las dos vistas, vuelve a declararlo. **5)** **`cache()` de React es por PETICIÓN.** No lo conviertas en caché entre peticiones: son cifras de dinero. **6)** **Una migración que actualice muchas boletas debe borrar y recrear los tres índices GIN** dentro de sí misma (I-065): sin eso, 200.000 filas tardan más de doce minutos |
| Publicación | **Desplegado en producción el 2026-08-22 con autorización expresa.** Respaldo previo en `Rifas-backups/2026-08-22-pre-0030/` (13 tablas con datos, **0** referencias a `auth`, **0** credenciales); `db push --dry-run` mostró solo `0030`; `db push --yes` la aplicó; `verify:remote` **13/13**. Sonda de catálogo: los 6 índices con su definición exacta y las 2 vistas con `security_invoker=true`. Sonda de equivalencia **sobre los datos reales**: `v_client_balances` con **0 filas distintas** frente a la formulación anterior y `v_payment_history` con **3 = 3** pagos. Vercel `READY` sobre **`d15d386`** (`dpl_8C6NRgGVxUVwe5n7VMsj6dESGjVB`), alias `gestion-rifas.vercel.app`, `/login` en 200 con sus seis cabeceras y las rutas protegidas en 307. Pasada con sesión real (solo lectura): 9 pantallas, 0 errores de consola, Clientes «1–25 de 45» y los 3 pagos completos. Detalle en `PHASE_STATUS.md` §7 |
| Pendiente | **1)** **Rotar la contraseña de las cuentas de demostración** (**I-066**): una sonda de verificación la envió en una URL a producción. **2)** Decisión sobre **I-062**: hoy buscar un cliente por su nombre son ~97 ms con 100.000 fichas y ~1 s con un millón, y las dos salidas tocan seguridad o comportamiento. **3)** Decisión sobre **I-063**: los agregados por rifa y vendedor son lineales; con un millón de boletas harían falta tablas de resumen mantenidas por disparadores. **4)** La columna «Abono» del importador **sigue sin empezarse** |
| Git | Rama `main`, de `140552e` a **`d15d386`**, empujado a `origin/main`. Sin reescrituras de historial |

## 1.a.0 Relevo anterior — buscar boletas por el cliente, y llegar a su ficha (2026-08-21)

| Campo | Estado |
|---|---|
| Resultado | Dos cosas, y las dos en «Boletas». **(1)** El buscador —que sigue siendo **uno**— encuentra también por el **cliente** que tiene la boleta (D-100, BR-N13): de 1 a 4 dígitos son los números (BR-N11, sin un solo cambio) y cualquier otro texto es el cliente; el resultado sigue siendo una lista de **boletas**. **(2)** En el detalle de una boleta, el cliente pasa a ser una **fila pulsable entera** con su teléfono y una flecha, que lleva a la ficha de cliente **que ya existía** (D-101). **Fuera a propósito:** no se tocó ni un cálculo de dinero, ni precios, ni comisiones, ni estados, ni la importación. **Ya en producción** |
| Archivos | Migración **`0029_ticket_search_by_client.sql`**; `lib/search.ts` (`isTicketSearchTerm`), `features/tickets/queries.ts`, `features/search/hints.ts`, `features/tickets/components/TicketFilters.tsx`, `features/tour/tours.ts`, las dos pantallas de listado y los dos detalles de boleta, y **`features/clients/components/ClientLinkCard.tsx` (nuevo)**. Pruebas: **`tests/db/ticket-search-client.test.ts` (21, nueva)**, **`tests/e2e/boleta-cliente.spec.ts` (15, nueva)**, `tests/db/ticket-search.test.ts` (bloque reescrito), `tests/unit/search.test.ts` (+4), y ajustes de rótulo en `busqueda-hibrida`, `owner-tickets`, `seller-tickets`, `seller-ciclo-movil` y `back-navigation`. Documentación: `BUSINESS_RULES`, `DECISIONS` (D-100, D-101), `DATA_MODEL`, `ARCHITECTURE`, `TESTING`, `TEST_RESULTS`, `UX_COPY_GUIDELINES`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **No se creó ninguna capa de búsqueda nueva.** Se amplía la función `search_tickets` que ya existía (`0018`) y se compara contra **`clients.search_text`**, la misma columna generada y el mismo índice que usa el buscador de «Clientes» desde `0017`: por eso «jose» encuentra a «José» en las dos pantallas por la misma razón. El debounce, la paginación, el estado en la URL y la selección múltiple funcionaron **sin tocarlos**, porque todos pasan por `listTickets`. La vuelta atrás tampoco necesitó código: `BackButton` (D-089) ya usaba el historial real. La tarjeta del cliente reutiliza las clases de `TeamMemberList` |
| Decisiones | **D-100** (un solo buscador, dos ramas SQL separadas) y **D-101** (el cliente como fila pulsable). Regla **BR-N13** |
| Verificación | **512/512** de base de datos (+22, **dos pasadas seguidas** sobre la misma base) · **320/320** unitarias (+4) · **274/274** E2E (+15, pasada completa y limpia el 2026-08-21 en 13,7 min) · `verify` en verde. **Cuatro errores** encontrados y corregidos, detallados en `TEST_RESULTS.md`. El plan de la consulta se midió con `explain (analyze)` sobre **5.006 clientes y 20.033 boletas** antes de decidir el diseño |
| Advertencias | **1)** **`0029` NO está en producción.** El código llama a la función nueva; con la vieja, buscar por nombre devuelve cero resultados. **Migración y despliegue van juntos.** **2)** **La rama de números de `search_tickets` se dejó idéntica a `0018` a propósito**, para que ampliar la búsqueda no pudiera cambiar un resultado antiguo; `tests/db/ticket-search.test.ts` es la red que lo vigila. **3)** **No añadas columnas al retorno de `search_tickets` sin pensarlo**: cambiar las columnas obliga a `drop function` + `create` en vez de `create or replace`, y con ello a rehacer privilegios y tipos. Por eso el teléfono del cliente se pide con un segundo alias en `getTicketDetail` y **no** viaja en `TicketListItem`. **4)** **Los permisos se heredan, no se filtran**: la función es `security invoker` y la protección real son `tickets_select` y `clients_select`, que son simétricas. No le añadas filtros «de seguridad». **5)** **Un término numérico de más de 4 cifras encuentra al cliente por su teléfono**, porque `search_text` lo incluye. Es deliberado y está dicho en la pista del campo; si alguien lo «arregla», tiene que cambiar también ese texto |
| Publicación | **Desplegado en producción el 2026-08-21 con autorización expresa.** Respaldo previo en `Rifas-backups/2026-08-21-pre-0029/` (13 tablas con datos, **0** referencias a `auth`, **0** credenciales); `db push --dry-run` mostró solo `0029`; `db push --yes` la aplicó; `verify:remote` **13/13**. Sonda de comportamiento contra el proyecto real: la función es `security invoker`, `authenticated` la ejecuta y **`anon` no**, buscar «Alvaro» devuelve su boleta `0363/4638`, buscar «0000» sigue devolviendo `0000/9999` y un código interno devuelve **0 filas**. Vercel `READY`, primero sobre `df7f1a7` (`dpl_9vkz31LsUvV3SBvG6heJhAxpQzWT`) y, tras reescribir el historial, sobre **`16a1b74`** (`dpl_HvXmiCUr1XkEZqa1m5Qphg2WtyCr`) con el mismo contenido con el alias `gestion-rifas.vercel.app`, `/login` en HTTP 200 con sus seis cabeceras y `/owner/tickets`, `/seller/tickets` y `/owner/clients` en 307 al login |
| Pendiente | **1)** Verificación visual con sesión real (un agente no inicia sesión en producción): que escribir un nombre en «Mis boletas» traiga sus boletas, y que la fila del cliente del detalle se vea pulsable en el teléfono. **2)** La columna «Abono» del importador **sigue sin empezarse**, por indicación expresa de un encargo anterior |
| Git | Rama `main`, de `3f82c42` a **`16a1b74`** (cuatro commits). Se empujó **solo la rama**. ⚠️ **El historial se reescribió una vez**: el asunto del commit de la funcionalidad nació como un `@` suelto —resto de la sintaxis de aquí-documento de PowerShell— y se corrigió a petición del dueño con `push --force-with-lease`, así que los tres primeros cambiaron de SHA (`df7f1a7`→`e1b2fe1`, `ebe797b`→`0ebc3e7`, `5267107`→`463b0ef`) y `16a1b74` actualizó las referencias que quedaron colgando. El hash del **árbol** es idéntico antes y después (`a93b181`): cambiaron mensajes, no contenido. **No queda rama de respaldo**: se creó y se borró a petición del dueño, así que los SHA viejos ya no son recuperables |

## 1.a.0 Relevo anterior — el vendedor puede rebajar el precio (2026-08-17)

| Campo | Estado |
|---|---|
| Resultado | Un vendedor puede vender una boleta concreta **por debajo del precio de la rifa** (D-099, BR-P09..BR-P12, BR-G17..BR-G19). El cliente debe **lo rebajado**, y la rebaja sale **entera** de la ganancia del vendedor: lo que le queda a la empresa no se mueve. **Fuera a propósito:** ninguna métrica de rebajas en el portal administrativo (el encargo lo pide expresamente), y **no** se tocó el porcentaje histórico de comisión — ver Advertencia 3 |
| Archivos | Migración **`0028_ticket_sale_discount.sql`**; `features/tickets/assign/` (`schemas.ts`, `actions.ts`, `AssignTicketsForm.tsx`, `AssignTicketDialog.tsx`), `features/tickets/selection/` (`eligibility.ts`, `queries.ts`, `BulkAssignDialog.tsx`), `features/tickets/queries.ts`, los dos detalles de boleta, `types/database.types.ts`. Pruebas: **`tests/db/sale-discount.test.ts` (19, nueva)**, **`tests/e2e/precio-rebajado.spec.ts` (4, nueva)**, `tests/unit/ticket-selection.test.ts` (+4). Documentación: `BUSINESS_RULES`, `DECISIONS` (D-099), `DATA_MODEL`, `TESTING`, `UX_COPY_GUIDELINES`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **No se creó ninguna capa nueva de precio ni de dinero.** `sale_price` ya era «lo que debe el cliente» (BR-P08): el saldo, el estado de pago, el tope de sobrepago y los totales ya salían de ahí, así que las secciones 8, 9, 10, 17 y 18 del encargo se cumplían solas. La rebaja viaja por el **mismo** `assign_ticket_row` que comparten la venta individual, la masiva y el importador. El límite se añadió al cuadro de elegibilidad que el diálogo **ya** pedía, sin una consulta nueva |
| Decisiones | **D-099**. La correspondencia «participación de la empresa = precio oficial − tarifa» la **confirmó el dueño** antes de implementar: el encargo daba por supuesto un porcentaje de Admin que en este sistema no existe |
| Verificación | **490/490** de base de datos (+19) · **316/316** unitarias (+4) · `verify` en verde · E2E completas. La suite nueva aguanta **tres pasadas seguidas** sobre la misma base |
| Advertencias | **1)** **`raffles.ticket_price − sale_price` NO es la rebaja.** El precio de la rifa cambia (y cambió en `0027`); la rebaja se calcula **siempre** contra `base_price`. **2)** El descuento máximo es la tarifa **mínima garantizada**, no la vigente: la tarifa por tramos baja sola al anularse un pago (BR-G06), y calcular sobre la alta dejaría ventas pasadas en comisión negativa. **3)** **Hallazgo reportado y NO corregido (sección 19 del encargo):** una venta pasada **sí** puede cambiar de ganancia retroactivamente, porque no hay snapshot de la tarifa y BR-G15 lo establece a propósito. Es una decisión del dueño (D-094, D-096), no un descuido; lo único congelado es la rebaja. **4)** `commission_movement` ganó el valor `discount` con `alter type ... add value`: la migración **no puede usarlo** en su propia transacción, y por eso **no** lleva bucle de recálculo. Si algún día hace falta uno, va en una migración posterior. **5)** El cambio de comisión es **por resto**: la tercera línea del ledger anota lo que falte para cuadrar, de modo que `sum(ledger) = earned` se mantiene por construcción. No la conviertas en «diferencia de rebajas» |
| Publicación | **Desplegado en producción el 2026-08-17 con autorización expresa.** Respaldo previo en `Rifas-backups/2026-08-17-pre-0028/` (13 tablas con datos, **0** referencias a `auth`, **0** credenciales); `db push --dry-run` mostró solo `0028`; `db push --yes` la aplicó; `verify:remote` **13/13**. **Comprobación de que no se movió dinero**, comparando antes y después: comisión **1 boleta / $60.000 / $60.000**, ledger **1 fila `sale +60.000`**, **3** pagos sin anular, boletas **1 Pagada · 2 Abonadas · 55 Sin pagar** — **idéntico**. Sonda de comportamiento: `base_price` existe con **0** filas no nulas, la restricción `sale_price <= base_price` está, el enum tiene `discount`, las 5 funciones con su firma nueva, `format_cop` da `$120.000`/`$1.500.000`/`$0`, **`anon` no puede ejecutar ninguna** y `authenticated` sí. Límites reales: Rifa Navidad **$120.000 → mínimo $60.000** (60 boletas de Jaydin Fernando), Rifa Control **$50.000 → mínimo $25.000**. Vercel `READY` sobre el SHA `01df211` (`dpl_ALjWZQs9ypDvngE9YaK9npHnW3Ju`), `/login` en HTTP 200 con sus seis cabeceras y las tres rutas protegidas en 307 |
| Pendiente | Verificación visual con sesión real en producción (un agente no inicia sesión allí): que la casilla «Precio de venta» llegue con **$120.000**, que rebajarla mueva el total, y que el aviso diga «Puedes rebajarlo hasta $60.000» |
| Git | Rama `main`, de `b2db1f0` a `01df211`. Se empujó **solo la rama** |

## 1.a.0 Relevo anterior — el precio de la boleta pasa a $120.000 (2026-08-15)

| Campo | Estado |
|---|---|
| Resultado | Corrección transversal del precio de la boleta de **$100.000 a $120.000** (D-098, BR-P01/BR-P07). **No es una subida de precio**: la cifra anterior nunca fue la correcta, así que se arrastra también el `sale_price` de las boletas ya vendidas de la rifa afectada. **Ni un peso de `payments` o `payment_allocations` se toca**: una boleta con $100.000 abonados queda **Abonada con $20.000 pendientes**, nunca Pagada. **Fuera a propósito:** la columna «Abono» del importador, que el encargo pide dejar para después |
| Archivos | Migración **`0027_ticket_price_120000.sql`** (única pieza que cambia datos); `src/lib/constants.ts` (`DEFAULT_TICKET_PRICE`); `scripts/seed.ts` (los cuatro escenarios de cobro); comentarios de `lib/money.ts` y `features/reports/export.ts`. Pruebas: **`tests/db/price-migration.test.ts` (14, nuevo)**, `payments.test.ts`, `rpc.test.ts`, `commissions.test.ts`, `commission-modes.test.ts`, `notifications.test.ts`, `seller-teams.test.ts`, `payment-status.test.ts`, `schemas.test.ts`, `money.test.ts`, `payments.spec.ts`, `owner-raffles.spec.ts`, `seleccion-multiple.spec.ts`, `equipo.spec.ts`. Documentación: `CLAUDE.md`, `MASTER_SPEC`, `BUSINESS_RULES`, `DATA_MODEL`, `ARCHITECTURE`, `DECISIONS`, `TESTING`, `PHASE_STATUS`, `OPERATIONS`, `RUNBOOK` §5.4, `README` |
| Reutilización | **No se creó ninguna capa de precio.** La arquitectura ya centralizaba el precio como pedía el encargo: `raffles.ticket_price` → `assign_ticket_row` lo copia a `sale_price` → los saldos y estados salen de SQL (`payment_status` es columna generada, `pending_amount` una vista). La aplicación tiene **una** constante, `DEFAULT_TICKET_PRICE`, y solo rellena el formulario de rifa nueva |
| Decisiones | **D-098**. Reglas **BR-P07** (corregir ≠ subir) y **BR-P08** (no hay descuentos: `sale_price` es lo que se debe). Actualizadas BR-P01, BR-R04, BR-O05 |
| Verificación | **471/471** de base de datos · **247/247** E2E · `verify` en verde (**312** unitarias). Sonda de **solo lectura** contra producción antes de escribir nada, con el mapa de impacto real |
| Advertencias | **1)** **`0027` YA está en producción** (2026-08-15) y es inmutable: cualquier corrección exige una migración nueva. **2)** **Cambiar el precio de una rifa mueve comisiones** (BR-G15): a quien cobra «la mitad» le sube la tarifa de $50.000 a $60.000 con ajuste retroactivo, y una boleta que deja de estar Pagada deja de contar. Lo recalculan los triggers; no se escribe ledger a mano. En producción no movió nada porque no hay ni una fila de comisión. **3)** **No hay migración inversa y es deliberado**: la vuelta atrás es restaurar (`RUNBOOK` §5.4). **4)** La prueba de la migración ejecuta el bloque `do $$` **leído del `.sql`** dentro de una transacción que revierte; si la conviertes en una copia del SQL o le quitas el `rollback`, dejará de probar la migración real o pisará las rifas a $100.000 de otras suites. **5)** `organizations.default_ticket_price` **no la lee ningún código**: `DATA_MODEL` decía lo contrario y se corrigió la documentación, no el comportamiento |
| Publicación | **Desplegado en producción el 2026-08-15 con autorización expresa.** Respaldo previo en `Rifas-backups/2026-08-15-pre-0027/` (9 tablas con datos, 121 boletas, **0** referencias a `auth`, **0** credenciales); `db push --dry-run` mostró solo `0027`; `db push --yes` la aplicó; `verify:remote` **13/13**. Sonda de solo lectura posterior: rifa a **$120.000**, **57** boletas corregidas, «Rifa Control 2026» intacta a $50.000, **61** sin vender aún sin precio, **0** pagos y **0** asignaciones (no había ninguno y no se creó ninguno), **0** movimientos de comisión, **0** sobrepagos, **0** rifas o boletas sin corregir. Auditoría: **58** entradas del sistema (1 `raffle.update` + 57 `ticket.update`) con `100000 → 120000` y actor `NULL`. Después del push: CI **2/2** (`31887615583`, incluidas las 27 migraciones desde cero), Vercel `READY` sobre el SHA `f6b0df9` (`dpl_DzRHxqoFERdnLzLhwiuMohgjhebZ`) y con el alias `gestion-rifas.vercel.app`, `/login` en HTTP 200 con sus seis cabeceras y `/owner/raffles/new`, `/owner/dashboard` y `/seller/tickets` en 307 al login |
| Pendiente | Verificación visual con sesión real en producción (un agente no inicia sesión allí): que el detalle de una boleta diga **$120.000** y que «Nueva rifa» llegue con **$120.000** puesto. El encargo continúa con la columna «Abono» del importador, que **no debe empezarse** hasta que esto esté estable |
| Git | Rama `main`, de `66ca9a7` a `f6b0df9`. Se empujó **solo la rama** |

## 1.a.0 Relevo anterior — corregir a un integrante pendiente (2026-08-14)

| Campo | Estado |
|---|---|
| Resultado | Segunda entrega del encargo del dueño (`Equipo.txt`): mientras un integrante **no** haya activado su cuenta, su vendedor padre puede corregirle nombre, alias, celular y **correo**, y eliminar el alta; en cuanto entra, el correo queda bloqueado y «Eliminar» desaparece. Corregir el correo **invalida la invitación anterior**. Nueva etiqueta de estado de las personas: **«Invitación pendiente» / «Cuenta activa» / «Inactivo»**, aplicada también al portal administrativo para que dos pantallas no se contradigan. **Fuera a propósito:** el personal no gana «eliminar» ni «cambiar correo» — el encargo era el flujo del vendedor padre |
| Archivos | Migración `0026`; `features/team/` (`actions.ts`, `schemas.ts`, `TeamMemberActions.tsx`, `TeamMemberList.tsx`), `features/users/` (`invite.ts` con `sendInvitation` extraída, `queries.ts`, `schemas.ts`, `UserDialog.tsx`, `UsersTable.tsx`), `features/auth/actions.ts`, `features/sellers/SellersTable.tsx`, `lib/auth/session.ts`, `lib/constants.ts`, `components/data/StatusBadge.tsx`, detalle del integrante y del vendedor. Pruebas: `tests/db/team-member-lifecycle.test.ts` (22), `tests/unit/account-status.test.ts` (10), `equipo.spec.ts` (3), y dos aserciones corregidas en `security.spec.ts` y `owner-users.spec.ts` |
| Reutilización | El correo nuevo se envía por el **mismo** camino del alta: `sendInvitation`, extraída de `inviteMember` sin cambiarle el comportamiento. El diálogo de edición es el **mismo** `UserDialog`, con un `edit` override gemelo del `create` que ya existía. El esquema extiende `userFormSchema`; el mapeo de membresías sigue siendo uno solo |
| Decisiones | **D-097**. Reglas BR-E14..BR-E19 |
| Verificación | **457/457** de base de datos (base recién sembrada) · **246/246** E2E · `verify` en verde (309 unitarias). **Seis** errores encontrados y corregidos, y **dos sondas empíricas** contra Auth antes de diseñar nada, detalladas en `TEST_RESULTS.md` |
| Advertencias | **1)** `0026` **ya está en producción** (2026-08-14): cualquier corrección sobre ella exige una migración nueva. **2)** «Activada» **no** se deduce de `auth.users`: GoTrue escribe un hash aleatorio en `encrypted_password` con solo abrir el enlace (D-097); la prueba `E2-02` existe para que nadie lo reintente. **3)** Que no haya dos invitaciones válidas lo garantiza **Auth** al reinvitar a una cuenta sin confirmar, no una limpieza nuestra; la prueba `E2-10` recorre el camino entero. **4)** Las tres funciones del equipo son funciones y **no** políticas porque `authenticated` tiene UPDATE sobre **todas** las columnas de `profiles`; `E2-08` vigila esa puerta. **5)** El CI de este trabajo destapó **I-057**, un defecto previo de dos suites de comisiones que sorteaban números de boleta sobre 90 valores: se corrigió aquí mismo y ahora la suite aguanta 10 pasadas seguidas |
| Publicación | **Desplegado en producción el 2026-08-14 con autorización expresa.** Respaldo previo en `Rifas-backups/2026-08-14-pre-0026/` (13 tablas con datos, **0** referencias a `auth`, **0** credenciales); `db push --dry-run` mostró solo `0026`; `db push --yes` la aplicó; `verify:remote` 13/13; sonda de solo lectura sobre el proyecto real confirmando columna, **backfill**, privilegios de las cuatro funciones e índice. Después del push: CI 2/2 (`31857668132`), Vercel `READY` sobre el SHA `7b26d99` (`dpl_5TJFHZSTsZBYKFRdyUUUhVgeByP6`), `/login` en HTTP 200 con sus cabeceras y `/seller/team` en 307 al login |
| Pendiente | Verificación visual con sesión real en producción (un agente no inicia sesión allí). **Dato real que conviene mirar:** `juanhernandez@gmail.com`, del equipo de Armando Gordillo, es el único que quedó como «Invitación pendiente» — nunca ingresó y no tiene boletas, clientes ni pagos, así que Armando ya puede corregirle el correo o eliminarlo |
| Git | Rama `main`, de `d5bc351` a `7b26d99`. Se empujó **solo la rama** |

## 1.a.0 Relevo anterior — equipos, avisos y comisiones (2026-08-13)

| Campo | Estado |
|---|---|
| Resultado | Encargo completo del dueño (`Equipo.txt`), sus doce fases, **más la corrección de las dos formas de pago** que pidió al ver la pantalla en producción (D-096). **Equipos:** cualquier vendedor forma el suyo; un integrante **es** una membresía con rol `seller` y `parent_seller_id`, sin rol ni entidad nueva (BR-E01). **Avisos:** tabla `notifications` + campanita, sin tiempo real; no existía ningún sistema que reutilizar. **Comisiones:** tramos retroactivos sobre boletas **cobradas**, motor derivado y ledger auditable. **Fuera a propósito:** comisión del vendedor padre sobre las ventas de su equipo — regla comercial sin definir |
| Archivos | Migraciones `0022`–`0025`; `features/team/`, `features/notifications/`, `features/commissions/`; `features/users/invite.ts` (alta compartida); rutas `/seller/team[/:id]`; `AppShell`, `SellersTable`, panel del vendedor y detalle del vendedor. Pruebas: `seller-teams`, `notifications`, `commissions`, `commission-modes`, `equipo.spec.ts`, `equipo-movil.spec.ts` |
| Reutilización | El alta de un integrante usa el **mismo** formulario y el **mismo** camino de invitación que el portal administrativo (`UserDialog` + `inviteMember`). El mapeo de membresías es uno solo, compartido entre `features/users` y `features/team` |
| Decisiones | D-091 (modelo), **D-092 (no ampliar `tickets_select`)**, D-093 (avisos), D-094 (motor derivado), D-095 (de qué rifa se habla), **D-096 (DOS formas de pago)**. Reglas BR-E01..BR-E13 y BR-G01..BR-G16 |
| Verificación | **435/435** de base de datos (dos pasadas sobre la misma base) · **243/243** E2E · `verify` en verde · revisión visual en 320–430 px. **Catorce** errores encontrados y corregidos, detallados en `TEST_RESULTS.md` |
| Advertencias | **1)** `tickets_select` NO se amplió, y es deliberado (D-092): abrirla cambia media docena de pantallas del vendedor en silencio; la prueba `E1-10` existe para avisarlo. **2)** El dinero no se acumula sumando eventos (D-094): no escribas en el ledger a mano. **3)** **Hay DOS formas de pago** (D-096): tramos para quien está en un equipo, mitad del precio vigente para quien no. **4)** Toda ejecución E2E empieza por `db:reset && seed:local`, también —y sobre todo— justo después de `test:db`. **5)** Limpiar pagos exige UNA transacción (`purgeSellers`): PostgREST no puede, y hacerlo mal falla en silencio |
| Pendiente | Verificación visual con sesión real en producción (un agente no inicia sesión allí). **Decisión del dueño en pausa:** si el aviso al personal por *cada* venta resulta ruidoso, se quita una línea de `notify_ticket_sold` (D-093) |
| Git | Rama `main`, de `8f4821c` a `e9f1c10` (11 commits). Se empujó **solo la rama**. Migraciones `0022`–`0025` promovidas con respaldo previo |

## 1.a.0 Relevo anterior — resumen compacto en «Asignar boletas» (2026-08-11)

| Campo | Estado |
|---|---|
| Resultado | El modal de asignación múltiple (`BulkAssignDialog`, dentro de «Mis boletas») reemplaza la barra inferior duplicada «N boletas — $XXX.XXX» por un resumen de dos columnas justo debajo de la descripción del modal: «Boletas seleccionadas» (cantidad) y «Total a asignar» (dinero), ambos calculados sobre las boletas ELEGIBLES, nunca sobre la selección bruta. La sección «Boletas seleccionadas» con los números individuales se conserva debajo, sin cambio de comportamiento. **No se tocó lógica de negocio**: ni precios, ni asignación, ni creación de clientes, ni el formulario compartido con la asignación de una sola boleta |
| Archivos | Modificados: `BulkAssignDialog.tsx` (nuevo `SelectionSummary`, `SelectedNumbers` simplificado a encabezado estático + lista), `AssignTicketsForm.tsx` (prop `showSummary`, por defecto `true`), `tests/e2e/seleccion-multiple.spec.ts` |
| Reutilización | `AssignTicketsForm` es el MISMO formulario que usa `AssignTicketDialog` (una sola boleta, sin resumen superior que duplicar): se le añadió `showSummary` en vez de bifurcar el formulario o tocar esa otra pantalla, que no tenía redundancia que resolver y no se pidió cambiar |
| Decisiones | El total y la cantidad del resumen nuevo usan `row.can.assign` (boletas elegibles), no la selección bruta: si alguna quedó bloqueada, el resumen nunca muestra un total inflado con lo que no se puede asignar |
| Verificación | `typecheck` ✅ · `lint` ✅ 0 errores · **299/299** unitarias ✅ · `build` ✅ · **378/378** de base de datos ✅ (sin cambios de esquema) · **59/59** E2E relevantes ✅ (`seleccion-multiple`, `seleccion-movil`, `owner-tickets`, `seller-tickets` — cubre los dos únicos consumidores reales de `AssignTicketsForm`) |
| Errores encontrados | Ninguno nuevo. Una aserción E2E existente comprobaba «N boletas seleccionadas» como un solo nodo de texto; se actualizó porque el nuevo diseño separa la cantidad («N boletas») de la etiqueta («Boletas seleccionadas») en dos elementos distintos |
| Advertencia | Ninguna nueva |
| Publicación | **Desplegado en producción el 2026-08-11 con autorización expresa.** Sin migraciones que aplicar (`git diff` del commit confirma 0 archivos tocados bajo `supabase/migrations`). Después del push: CI 2/2 (`31549029537`), despliegue de Vercel `READY` sobre el SHA `836457c` (`dpl_FVgLshhMw3JdUErtzCHz6uM9WSff`, verificado por API), y `https://gestion-rifas.vercel.app/login` en HTTP 200 con sus cabeceras; `/seller/tickets` en 307 hacia el login, como corresponde sin sesión |
| Pendiente | Verificación visual manual con sesión real (un agente no inicia sesión en producción). Aparte de eso, nada de este trabajo |
| Git | Rama `main`, de `e8df01c` a `836457c`. Se empujó **solo la rama** |

## 1.a.1 Relevo anterior — resumen de cobranza en el panel (2026-08-11)

Contexto histórico: ya publicado y verificado en producción (`45759f6`, con `e8df01c` documental de
cierre). Resumen: la tarjeta «Rifa activa» de ambos paneles se reemplazó por un resumen ejecutivo de
cobranza (`CollectionSummaryCard`, D-090) que reutiliza `dashboard.totals` sin consultas nuevas; se
retiraron las tarjetas de dinero duplicadas de la fila «Cobranza» y el botón «Crear boletas» del panel
del vendedor. Detalle completo en `DECISIONS.md` (D-090) y en el historial de Git.

## 1.a.1 Relevo anterior — flecha de volver en las pantallas de detalle (2026-08-10)

Contexto histórico: ya publicado y verificado en producción (`a25a289`, con `e9d3444`/`bb6db5f`
previos de corrección/documentación). Resumen: patrón global de navegación hacia atrás (BR-X09,
D-089) en las 8 pantallas de detalle/edición y 2 más; prefiere el historial real de la sesión y cae en
un destino de repuesto por entidad cuando no hay pantalla anterior real. Detalle completo en
`DECISIONS.md` (D-089) y en el historial de Git.

## 1.b Qué queda abierto

**No hay trabajo técnico activo autorizado.** El plan de fases terminó, pero sí quedan decisiones del
dueño, deuda aceptada y límites verificados; no deben describirse como si no existieran:

| Asunto | Qué hace falta |
|---|---|
| **I-059** — limpiar pagos por PostgREST falla en silencio; dos suites de comisiones dejan basura | Llevar su `afterAll` a **una** transacción por `pg`, como hace `price-migration.test.ts`, y comprobar el resultado. Es lo que degrada `test:db` al repetirlo |
| **I-060** — `ticket-search` elige la rifa con un `limit 1` sin orden | Elegir la rifa por nombre y usar el mismo id en las dos consultas. Falla a partir de la tercera pasada seguida |
| **I-024** — plan Free sin backups automáticos ni PITR | Subir a Supabase Pro o automatizar el respaldo externo. **Prerrequisito antes de operar con dinero o clientes reales** (`RUNBOOK.md` §5.3) |
| **I-021** — cuentas de demostración en producción con contraseña compartida | Desactivarlas o rotarles la contraseña (`OPERATIONS.md` §5) |
| **I-023** — la URL permitida de Auth debe coincidir con la canónica de Vercel | Confirmar `https://gestion-rifas.vercel.app/**` en Vercel y Supabase antes de enviar invitaciones (`DEPLOYMENT.md` §2.1) |
| **I-030** — persisten mensajes de base de datos sin tildes | Autorizar una migración nueva que reescriba las definiciones vigentes y aplicarla al proyecto real (D-073) |
| **I-037** — filtro fijo de clientes topado en 200 | Priorizar un selector con búsqueda cuando el volumen lo justifique |
| **I-046 a I-053** — límites y derivas encontrados por esta auditoría | Revisar `KNOWN_ISSUES.md`: no se modificó código para corregirlos porque esta tarea es solo documental |

## 1.c Contexto histórico preservado

Las siguientes notas explican decisiones recientes de producción que siguen siendo trampas útiles;
no sustituyen el relevo vigente de §1.a ni el historial propietario de Git/`TEST_RESULTS`.

La última acción de ingeniería **sobre producción** fue aplicar la migración **`0021`** al proyecto
real (2026-08-09, autorizada explícitamente) y activar desde `main` el despliegue de los **clientes
con celular obligatorio en la importación CSV/JSON** (BR-N12, D-087). La selección múltiple y las
acciones masivas de boletas (BR-B01..BR-B08, D-082 a D-085) siguen disponibles: se marcan varias
boletas de la lista y se actúa sobre todas: el
vendedor las vende a un cliente de una vez; el Dueño y el Administrador aprueban, anulan, cambian de
vendedor y **eliminan** las que se cargaron por error. Lo que conviene saber antes de tocarlo:

* **No hay reglas de boletas nuevas.** El cuerpo de `assign_ticket` y `cancel_ticket` se extrajo a
  `assign_ticket_row` y `cancel_ticket_row`, que ahora usan tanto la acción individual como la
  masiva. Si cambias una regla de asignación o anulación, cámbiala **ahí** y afecta a las dos.
* **Eliminar sí es nuevo** y es borrado físico, acotado a boletas sin cliente, sin venta y sin
  abonos, y **nunca a una anulada** (su combinación queda reservada, BR-N08). Sigue sin haber
  privilegio de `DELETE` para nadie: ocurre dentro de una función `SECURITY DEFINER` (D-084).
* **La selección vive fuera de React**, en `sessionStorage` leído con `useSyncExternalStore`. Es lo
  que la hace sobrevivir a buscar, filtrar y recargar (D-082).
* **Al escribir pruebas E2E que pulsan lo primero al entrar a una pantalla**, usa `toggleCheckbox`
  de `fixtures.ts` o el mismo patrón: sin reintentar, el clic cae antes de la hidratación y la
  prueba culpa al producto (`TESTING.md` §5.3).

Antes de eso, la última acción sobre producción fue aplicar la migración **`0019`** (2026-08-08,
autorizada explícitamente): añade `taken_ticket_combinations` y `log_ticket_import`, las dos piezas
del importador de archivos (BR-N12, D-081). Respaldo previo en
`Rifas-backups/2026-08-08-antes-0019/`, comprobado sin `auth.users`. Verificada por catálogo
(`verify:remote` 13/13 + privilegios de las dos funciones) y **por comportamiento**, simulando una
sesión real con `request.jwt.claims` dentro de una transacción revertida: la combinación existente
se devuelve, la inexistente no, la respuesta trae **solo los dos números**, y la bitácora recibe una
fila con origen y recuentos. La transacción se revirtió: producción quedó con **0** filas
`ticket.import` de prueba. Por PostgREST, `anon` recibe `42501` en las dos —lo que además
demuestra que la caché de esquema se recargó—.

El mismo día se aplicó la **`0018`** (2026-08-08,
autorizada explícitamente): añade `search_tickets` y los dos índices de trigramas sobre los números
de la boleta (BR-N11, D-080). Respaldo previo en `Rifas-backups/2026-08-08-antes-0018/`, comprobado
sin `auth.users`. Verificada allí por catálogo (`verify:remote` 13/13) **y por comportamiento**
contra los datos reales: el número diario y el semanal encuentran la boleta enteros y en parte; el
código interno, entero o en prefijo, no encuentra nada; las coincidencias del diario salen primero; y
`anon` recibe `42501` al invocar la función por PostgREST, que además demuestra que la caché de
esquema se recargó.

Antes de esa se aplicó la **`0017`** (2026-08-07,
autorizada explícitamente): añade la normalización de acentos y teléfonos y los dos índices de
trigramas de la búsqueda (D-079). Respaldo previo en `Rifas-backups/2026-08-07-antes-0017/`.
Verificada allí por catálogo (13 comprobaciones) **y por comportamiento**: se insertó «Jesús Peña
Ñuñez» dentro de una transacción, se comprobó que aparece buscando «jesus», «pena», «nunez», el alias
sin tilde y el teléfono en dos formatos, y se revirtió — 6 clientes antes y 6 después.

Verificar después la búsqueda **desde el camino de datos de la aplicación** (no con SQL a mano) sacó a
la luz I-039: un teléfono guardado sin indicativo no se encontraba escribiéndolo con «+57». Corregido
sin migración nueva. Merece la pena repetir esa comprobación tras cualquier cambio de esquema: es
además la que demuestra que PostgREST recargó su caché y expone las columnas nuevas.

**Lo que falta y no puede hacer un agente:** entrar a producción por el navegador con los tres roles y
escribir en los buscadores. `login está prohibido para un agente` (Fase 8), así que esa pasada la hace
el usuario.

Antes de esa se aplicó la `0016` (2026-08-05): cierra I-025 —un Owner podía dejar su organización sin
propietario, de forma irrecuperable desde la aplicación— con un constraint trigger diferido (D-071).
Verificada también por catálogo y por comportamiento: degradar al Owner en producción es rechazado.

---

## 2. Arranque en 4 comandos

```bash
npm install
```

```bash
npx supabase start
```

```bash
npm run db:reset && npm run seed:local
```

```bash
npm run dev:local
```

Requisitos: Node ≥ 20.19, Docker Desktop, y un `.env.local` (ver §3).

⚠️ **`npm run dev` apunta a donde diga `.env.local`, que hoy es el proyecto REAL** (I-013). Para
desarrollar y para las pruebas end-to-end usa **`npm run dev:local`** (D-047): inyecta las
credenciales de la instancia local y no toca producción.

---

## 3. Variables de entorno

`.env.local` **no está versionado**. Copiar de `.env.example` y completar.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave pública (sujeta a RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | **Secreta.** Solo servidor y scripts; omite RLS |
| `SEED_DEFAULT_PASSWORD` | Sí (para el seed) | Contraseña de las cuentas de desarrollo |
| `SUPABASE_DB_URL` | Solo para migraciones al remoto | **Session pooler**, no conexión directa (I-005) |
| `NEXT_PUBLIC_SITE_URL` | Sí | Enlaces de recuperación de contraseña |
| `TZ` | Sí (`UTC`) | La conversión a `America/Bogota` es explícita (D-022) |

⚠️ **Trampa ya sufrida (I-010):** no generes valores de `.env` con redirecciones de shell en Windows.
Un `\r` invisible dentro del valor rompe el login de forma desconcertante (funciona por API, falla en
el navegador). Verificación rápida:

```bash
node -e "const b=require('fs').readFileSync('.env.local');console.log('CR:',[...b].filter(x=>x===13).length)"
```

Debe imprimir `CR: 0`.

✅ **Las 21 migraciones están aplicadas también en el proyecto real** y verificadas el 2026-08-09
(`npm run verify:remote`, 13/13, más sonda específica de `0021` con rollback y 0 residuos).

Al aplicar migraciones al proyecto real, primero exige autorización explícita y genera el respaldo
de §3.b. Después, la promoción de base de datos tiene **tres** pasos, no dos:

```bash
npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"
```

```bash
npx supabase db push --yes --db-url "$SUPABASE_DB_URL"
```

```bash
npm run verify:remote
```

⚠️ **El tercero no es opcional.** Comprueba las invariantes de catálogo contra el proyecto real, y es
lo único que detecta que local y remoto han dejado de ser equivalentes. Ha hecho falta **dos veces**:
`authenticated` conservaba `DELETE` en el remoto (D-038) y `anon` podía ejecutar todas las funciones
(I-020). En ambos casos las pruebas locales pasaban.

---

## 3.b Copias de seguridad — el proyecto real está en plan Free (I-024)

**Sin scheduled backups, sin Point-in-Time Recovery, sin restore-to-new-project.** Confirmado en el
dashboard (Database → Backups) en la Fase 8. La única red de seguridad es un respaldo lógico manual:

```bash
npx supabase db dump -f "<fuera-del-repo>/roles.sql" --role-only --db-url "$SUPABASE_DB_URL"
npx supabase db dump -f "<fuera-del-repo>/schema.sql" --db-url "$SUPABASE_DB_URL"
npx supabase db dump -f "<fuera-del-repo>/data.sql" --schema public --data-only --db-url "$SUPABASE_DB_URL"
```

⚠️ El `--schema public` de la **tercera** línea es obligatorio (sin él, el volcado trae `auth.users`
completo — contraseñas cifradas y tokens). La **segunda** va **sin** restringir esquema a propósito
(restringirla rompe la extensión `pg_trgm`). Procedimiento completo, sus dos advertencias reales y
cómo restaurar (**solo en local**, nunca en el remoto sin mostrar el procedimiento exacto y recibir
autorización explícita) en `docs/RUNBOOK.md` §5.

**Generar un respaldo antes de cualquier migración o acción destructiva sobre el proyecto real.**
Antes de operar con dinero o clientes reales: actualizar a Pro o automatizar este procedimiento desde
fuera de Supabase (`docs/RUNBOOK.md` §5.3).

---

## 4. Cuentas de desarrollo

Creadas por `npm run seed` (remoto) o `npm run seed:local`. Contraseña: `SEED_DEFAULT_PASSWORD`
(en local es `DesarrolloLocal2026`).

| Correo | Rol | Organización |
|---|---|---|
| `owner@demo.test` | owner | Rifas Demo |
| `admin@demo.test` | admin | Rifas Demo |
| `vendedor1@demo.test` | seller | Rifas Demo |
| `vendedor2@demo.test` | seller | Rifas Demo |
| `owner@control.test` | owner | Rifas Control |
| `vendedor@control.test` | seller | Rifas Control |

«Rifas Control» existe **solo para probar aislamiento**: su rifa reutiliza a propósito las mismas
combinaciones de números que la de «Rifas Demo».

---

## 5. Qué documento leer y cuándo

El núcleo es obligatorio para ambos agentes, pero los documentos acumulativos se consultan por sus
secciones actuales y por los identificadores relacionados; no hace falta releer cada snapshot
histórico en una tarea sin relación.

### 5.1 Núcleo común

| Orden | Documento | Responsabilidad única |
|---|---|---|
| 1 | `AGENTS.md` **o** `CLAUDE.md` | Instrucciones del agente que trabaja |
| 2 | Este archivo | Relevo y contexto operativo actual |
| 3 | `PHASE_STATUS.md` | Estado del producto y de las fases |
| 4 | `MASTER_SPEC.md` | Alcance funcional consolidado |
| 5 | `ARCHITECTURE.md` | Diseño técnico y patrones vigentes |
| 6 | `BUSINESS_RULES.md` | Reglas normativas `BR-*` |
| 7 | `DECISIONS.md` | Decisiones `D-*`; lee las entradas relacionadas y sus notas de vigencia |

### 5.2 Según el cambio

| Vas a... | Lee además |
|---|---|
| Tocar esquema, consulta, índice o migración | `DATA_MODEL.md`, migraciones y `database.types.ts` |
| Escribir auth, RLS, permisos, RPC, Server Action o Route Handler | `SECURITY.md` y pruebas de aislamiento |
| Crear o modificar UI responsive | `ARCHITECTURE.md` §8 y `UX_COPY_GUIDELINES.md` |
| Escribir o cambiar cualquier texto visible | `UX_COPY_GUIDELINES.md` completa y `src/lib/constants.ts` |
| Escribir pruebas | `TESTING.md`; `TEST_RESULTS.md` si buscas una regresión o trampa conocida |
| Ejecutar una fase formal | `IMPLEMENTATION_PLAN.md`, solo la sección autorizada |
| Desplegar o tocar producción | `DEPLOYMENT.md`, `OPERATIONS.md`, `RUNBOOK.md` y `KNOWN_ISSUES.md` |
| Operar el negocio | `OPERATIONS.md` |
| Diagnosticar un incidente | `KNOWN_ISSUES.md`, `RUNBOOK.md` y, si aplica, el snapshot de `AUDIT_REPORT.md` |

### 5.3 Propiedad de la información

| Hecho | Documento propietario |
|---|---|
| Estado operativo y próximo relevo | `HANDOFF.md` |
| Estado de fase/producto | `PHASE_STATUS.md` |
| Problema, riesgo o deuda | `KNOWN_ISSUES.md` |
| Evidencia de pruebas | `TEST_RESULTS.md` |
| Procedimiento de producción | `DEPLOYMENT.md` / `RUNBOOK.md` |
| Razón estable | `DECISIONS.md` |
| Regla funcional | `BUSINESS_RULES.md` |
| Patrón técnico | `ARCHITECTURE.md` |

El código cita las decisiones (`D-0xx`) y reglas (`BR-xxx`) que aplica: si un comentario dice
`(D-039)`, busca solo esa entrada, no el documento entero.

---

## 6. Esquema, en una pantalla

Evita leer `DATA_MODEL.md` (~5k tokens) solo para recordar nombres.

```
organizations ─┬─ memberships (profile_id, organization_id, role, is_active,
               │                parent_seller_id → equipos, 0022)
               ├─ notifications (recipient_profile_id, kind, data, read_at; 0023)
               ├─ commission_tiers    (min_tickets, rate; 0024)
               ├─ seller_commissions  (raffle_id, seller_id, tickets_paid, rate, earned)
               └─ commission_ledger   (movement, amount, tickets_paid, rate; solo anexado)
               ├─ raffles     (short_code, name, ticket_price, status, allow_seller_ticket_creation)
               ├─ clients     (seller_id, name, phone, archived_at)
               ├─ tickets     (raffle_id, seller_id, client_id, internal_code,
               │               daily_number, weekly_number, sale_price, base_price,
               │               paid_amount, inventory_status, payment_status)
               ├─ payments    (seller_id, client_id, total_amount, payment_date, voided_at)
               └─ audit_logs  (actor_profile_id, action, entity_type, entity_id, old/new_values)

payments 1─N payment_allocations N─1 tickets   (amount; SUM = payments.total_amount)
profiles 1─1 auth.users
```

**Enums:** `app_role` owner|admin|seller · `raffle_status` draft|active|closed|cancelled ·
`ticket_inventory_status` draft|pending_approval|available|assigned|cancelled ·
`ticket_payment_status` unpaid|partial|paid · `payment_method` cash|transfer|other

**Invariantes que la BD ya garantiza — no las reimplementes en la aplicación:**
- Combinación `(org, rifa, daily, weekly)` única, incluso entre vendedores y con boletas anuladas.
- Números como texto, 1–4 dígitos, ceros iniciales conservados.
- Dinero en `bigint`; `paid_amount` derivado por trigger; `payment_status` columna generada.
- Sobrepago imposible; pago y asignaciones cuadran exactamente; todo o nada. El límite es
  **siempre** `sale_price`, que puede venir rebajado (BR-P09): una boleta vendida en $100.000 queda
  **Pagada** con $100.000, y el peso 100.001 se rechaza.
- `sale_price <= base_price`: se puede rebajar, nunca recargar.
- Ningún `DELETE` en ninguna tabla (ni política ni privilegio). La **única** excepción controlada es
  `bulk_delete_tickets` (`0020`), que borra boletas cargadas por error desde dentro de una función
  `SECURITY DEFINER`; nadie gana el privilegio (D-084).
- Aislamiento por organización y por vendedor vía RLS forzada.
- Una organización nunca se queda sin Owner activo (`0016`, aplicada en local y en producción).

**Funciones a usar en vez de DML directo:**
`assign_ticket` · `create_payment` · `void_payment` · `bulk_create_tickets` · `approve_tickets` ·
`cancel_ticket` · `bulk_assign_tickets` · `bulk_cancel_tickets` · `bulk_change_ticket_seller` ·
`bulk_delete_tickets`. Todas validan permisos internamente y auditan. Son `SECURITY DEFINER`: existen
precisamente para hacer cosas que la RLS del usuario prohíbe.

**Importación con cliente (`0021`, local y producción):** `match_ticket_import_clients` acota la
vista previa a una cartera e `import_tickets_with_clients` crea/reutiliza clientes y llama a
`assign_ticket_row` en una sola transacción (D-087).

⚠️ **`assign_ticket` y `cancel_ticket` ya no llevan las reglas dentro**: delegan en
`assign_ticket_row` y `cancel_ticket_row`, que comparten con las masivas. Si cambias una regla,
cámbiala ahí (D-083).

**Vistas de solo lectura:** `v_ticket_balances` · `v_client_balances` · `v_seller_summary` ·
`v_raffle_summary` · `v_payment_history`.

**Funciones de reporte** (`0013`, solo lectura): `report_payment_totals` y
`report_payments_by_day`. Al revés que las anteriores son **`SECURITY INVOKER`**, para heredar la
RLS de quien consulta (D-057). Úsalas para cualquier agregado de pagos que necesite parámetros.

---

## 6.b REUSE → EXTEND → CREATE: qué reutilizar antes de escribir nada nuevo

```
components/data/    DataTable · DataTablePagination · EmptyState
                    StatusBadge: badges de boleta, rifa y AccountStatusBadge, que es
                    el estado de una PERSONA (pendiente/activa/inactivo, BR-E14)
                    PageHeader (backHref = flecha de volver, D-089) · BackButton · MetricCard
lib/navigation-history.ts  detecta si hay historial real en esta pestaña, para
                    BackButton. Contador de modulo, no sessionStorage (D-089)
components/layout/  AppShell · NavLinks (lateral, escritorio) · BottomNav (barra
                    inferior del telefono, D-106) · UserMenu. UNA sola lista de rutas
                    por portal: los navItems del layout, con `primary` en las cuatro
                    que bajan. Antes de anadir un menu, mira si te basta esa marca.
                    nav-active.ts dice que entrada se enciende, y lo comparten las dos
                    barras. El hueco de la barra inferior lo reserva AppShell con
                    --bottom-nav-space (globals.css): NO pongas margenes abajo
                    pantalla por pantalla
components/form/    MoneyInput · TicketNumberInput
components/feedback/ ConfirmDialog · PageSkeleton · TableSkeleton · ReportSkeleton
features/tickets/import/  importador de archivos CSV/JSON: UN componente para los tres
                    roles, parametrizado por contexto (D-081/D-087). Antes de escribir otro
                    lector o resolver clientes, míralo: columnas/csv/json/clients/rows/review
features/tickets/components/TicketsList  la lista de boletas: UNA consulta, DOS
                    presentaciones (D-107). Escritorio -> TicketsTable; telefono ->
                    TicketCardList, tarjetas con los SEIS datos. Lo elige Tailwind,
                    no JavaScript, y las dos reciben el mismo TicketListItem[].
                    Antes de anadir una lista de boletas en otro sitio, usa esta:
                    TicketsTable ya no se llama desde ninguna pantalla
features/tickets/components/TicketFilters  el buscador SIEMPRE visible y, en el
                    telefono, los desplegables detras de «Filtros (n)» en una hoja
                    inferior (ui/sheet.tsx). Se escriben UNA vez y se pintan en los
                    dos sitios con idPrefix distinto (D-107)
features/tickets/selection/  selección múltiple y acciones masivas (D-082..D-085):
                    contexto + almacén fuera de React + elegibilidad + diálogos
components/form/    SelectionCheckbox (20 px a la vista, 44 px de diana)
lib/use-media-query.ts  consulta de medios sin romper la hidratación. Solo para
                    COMPORTAMIENTO; lo que se ve lo decide Tailwind
features/team/      equipos de vendedores (D-091): queries.ts, actions.ts y las
                    tarjetas de «Mi equipo». El ALTA no vive aqui: es la misma de
                    features/users/invite.ts, compartida con el portal administrativo.
                    Las ventas del equipo NO salen de listTickets ni de
                    v_seller_summary: van por team_sales_summary / team_member_sales,
                    porque `tickets_select` NO se amplio (D-092)
features/users/invite.ts  invitacion por correo + membresia bajo RLS. UN solo camino
                    para crear un vendedor, lo cree el personal o su vendedor padre.
                    sendInvitation() es ademas lo que INVALIDA una invitacion
                    anterior al corregir un correo: reinvitar rota el token (D-097)
features/users/components/UserDialog  UN formulario para el alta Y la edicion, en los
                    dos portales. Se parametriza con `create` o `edit` (que decide si
                    el correo se puede corregir), no se bifurca
features/commissions/  comision (D-094/D-095): TODO sale de commission_summary,
                    ninguna pantalla suma ni decide tramos. getCurrentCommissionRaffle()
                    elige de que rifa se habla, y la pantalla lo dice
features/notifications/  avisos (D-093): campanita en el armazon, tabla escrita
                    SOLO por triggers, y el TEXTO en text.ts —nunca en la base de
                    datos, para no repetir I-030—
features/search/    busqueda hibrida (D-078/D-079): useUrlSearch (listas paginadas en
                    servidor) · useRemoteSearch (dialogos) · SearchInput · hints.ts,
                    donde viven TODAS las pistas de los buscadores. El termino se
                    normaliza en lib/search.ts, que tiene que seguir coincidiendo con
                    search_normalize() de la migracion 0017
features/clients/components/ClientLinkCard  el cliente como fila pulsable entera, con
                    su avatar, su telefono y su flecha, hacia la ficha de cliente QUE YA
                    EXISTE (D-101). Un solo componente para los dos portales; el href es
                    lo unico que cambia. ClientEmptyCard es el mismo hueco sin enlace
components/data/ProgressRing  anillo de progreso accesible, sin librerias (D-105).
                    Antes de dibujar otro porcentaje, mira este y la barra de
                    CollectionSummaryCard: el porcentaje SIEMPRE va escrito, no solo
                    en el color
features/tickets/components/TicketPaymentSummary  estado, estado de pago, anillo,
                    abonado y pendiente de UNA boleta (D-105). No calcula: pide el
                    porcentaje a calculateCollectionSummary, la cuenta del panel
features/payments/components/TicketPaymentsCard  los abonos de UNA boleta, en los dos
                    portales: apilados en el telefono, en columnas desde lg. Un solo
                    arbol de HTML, no una tabla escondida y otra visible
features/tour/      recorrido guiado: pasos y textos en tours.ts, nada disperso (D-074)
features/reports/   ReportsView (los dos portales) · ReportTable · ReportNav · ReportFilters
                    ExportCsvButton
lib/                action-result.ts · auth/guards.ts (authorizeAction, requireStaff)
                    csv.ts (toCsv, escapeCsvCell) · supabase/paginate.ts (fetchAllRows)
                    tickets.ts (ticketLabel: «1234 / 5678», BR-N11)
```

**Una boleta se nombra con `ticketLabel`, nunca escribiendo `${daily} / ${weekly}` a mano.** Es lo que
evita acabar con cinco formatos para lo mismo, y lo que hace que el código interno no se vuelva a
colar en una lista (BR-N11, D-080).

**`DataTable` o `ReportTable`.** `DataTable` ordena en el navegador: úsalo en los listados
operativos. En una tabla paginada en servidor esa ordenación afectaría **solo a la página visible**,
así que los reportes usan `ReportTable`, que es un Server Component sin ordenación y con el orden
puesto por SQL (D-058).

Convención de cada módulo de `features/`: `schemas.ts` (Zod, cliente **y** servidor) ·
`queries.ts` (`server-only`, lectura para RSC) · `actions.ts` (`use server`) · `components/`.

Toda Server Action parametrizada de negocio debe seguir el mismo orden: `authorizeAction` → Zod →
RPC o DML sujeto a RLS → `mapPgError` → `revalidatePath` → `{ ok } | { error }`. Autenticación y
`logout` tienen guardas propias. I-051 registra una excepción preexistente; no debe copiarse y queda
pendiente de endurecimiento.

Los filtros y la paginación viven en la **URL**, no en estado de React: la página es compartible y el
RSC vuelve a consultar filtrando en SQL.

Las tablas y los filtros **sirven a los dos portales** y se parametrizan, no se duplican (D-051):
`TicketsTable` y `ClientsTable` reciben `basePath` / `showSeller` / `showRaffle` / `enableApproval`;
`PaymentsTable` recibe `clientBasePath` / `showSeller` / `canVoid`; `TicketFilters`,
`ClientFilters` y `PaymentFilters` ocultan los selectores que no se les pasan.

En `/seller/tickets` no hay filtro ni columna «Rifa»: el negocio opera una sola (D-088). Se consigue
**no pasando** `raffles` a `TicketFilters` y pasando `showRaffle={false}` a la tabla y a
`TicketListSlot` —«Ver seleccionadas» es la misma pantalla y debe enseñar las mismas columnas—. El
portal administrativo los conserva, y la consulta sigue aceptando `raffleId` por la URL.

**El dinero se calcula en SQL, siempre.** `paid_amount` lo mantiene un trigger, `payment_status` es
una columna generada, los saldos salen de las vistas y los totales de cobranza por fechas, de las
funciones `report_*`. Lo único que vive en la aplicación es el reparto de un abono entre boletas
(`features/payments/allocation.ts`, funciones puras), y aun así `create_payment` lo revalida antes
de escribir. Donde los reportes suman en TypeScript, lo hacen sobre filas **ya agregadas** por la
base de datos —una por rifa y vendedor, decenas—, nunca sobre boletas o pagos sueltos.

Para contar, usa `count: 'exact', head: true`; para recorrer todo, `fetchAllRows`
(`lib/supabase/paginate.ts`), que pide bloques con un orden estable hasta que uno viene incompleto.
No supongas que todos los caminos actuales ya cumplen esta regla: la auditoría de continuidad encontró
lecturas auxiliares e historiales todavía acotados o sujetos al límite de PostgREST (I-046).

---

## 7. Verificar el estado real sin leer documentación

Si dudas de si la documentación está al día, pregúntale a la base de datos:

```bash
npm run test:db
```

378 pruebas que fallan si alguien rompió una invariante. Incluyen comprobaciones de catálogo que
detectan una tabla sin RLS, una función sin `search_path` o una vista sin `security_invoker`,
**aunque nadie escriba una prueba nueva**.

⚠️ Esta suite crea 5.000 boletas en una rifa **en borrador** llamada «Rifa Volumen Fase 6», para la
prueba de volumen. Es idempotente (las reutiliza en ejecuciones posteriores), pero deja la base
distinta de como la dejó el seed: **`db:reset` + `seed:local` antes de `test:e2e`**.

```bash
npm run verify
```

typecheck + lint + unitarias + build.

```bash
npm run test:e2e
```

213 pruebas end-to-end (Playwright) que recorren los dos portales con sesiones reales, en escritorio y
en móvil (Pixel 7). Levanta solo el servidor con `npm run dev:local`; **exigen la base local recién
sembrada** (`npm run db:reset && npm run seed:local`). Fueron las que destaparon I-011.

---

## 8. Reglas de trabajo que no se negocian

1. **Una fase a la vez, solo con autorización explícita.** No adelantar trabajo de fases siguientes.
2. **Migraciones inmutables** una vez aplicadas al proyecto real: los cambios van en una migración
   nueva (así nacieron `0009` y `0010`).
3. **El acto cuya RLS se prueba nunca usa `service_role`** — omitiría RLS y pasaría aunque no
   existiera ninguna política. La clave de servicio puede preparar/comprobar/limpiar el escenario
   fuera de ese acto (D-043).
4. **El dinero se calcula en SQL**, nunca en el frontend.
5. **`SUPABASE_SERVICE_ROLE_KEY` jamás llega al navegador** (`import 'server-only'`).
6. Al cerrar la fase: actualizar documentación, ejecutar `npm run verify` y `npm run test:db`,
   commit local + etiqueta `fase-N`. Detalle en las instrucciones del agente.
7. **Revisar Git antes de implementar.** Todo cambio sin commit se presume del usuario u otro agente;
   no se resetea, descarta, sobrescribe ni reformatea sin necesidad.
8. **REUSE → EXTEND → CREATE.** Buscar primero las piezas de §6.b y los patrones del código real. No
   crear capas `services`, stores globales, wrappers o componentes paralelos por preferencia.
9. **Política de cambio mínimo.** Sin refactors, renombramientos, movimientos, dependencias ni limpieza
   fuera del alcance autorizado.
10. **Continuar el trabajo del otro agente.** Leer `HANDOFF`, `PHASE_STATUS`, diff, commits y archivos
    tocados; no reimplementar ni sustituir silenciosamente una decisión arquitectónica.
11. **Documentar por propiedad.** Actualizar solo el documento cuyo tema cambió; los snapshots
    históricos se conservan. D-086 fija la jerarquía y el protocolo común.
12. **Mantenimiento no es una fase.** Después de la Fase 9 se usan pruebas proporcionales, commit local
    y relevo; no se crea una etiqueta `fase-*` nueva sin autorización.

---

## 9. Trampas conocidas (te ahorran horas)

| Síntoma | Causa | Ver |
|---|---|---|
| Picos de ~3,4 s midiendo producción con `curl`, que parecen arranque en frío | `time_starttransfer` **no** es tiempo de servidor: incluye DNS, TCP y TLS. Desglósalo, y compara contra `/denied`, que es CDN. Un pico clavado en ~3,1 s en `time_connect` es el reintento del SYN de TCP de tu propia red | D-106, D-104 |
| Login falla en navegador pero funciona por API | `\r` dentro de un valor de `.env.local` | I-010 |
| `invalid_credentials` tras crear un usuario | `createUser` no deja la contraseña usable; hace falta `updateUserById` después | I-007 |
| `invalid_credentials` con la contraseña correcta | Límite de intentos de Supabase Auth tras varios fallos | I-008 |
| `permission denied for table X` | Falta un `GRANT`: no confíes en los que Supabase pone por defecto | D-037 |
| DNS no resuelve `db.<ref>.supabase.co` | Usa el **session pooler** (`aws-0-<región>.pooler.supabase.com`) | I-005 |
| Un `sum()` de dinero llega como string | `sum(bigint)` devuelve `numeric`: castea a `bigint` | D-040 |
| Error de tipos al insertar en `tickets`/`raffles` | `internal_code`/`short_code` los pone un trigger | D-039 |
| `Could not embed … more than one relationship` | Hay 2 FK de `tickets` a `clients`: usa la pista `clients!tickets_client_org_fk` | §6 |
| Una consulta devuelve como mucho 1.000 filas | Límite `max_rows` de PostgREST. Para contar usa `count: 'exact', head: true`, nunca `data.length` | I-011 |
| Un `UPDATE` bloqueado por RLS **no** da error | Afecta cero filas en silencio: hay que comprobar `data.length === 0` (así se detecta que un Admin no pudo tocar al Owner) | BD `F3-03` |
| El desarrollo escribe en el proyecto real | `npm run dev` usa `.env.local`. Usa `npm run dev:local` | I-013 · D-047 |
| Un usuario desactivado desaparece del listado | Falta la migración `0011` en ese entorno | I-011 |
| Una fecha de pago, venta o rifa aparece **un día antes** | `new Date('2026-08-04')` es medianoche **UTC**, que en Bogotá aún es el día 3. Usa `formatDateEs`/`formatDateCsv`, que ya lo tratan | I-017 |
| El reporte «Pagos por fecha» falla en producción | Falta la migración `0013` en ese entorno | §3 |
| Una prueba E2E lee 0 filas de una tabla que sí está | `count()` y `allInnerTexts()` **no auto-esperan** y corren contra el `loading.tsx`. Ancla antes con `expect(...).toBeVisible()` | TESTING §3.1 |
| `loginAs` falla al cambiar de usuario en una prueba | Con sesión abierta, `/login` redirige al panel. Usa `logout(page)` | TESTING §3.1 |
| Un Route Handler dentro de `(protected)` es público | Los layouts no protegen `route.ts`. Comprobar sesión y rol dentro | D-060 |
| Una consulta con RLS tarda segundos | Una política llama a una función pasándole una **columna** → una llamada por fila. Usar `columna in (select current_staff_org_ids())` | I-019 · D-063 |
| Vitest no puede importar un módulo con `server-only` | Está aliasado a un stub en `vitest.config.mts`; si aparece el error, falta el alias | D-064 |
| Una prueba E2E deja el seed corrupto | Restituir por base de datos en un `afterEach` (`setMembershipActive`), no por la interfaz dentro de la prueba: si agota el tiempo, el `finally` no llega a ejecutarse | TESTING §3.1 |
| Una ruta inexistente devuelve 200 en vez de 404 | El segmento tiene `loading.tsx`: la respuesta ya iba en streaming. No filtra datos | I-014 |
| Una vista `security_invoker` pierde filas enteras | Un `JOIN` interno contra una tabla que quien consulta no ve borra la fila. **Usa LEFT JOIN** para los nombres | I-015 |
| Un pago registrado por un admin no aparece en el historial del vendedor | Falta la migración `0012` en ese entorno | I-015 |
| Aplicar migraciones al remoto sin ver la contraseña | `npx supabase db push --dry-run` primero, y `--yes` para no quedarse esperando la confirmación | §3 |
| Un despliegue de Vercel falla con `Faltan variables de entorno obligatorias` | Revisa el **nombre exacto** de cada variable (un solo carácter de más o de menos rompe `check:env`) y que el scope **Production** esté marcado | I-021·§3.b |
| Un volcado de `supabase db dump` sale con `LegacyDbConfigParseUrlError` | `require('dotenv').config()` imprime un aviso por `stdout` que se cuela en `$(...)` y corrompe la URL capturada. Lee el `.env.local` con `fs.readFileSync` en vez de `dotenv` | §3.b |
| Un volcado de datos (`db dump --data-only`) incluye contraseñas cifradas | Sin `--schema public`, arrastra `auth.users` completo. Con `--schema public` en el volcado de **esquema** en cambio, se rompe `pg_trgm` al restaurar — restríngelo solo en el de datos | §3.b · I-024 |
| Un enlace de invitación real cae en la portada al hacer clic, con `otp_expired` | La URL de destino no está en Authentication → URL Configuration del proyecto Supabase (local o real) | I-023 |
| El seed falla con `AuthRetryableFetchError` (502) justo después de `db:reset` | GoTrue tarda más que Postgres en arrancar tras reiniciar los contenedores. Espera a que `curl http://127.0.0.1:54321/auth/v1/health` dé 200, o reintenta: el seed es idempotente | I-028 |
| Una Server Action nueva en un módulo anidado parece no tener red de pruebas | Ya la tiene: desde la Fase 9 el recorrido de `server-actions-guard.test.ts` es recursivo | I-026 |
| `F6-04` empieza a fallar después de tocar el seed o las pruebas de pagos | Depende de que `vendedor2` **no** tenga ningún pago. `F9-02` le crea uno y lo **borra** al terminar | TESTING §6.1 |
| Cambias un texto de la interfaz y las E2E fallan pese a haber actualizado las cadenas | Las pruebas también lo buscan dentro de **expresiones regulares** (`/menú de usuario/i`, `/de más/`), que ningún reemplazo de cadenas encuentra. Búscalas aparte con `grep -oE "/[^/]*palabra[^/]*/i?"` | D-073 |
| Un reemplazo masivo de textos rompe el `typecheck` con `Cannot find name` | El script confundió una línea de código con prosa y renombró un **identificador** (`numeros` → `números`). Pasó dos veces. Por eso el orden es corregir → `typecheck` → `lint` → unitarias → BD → E2E | D-073 · I-029 |
| Muchas pruebas E2E fallan de golpe con la pantalla tapada | El **recorrido guiado** se abre solo la primera vez y su capa bloquea los clics. `loginAs` lo desactiva por `localStorage`; si escribes una prueba que no lo use, pásale `{ withTour: true }` a propósito | D-074 · `tests/e2e/fixtures.ts` |
| Al añadir un paso al recorrido, el contador no cuadra o el paso no aparece | Un paso cuyo `data-tour` no exista **o no esté visible** se descarta al arrancar. Comprueba que el atributo esté en el DOM en esa ruta y ese rol | `ARCHITECTURE.md` §8.4 |
| Una prueba espera a `aria-busy="false"` y sigue antes de tiempo | Durante la pausa del debounce **todavía no se está buscando**, así que vale `false` sin que haya terminado nada. Espera al resultado real: que la lista se estreche | D-078 |
| Una función nueva resulta ejecutable por `anon` pese a las default privileges de `0015` | PostgreSQL concede EXECUTE a PUBLIC por defecto y aquella regla no lo alcanza. Añade `revoke execute … from anon, public` explícito en tu migración | I-020 · `0017` |
| Cambias `foldForSearch()` y la búsqueda de clientes deja de encontrar | Hay una copia de esa misma regla en SQL (`search_normalize`, `0017`). Las dos tienen que coincidir; lo comprueba `tests/db/search.test.ts` | D-079 |
| Buscas una boleta por su código interno y no aparece nada | Es lo esperado desde BR-N11: se busca por número diario o semanal, nunca por el código. La pantalla lo explica; el código sigue estando en el detalle de la boleta | D-080 |
| Una búsqueda de boletas devuelve las filas en un orden que parece aleatorio | Dentro del mismo escalón de relevancia el orden es **por número**, no por fecha. Si vuelve a verse desordenado, alguien tocó el `order by` de `search_tickets` | D-080 |
| Un CSV exportado de Excel «no funciona» y el encabezado parece correcto | La marca **BOM** va pegada al primer encabezado y es invisible. `parseCsv` ya la quita; si escribes otro lector, quítala tú | `import/csv.ts` |
| La comprobación previa del importador falla entera por una fila mala | La Server Action valida lo que recibe: mandarle un «12345» tumba la llamada completa. Manda solo las filas con formato válido — las demás no pueden existir en la base de datos igualmente | D-081 |
| Una prueba nueva sobre boletas del seed falla solo al correr la suite entera | Otras suites de `tests/db` dejan boletas creadas —la de volumen, 5.000—. Afirma sobre boletas que cree la propia prueba, o acota por `p_raffle_id`, en vez de contar filas del seed | I-035 · `ticket-search.test.ts` |
| Una prueba E2E falla con `page.goto: net::ERR_ABORTED at /login` y en la captura el login SÍ aparece | Otra navegación ganó la carrera: tras `clearCookies()` las peticiones RSC pendientes redirigen solas. `loginAs` ya lo reintenta; si aparece en otro `goto`, haz lo mismo | I-038 · `fixtures.ts` |
| Una prueba mide un contraste de **1,00** en un texto que se lee perfectamente | Con Tailwind 4 el navegador devuelve el color en `lab()`/`oklab()`, no en `rgb()`: leer sus números como canales de 0 a 255 da basura. Píntalo en un `canvas` y lee los píxeles | I-034 · `filas-seleccionables.spec.ts` |
| Un estado visual «se pierde» al pasar el cursor: texto claro sobre fondo claro | `hover:*` añade una pseudoclase y gana al fondo del estado elegido, pero el color del texto se queda. Escribe los estados como **ramas excluyentes**, cada una con su propio hover | D-077 · I-033 |
| Un clic en un menú de Radix dispara además la acción de la fila que lo contiene | El menú vive en un portal, pero React propaga el evento por el **árbol de componentes**. Comprueba `fila.contains(objetivo)` antes de mirar si el objetivo es interactivo | D-076 · `row-activation.ts` |
| Una medida de color o de tamaño sale distinta cada vez que se ejecuta la prueba | `transition-colors` y la animación de entrada del diálogo: estás midiendo un fotograma intermedio. Espera a que el valor deje de cambiar | I-034 |
| `seller-tickets.spec.ts` (BR-I08) empieza a fallar tras correr la suite varias veces sin `db:reset` | El selector de cliente del diálogo muestra los **primeros 50** cuando no se ha escrito nada en el buscador, y esa prueba no escribe. Cada ejecución que deja clientes nuevos acerca el límite. Una prueba que cree clientes debe borrarlos al terminar | I-035 |
| Una prueba E2E pulsa un botón y **no pasa nada**, pero a mano funciona | El clic cayó entre que el HTML del servidor está pintado —Playwright ya lo cree pulsable— y que React lo hidrató. Reintenta el gesto con `toggleCheckbox` (`fixtures.ts`) o el mismo patrón | `TESTING.md` §5.3 |
| En el teléfono, un toque se pierde en silencio al aparecer una barra o un aviso | `page.touchscreen.tap(x, y)` toca coordenadas de pantalla y no desplaza nada. Usa `locator.tap()`, que lleva el elemento a la vista y espera | `TESTING.md` §5.3 |
| Cambias una regla de asignación o anulación de boletas y la versión masiva no se entera | Desde `0020` la regla vive en `assign_ticket_row` / `cancel_ticket_row`; `assign_ticket` y `cancel_ticket` delegan. Cámbiala ahí, no en las funciones públicas | D-083 |
| Un `setState` dentro de un `useEffect` rompe el lint con «cascading renders» | El compilador de React lo rechaza. Deduce el estado en vez de sincronizarlo, o mueve el `setState` al `.then()` de una promesa | D-085 · `TicketSelectionContext.tsx` |
| Una prueba de boletas falla sola de vez en cuando, con un estado que no pusiste tú | Buscar una boleta por **el número diario solo** no la identifica: puede repetirse en otra combinación (BR-N07), así que `find()` acaba en la boleta de otra prueba. Acota siempre por el **par completo**, que es lo único único en la rifa (BR-N04). Le pasó a `importar-boletas.spec.ts`, cuyos ayudantes contaban —y apuntaban para borrar— por el número diario suelto | I-055 · I-035 |
| Escribes una prueba que afirma un importe o un recuento de una cuenta del seed | No lo fijes a mano. Otras suites venden y cobran boletas de esas cuentas, así que un `$40.000` escrito en la prueba aguanta hasta que alguien reordena los archivos. Lee el valor de la base y compruébalo contra la pantalla: eso comprueba lo que importa —que la pantalla dice lo que el motor calculó— y no depende del orden | `equipo.spec.ts` |
| Encadenas `test:db` y luego `test:e2e` y la segunda se cae a pedazos (decenas de timeouts) | No es un fallo del producto: `test:db` deja la base con las **5.000 boletas** de la prueba de volumen y con usuarios que otras suites desactivan. **Cada** ejecución E2E empieza por `db:reset && seed:local`, también —y sobre todo— si acabas de correr las de base de datos | §7 |
| Ejecutas **una sola** suite E2E y falla con datos que no reconoces | Las E2E crean rifas y las dejan **activas**; el selector de rifa del importador toma la primera activa, que ya no es la del seed. Cualquier ejecución E2E parte de `db:reset && seed:local`, también las de un solo archivo | §7 |
| Vas a dar visibilidad nueva a un rol y piensas ampliar una política de `SELECT` | Mira antes **quién depende de que esa política signifique lo que significa**. Media docena de consultas del portal del vendedor no filtran por vendedor a propósito, porque `tickets_select` ya lo hacía; ampliarla las habría cambiado todas en silencio. La vía segura es una función `SECURITY DEFINER` que se autorice sola | D-092 |
| Necesitas los números del equipo de un vendedor | `team_sales_summary()` (una fila por integrante, sin N+1) y `team_member_sales(id)`. **No** existen en `v_seller_summary` ni en `listTickets` para un vendedor | D-092 |
| Vas a tocar algo de comisiones | El importe **no se acumula sumando eventos**: es `n × tarifa(n)` recalculado. Si añades un camino que cambie el estado de pago de una boleta, no escribas ledger a mano — deja que el trigger `tickets_sync_commission` recuente | D-094 |
| Una prueba de comisiones falla con un total que no cuadra | Comprueba primero la invariante `SUM(commission_ledger) = seller_commissions.earned`. Si esa cuadra, el error está en la expectativa de la prueba, no en el motor | BR-G10 |
| Una prueba tuya le monta equipo a `vendedor1` o `vendedor2` | No lo hagas: son cuentas compartidas y `phase3-admin` comprueba a quién ve un vendedor. Crea tu propio vendedor padre en la suite, o el resultado dependerá del orden de ejecución | I-035 |
| Quieres saber si alguien «ya activó su cuenta» y miras `auth.users` | No hay forma de deducirlo ahí. GoTrue **escribe un hash aleatorio** en `encrypted_password` al verificar el enlace de la invitación, así que esa columna dice «abrió el correo», no «configuró su cuenta». El dato vive en `profiles.activated_at` y lo marca la aplicación | D-097 · BD `E2-02` |
| Cambias el correo de una cuenta invitada y crees que el enlace anterior murió | No murió. Cambiar el correo **no toca** `confirmation_token`: el enlace viejo sigue dando sesión, ya con el correo nuevo. Lo que sí lo invalida es **volver a invitar** —Auth reescribe el token en la misma ranura—, y por eso el cambio de correo pasa siempre por `sendInvitation` | D-097 · BD `E2-10` |
| Vas a dejar que un rol escriba en `profiles` con una política | `authenticated` tiene `UPDATE` sobre **todas** sus columnas (`0009`/`0010`): la política le daría de paso `is_active` y `email`. Usa una función `SECURITY DEFINER` que escriba solo lo que toca | D-097 · BD `E2-08` |
| `test:db` falla en archivos que no tocaste, o un archivo entero sale «skipped» | Busca `tickets_combo_unique` en el log. Un número de boleta sorteado a ciegas choca con los que ya hay, revienta el `beforeAll` y arrastra su archivo; si muere entre el cambio y la restauración del precio de una rifa compartida, la **ejecución siguiente** falla con importes que no cuadran y apunta al sitio equivocado. Los números se buscan libres, no se sortean | I-057 · I-055 |
| Tu `afterAll` borra pagos con el cliente de Supabase y la base se queda llena | `payments_balanced` es un constraint trigger **diferido** y PostgREST manda cada `delete` en su propia transacción: borrar las asignaciones a solas revienta con «El pago no cuadra». El cliente **devuelve** el error en vez de lanzarlo, así que no te enteras. Limpia por `pg` en UNA transacción y comprueba que no quedó nada | I-059 |
| Escribes una cifra de precio («$100.000», `100_000`) en una prueba o en un componente | No lo hagas. Al corregir el precio a $120.000 se cayeron **once** pruebas que no tenían nada roto: comparaban contra un número escrito a mano en vez de contra `raffles.ticket_price` o `sale_price`. Léelo de la base (`raffleTicketPrice(refs)` en E2E) o exprésalo relativo al precio | D-098 |
| Una boleta con $100.000 abonados aparece como «Pagada» | Es una regresión de verdad: con el precio vigente le faltan $20.000. Alguien comparó contra una cifra fija en vez de contra `sale_price`. Lo vigilan la unitaria «CASO CRITICO», BD `E7-07` y una E2E del mismo nombre | D-098 · BR-P07 |
| Cambias el precio de una rifa y alguien cobra distinto de un día para otro | Es lo previsto (BR-G15): quien no está en un equipo cobra **la mitad del precio vigente**, y el trigger `raffles_sync_commission` reajusta también las boletas ya cobradas. Además, una boleta que deja de estar Pagada deja de contar para la comisión | D-096 · D-098 |
| Necesitas saber cuánto rebajó un vendedor y calculas `raffles.ticket_price − sale_price` | Da una cifra falsa en cuanto la rifa cambie de precio, y ya cambió una vez (`0027`): convertiría en «rebaja» ventas hechas al precio correcto y hundiría la comisión de todos a la vez. La rebaja es `base_price − sale_price`, **siempre** | D-099 · BR-P10 |
| Vas a permitir una rebaja mayor y piensas usar la tarifa que cobra hoy el vendedor | La tarifa por tramos **baja sola** al anularse un pago (BR-G06). Con la tarifa alta como límite, esa venta pasada se quedaría en comisión negativa sin que nadie la tocara. El tope es la tarifa **mínima garantizada** | D-099 · BR-G18 |
| Añades un valor a un `enum` en una migración y revienta al usarlo | `alter type … add value` deja el valor inutilizable **hasta que la transacción confirma**. Por eso `0028` no lleva bucle de recálculo: si hace falta uno, va en una migración posterior | D-099 |
| Tocas el motor de comisión y la invariante del ledger deja de cuadrar | La línea de la rebaja se calcula **por resto** (lo que falte para cuadrar), no como «diferencia de rebajas». Es lo que hace que `sum(ledger) = earned` se mantenga por construcción y no dependa de que tres fórmulas sigan siendo consistentes | D-099 · BR-G10 |
| Añades un campo a un diálogo y una prueba reintenta el clic decenas de veces contra un botón «visible y habilitado» | El botón se salía de la pantalla porque `DialogContent` no acotaba su alto. **Resuelto en el componente compartido** (`max-h-[calc(100dvh-2rem)] overflow-y-auto`), así que ya no puede repetirse en ningún diálogo. Lo vigila `tests/e2e/dialogos-alcanzables.spec.ts`, que corre los mismos escenarios en dos tamaños de ventana | D-099 |
| Necesitas que un diálogo concreto sea más bajo o más alto | Pásale su propia clase `max-h-*`: `cn` usa `tailwind-merge`, así que la de quien llama gana sobre la del componente. No hace falta —ni conviene— volver a declarar `overflow-y-auto` | D-099 |
| Cambias una clase de Tailwind **con valor entre corchetes** y en `npm run dev` no pasa nada | La caché de Turbopack se queda con la clase **anterior** y no genera la nueva: la rejilla se ve de una sola columna y parece un error de maquetación. Compruébalo en el CSS generado (`.next/dev/static/chunks/src_app_globals_css_*.css`); si la clase vieja sigue ahí, `rm -rf .next/dev` y reinicia. El `build` de producción sí la genera | D-105 |
| El servidor de desarrollo empieza a devolver **500 en todas las rutas** sin haber tocado nada | Ocurre después de un `Finished filesystem cache database compaction` en el log de Turbopack. Reiniciar `npm run dev:local` lo arregla; no es la aplicación | D-105 |
