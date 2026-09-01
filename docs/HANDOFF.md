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
| Siguiente fase | Ninguna. Mantenimiento: **«Ventas por fecha»**, reporte del vendedor (D-151, migración `0040`), **solo en local — falta desplegar** |
| **Reportes** | Desde el 2026-08-31 (D-151, BR-T05..BR-T07) `/seller/reports` abre **«Ventas por fecha»** con las ventas de hoy, sin redirección. Una venta es una boleta `assigned` fechada por **`sale_date`**; «Abonado» es lo que llevan pagado **hoy**, no el dinero recibido esos días —eso lo sigue respondiendo «Pagos por fecha», intacto—. El predeterminado es **por portal**: `/owner/reports` conserva «Por vendedor» y **no** ofrece el nuevo. Migración **`0040`**: `report_sales_totals` y `tickets_sale_date_idx` |
| **Resultados de loterías** | Etapa 6 (2026-08-30, D-149): `0036`–`0039` en el proyecto real, `vercel.json` con los 10 jobs Hobby, `CRON_SECRET` inyectado por Vercel. Recuadro del Panel, sync, matching y avisos de las etapas 1–5. **Cron activado** |
| **Precio de la boleta** | **$120.000** desde el 2026-08-15 (D-098, BR-P01). Era `$100.000` y **esa cifra nunca fue la correcta**. La fuente sigue siendo `raffles.ticket_price`; no escribas cifras de precio en el código |
| **Rebaja del vendedor** | Desde el 2026-08-17 (D-099) una boleta puede venderse **por debajo** del precio de la rifa. `sale_price` es lo que debe el cliente y `base_price` el precio oficial congelado; la rebaja es la resta y **no se guarda**. La asume entera la ganancia del vendedor. **Ya en producción** (`0028`, 2026-08-17) |
| **Buscar en «Boletas»** | Desde el 2026-08-21 (D-100, BR-N13) el **único** campo de búsqueda encuentra por los números de la boleta **y** por el nombre del cliente que la tiene, devolviendo siempre boletas. Migración **`0029`**. **Ya en producción** (`e1b2fe1`, 2026-08-21) |
| **Navegación en el teléfono** | Desde el 2026-08-23 (D-106) el móvil **no tiene cajón lateral**: tiene una **barra inferior fija** con Panel · Boletas · Clientes · Pagos, y el resto del menú se lee desde el **menú de usuario**. Escritorio sigue igual. Ninguna ruta ni permiso cambió. **Ya en producción** (`79e107b`, 2026-08-23) |
| **«Boletas» en el teléfono** | Desde el 2026-08-23 (D-107) la lista de boletas del móvil son **tarjetas**, no una tabla con Cliente, Pago y Precio ocultos. Los filtros van detrás de «Filtros (n)», en una hoja inferior; el buscador sigue siempre visible. **Escritorio no cambió.** Misma consulta, mismos permisos, sin migración. **Ya en producción** (`d3ee139`, 2026-08-23) |
| **Cabecera de «Boletas»** | Desde el 2026-08-24 (D-108) el título y **«Crear boletas»** comparten fila, el recuadro de filtros es **solo de escritorio**, el buscador mide **44 px** en el móvil y **«Filtros»** y **«Seleccionar varias»** son **una sola fila** de 44 px. La primera boleta sube de y = 448 a **y = 322**. Sin migración, sin consultas nuevas. **Ya en producción** (`4381f2b`, 2026-08-24) |
| **Cabecera del portal administrativo** | Desde el 2026-08-24 (D-109) `/owner/tickets` tiene el mismo bloque, con **una diferencia obligada**: sus **dos** acciones no caben junto al título —363 px sobre 288 a 320 px— y bajan juntas a una **fila propia de 44 px** de lado a lado. Las dos pantallas de boletas tienen encabezados distintos a propósito (`ARCHITECTURE` §8.11). **Ya en producción** (`f9d5b20`, 2026-08-24) |
| **Barra de selección en el teléfono** | Desde el 2026-08-24 (D-110) el hueco de esa barra lo reserva `--selection-bar-space` al **fondo** del contenido, no un div vacío en medio de la lista, y la barra va envuelta en `display: contents` para que el margen del `space-y-6` no la levante sobre la navegación. Se acabaron los 80 px en blanco al marcar y la paginación tapada. **Escritorio no cambia.** **Ya en producción** (`ef6bcb2`, 2026-08-24; `ARCHITECTURE` §8.8) |
| **Panel del vendedor** | Desde el 2026-08-25 (D-112) el panel son **siete piezas** con selector de período, anillo de reparto del dinero y gráfico de recaudo diario. Desaparecen «Tu ganancia», «Resumen de cobranza», las cinco tarjetas de inventario y dos de las tres listas. **Sin migración, sin cambios de reglas ni de rutas.** **Ya en producción** (`96827dc`, 2026-08-25; `ARCHITECTURE` §8.13; I-068 espera decisión) |
| **Ficha del cliente** | Desde el 2026-08-25 (D-113) el detalle del cliente tiene el estado **junto al nombre**, **«Registrar abono»** en el encabezado, la información general en una **cuadrícula** —2 × 2 en el teléfono, una fila en escritorio— y los dos listados en **tarjetas con título**. Se retira la columna «Cliente» de las dos tablas y «Rifa» en el portal del vendedor. **Mismo aspecto en los dos portales.** Sin migración, sin consultas nuevas, sin cambios de reglas ni de rutas. **Ya en producción** (`18ad9bd` y `9e72fca`, 2026-08-25; `ARCHITECTURE` §8.14) |
| **El dinero de cada boleta, en la lista** | Desde el 2026-08-27 (D-130) las dos pantallas que listan boletas dicen, **sin abrirlas**, cuánto se abonó, cuánto falta y qué parte del precio es eso. «Mis boletas» gana tres columnas (Abonado · Falta · Progreso) y un **pie financiero** en la tarjeta del teléfono; «Boletas de este cliente» tiene ahora **su propia lista** (`ClientTicketsList`), con más aire. Los dos números diario y semanal se funden en **una** columna, «Boleta». Las cuentas salen de **`ticketFinancials()`**, que usan también el detalle: hay una sola resta. **Sin migración, sin consultas nuevas, sin cambios de reglas ni de rutas.** **Ya en producción** (`6ff1a8f` y `599a3b6`, 2026-08-27) |
| **«Clientes» en el teléfono** | Desde el 2026-08-29 (D-136) la lista de clientes del móvil son **tarjetas**, no una tabla con scroll horizontal. Nombre a la izquierda, celular a la derecha, Boletas y Saldo en el pie. **«Nuevo cliente»** comparte fila con el título. Escritorio no cambia. Misma consulta, mismos permisos, sin migración. **Ya en producción** (`dc97949`, 2026-08-29) |
| **Editar el precio de una boleta asignada** | Desde el 2026-08-29 (D-137, BR-P13) el detalle de una boleta asignada tiene un icono junto al **precio de venta**. Es el mismo campo y las mismas validaciones de la asignación; no puede bajar de lo abonado ni recargar sobre el oficial congelado. Migración **`0035`**. Recálculo de saldo, estado y ganancia por los disparadores de siempre. **Ya en producción** (`0d6d7ea`, 2026-08-29) |
| **«Registrar abono» en el teléfono** | Desde el 2026-08-29 (D-138) el formulario de abono en el móvil son **tarjetas**, no una tabla de cuatro columnas. El título es solo «Registrar abono»; el cliente vive debajo, con **Cambiar**. Resumen y botones van al fondo con flex, no fijos. Escritorio conserva la tabla. Misma RPC, mismos permisos, sin migración. **Ya en producción** (`1d3fa54`, 2026-08-29). **Fecha ya no tapa Método** (D-139, I-079): el `input type=date` nativo de iPhone/Android/PWA se montaba encima del desplegable; el navegador de escritorio, al estrechar la ventana, no lo reproducía. **Ya en producción** (`a0bbc97`, 2026-08-29) |
| **Abono desde una boleta** | Desde el 2026-08-28 (D-133) registrar un abono **desde el detalle de una boleta** vuelve a **esa misma boleta**. **D-135** (2026-08-29) extiende lo mismo a la ficha del cliente, «Mis pagos» y el panel: una sola pantalla, el origen viaja en `?from=`. Sin migración, sin RPC nueva. **Ya en producción** (`f05c397`, 2026-08-29) |
| **Editar un abono vigente** | Desde el 2026-08-28 (D-134, BR-F16) el historial de una boleta —y el detalle de un pago— permiten **corregir el valor** de un abono activo. Es el mismo registro, no uno nuevo. Saldo, estado y ganancia los recalcula la base. Un anulado no se toca. Migración **`0034`**. **Ya en producción** (`0b05fd9`, 2026-08-29) |
| **Menú lateral de escritorio** | Desde el 2026-08-28 (D-131) la barra lateral mide **232 px** en una ventana amplia, **de 208 a 232** entre 1.360 y 1.600 px, y **56 px —solo iconos—** por debajo de 1.360, sea porque la persona la cerró con el botón nuevo o porque no cabe. La preferencia viaja en la cookie `rifas.sidebar` y la lee el servidor, así que no hay parpadeo. **El teléfono no cambia**: sigue la barra inferior de D-106. **Ya en producción** (`322d80a`) |
| **…y donde no cabe, se abre flotando** | El mismo día (**D-132**, revoca D-131 §5): por debajo de 1.360 px el botón abre la barra **encima** del contenido en vez de quedarse inerte, sin moverlo ni un píxel, y se cierra sola al elegir una opción, al pulsar fuera, con `Escape`, al salir el foco o al volver a haber sitio. **No toca la preferencia guardada.** Sin migración. **Ya en producción** (`1d12081`, 2026-08-28) |
| **Paginación en el teléfono** | Desde el 2026-08-24 (D-111) el recuento dice **qué** cuenta —«1–25 de 118 boletas», de `LIST_ITEM_LABELS`—, los botones miden **44 px** y van a los márgenes, y el indicador dice «1 de 5» centrado entre ellos. Mismo componente para los **ocho** listados y **mismo paginado**. Escritorio solo cambia dos textos. **Ya en producción** (`7d7cf18`, 2026-08-24; `ARCHITECTURE` §8.12) |
| **Aplicación instalable (PWA)** | Desde el 2026-08-26 (D-115 a D-119) la aplicación se **instala** en Android, iPhone y escritorio: manifiesto, iconos, service worker propio, pantalla sin conexión y aviso de versión nueva. **No cambia nada de la aplicación web**: mismas rutas, misma sesión, misma lógica. El worker **no guarda ni una respuesta autenticada** —ni HTML, ni RSC, ni API, ni nada que no sea `GET`—, solo archivos con huella de contenido. **Ya en producción** (`cc64a99`, 2026-08-26), con el worker activo en el alcance raíz y **0 entradas ajenas** en sus cachés |
| **«Recuperar contraseña», corregida** | El 2026-08-26 (D-121) se corrigió **I-070**: esa pantalla estaba **prerenderizada**, la CSP por nonce le bloqueaba todos los scripts y llevaba **sin JavaScript en producción desde la Fase 7** — el formulario caía a su envío nativo por GET y **no enviaba ningún correo**. Una línea: `force-dynamic`. Lo que sigue abierto es **I-074**: la suite E2E corre en modo desarrollo y **no puede ver** esta familia de fallos. **Ya en producción y comprobado en vivo** (`cc64a99`): consola limpia, React hidrata, y un correo inválido muestra «Ingresa un correo válido.» sin que la dirección cambie |
| **Ofrecer la instalación** | Desde el 2026-08-26 (D-123) la tarjeta va **arriba** del panel, no al final: estaba en `y = 2.646` de una página de 2.936 y el dueño instaló la aplicación a mano sin verla nunca. Se añade **«Instalar aplicación»** al menú de usuario, y el **iPhone fuera de Safari** —que antes recibía silencio— ahora recibe la única indicación útil: ábrela en Safari. **Ya en producción** (`f597905`, 2026-08-26); la tarjeta en sí se verificó con sesión contra la base local, porque en producción vive tras el inicio de sesión |
| **Logo e iconos** | Desde el 2026-08-26 (D-122) el logo real está puesto y, sobre todo, **se cambia solo**: los SVG viven en `public/icons/source/`, `npm run icons` genera las seis salidas y ningún nombre cambia, así que el manifiesto nunca se toca. `sharp` pasa a `devDependency` explícita. **Ya en producción** (`f597905`, 2026-08-26), con los **6** archivos servidos coincidiendo byte a byte con los generados en local |
| **Rendimiento — navegador** | 2026-08-26 (D-118, D-120): fuera `Geist_Mono`, que se precargaba en las 37 pantallas sin que la usara nadie (11 → **5** `.woff2`; 51,2 → **29,3 KB** en la ruta crítica); fuera `date-fns` y `@date-fns/tz`, sin una sola aparición en el repositorio; y el recorrido guiado (**8,4 KB**, estaba en todas las pantallas) y los cinco diálogos de acción masiva (**7–10 KB** cada uno, en la pantalla que más se abre) pasan a `next/dynamic`. **Ya en producción** (`cc64a99`, 2026-08-26) |
| **Anillos y dinero** | Desde el 2026-08-26 (D-124) **dentro de un anillo va solo un porcentaje**; el dinero se escribe fuera, al lado. Cambia el «Resumen de pago» de una boleta y el «Resumen financiero» del panel, y el centro del anillo pasa de «Total a cobrar $6.960.000» a «26 % recaudado» con **«Total vendido»** al lado —el término que ya usaban las otras diez pantallas—. De paso se corrigió el globo del recorrido guiado, que con un elemento alto se salía de la pantalla. Sin migración, sin consultas nuevas, sin cambios de reglas ni de rutas. **Ya en producción** (`a031ae1`, 2026-08-26) |
| **320 px es un ancho soportado** | Desde el 2026-08-26 (D-125, I-076) el detalle de una boleta ya no se desplaza de lado con un cliente de nombre largo, en **los dos** portales. La regla general que deja: **una rejilla que declara columnas solo desde `sm:` está declarando `auto` en el teléfono**, y una columna `auto` no baja del mínimo de su contenido — con `truncate` (`nowrap`) ese mínimo es la frase entera. Declara siempre la columna base. Una clase por pantalla; cubierto por `boleta-estrecha-movil.spec.ts`. **Ya en producción** (`a031ae1`, 2026-08-26) |
| **El negocio se llama «Rifas»** | Desde el 2026-08-27 (D-126). **No fue un cambio de código:** «Rifas Demo» era el nombre de la **organización** en la base de datos —`AppShell` pinta `organizations.name` en la barra lateral y en el encabezado del móvil—, y en `src/` la palabra «Demo» no aparecía ni una vez. Renombrado con `UPDATE` sobre el proyecto real, con autorización expresa. **Ya en producción**, sin desplegar nada (el código de las otras dos filas se desplegó aparte, en `c9dc8b7`). ⚠️ Lo que **no** arregla: producción sigue siendo el **seed entero**, con cuatro cuentas `@demo.test` que pueden entrar (**I-077**) |
| **Boleta 7616 / 1891** | Corrección operativa el **2026-08-29**, con autorización expresa: estaba en **Marcos Muñoz mto** (1111111438) y pasó a **Marcos Muñoz biarticulado** (3208468676), misma cartera de Armando Gordillo. **Sin pagos**, precio y fecha intactos. Sin despliegue ni migración. Detalle en `TEST_RESULTS` |
| **Flecha de volver, a plomo con su título** | Desde el 2026-08-27 (D-126) el icono ya no cae **6 px** por debajo del título en las **once** pantallas con flecha. La causa era aritmética —línea de 32 px contra un botón de 44 alineados por arriba— y el arreglo vive **una sola vez** en `PageHeader`: `-my-1.5` saca del flujo los 6 px sobrantes de cada lado **sin encoger la diana**, que sigue midiendo 44 × 44. De paso, `-ms-3` deja la flecha a plomo con las tarjetas de abajo. **Ya en producción** (`c9dc8b7`, 2026-08-27) |
| **Encabezado del detalle de una boleta** | Desde el 2026-08-27 (D-126) dice **«Detalle boleta»** y nada más: los dos números y la rifa estaban repetidos a un dedo de distancia. La **rifa baja al contenido** —«Detalles de la boleta» en el portal del vendedor, junto a «Vendedor» y enlazada en el administrativo—, porque el encabezado era el único sitio donde aparecía. **No contradice BR-N11**: la boleta se sigue nombrando por sus números donde hace falta nombrarla. **Ya en producción** (`c9dc8b7`, 2026-08-27) |
| Cambio funcional anterior | `7b26d99` — **corregir a un integrante pendiente** (D-097), 2026-08-14; migración `0026` aplicada al proyecto real, CI 2/2 y despliegue verificado por SHA |
| Último cambio promovido | **`d102108`** — **cabecera contextual al hacer scroll** (D-150), 2026-08-30; sin migración, CI 2/2, despliegue verificado por el identificador `6ca114ab2ccd` y por `--app-header-height` |
| Cambio promovido anterior | **`325398c`** — **resultados oficiales de loterías en producción** (D-149, Etapa 6), 2026-08-30; migraciones `0036`–`0039`, cron Hobby, CI 2/2, despliegue verificado por el identificador `eeb9d8e64d57` y por `/api/lottery/sync` en 401 |
| Cambio promovido anterior | **`1d3fa54`** — **rediseño de «Registrar abono» en el teléfono** (D-138), 2026-08-29; sin migración, CI 2/2, despliegue verificado por el identificador `d2cb88d2614e` y por `.min-\[360px\]\:grid-cols-2` / `.h-\[52px\]` |
| Cambio promovido anterior | **`0d6d7ea`** — **editar el precio de venta de una boleta asignada** (D-137), 2026-08-29; migración `0035` aplicada al proyecto real, CI 2/2, despliegue verificado por el identificador `2ac42dbe11ea` |
| Cambio promovido anterior | **`dc97949`** — **clientes en tarjetas en el teléfono** (D-136), 2026-08-29; sin migración, CI 2/2, despliegue verificado por el identificador `13654f6048d5` y por `.max-w-\[45\%\]` |
| Cambio promovido anterior | **`f05c397`** — **volver al origen tras registrar un abono** (D-135), 2026-08-29; sin migración, CI 2/2, despliegue verificado por el identificador `2276f1864055` |
| Cambio promovido anterior | **`0b05fd9`** — **editar el valor de un abono vigente** (D-134), 2026-08-29; migración `0034` aplicada al proyecto real, CI 2/2, despliegue verificado por el identificador `dddfeddf377c` |
| Cambio promovido anterior | **`4480a3a`** — **volver al detalle de la boleta tras registrar un abono** (D-133), 2026-08-28; sin migración, CI 2/2, despliegue verificado por el identificador `0929554862d1` |
| Cambio promovido anterior | **`e2b604a`** — **la deuda real de formato, saldada** (16 archivos), 2026-08-28; sin migración, CI 2/2, despliegue verificado por el identificador `ad94db8e07ba` |
| Cambio promovido anterior | **`1d12081`** — **el menú se abre flotando donde no cabe** (D-132), 2026-08-28; sin migración, CI 2/2, y despliegue verificado por el identificador `e25b8f1dda89` **y** por las tres huellas CSS que solo genera este cambio |
| Cambio promovido anterior | **`322d80a`** — **el menú lateral se estrecha y se cierra solo** (D-131), 2026-08-28; sin migración, CI 2/2, y despliegue verificado por el identificador de versión `12633e1a9961` **y** por las cinco huellas CSS que solo genera este cambio (`--sidebar-width`, `clamp(13rem`, la consulta de medios de 85rem, `[data-sidebar=collapsed]` y `sidebar-label`) |
| Cambio promovido anterior | **`599a3b6`** — **el dinero de cada boleta en la lista, con sus dos ajustes** (D-130), 2026-08-27; sin migración, CI 2/2 y despliegue verificado por el identificador de versión |
| Cambio promovido anterior | **`c9dc8b7`** — **«Demo» fuera del nombre visible, la flecha de volver a plomo con su título y «Detalle boleta»** (D-126), 2026-08-27; sin migración, CI 2/2, y despliegue verificado por el identificador de versión **y** por las dos clases (`.-my-1\.5`, `.-ms-3`) que solo genera este cambio. El renombrado de la organización fue un `UPDATE`, no parte del despliegue |
| Cambio promovido anterior | **`a031ae1`** — **el dinero fuera de los anillos y el desbordamiento a 320 px** (D-124, D-125), 2026-08-26; sin migración, CI 2/2, y despliegue verificado por el identificador de versión **y** por las cuatro reglas `cqw` que solo genera este cambio |
| Cambio promovido anterior | **`f597905`** — **el logo real con su tubería y el ofrecimiento de instalar corregido** (D-122, D-123), 2026-08-26; sin migración, CI 2/2, los 6 iconos verificados byte a byte y el **ciclo de actualización del service worker observado en vivo** sobre el dominio real |
| Cambio promovido anterior | **`cc64a99`** — **la aplicación instalable, el arreglo de «Recuperar contraseña» y el registro de pruebas** (D-115 a D-121), 2026-08-26; sin migración, CI 2/2 y despliegue verificado por el **identificador de versión servido**, que es método nuevo (I-069 cerrado) |
| Cambio promovido anterior | **`9e72fca`** — **la cuadrícula 2 × 2 de «Información general»** (D-113.c), 2026-08-25; sin migración, CI 2/2 y despliegue verificado por SHA. Se comprobó además que las huellas CSS del build anterior **desaparecieron** |
| Cambio promovido anterior | **`18ad9bd`** — **el rediseño de la ficha del cliente** (D-113), 2026-08-25; sin migración, CI 2/2 y despliegue verificado por SHA |
| Cambio promovido anterior | **`96827dc`** — **el rediseño del panel del vendedor** (D-112), 2026-08-25; sin migración, CI 2/2 y despliegue verificado por SHA |
| Cambio promovido anterior | **`7d7cf18`** — **la paginación en el teléfono** (D-111), 2026-08-24; sin migración, CI 2/2 y despliegue verificado por SHA |
| Cambio promovido anterior | **`ef6bcb2`** — **el hueco de la barra de selección múltiple** (D-110), 2026-08-24; sin migración, CI 2/2 y despliegue verificado por SHA |
| Cambio promovido anterior | **`f9d5b20`** — **la misma cabecera en el portal administrativo** (D-109), 2026-08-24; sin migración, CI 2/2 y despliegue verificado por SHA |
| Cambio promovido anterior | **`4381f2b`** — **la cabecera de «Boletas» deja de ser cuatro bloques sueltos** (D-108), 2026-08-24; sin migración, CI 2/2 y despliegue verificado por SHA |
| Cambio promovido anterior | **`d3ee139`** — **las boletas del teléfono pasan a tarjetas** (D-107), 2026-08-23; sin migración, CI 2/2 y despliegue verificado por SHA |
| Cambio promovido anterior | **`ded4181`** — **Fluid Compute declarado en `vercel.json`**, 2026-08-23. Era un requisito duro de `DEPLOYMENT.md` §3.1.b que vivía solo en el panel y no dejaba rastro en Git. Se declara **solo** `fluid`: las cabeceras siguen en `next.config.ts` y `src/proxy.ts`, y se comprobó que las 6 siguen llegando |
| Cambio promovido anterior | **`79e107b`** — **la navegación del teléfono baja a una barra inferior** (D-106), 2026-08-23; sin migración, CI 2/2 y despliegue verificado por SHA |
| Último cambio funcional promovido | **`e1b2fe1`** — **buscar boletas por el cliente** (D-100, D-101), 2026-08-21; migración `0029` aplicada al proyecto real, despliegue verificado por SHA. La migración no escribe ni una fila |
| Punto de partida del último mantenimiento | `main` en `3f82c42`, con árbol limpio antes de implementar (2026-08-21) |
| Etiquetas | La última es `fase-9`, que apunta a `0becc47`. Solo `fase-0`, `fase-1` y `fase-2` están en el remoto; `fase-3` a `fase-9` siguen solo en local. No mover ni empujar etiquetas sin autorización |
| Remoto | `github.com/jimmyriveros/GestionRifas`. `main` local y `origin/main` coincidían en **`18ad9bd`** el 2026-08-25, tras el push de D-113; a partir de ahí vuelve a comprobarse con Git, no se asume por este texto |
| **Producción** | **`https://gestion-rifas.vercel.app`** — proyecto Vercel `gestion-rifas`, desplegado y verificado (cabeceras, aislamiento de rutas, los 3 roles probados por el usuario) |
| App | Next.js 16: autenticación, portal administrativo, portal del vendedor, pagos/abonos y **reportes con exportación CSV**, todo funcionando **en producción** |
| **Rendimiento — datos** | Auditado con volumen real el **2026-08-22** (D-102, D-103): 100.005 clientes, 300.033 boletas y 1.000.006 pagos en base local. Las consultas de las cinco pantallas más usadas pasaron de **0,6–1,4 s** a **0,1–0,3 s**. Migración **`0030`** y código en producción. Con el volumen real de hoy —46 clientes, 121 boletas— **no se nota**: es preventiva. Techos pendientes: I-062 e I-063 |
| **Rendimiento — navegación** | Medida la cadena completa desde el clic (D-104, 2026-08-22): local **826 → 124 ms**; en Vercel, encadenada **~840 → ~350 ms** y **tras 60 s de lectura 2.900–5.900 → 847 ms** de mediana, ninguna por encima de 2 s. Tres causas: los `loading.tsx` (~300 ms de espera por el fallback), la precarga de las filas de tabla, y el **arranque en frío de Vercel**, que no era código y se resolvió activando **Fluid Compute** (I-067, resuelto). ⚠️ **Fluid Compute es ahora un requisito de despliegue** (`DEPLOYMENT.md` §3.1.b): si alguien lo desactiva, los tres segundos vuelven y ningún cambio de código los quitará |
| Base de datos | **39 migraciones en local y en el proyecto real.** **`0036`–`0039` se promovieron el 2026-08-30** con respaldo previo en `Rifas-backups/2026-08-30-pre-0036/`. **`0035` se promovió el 2026-08-29** con respaldo previo en `Rifas-backups/2026-08-29-pre-0035/`. **`0034` se promovió el 2026-08-29** con respaldo previo en `Rifas-backups/2026-08-28-pre-0034/`. **`0033` se promovió el 2026-08-27**. **`0030` se promovió el 2026-08-22** con respaldo previo en `Rifas-backups/2026-08-22-pre-0030/`. **`0029` se promovió el 2026-08-21** con respaldo previo en `Rifas-backups/2026-08-21-pre-0029/`. `0028` se promovió el **2026-08-17** con respaldo previo en `Rifas-backups/2026-08-17-pre-0028/`. `0027` se promovió el **2026-08-15** con respaldo previo en `Rifas-backups/2026-08-15-pre-0027/`. `0022`–`0025` se promovieron el 2026-08-13 y **`0026` el 2026-08-14**, con respaldo previo en `Rifas-backups/`. **Plan Free: sin backups automáticos** (I-024), respaldo lógico manual en §3.b |
| Pruebas | **374 unitarias**, **518 de base de datos** y **294 E2E**, las tres **revalidadas en verde el 2026-08-26** con Docker levantado y sembrando limpio antes de cada pasada. ⚠️ La primera pasada E2E dio 1 fallo que **no era del código**: con `.next/dev` frío, la primera prueba agota su tiempo pagando la compilación de cuatro rutas (**I-075**, reproducido igual sobre el commit anterior a este trabajo). La suite de base de datos aguanta pasadas seguidas sobre la misma base (I-057 e I-059); la de E2E **no**, y hay que sembrarla limpia antes de una pasada completa. CI en GitHub Actions desde la Fase 8 |

**Lo que existe hoy:** el producto completo del MVP **en producción real** — crear rifas y boletas,
repartirlas entre vendedores, venderlas a clientes, cobrarlas con abonos, y consultar y exportar todo
eso en reportes. Los saldos y los estados de pago los calcula la base de datos. Endurecido en la
Fase 7 (CSP por nonce, limitación de intentos, RLS ~1.400× más rápida), desplegado en la Fase 8 y
auditado en la Fase 9 con **47 intentos deliberados de romperlo**, ninguno de los cuales consiguió
leer ni escribir un dato ajeno. Informe: `docs/AUDIT_REPORT.md`.
Desde el 2026-08-08 la lista de boletas admite **selección múltiple y acciones masivas** (BR-B01..
BR-B08), ya **en producción**.
El importador CSV/JSON admite además filas opcionales con cliente + celular obligatorio (D-087) y una
columna **«Abono»** con lo ya cobrado de esa boleta, que se registra por `create_payment` (BR-N14,
D-129; migración `0033`).
La base real ya tiene `0021`; el push coordinado de `main` activa el frontend correspondiente.
**Lo que NO existe:** backups automáticos de Supabase (plan Free — I-024, prerrequisito antes de datos
reales).

---

## 1.a Último relevo significativo — «Ventas por fecha», reporte del vendedor (2026-08-31)

| Campo | Estado |
|---|---|
| Resultado | **El vendedor entra a Reportes y ve lo que vendió hoy**: cuántas boletas, qué números, a quién, cuánto sumó, cuánto llevan abonado y cuánto falta. `/seller/reports` abre en «Ventas por fecha» **sin redirección**; `/owner/reports` conserva «Por vendedor» y **no** ofrece el nuevo. `Route changes: None` · `Migrations: 0040` · `New dependencies: None`. **Solo en local: no se ha desplegado** |
| Archivos | **Nuevos:** `supabase/migrations/0040_report_sales_by_date.sql`, `tests/unit/reports-sales-by-date.test.ts`, `tests/db/reports-sales-by-date.test.ts`, `tests/e2e/ventas-por-fecha.spec.ts`, `ventas-por-fecha-movil.spec.ts`. **Tocados:** `features/reports/{schemas,queries,export}.ts`, `components/{ReportsView,ReportFilters}.tsx`, los dos `reports/page.tsx`, `api/reports/export/route.ts`, `tickets/components/TicketNumbers.tsx`, `database.types.ts`, `scripts/verify-remote.ts`, `tests/db/catalog.test.ts`. Documentación: `DECISIONS` (D-151), `BUSINESS_RULES` (BR-T05..BR-T07), `ARCHITECTURE` §8.21, `DATA_MODEL` §5 y §6.k, `SECURITY` §4.9, `UX_COPY_GUIDELINES`, `TESTING` §4.2.b, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una capa services, ni una segunda lista de boletas.** `ReportsView`, `ReportNav`, `ReportFilters`, `ReportTable`, `DataTablePagination`, `TicketNumbersCell`, `PaymentStatusBadge`, `ticketFinancials`, `formatCOP`, `formatDateEs`, `todayBogota`, `fetchAllRows`, `toCsv` y el mismo Route Handler. Lo único que hubo que **abrir** fue el tipo de `TicketNumbersCell`, que exigía un `TicketListItem` entero cuando solo usa dos campos: ahora acepta `TicketNumbersSource` y los llamadores de siempre encajan sin cambiar |
| Decisiones | **D-151**: definición de venta reutilizada (BR-T05), «Abonado» ≠ «Recaudado» y la pantalla lo dice (BR-T06), predeterminado **por portal** con `resolveReport` (BR-T07), hoy deducido de la ausencia de fechas con `resolveSalesDateRange`, agregado en SQL y **sin tercera consulta para contar**, y la función **sin parámetro de vendedor ni de organización** |
| Verificación | `npm run verify` ✅ · lint **0 errores** (2 avisos de siempre) · **574/574** unitarias (+22) · `build` ✅ · `test:db` **651/651** (+20) · E2E de esta tanda **23/23** (18 escritorio + 5 móvil) · suite E2E completa **416/417**, y ese 1 es el fallo por orden de ejecución que ya registró D-150 —verde en aislamiento con base limpia, y las specs nuevas no crean pagos—. Doce errores encontrados y corregidos, **todos de las pruebas, ninguno del producto**; detalle en `TEST_RESULTS.md`. Dos merecen recordarse: la limpieza por PostgREST **fallaba en silencio** por `check_payment_balance`, y `current_date` es el día **UTC** del contenedor, no el de Bogotá |
| Advertencias | **1)** `0040` está **solo en local**. **2)** **No pongas `seller_id` delante** en `tickets_sale_date_idx`: se midió y es peor (lección de D-102); `D151-05` lo vigila. **3)** **No devuelvas las guardas `is null`** a `report_sales_totals`: valen 60 ms y un barrido de tabla. **4)** `report_payment_totals` **no se tocó**. **5)** `Ventas por fecha.txt` y `prueba-abono.csv` son del dueño; no se commitean |
| Pendiente | Desplegar (migración `0040` al proyecto real + código) cuando se autorice. **Fuera de alcance, detectado de paso:** otras suites de `tests/db` limpian pagos por PostgREST e ignoran el error, así que su limpieza puede no estar ocurriendo. Lo de siempre: I-030, I-062, I-063, I-068, I-072, I-074, I-075, I-077, I-081, I-082, I-024 |
| Git | Rama `main`. Commit local de esta entrega; **sin push**. `Ventas por fecha.txt` y `prueba-abono.csv` siguen sin seguimiento |

## 1.a.0 Relevo anterior — Cabecera contextual al hacer scroll (2026-08-30)

| Campo | Estado |
|---|---|
| Resultado | **La cabecera fija de `AppShell` muestra título, flecha y un CTA** cuando el `PageHeader` sale de la vista. Sin segunda barra. Sin listener de `scroll`. `Query changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None`. **Ya en producción** |
| Archivos | **Nuevos:** `src/components/layout/compact-header.ts`, `CompactHeader.tsx`, `tests/unit/compact-header.test.ts`, `tests/e2e/cabecera-helpers.ts`, `cabecera-contextual.spec.ts`, `cabecera-contextual-movil.spec.ts`. **Tocados:** `AppShell`, `PageHeader`, `BackButton`, `globals.css`, páginas con CTA, `TicketActions`, `RaffleStatusActions`. Documentación: `DECISIONS` (D-150), `ARCHITECTURE` §8.20, `TESTING`, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una capa services.** `PageHeader` + `BackButton` + `AppShell`. El CTA se mueve con un portal (`CompactActionSlot`), no se clona. El observer mira el encabezado de la ruta y se limpia al desmontar |
| Decisiones | **D-150** (IntersectionObserver, contrato `compactAction`, portal, un solo `<h1>`, `z-40` intacto). No se inventó una fase |
| Verificación | `npm run verify` ✅ · lint **0 errores** (2 avisos de siempre) · **552/552** unitarias (+3) · `build` ✅ · `test:db` **631/631** · E2E de esta tanda **23/23** · suite E2E **392/394**, luego el locator de clientes **1/1** · `git diff --check` ✅. El «N» de Next en desarrollo tapa la flecha compacta: las pruebas usan un clic de DOM. El `(anulado)` del panel no entra en los 5 pagos más recientes tras el ciclo de 1.000 boletas: no es de este cambio |
| Advertencias | **1)** No clones el nodo `actions`. **2)** Una acción destructiva no sube. **3)** `CabeceraUsabilidad.txt` y `prueba-abono.csv` son del dueño; no se commitean |
| Pendiente | Verificación visual con sesión real (I-066) en un teléfono físico a 320 px: bajar en Boletas y en un detalle, comprobar título, flecha y CTA. Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063 |
| Publicación | **Desplegado el 2026-08-30 con autorización expresa. Sin migraciones.** CI **2/2** (`33346483650`). Vercel `READY` sobre **`d102108`** (despliegue GitHub `6173298089`, URL única `gestion-rifas-aqzfihhdk-jimmyriveros-projects.vercel.app`), alias `gestion-rifas.vercel.app`. En vivo: **6/6** cabeceras en `/login` (200, CSP con nonce), **4/4** rutas protegidas en 307 hacia `/login?next=…`, `/sw.js` en 200, **0** claves de servicio en 16 recursos (**1.077 KB**), identificador `6ca114ab2ccd` en `30b_k3xghd-tr.js`, y `--app-header-height` en `0v0ou74eo_3hk.css`. `/api/lottery/sync` sigue en **401** sin secreto |
| Git | Rama `main`, **`d102108`** empujado a `origin/main` y desplegado. `CabeceraUsabilidad.txt` y `prueba-abono.csv` siguen sin seguimiento |

## 1.a.0 Relevo anterior — Resultados oficiales de loterías, Etapa 6 (2026-08-30)

| Campo | Estado |
|---|---|
| Resultado | **Producción de resultados oficiales.** Migraciones `0036`–`0039` aplicadas al proyecto real. `vercel.json` declara los 10 jobs diarios de Hobby sobre `/api/lottery/sync`. El programador envía `CRON_SECRET`. El Panel sigue leyendo solo datos locales. `Query changes: None` · `Route changes: None` (la ruta ya existía) · `Migrations: 0036–0039 promovidas` · `New dependencies: None` |
| Archivos | **Tocados:** `vercel.json`, `features/lottery/cron-plan.ts`, `app/api/lottery/sync/route.ts`, `scripts/verify-remote.ts`, `tests/unit/lottery-cron.test.ts`, `tests/e2e/loterias-cron.spec.ts`, `.env.example`. Documentación: `DECISIONS` (D-149), `BUSINESS_RULES` (BR-L21), `ARCHITECTURE`, `DATA_MODEL`, `SECURITY`, `DEPLOYMENT`, `OPERATIONS`, `RUNBOOK`, `MASTER_SPEC`, `TESTING`, `KNOWN_ISSUES` (I-082), `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una capa services.** Los jobs salen de `cron-plan.ts`. El matching sigue en PostgreSQL. El Panel no importa el tick. `tickets_select` no se tocó |
| Decisiones | **D-149** (Hobby, no Pro; `CRON_SECRET` de Vercel; no un `LOTTERY_SYNC_SECRET` distinto). BR-L21. I-082 sigue como tope de precisión |
| Verificación | `npm run verify` ✅ · lint **0 errores** (2 avisos de siempre) · **549/549** unitarias · `build` ✅. Remoto: respaldo `2026-08-30-pre-0036` (`data.sql` **0** `"auth"`); `db push --dry-run` solo `0036`–`0039`; `db push --yes`; `verify:remote` **17/17**. Sonda de dinero **idéntica** antes y después: 818 boletas, 641 vendidas, 425 clientes, 244 pagos por $23.990.000, comisión $9.900.000, 3.135 filas de bitácora. Nacieron las tablas y RPC de loterías; `authenticated` **no** las ejecuta |
| Advertencias | **1)** No declares el job Pro (`*/15`) mientras el hosting pueda ser Hobby. **2)** No pongas `LOTTERY_SYNC_SECRET` distinto de `CRON_SECRET`. **3)** No llames `download*` ni `runLotterySyncTick` desde una página. **4)** No eludas Cloudflare/Imunify ni uses un agregador (I-081). **5)** `ResultadosLoterias.txt` es del dueño; no se commitea |
| Pendiente | Verificación visual con sesión real (I-066): Panel del dueño y del vendedor, recuadro de loterías. Hasta el primer tick puede ir vacío o con «Horario por confirmar». Cruz Roja y Bogotá pueden no confirmarse solas (I-081). Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063 |
| Publicación | **Desplegado el 2026-08-30 con autorización expresa, en el orden correcto: migraciones primero, frontend y cron después.** Respaldo previo en `Rifas-backups/2026-08-30-pre-0036/` (`data.sql` **0** `"auth"`). `db push` `0036`–`0039`; `verify:remote` **17/17**. CI **2/2** (`33338500944`). Vercel `READY` sobre **`325398c`** (despliegue GitHub `6171863601`, URL única `gestion-rifas-eqiehzqnk-jimmyriveros-projects.vercel.app`), alias `gestion-rifas.vercel.app`. En vivo: **6/6** cabeceras en `/login` (200), **4/4** rutas protegidas en 307, `/sw.js` en 200, **0** claves de servicio, identificador `eeb9d8e64d57` servido, y `/api/lottery/sync` responde **401** sin secreto (no redirige al login). El primer tick espera la ventana Hobby, no el despliegue |
| Git | Rama `main`, **`325398c`** empujado a `origin/main` y desplegado. `ResultadosLoterias.txt` y `prueba-abono.csv` siguen sin seguimiento |

## 1.a.0 Relevo anterior — Resultados oficiales de loterías, Etapa 5 (2026-08-30)

| Campo | Estado |
|---|---|
| Resultado | **Route Handler seguro y tick local, sin cron de producción.** `/api/lottery/sync` exige un secreto de servidor (Bearer o cabecera), comparado a tiempo constante. Falla cerrado. El proxy deja pasar la ruta. Un tick toma el cerrojo `0039`, sincroniza CNJSA como mucho una vez por día Bogotá, confirma resultados pendientes y suelta. Un segundo tick concurrente no descarga. `vercel.json` **no** declara `crons`. `Query changes: None` (el Panel no cambia) · `Route changes: +1 interno` · `Migrations: 0039` · `New dependencies: None`. **No está en producción** |
| Archivos | **Nuevos:** `supabase/migrations/0039_lottery_sync_lock.sql`, `src/features/lottery/{auth,cron-plan,job}.ts`, `src/app/api/lottery/sync/route.ts`, `scripts/lottery-sync.ts`, `tests/unit/lottery-cron.test.ts`, `tests/db/lottery-cron.test.ts`, `tests/e2e/loterias-cron.spec.ts`. **Tocados:** `lottery/{adapters,constants,publication,sync}.ts`, `lib/{rate-limit,supabase/admin,supabase/proxy}.ts`, `database.types.ts` (generado), `.env.example`, `package.json`. Documentación: `DECISIONS` (D-148), `BUSINESS_RULES` (BR-L21), `ARCHITECTURE`, `DATA_MODEL`, `SECURITY`, `MASTER_SPEC`, `TESTING`, `TEST_RESULTS`, `KNOWN_ISSUES` (I-082), `DEPLOYMENT`, `OPERATIONS`, `RUNBOOK`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una capa services.** `syncDueLotteryResults`, `applyLotterySchedule`, `createAdminClient`, `checkRateLimit`. El matching sigue en PostgreSQL. El Panel no importa el tick. `tickets_select` no se tocó |
| Decisiones | **D-148** (Vercel Cron previsto, no pg_cron; secreto; cerrojo de fila; no activar `crons` aún). BR-L21. I-082 |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (2 avisos de siempre) · **549/549** unitarias (+15) · `build` ✅ (ruta `/api/lottery/sync`) · **`test:db` 631/631** (+5) · E2E de esta tanda **4/4** · panel **3/3** · cobranza **4/4**. Primera `test:e2e` completa 354/371: volumen sucio de `test:db` + I-075. Tras `db:reset` + seed, las specs fallidas **77/78**; el 1 restante es `back-navigation` clientes (`.first()` pisa la tarjeta móvil de D-136), ajeno a esta etapa. Detalle en `TEST_RESULTS` |
| Advertencias | **1)** `0036`–`0039` siguen **solo local**. No `db push`, no cron, no secretos reales, no Etapa 6. **2)** No pongas `crons` en `vercel.json`: el próximo despliegue los encendería. **3)** No llames `download*` ni `runLotterySyncTick` desde una página. **4)** No eludas Cloudflare/Imunify ni uses un agregador. **5)** `ResultadosLoterias.txt` es del dueño; no se commitea |
| Pendiente | **Siguiente acción:** Etapa 6 — producción, con autorización expresa. Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063. I-081 se orquesta, no se «arregla» evadiendo. I-082 se elige Hobby vs Pro al activar |
| Publicación | **No.** Mantenimiento local. Prohibido push y producción |
| Git | Rama `main`, sobre `cf700de` (Etapa 4). Árbol con Route Handler, cerrojo y docs; `ResultadosLoterias.txt` y `prueba-abono.csv` siguen sin seguimiento |

## 1.a.0 Relevo anterior — Resultados oficiales de loterías, Etapa 4 (2026-08-30)

| Campo | Estado |
|---|---|
| Resultado | **Recuadro compartido de resultados oficiales en los dos Paneles, con lectura local.** Va después de los avisos y de instalar, antes del resto. El sorteo de hoy es el de `official_scheduled_at` en Bogotá, no el día nominal. Un resultado anterior se etiqueta «Último resultado» y no se pinta como el de hoy. Un fallo de esta lectura no tumba el Panel. `Query changes: +1 local (schedules+results+matches)` · `Route changes: None` · `Migrations: None` · `New dependencies: None`. **No hay cron, no está en producción** |
| Archivos | **Nuevos:** `src/features/lottery/{dashboard,queries}.ts`, `src/features/lottery/components/{LotteryResultsCard,LotteryScheduleBadge}.tsx`, `tests/unit/lottery-dashboard.test.ts`, `tests/e2e/loterias-panel.spec.ts`, `tests/e2e/loterias-panel-movil.spec.ts`. **Tocados:** los dos `dashboard/page.tsx`, `lib/dates.ts`, `tests/unit/dates.test.ts`, `tests/db/lottery-results.test.ts`. Documentación: `DECISIONS` (D-147), `BUSINESS_RULES` (BR-L20), `ARCHITECTURE` §8.19, `MASTER_SPEC`, `SECURITY`, `UX_COPY_GUIDELINES`, `TESTING`, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una capa services ni un recuadro por portal.** `Card`/`EmptyState`/`Badge`. Textos de cambio de programación reutilizan `notificationMessage` (D-146). Números con `ticketLabel`. La RLS de coincidencias no se tocó. `tickets_select` no se tocó. No se importan `fetch`/`sync`/`adapters` desde el Panel |
| Decisiones | **D-147** (lectura local; hoy = fecha oficial; el anterior va aparte; la serie se muestra si existe). BR-L20 |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (2 avisos de siempre) · **534/534** unitarias (+18) · `build` ✅ · **`test:db` 626/626** (+1) · E2E de esta tanda **4/4** · regresión del resumen de cobranza **4/4**. Detalle en `TEST_RESULTS` |
| Advertencias | **1)** `0036`–`0038` siguen **solo local**. No `db push`, no cron, no secretos, no Etapa 6. **2)** No llames `download*` ni `syncDueLotteryResults` desde una página. **3)** No eludas Cloudflare/Imunify ni uses un agregador. **4)** `ResultadosLoterias.txt` es del dueño; no se commitea |
| Pendiente | **Siguiente acción:** Etapa 5 — programador y Route Handler, todavía sin producción. Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063. I-081 se orquesta, no se «arregla» evadiendo |
| Publicación | **No.** Mantenimiento local. Prohibido push y producción |
| Git | Rama `main`, sobre `114c862` (Etapa 3). Árbol con recuadro del Panel y docs; `ResultadosLoterias.txt` y `prueba-abono.csv` siguen sin seguimiento |

## 1.a.1 Relevo anterior — Resultados oficiales de loterías, Etapa 3 (2026-08-30)

| Campo | Estado |
|---|---|
| Resultado | **Sincronización idempotente, matching real y avisos, todavía sin Panel ni cron.** Programación CNJSA se persiste conservando `reference_date` y `original_scheduled_at`. Un resultado confirmado dispara coincidencias set-based y avisos agregados en la misma transacción. Un vendedor sin coincidencias no recibe aviso. `Query changes: None` · `Route changes: None` · `Migrations: 0037, 0038` · `New dependencies: None`. **No hay cron, no hay Panel, no está en producción** |
| Archivos | **Nuevos:** `supabase/migrations/0037_lottery_sync.sql`, `0038_lottery_confirm_enum_cast.sql`, `src/features/lottery/{publication,sync}.ts`, `tests/unit/lottery-sync.test.ts`, `tests/unit/lottery-notifications.test.ts`, `tests/db/lottery-sync.test.ts`. **Tocados:** `lottery/{adapters,constants,sources}.ts`, `notifications/text.ts`, `database.types.ts` (generado), `tests/db/helpers.ts` (`randomNumbers` no emite `0100`). Documentación: `DECISIONS` (D-145, D-146), `BUSINESS_RULES` (BR-L18, BR-L19), `DATA_MODEL`, `SECURITY`, `ARCHITECTURE`, `MASTER_SPEC`, `TESTING`, `TEST_RESULTS`, `KNOWN_ISSUES` (I-081), `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una capa services.** RPCs `SECURITY DEFINER` como el matching de la Etapa 1. `notifications` y `text.ts` (D-093, I-030). Adaptadores de la Etapa 2. `tickets_select` no se tocó |
| Decisiones | **D-145** (escrituras en PostgreSQL, TypeScript orquesta, sin cron) · **D-146** (un aviso por sorteo y destinatario; frases con días, no con «hoy»). I-081: Cundinamarca JSON con sorteo conocido; Cruz Roja y Bogotá no se eluden |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (2 avisos de siempre) · **516/516** unitarias (+17) · `build` ✅ · **`test:db` 625/625** (+16). Primera pasada sucia: 8 fallos de `ticket-search` por un `0100` ajeno (I-035); `randomNumbers()` ya no emite ese ancla. E2E no se reejecutó: no hay UI. Detalle en `TEST_RESULTS` |
| Advertencias | **1)** `0036`–`0038` siguen **solo local**. No `db push`, no cron, no secretos, no Etapa 6. **2)** No llames `download*` ni `syncDueLotteryResults` desde una página: el Panel no consulta internet. **3)** No eludas Cloudflare/Imunify ni uses un agregador. **4)** `ResultadosLoterias.txt` es del dueño; no se commitea |
| Pendiente | **Siguiente acción:** Etapa 4 — recuadro del Panel, lectura local, sin cron de producción. Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063. I-081 se orquesta, no se «arregla» evadiendo |
| Publicación | **No.** Mantenimiento local. Prohibido push y producción |
| Git | Rama `main`, sobre `a0f2be6` (Etapa 2). Árbol con sync, avisos y docs; `ResultadosLoterias.txt` y `prueba-abono.csv` siguen sin seguimiento |

## 1.a.2 Relevo anterior — Resultados oficiales de loterías, Etapa 2 (2026-08-30)

| Campo | Estado |
|---|---|
| Resultado | **Adaptadores testeables de programación CNJSA y de resultados de las seis loterías, sin activar el flujo real.** Descarga HTTPS con allowlist (D-144). `reference_date` = día nominal de la misma semana lunes–domingo (D-143). Extraen sorteo, fecha, premio mayor y serie; conservan ceros; rechazan extraordinarios; fallan si la estructura cambió o el dato es ambiguo. `Query changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None`. **No hay cron, matching en vivo, avisos ni Panel** |
| Archivos | **Nuevos:** `src/features/lottery/{adapters,fetch,hash,sources,types,validate}.ts`, `src/features/lottery/parse/` (`zip`, `xlsx`, `html`, `excel-date`, `cnjsa-discovery`, `cnjsa-ordinarios`, `results`), `tests/fixtures/lottery/build-xlsx.ts`, `tests/unit/lottery-adapters.test.ts`, `tests/unit/lottery-fetch.test.ts`. Documentación: `DECISIONS` (D-143, D-144), `BUSINESS_RULES` (BR-L17), `SECURITY`, `ARCHITECTURE`, `MASTER_SPEC`, `TESTING`, `TEST_RESULTS`, `KNOWN_ISSUES` (I-081), `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una capa services ni librerías de Excel/HTML/PDF.** ZIP+XML propio. `server-only` en la descarga, como el resto de código de servidor. Constantes de la Etapa 1. `tickets_select` no se tocó. `notifications` no se escribe |
| Decisiones | **D-143** (fecha de referencia = día nominal de la misma semana) · **D-144** (allowlist, timeout, tope, redirecciones, descubrimiento CNJSA, parsers propios). I-081: Cundinamarca SPA, Cruz Roja Imunify, Bogotá Cloudflare |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (2 avisos de siempre) · **499/499** unitarias (+29) · `build` ✅ · **`test:db` 609/609**. E2E no se reejecutó: no hay UI. El xlsx oficial vigente (deflate, 98.970 bytes, 312 ordinarios) se parseó una vez fuera de la suite para revalidar los casos 2026; no se commitea. Detalle en `TEST_RESULTS` |
| Advertencias | **1)** `0036` sigue **solo local**. No `db push`, no cron, no secretos, no Etapa 6. **2)** No llames `downloadCnjsaDiscovery` / `downloadLotteryResultPage` desde una página: el Panel no consulta internet. **3)** No fijes un `idFile`. **4)** No eludas Cloudflare/Imunify ni uses un agregador. **5)** `ResultadosLoterias.txt` es del dueño; no se commitea |
| Pendiente | **Siguiente acción:** Etapa 3 — sincronización idempotente, matching real y avisos, todavía sin Panel ni cron de producción. Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063. I-081 hay que orquestarlo, no «arreglarlo» evadiendo |
| Publicación | **No.** Mantenimiento local. Prohibido push y producción |
| Git | Rama `main`, sobre `5c3748f` (Etapa 1). Árbol con adaptadores y docs; `ResultadosLoterias.txt` y `prueba-abono.csv` siguen sin seguimiento |

## 1.a.3 Relevo anterior — Resultados oficiales de loterías, Etapa 1 (2026-08-30)

| Campo | Estado |
|---|---|
| Resultado | **Contrato persistente de programación, resultado y coincidencias, con matching set-based en PostgreSQL.** Seis loterías ordinarias. Números como texto exacto (`0046` ≠ `46`). Vendida según `assigned_at` vs `official_scheduled_at`, no según el pago. Rifas elegibles: todas las `active`/`closed` cuya ventana cubre `reference_date` (D-140). Sin scraping, sin adaptadores, sin cron, sin Panel, sin avisos. `Query changes: None` (el Panel no lee esto aún) · `Route changes: None` · `Migrations: 0036` · `New dependencies: None`. **No se aplica a producción** |
| Archivos | **Nuevos:** `supabase/migrations/0036_lottery_results.sql`, `src/features/lottery/constants.ts`, `tests/db/lottery-results.test.ts`, `tests/unit/lottery-constants.test.ts`. **Tocados:** `src/types/database.types.ts` (generado), `tests/db/catalog.test.ts`. Documentación: `DECISIONS` (D-140..D-142), `BUSINESS_RULES` (BR-L01..BR-L16), `DATA_MODEL`, `SECURITY`, `ARCHITECTURE`, `MASTER_SPEC`, `UX_COPY_GUIDELINES`, `TESTING`, `TEST_RESULTS`, `KNOWN_ISSUES` (I-080), `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una capa services.** El matching es una RPC `SECURITY DEFINER`, como pagos y asignación. RLS con `current_org_ids` / `current_staff_org_ids` (I-019). `tickets_select` **no se tocó** (D-092, D-141). Notificaciones se reutilizarán en la Etapa 3; esta etapa no escribe `notifications`. Índices de `daily_number`/`weekly_number` de `0003` bastan |
| Decisiones | **D-140** (qué rifas participan) · **D-141** (programación nacional, coincidencias por org) · **D-142** (texto exacto, fotografía inmutable, vendida = `assigned_at`). I-080: no hay historial de inventario |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (2 avisos de siempre) · **470/470** unitarias (+5) · `build` ✅ · **`test:db` 609/609** (+22). E2E no se reejecutó: no hay UI. Detalle en `TEST_RESULTS` |
| Advertencias | **1)** `0036` es **solo local**. No `db push`, no cron, no secretos. La Etapa 6 exige autorización expresa. **2)** No metas `match_lottery_result` en la lista blanca de `authenticated` (I-078): es proceso interno. **3)** No amplíes `tickets_select` para pintar coincidencias. **4)** `ResultadosLoterias.txt` es del dueño; no se commitea |
| Pendiente | **Siguiente acción:** Etapa 2 — adaptadores de fuentes oficiales, con fixtures, sin activar el flujo real. Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063 |
| Publicación | **No.** Mantenimiento local. Prohibido push y producción |
| Git | Rama `main`, sobre `cb95b1c`. Árbol con `0036` y docs; `ResultadosLoterias.txt` y `prueba-abono.csv` siguen sin seguimiento |

## 1.a.0 Relevo anterior — Fecha ya no tapa Método en «Registrar abono» (2026-08-29)

| Campo | Estado |
|---|---|
| Resultado | **En iPhone, Android y la PWA, el campo Fecha de «Registrar abono» deja de montarse encima del desplegable Método.** Siguen en la misma fila al 50 % desde 360 px. El control nativo pasa a `appearance: none` y se le recorta el mínimo de los pseudoelementos de WebKit. Escritorio no cambia de aspecto. `Query changes: None` · `New API calls: None` · `Business logic changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None` |
| Archivos | **Tocados:** `src/app/globals.css` (regla de `input[type=date]`), `src/features/payments/components/PaymentForm.tsx` (`max-w-full` y comentario), `tests/e2e/abono-registrar-movil.spec.ts` (clava `appearance: none` y el corte a 360 px). Documentación: `DECISIONS` (D-139), `ARCHITECTURE` §8.18, `KNOWN_ISSUES` (I-079), `TESTING`, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni un componente nuevo.** La rejilla de D-138 se queda. El arreglo es del elemento `type=date`, no del formulario, para que filtros y rifas nuevas no hereden el mismo desborde el día que se estrechen |
| Decisiones | **D-139.** Lo no evidente: **(a)** el solapamiento no se ve al emular el teléfono desde el navegador de escritorio —Chromium respeta `width: 100 %`; WebKit iOS y Chrome Android pintan un `menulist-button`—; **(b)** `boundingBox()` de Playwright mide la caja de maquetación, no la tinta que el control pinta fuera, y por eso la prueba de D-138 pasaba; **(c)** no se apilan ni se sube el corte a `sm`: a 360 px sí caben una vez el control respeta el ancho |
| Verificación | `typecheck` ✅ · `lint` **0 errores** · **465/465** unitarias · E2E `abono-registrar-movil` **8/8**, incluida Fecha/Método a 360 px y `appearance: none`. `test:db` no aplica. Chromium no reproduce el desborde de tinta de iOS (I-079). Detalle en `TEST_RESULTS` |
| Advertencias | **1)** Playwright en Chromium **no reproduce** este fallo. Una prueba verde no demuestra que iOS esté bien; hay que mirarlo en un teléfono (I-066). **2)** No subas el corte de 360 px ni apiles Fecha y Método «para que quepan»: el diseño pide la fila y el arreglo es del control. **3)** `ErrorAbono.JPEG` es del dueño; no se commitea |
| Pendiente | **1)** Verificación visual con sesión real (I-066): vendedor → Registrar abono **en un iPhone o Android**, no en el inspector. Fecha y Método en la misma fila, sin solaparse, la fecha entera, el desplegable usable. Si la PWA ya estaba instalada, el aviso de versión nueva recarga al pulsarlo; no hace falta desinstalar. **2)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063 |
| Publicación | **Desplegado el 2026-08-29 con autorización expresa.** Vercel `READY` sobre **`a0bbc97`** (despliegue GitHub `6159052411`, URL única `gestion-rifas-eqx28941p-jimmyriveros-projects.vercel.app`), alias `gestion-rifas.vercel.app`. CI **2/2** (`33269749600`). **Sin migraciones**: `db push --dry-run` reportó *Remote database is up to date*, y `verify:remote` **14/14** después del despliegue. En vivo: **6/6** cabeceras en `/login` (200), **4/4** rutas protegidas en 307, `/sw.js` en 200, **0** claves de servicio en los 17 recursos (**1.101 KB**) y el identificador `d441b021c0eb` en 1 de ellos (`3z5-90me2a-p4.js`, I-069). **Y el arreglo concreto está servido:** la CSS de producción trae `webkit-date-and-time-value` (`1k4itgfx-g15g.css`), que en toda la aplicación solo genera este cambio |
| Git | Rama `main`, de `0e1c968` a **`a0bbc97`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-29 |

## 1.a.0 Relevo anterior — editar el precio de una boleta asignada (2026-08-29)

| Campo | Estado |
|---|---|
| Resultado | **El precio de venta de una boleta ya asignada se corrige en el mismo registro.** Desde el detalle (los dos portales) hay un icono junto al precio, un diálogo «Editar precio de venta» y `update_ticket_sale_price`, que reescribe `tickets.sale_price`. Saldo, estado y ganancia los recalculan los disparadores de siempre. Los abonos no se tocan. El precio de la rifa no se mueve. No se puede recargar ni dejar el precio por debajo de lo abonado. `Query changes: None` · `Route changes: None` · `Migrations: 0035` · `New dependencies: None` |
| Archivos | **Nuevos:** `supabase/migrations/0035_update_ticket_sale_price.sql`, `src/features/tickets/components/{EditSalePriceDialog,TicketSalePrice}.tsx`, `src/features/tickets/sale-price.ts`, `tests/db/sale-price-update.test.ts`, `tests/unit/sale-price.test.ts`, `tests/e2e/precio-venta-editar.spec.ts`, `tests/e2e/precio-venta-editar-movil.spec.ts`. **Tocados:** `tickets/{actions,schemas}.ts`, los dos `tickets/[ticketId]/page.tsx`, `database.types.ts`, `scripts/verify-remote.ts`, `tests/db/catalog.test.ts`. Documentación: `DECISIONS` (D-137), `BUSINESS_RULES` (BR-P13; BR-P05 y BR-P12 actualizadas), `ARCHITECTURE`, `DATA_MODEL`, `SECURITY`, `UX_COPY_GUIDELINES`, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una regla de dinero nueva.** El recálculo es la columna generada `payment_status`, el CHECK `tickets_paid_amount_range`, `tickets_sync_commission` y `ticket_sale_price_limits` de D-099. El diálogo reutiliza `MoneyInput`, `Dialog` y `mapPgError`. La acción sigue `authorizeAction` → Zod → RPC → `revalidatePath`. El icono es el mismo `PencilIcon` de editar un abono |
| Decisiones | **D-137.** Lo no evidente: **(a)** no hay recargo —el techo es el `base_price` congelado, no el precio vigente de la rifa—; **(b)** un precio menor que lo abonado se rechaza, no inventa saldo a favor; **(c)** el UPDATE directo con abonos sigue bloqueado, solo la RPC enciende un GUC de transacción; **(d)** el vendedor padre no edita las boletas de su equipo, porque tampoco puede asignarlas; **(e)** una boleta anterior a 0028 congela ahora su `base_price` al precio que ya tenía |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (el aviso de siempre) · **465/465** unitarias (+8) · `build` ✅ · **`test:db` 587/587** (+20) · E2E de esta tanda **5/5** · regresión del detalle **21/21**. Detalle en `TEST_RESULTS` |
| Advertencias | **1)** `0035` ya está en el proyecto real: es inmutable; cualquier corrección exige una migración nueva. **2)** No relajes `tickets_protect_sale_price` para todo el mundo: el personal tiene UPDATE sobre `tickets` y se saltaría el mínimo de rebaja. **3)** No uses esta RPC para recargar: el CHECK `sale_price <= base_price` y la validación lo impiden a propósito. **4)** `EditPriceBoleta.txt` es del dueño; no se commitea |
| Pendiente | **1)** Verificación visual con sesión real (I-066): vendedor → detalle de una boleta asignada → icono → guardar, y confirmar saldo, estado y rebaja. **2)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063 |
| Publicación | **Desplegado el 2026-08-29 con autorización expresa, en el orden correcto: migración primero, frontend después.** Respaldo previo en `Rifas-backups/2026-08-29-pre-0035/` (13 tablas, **0** `auth`, **0** credenciales); `db push --dry-run` solo `0035`; `db push --yes`; `verify:remote` **14/14**. **Comprobado que NO movió dinero**, leyendo la misma sonda antes y después: 739 boletas, 558 vendidas, 421 clientes, 157 pagos por $13.960.000, comisión $4.980.000 y 2.782 filas de bitácora, **idénticos**; lo único que cambió es que nació `update_ticket_sale_price` (`87093d71`, ejecutable por `authenticated`, no por `anon`). **6 sondas de comportamiento en verde** sobre el proyecto real, con jwt de un dueño real y **dentro de una transacción revertida**: rebajar $20.000 deja Sin pagar; el precio menor que lo abonado, el cero, el recargo y el `expected` viejo se rechazan redactados; el UPDATE directo con abonos sigue bloqueado. Se releyó la sonda de datos después: **nada quedó escrito**. CI **2/2** (`33258497272`). Vercel `READY` sobre **`0d6d7ea`** (despliegue GitHub `6156855666`), alias `gestion-rifas.vercel.app`, región `iad1`. En vivo: **6/6** cabeceras en `/login` (200), **4/4** rutas protegidas en 307, `/sw.js` en 200, **0** claves de servicio en los 16 recursos (**1.048 KB**) y el identificador `2ac42dbe11ea` en 1 de ellos (`1oq3bqxmv_n3q.js`, I-069) |
| Git | Rama `main`, de `cd91839` a **`0d6d7ea`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-29 |

## 1.a.0 Relevo anterior — clientes en tarjetas en el teléfono (2026-08-29)

| Campo | Estado |
|---|---|
| Resultado | **En el teléfono, «Mis clientes» (y «Clientes» del portal administrativo) son tarjetas**, no una tabla con scroll horizontal. Nombre a la izquierda, alias debajo, celular a la derecha, flecha al extremo, Boletas y Saldo en el pie. Toda la tarjeta abre el detalle. El título y **«Nuevo cliente»** comparten fila. Escritorio sigue siendo la tabla. `Query changes: None` · `New API calls: None` · `Business logic changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None` |
| Archivos | **Nuevos:** `src/features/clients/components/ClientCardList.tsx`, `ClientsList.tsx`, `tests/e2e/clientes-movil.spec.ts` (7). **Tocados:** `seller/clients/page.tsx` (`inlineActions` + `ClientsList`), `owner/clients/page.tsx` (`ClientsList`), `ClientFilters.tsx` (recuadro solo `md`, `touchSize`), `ClientsTable.tsx` (comentario). Pruebas ajustadas: `seller-clients.spec.ts` (+1, la tabla de escritorio), `owner-responsive.spec.ts` (+1, las tarjetas del administrativo). Documentación: `DECISIONS` (D-136), `ARCHITECTURE` §8.2 y **§8.17**, `UX_COPY_GUIDELINES` anexo B, `TESTING`, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **El mismo patrón de D-107.** `ClientsList` es a `ClientsTable` lo que `TicketsList` es a `TicketsTable`. Cabecera con `PageHeader inlineActions` (D-108). Buscador con `SearchInput touchSize`. Recuadro de filtros solo en escritorio, como `TicketFilters`. Clic y teclado con `row-activation.ts` y `RowLink`/`RowChevron`. Dinero con `formatCOP`. «Archivado» de `CLIENT_STATUS_LABELS`. `ClientLinkCard` **no** se reutilizó: es la fila del detalle de una boleta y lleva avatar |
| Decisiones | **D-136.** Lo no evidente: **(a)** quién elige la presentación es **Tailwind**, no `useIsCompactScreen()`; **(b)** cada cliente es una tarjeta suelta, no una fila de una lista continua —el diseño aprobado pide ese aire, distinto de `TicketCardList`; **(c)** `ClientsList` sustituye a `ClientsTable` en **los dos** portales, no solo en «Mis clientes»; **(d)** Comprado, Pagado y Estado no bajan a la tarjeta: el encargo no los pide |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (los 2 avisos de siempre) · **457/457** unitarias · `build` ✅ · E2E de clientes **22/22** (10 escritorio + 7 móviles nuevas + 5 de `owner-responsive`) · búsqueda híbrida **15/15** · ciclo del vendedor en el teléfono **5/5**. `test:db` no se reejecutó: no hay cambio de esquema ni de RPC. Capturas a 320, 375, 390, 430, 768 y 1.280 px: sin overflow horizontal; a partir de 768 se ve la tabla |
| Advertencias | **1)** **Las dos presentaciones están en el DOM a la vez.** `display:none` las saca del árbol de accesibilidad, así que `getByRole` solo ve la del viewport actual —pero `getByText` **no** filtra por visibilidad: en una prueba nueva, ancla por rol o acota con `getByRole('list', { name: 'Clientes' })`. **2)** El recorrido guiado busca `data-tour="data-table"` y descarta lo que mida 0 × 0: la marca va en el **envoltorio** `ClientsList`. **3)** `ClientsTable` sigue existiendo y **no cambió de columnas**, pero ya no se llama desde ninguna pantalla: solo desde `ClientsList`. **4)** `ClientLinkCard` no es esta lista: no le pongas el pie de Boletas/Saldo ni le quites el avatar «porque el listado no lo lleva» |
| Pendiente | **1)** Verificación visual con sesión real (I-066): vendedor → Clientes en el teléfono, abrir un cliente tocando el pie, buscar, incluir archivados. **2)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063 |
| Publicación | **Desplegado el 2026-08-29 con autorización expresa.** Vercel `READY` sobre **`dc97949`** (despliegue GitHub `6156383566`, alias `gestion-rifas.vercel.app`). CI **2/2** (`33256100419`). **Sin migraciones**, y `verify:remote` **14/14** después del despliegue. En vivo: **6/6** cabeceras en `/login` (200), **4/4** rutas protegidas en 307, `/sw.js` en 200, **0** claves de servicio en los 16 recursos (**1.073 KB**) y el identificador `13654f6048d5` en 1 de ellos (`3zl4uf39ju6ym.js`, I-069). **Y el rediseño concreto está servido:** la CSS de producción trae `.max-w-\[45\%\]{max-width:45%}`, que en toda la aplicación solo genera `ClientCardList` |
| Git | Rama `main`, de `bc4675a` a **`dc97949`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-29 |

## 1.a.0 Relevo anterior — volver al origen tras registrar un abono (2026-08-29)

| Campo | Estado |
|---|---|
| Resultado | **Quien registra un abono vuelve a la pantalla de la que vino**: boleta, cliente, «Mis pagos» o el panel. Cancelar, la flecha y una recarga usan el mismo origen. Un error no saca del formulario. Después de guardar, atrás no reabre el formulario ya enviado. `Query changes: None` · `Business logic changes: None` —la RPC no se tocó— · `Route changes: None` —se reutiliza `/seller/payments/new`— · `Migrations: None` · `New dependencies: None` |
| Archivos | **Tocados:** `payments/return-to.ts` (`from` + `paymentNewHref`), `PaymentForm.tsx` (`replace` siempre; Cancelar = D-089), `ClientPicker.tsx` (`replace` al elegir), `seller/payments/new/page.tsx` (`backHref` y `from`), los enlaces en detalle de boleta, ficha de cliente, «Mis pagos», `QuickActionsCard` y `RecentActivityCard`. **Pruebas:** `tests/unit/payment-return-to.test.ts`, `tests/e2e/payments.spec.ts`, `tests/e2e/abono-desde-boleta-movil.spec.ts`. Documentación: `DECISIONS` (D-135; vigencia en D-133 y D-089), `ARCHITECTURE` tabla de rutas y §8.6, `TESTING`, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni un formulario nuevo ni una ruta nueva.** Es el mismo `PaymentForm`, el mismo `createPayment` y la misma RPC. El origen viaja en la URL, que es como ya se elige el cliente. La flecha es `PageHeader backHref` (D-089). `replace` tras guardar es lo que D-133 ya hacía para la boleta, ahora en todos los orígenes |
| Decisiones | **D-135.** Lo no evidente: **(a)** `clientId` no identifica el origen —también está cuando se elige el cliente desde «Mis pagos»—, hace falta `from`; **(b)** `from` es allowlist, nunca un `returnTo` libre; **(c)** `ticketId` y `from` se separan: el primero es el reparto, el segundo el destino; **(d)** elegir cliente con `replace` saca el selector del historial; **(e)** el panel es un cuarto origen, no listado en el encargo |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (los 2 avisos de siempre) · **457/457** unitarias (+14) · `build` ✅ · `verify` ✅ · E2E de pagos **38/39** en la primera pasada, el fallo era afirmar `toBeDisabled` tras un `replace` ya hecho; aislado, **pasa**. `test:db` no se reejecutó: no hay cambio de esquema ni de RPC. Detalle en `TEST_RESULTS` |
| Advertencias | **1)** No aceptes un `returnTo` con URL completa. **2)** No uses `router.back()` como único destino: recarga y PWA se quedan sin historial interno. **3)** `PaymentForm` se usa solo en el portal del vendedor (D-054). **4)** `FlowRegistrarAbono.txt` y `prueba-abono.csv` son del dueño; no se commitean |
| Pendiente | **1)** Verificación visual con sesión real (I-066): vendedor → boleta, cliente y Pagos → registrar / cancelar / recargar. **2)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063 |
| Publicación | **Desplegado el 2026-08-29 con autorización expresa.** Vercel `READY` sobre **`f05c397`** (inspector `E7QRes6sHKdmhsRf8vYHYy9b1y9w`), alias `gestion-rifas.vercel.app`, región `iad1`. CI **2/2**. **Sin migraciones**: `db push --dry-run` reportó *Remote database is up to date*, y `verify:remote` **14/14** después del despliegue. En vivo: **6/6** cabeceras en `/login` (200), **4/4** rutas protegidas en 307, `/sw.js` en 200, **0** claves de servicio en los 16 recursos (**1.048 KB**) y el identificador `2276f1864055` en 1 de ellos (`2-8avwak8t_oj.js`, I-069) |
| Git | Rama `main`, de `385b921` a **`f05c397`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-29 |

## 1.a.0 Relevo anterior — editar el valor de un abono vigente (2026-08-28)

| Campo | Estado |
|---|---|
| Resultado | **Un abono vigente se corrige en el mismo registro.** Desde el historial de la boleta (y desde el detalle de un pago) hay «Editar», un diálogo «Editar abono» y `update_payment_allocation`, que reescribe esa asignación y el total del pago. Saldo, estado y ganancia los recalculan los disparadores de siempre. Un pago anulado no se toca. No se crea otro abono ni se puede cambiar de boleta. `Query changes: None` · `Route changes: None` · `Migrations: 0034` · `New dependencies: None` |
| Archivos | **Nuevos:** `supabase/migrations/0034_update_payment_allocation.sql`, `src/features/payments/components/EditPaymentDialog.tsx`, `tests/db/payment-update.test.ts`. **Tocados:** `payments/{actions,schemas}.ts`, `TicketPaymentsCard.tsx` (pasa a cliente), `PaymentDetailDialog.tsx`, los dos `tickets/[ticketId]/page.tsx`, `database.types.ts`, `scripts/verify-remote.ts`, `tests/db/catalog.test.ts`, `tests/unit/payment-status.test.ts`, `tests/e2e/payments.spec.ts`, `tests/e2e/abono-desde-boleta-movil.spec.ts`. Documentación: `DECISIONS` (D-134), `BUSINESS_RULES` (BR-F16), `ARCHITECTURE`, `DATA_MODEL`, `SECURITY`, `UX_COPY_GUIDELINES`, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una regla de dinero nueva.** El recálculo es `payment_allocations_recalc` → `recalc_ticket_paid_amount`, el estado es la columna generada, el tope es `tickets_paid_amount_range`, la ganancia es `tickets_sync_commission` y el cuadre es el constraint diferido de BR-F05. El diálogo reutiliza `MoneyInput`, `Dialog` y `mapPgError`. La acción sigue `authorizeAction` → Zod → RPC → `revalidatePayments` |
| Decisiones | **D-134.** Lo no evidente: **(a)** no hay aprobación ni liquidación de pagos, así que no se inventó un candado para esos estados; **(b)** el vendedor padre no edita los abonos de su equipo, porque tampoco puede registrarlos; **(c)** `p_expected_amount` evita que dos pantallas se pisen; **(d)** un pago a varias boletas se edita por línea; **(e)** D-013 no se revoca —un anulado sigue intocable—; **(f)** sigue sin haber política de UPDATE sobre `payment_allocations` |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (los 2 avisos de siempre) · **443/443** unitarias (+3) · `build` ✅ · **`test:db` 567/567** (+15) · E2E de pagos **29/30** en la primera pasada, el fallo era I-075 (`ECONNRESET` en un POST ajeno a la edición) y **pasa aislado**; las 5 pruebas nuevas de edición pasaron en esa misma corrida. Un error de lint encontrado y corregido (D-085), en `TEST_RESULTS` |
| Advertencias | **1)** `0034` debe ir **antes** que el frontend: sin la RPC, «Editar» responde un error genérico. **2)** No concedas UPDATE sobre `payment_allocations` a `authenticated`. **3)** No uses esta RPC para anular: el importe tiene que seguir siendo `> 0`. **4)** `Edición Abono.txt` y `prueba-abono.csv` son del dueño; no se commitean |
| Pendiente | **1)** Verificación visual con sesión real (I-066): vendedor → detalle de una boleta con abono → Editar → guardar, y confirmar saldo, estado e historial. **2)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063 |
| Publicación | **Desplegado el 2026-08-29 con autorización expresa, en el orden correcto: migración primero, frontend después.** Respaldo previo en `Rifas-backups/2026-08-28-pre-0034/` (13 tablas, **0** `auth`, **0** credenciales); `db push --dry-run` solo `0034`; `db push --yes`; `verify:remote` **14/14**. **Comprobado que NO movió dinero**, leyendo la misma sonda antes y después: 739 boletas, 556 vendidas, 420 clientes, 157 pagos por $13.960.000, comisión $4.980.000 y 2.772 filas de bitácora, **idénticos**; lo único que cambió es que nació `update_payment_allocation` (`043be2aa`, ejecutable por `authenticated`, no por `anon`). **4 sondas de comportamiento en verde** sobre el proyecto real, con jwt de un dueño real y **dentro de una transacción revertida**: subir $1.000 deja Abonada sin crear otro pago; el sobrepago, el cero y el `expected_amount` viejo se rechazan redactados. Se releyó la sonda de datos después: **nada quedó escrito**. CI **2/2**. Vercel `READY` sobre **`0b05fd9`** (inspector `Ah8Pdq4JGebk1Vo8UHPubqkgYAt5`), alias `gestion-rifas.vercel.app`, región `iad1`. En vivo: **6/6** cabeceras en `/login` (200), **4/4** rutas protegidas en 307, `/sw.js` en 200, **0** claves de servicio en los 26 recursos (**1.048 KB**) y el identificador `dddfeddf377c` en 1 de ellos (`20my4m3mdc0at.js`, I-069) |
| Git | Rama `main`, de `42a9bf4` a **`0b05fd9`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-29 |

## 1.a.0 Relevo anterior — volver al detalle de la boleta tras registrar un abono (2026-08-28)

| Campo | Estado |
|---|---|
| Resultado | **Quien registra un abono desde el detalle de una boleta vuelve a ESA boleta**, con abonado, saldo, estado e historial al día. Un error no saca del formulario. Los demás orígenes (ficha del cliente, «Mis pagos», panel) siguen yendo a `/seller/payments`. `Query changes: None` · `Business logic changes: None` —la RPC no se tocó; solo el orden de la *sugerencia* de reparto cuando hay origen (D-133, extiende D-052)— · `Route changes: None` —se reutiliza `/seller/tickets/[ticketId]` y `/seller/payments/new?ticketId=`— · `Migrations: None` · `New dependencies: None` |
| Archivos | **Nuevo:** `src/features/payments/return-to.ts`. **Tocados:** `seller/tickets/[ticketId]/page.tsx` (el enlace lleva `ticketId`), `seller/payments/new/page.tsx`, `PaymentForm.tsx`, `payments/actions.ts` (revalida el detalle), `payments/allocation.ts` (`preferTicketId`). **Pruebas:** `tests/unit/payment-return-to.test.ts`, ampliación de `payment-status.test.ts`, `tests/e2e/payments.spec.ts` (6 casos) y `tests/e2e/abono-desde-boleta-movil.spec.ts`. Documentación: `DECISIONS` (D-133), `ARCHITECTURE` tabla de rutas, `UX_COPY_GUIDELINES` anexo B, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni un formulario nuevo ni una ruta nueva.** Es el mismo `PaymentForm`, el mismo `createPayment` y la misma RPC. El origen viaja en la URL, que es como ya se elige el cliente. La revalidación del patrón `[ticketId]` copia la de `tickets/assign/actions.ts`. `replace` en vez de `push` es lo que ya hace `TeamMemberActions` cuando no debe quedar una pantalla intermedia en el historial |
| Decisiones | **D-133.** Lo no evidente: **(a)** un `?ticketId=` solo cuenta si esa boleta está en `listPayableTickets` de este cliente, o un id escrito a mano mandaría a cualquier sitio; **(b)** `router.replace` al volver a la boleta, `push` en los demás orígenes —un `push` deja Detalle → Formulario → Detalle y el gesto de atrás reabre el formulario; **(c)** la sugerencia de reparto cubre primero la boleta de origen, porque si no, con varias boletas el dinero cae en la primera de la tabla y al volver las cifras no han cambiado; **(d)** hay que revalidar el detalle por patrón *y* por ruta literal —revalidar `/seller/tickets` no alcanza a `[ticketId]` |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (los 2 avisos de siempre) · **440/440** unitarias (+8) · `build` ✅ · E2E de pagos **25/25** (24 escritorio + 1 móvil) tras corregir un localizador; `filas-seleccionables` **9/9** (el sospechoso del relevo anterior). Un error de prueba encontrado y corregido, en `TEST_RESULTS`. `test:db` no se reejecutó: no hay cambio de esquema ni de RPC |
| Advertencias | **1)** No cambies el destino de los flujos que *no* traen `ticketId`. **2)** No uses `router.back()` para volver a la boleta: en una pestaña nueva o una PWA abierta en el formulario no hay historial interno. **3)** `PaymentForm` se usa solo en el portal del vendedor (D-054). **4)** `Recarga.txt` y `prueba-abono.csv` son del dueño; no se commitean |
| Pendiente | **1)** Verificación visual con sesión real en producción (I-066): entrar como vendedor, abrir una boleta con saldo, registrar un abono y confirmar que vuelve a esa boleta con las cifras al día. **2)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-062, I-063 |
| Publicación | **Desplegado el 2026-08-28 con autorización expresa.** Vercel `READY` sobre **`4480a3a`** (inspector `G1eYJZY8veqNPshWdZQQvfnbszYD`), alias `gestion-rifas.vercel.app`, región `iad1`. CI **2/2**. **Sin migraciones**, y `verify:remote` **14/14** después del despliegue. En vivo: **6/6** cabeceras en `/login` (200), **4/4** rutas protegidas en 307, `/sw.js` en 200, **0** claves de servicio en los 18 recursos (**1.095 KB**) y el identificador `0929554862d1` en 1 de ellos (I-069) |
| Git | Rama `main`, de `fef47b6` a **`4480a3a`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-28 |

## 1.a.0 Relevo anterior — deuda de formato, y un diagnóstico mío que estaba mal (2026-08-28)

| Campo | Estado |
|---|---|
| Resultado | **16 archivos reformateados con Prettier. Cero cambios de comportamiento.** Salió de un error mío: al cerrar D-131 informé de que `BottomNav.tsx` «no cumple Prettier» y **no era cierto** — su contenido guardado estaba bien, lo que fallaba era el **fin de línea de la copia de trabajo** (CRLF, `core.autocrlf=true`). Al medirlo en serio: `format:check` reportaba **53** archivos, **37 solo por el fin de línea** y **16 con deuda real**. Se corrigieron esos 16. `Query changes: None` · `Business logic changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None` |
| Archivos | Los **16**: `owner/sellers/page.tsx`, `CollectionSummaryCard.tsx`, `ClientsTable.tsx`, `CommissionCard.tsx`, `notifications/queries.ts`, `ReportNav.tsx`, `AssignTicketsForm.tsx`, `TicketFilters.tsx`, `BulkActionDialog.tsx`, `BulkAssignDialog.tsx`, `TicketSelectionContext.tsx`, `db/notifications.test.ts`, `e2e/busqueda-hibrida.spec.ts`, `e2e/owner-tickets.spec.ts`, `e2e/seleccion-multiple.spec.ts`, `unit/ticket-selection.test.ts`. Documentación: `TESTING` **§2.0** (nueva) y `TEST_RESULTS` |
| Reutilización | No aplica: no hay código nuevo, solo el reflujo que impone `.prettierrc` |
| Decisiones | Sin `D-*`: no hay decisión de diseño. Sí dos cosas que conviene saber. **(a)** Quince de los 16 son **reflujo** —los mismos tokens en otras líneas—; el que no lo es, `ReportNav.tsx:49`, es el plugin de Tailwind **reordenando clases** dentro de la cadena, que no cambia lo que se ve —el orden del atributo `class` no decide qué regla gana— y deja la forma canónica que ya usaban `NavLinks`, `OptionList` y `Button`. Comprobado antes de aceptarlo que **ninguna prueba** afirma sobre esa cadena ni sobre un `className` literal. **(b)** Los **37 de fin de línea NO se tocaron**: normalizarlos exige `.gitattributes` y reescribir el repositorio entero, mucho ruido para algo que solo existe en el disco de quien programa (`TESTING` §2.0) |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (los 2 avisos de siempre) · **432/432** unitarias · `build` ✅ · **`test:db` 552/552** · **E2E 320/320** con base sembrada limpia. Importa que las suites pasen enteras porque **cuatro de los 16 son pruebas**, dos de ellas de selección múltiple |
| Advertencias | **1) HAY TRABAJO EN CURSO AJENO EN EL ÁRBOL, SIN COMMIT, Y NO SE SUBIÓ**: cuatro archivos de «registrar un abono desde la boleta y volver a ella» — `seller/payments/new/page.tsx`, `seller/tickets/[ticketId]/page.tsx`, `payments/actions.ts` y `PaymentForm.tsx` (85 líneas). Se apartó con `git stash` **solo para medir**, se devolvió intacto y hay copia de respaldo. **No es de este encargo; decide su dueño qué hacer con él.** **2) Ese trabajo en curso es el sospechoso de un fallo E2E** que apareció en la primera pasada (`filas-seleccionables.spec.ts:195`): toca justo la pantalla a la que navega esa prueba, y aislándolo la prueba pasa **10/10** sin él y **10/10** con solo el formato. **3) `format:check` no está en `verify` ni en el CI**, así que esto nunca rompió una construcción ni la romperá. **4) `git status` truncado con `head` fue lo que ocultó esos cuatro archivos**: no lo trunques cuando lo que buscas es «qué hay sin commit» |
| Pendiente | **1)** Decidir qué se hace con el trabajo en curso de los cuatro archivos de pagos. **2)** Si algún día molesta el ruido de `format:check`, el arreglo es `.gitattributes` con `* text=auto eol=lf`, en un cambio **propio** y no dentro de otro. **3)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-066, I-062, I-063 |
| Publicación | **Desplegado el 2026-08-28 con autorización expresa.** Vercel `READY` sobre **`e2b604a`** (`dpl_6BRay9N21Ypf7gEbpiAeKFfpjXuL`), alias `gestion-rifas.vercel.app`. CI **2/2**. **Sin migraciones**, y `verify:remote` **14/14** después del despliegue. En vivo: **6/6** cabeceras, **4/4** rutas protegidas en 307, **0** claves de servicio en los 16 recursos (**1.030 KB**) y el identificador `ad94db8e07ba` en 1 de ellos (I-069). El orden de clases de `ReportNav` **no se pudo comprobar servido**: vive en el JavaScript de reportes, tras el inicio de sesión |
| Git | Rama `main`, de `d6d19a7` a **`e2b604a`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-28 |

## 1.a.0 Relevo anterior — el menú se abre flotando donde no cabe (2026-08-28)

| Campo | Estado |
|---|---|
| Resultado | **Revocada D-131 §5, a petición del dueño y con razón** (D-132). Donde la barra no cabe abierta —por debajo de 1.360 px— el botón ya no se queda inerte: la abre **encima del contenido**, flotando, y el contenido **no se mueve ni un píxel** porque su hueco de 56 px se queda en el flujo. Se cierra sola por cinco caminos: elegir una opción, pulsar fuera, `Escape`, llevarse el foco fuera y volver a haber sitio. **No toca la preferencia guardada.** Todo lo demás de D-131 sigue igual. `Query changes: None` · `Business logic changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None`. **Ya en producción** (`1d12081`, 2026-08-28) |
| Archivos | **Tocados, cuatro de código**: `src/components/layout/AppSidebar.tsx` (la superposición entera), `src/components/layout/sidebar-preference.ts` (`isSidebarCollapsed` gana un tercer parámetro), `src/app/globals.css` (tercera posición del interruptor y las dos reglas de `sr-only`, que ahora se excluyen al flotar). **Pruebas**: `tests/unit/sidebar-preference.test.ts` (+3) y `tests/e2e/menu-lateral.spec.ts` (+6 nuevas, −1 retirada). Documentación: `DECISIONS` (**D-132**, y aviso en D-131 §5), `ARCHITECTURE` §8.16, `TESTING` §5.2, `UX_COPY_GUIDELINES` anexos A y B, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni un componente nuevo ni un menú nuevo.** Es el **mismo `<aside>`** con los mismos `navItems`: lo único que cambia es que sale del flujo. El cierre al elegir una opción sale de `onNavigate`, que `NavLinks` ya tenía desde D-106. Las cinco variables de `globals.css` son las de D-131, con una tercera declaración. **No se usó `Sheet`** aunque estaba disponible: habría metido la navegación en un portal y dejado **dos** `<nav>` en la página, uno anunciado como diálogo |
| Decisiones | **D-132.** Lo no evidente: **(a)** el hueco de 56 px en el flujo **no es decorativo** — sin él el contenido salta 56 px al abrir y otros 56 al cerrar, que es justo lo que se venía a evitar; **(b)** el selector `aside[data-sidebar-overlay]` lleva el nombre de etiqueta a propósito, porque `[data-sidebar='collapsed']` vive en el mismo elemento y empata en especificidad; **(c)** flotar **no escribe la cookie**: es un vistazo, no una forma de trabajar; **(d)** la capa **no es un diálogo** —sin `aria-modal` ni cepo de foco—, y lo que hacía falta de verdad, que el teclado no se quede detrás, lo resuelve el cierre por foco; **(e)** el botón conserva **dos** textos, no tres: la acción es la misma empuje o flote |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (los 2 avisos de siempre) · **432/432** unitarias (+3) · `build` ✅ · **`test:db` 552/552** · **E2E 320/320** con base sembrada limpia · **Medido en el navegador a 1.100 px**: la barra pasa a `fixed` con 208 px y alto de ventana, capa a `z-45` contra los `z-50` de la barra, nombres visibles, **cero desplazamiento horizontal** y `main` en **x = 56, ancho = 1.029 antes y después**. A 1.600 px, D-131 intacta: empuja (232 → 56) y guarda la cookie. **Un error de diagnóstico**, en `TEST_RESULTS` |
| Advertencias | **1) El panel del navegador no emite eventos de foco.** Es la tercera limitación del mismo panel en este trabajo, junto a `resize` y las transiciones congeladas: `focus()` cambia `document.activeElement` y **no dispara nada**, porque la ventana no tiene el foco del sistema. Costó dos reescrituras del cierre por foco antes de sondearlo. Lo que dependa de foco, `resize` o animación **se comprueba con Playwright**. **2) No fundas `data-sidebar` y `data-sidebar-overlay`**: el primero lleva la preferencia y lo lee el servidor; el segundo es estado de cliente y temporal. **3) No quites el hueco del flujo.** **4) No conviertas la capa en un diálogo.** **5)** La prueba del botón inerte **se retiró**: comprobaba un comportamiento que ya no existe |
| Publicación | **Desplegado el 2026-08-28 con autorización expresa.** Vercel `READY` sobre **`1d12081`** (`dpl_J1xFsPeirB6cgFdUWZoefysD5YaQ`), alias `gestion-rifas.vercel.app`, región `iad1`, build de **27 s**. CI **2/2**. **Sin migraciones**, y `verify:remote` **14/14** después del despliegue lo confirma. En vivo: las **6** cabeceras, **4** rutas protegidas en 307, **0** claves de servicio en los 16 recursos (**1.030 KB**) y consola limpia al cargar `/login`. **El código servido es este commit**, comprobado por dos caminos: el identificador `e25b8f1dda89` en 1 de los 16 fragmentos (I-069) y las tres huellas CSS que solo genera D-132 —`--sidebar-width-expanded`, `aside[data-sidebar-overlay]` y el `:not([data-sidebar-overlay])` de las reglas `sr-only`—, más la clase de la capa, `.z-[45]` |
| Pendiente | **1)** Verificación visual con sesión real, que un agente no hace en producción (I-066): estrechar la ventana por debajo de 1.360 px y abrir el menú flotante. **2)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `380be5c` a **`1d12081`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-28 |

## 1.a.0 Relevo anterior — la barra lateral se estrecha y se cierra sola (2026-08-28)

| Campo | Estado |
|---|---|
| Resultado | **La barra lateral dejó de ser un bloque de 256 px fijos** (D-131). Ahora tiene tres anchos: **232 px** desde 1.600, **de 208 a 232** entre 1.360 y 1.600 de forma continua, y **56 px —solo iconos—** por debajo de 1.360, sea porque la persona la cerró con el botón nuevo o porque no cabe. Los dos números están **medidos**, no elegidos. El teléfono **no cambia ni un píxel**: sigue mandando la barra inferior (D-106). `Query changes: None` · `Business logic changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None`. **Ya en producción** (`322d80a`, 2026-08-28) |
| Archivos | **Nuevos**: `src/components/layout/AppSidebar.tsx`, `src/components/layout/sidebar-preference.ts`, `tests/unit/sidebar-preference.test.ts` (9), `tests/e2e/menu-lateral.spec.ts` (10). **Tocados**: `src/app/globals.css` (las cinco variables y las dos reglas de `sr-only`), `src/components/layout/AppShell.tsx` (lee la cookie; deja de pintar el `<aside>`), `src/components/layout/NavLinks.tsx` (`collapsed`, globos y el aviso de carga en el sitio del icono). **Una prueba ajena ajustada**: `navegacion.spec.ts` fija su ventana en 1.440 px, **sin cambiar ninguna aserción**. Documentación: `DECISIONS` (**D-131**), `ARCHITECTURE` §8.1, §8.2 y **§8.16** (más dos notas de cifras que envejecieron, §8.7 y §8.13), `TESTING` §5.2, `UX_COPY_GUIDELINES` anexos A y B, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una librería nueva y ni un menú nuevo.** Las opciones salen de los mismos `navItems` de cada portal (D-106), la barra inferior y `isNavItemActive` no se tocan, el botón es el `Button` de la casa con `size="icon"`, y los globos usan el `Tooltip` de shadcn que **ya estaba en el repositorio sin que lo usara nadie**. El aviso de «se está abriendo» adopta el patrón que `BottomNav` ya usaba desde D-106: ocupar el sitio del icono. El almacenamiento de la preferencia sigue el patrón de `tour/storage.ts` en espíritu —una preferencia de interfaz, no un dato del negocio— pero en **cookie** y no en `localStorage`, y el porqué está en la fila de abajo |
| Decisiones | **D-131.** Lo no evidente: **(a)** lo que se VE lo decide el **CSS**, no React: cinco variables que se declaran dos veces —consulta de medios y `[data-sidebar='collapsed']`— y unas reglas que se escriben una sola vez; **(b)** por eso la preferencia va en **cookie leída en el servidor**: con `localStorage` habría un parpadeo en cada carga para quien la tuviera cerrada; **(c)** `data-sidebar` lleva **la preferencia**, nunca el estado efectivo; **(d)** la falta de sitio manda sobre la preferencia **en un solo sentido** y no la borra; **(e)** los nombres pasan a `sr-only`, no a `display:none`, para que cada enlace conserve su nombre; **(f)** el corte de **1.360 px** sale de la tabla más ancha de la aplicación (1.050 px medidos) más la barra abierta, el relleno y la barra de desplazamiento |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (los 2 avisos de siempre) · **429/429** unitarias (+9) · `build` ✅ · **`test:db` 552/552** · **E2E 315/315** (+10) con `db:reset` + `seed:local` antes · **Medido en el navegador en ocho anchos** (1.600 → 375): los tres anchos de la barra, ningún nombre partido ni recortado a 1.360 —el más apretado—, iconos y botón centrados **en 27,5 px** con la barra cerrada, y **cero desplazamiento horizontal** en todos. El hueco de la tabla del portal administrativo pasa de **705 a 905 px** a 1.024, y de 1.305 a **1.481** con la barra cerrada a mano. **Tres errores encontrados y corregidos**, en `TEST_RESULTS` |
| Advertencias | **1) El punto de corte vive en dos archivos** —la consulta de medios de `globals.css` y `SIDEBAR_MIN_EXPANDED`— y **tienen que decir lo mismo**; hay una prueba unitaria que lo vigila porque el CSS no se importa. **2) `data-sidebar` lleva la preferencia, nunca el estado efectivo**: ponerle el estado efectivo deja la barra clavada en 56 px al ensanchar la ventana, y ya pasó una vez en este mismo trabajo. **3) Tailwind 4 NO genera `justify-[…]` con valor arbitrario**: hay que escribir `[justify-content:var(--…)]`. La pista está en Prettier, que deja **al principio** del atributo las clases que no reconoce. **4) Si una tabla gana una columna, hay que volver a medir el corte**: 1.360 sale de que la más ancha pide 1.050. **5) La suite de escritorio corre a 1.280 px**, o sea **con la barra en modo iconos**; una prueba nueva que necesite verla abierta tiene que fijar su propia ventana. **6) Los cortes `xl`** del detalle de una boleta y del panel del vendedor se calcularon con la barra de 256 px y ahora sobra ancho: **no se revisaron**, a propósito |
| Publicación | **Desplegado el 2026-08-28 con autorización expresa.** Vercel `READY` sobre **`322d80a`** (`dpl_BXg8weHspbUPJAtiUbgSTVUUgE9r`), alias `gestion-rifas.vercel.app`, región `iad1`, build de **29 s**. CI **2/2**, incluido el job de migraciones desde cero. **Sin migraciones**: cero cambios bajo `supabase/`, así que la reversión es un Instant Rollback sin nada que deshacer en la base — y **`verify:remote` 14/14** después del despliegue lo confirma. En vivo: las **6** cabeceras de seguridad en `/login` (200), las **4** rutas protegidas en 307, **0** claves de servicio en los 16 recursos servidos (**1.029 KB**) y la consola **sin un solo error** al cargar `/login`. **El código servido es este commit**, comprobado por partida doble: el identificador de versión `12633e1a9961` aparece en 1 de los 16 fragmentos (método de I-069), y la hoja de estilos servida trae las **cinco** huellas que solo genera este cambio — `--sidebar-width: clamp(13rem, calc(10vw + 4.5rem), 14.5rem)`, la consulta de medios de 85rem (minificada como `@media not all and (min-width:85rem)`), `[data-sidebar=collapsed]`, `sidebar-label` y `motion-reduce:transition-none` |
| Pendiente | **1)** Verificación visual con sesión real, que un agente no hace en producción (I-066): entrar, abrir y cerrar la barra y mirar «Boletas» en una ventana de portátil. **2)** El paso del recorrido guiado que explica la barra lateral apunta a un carril de iconos cuando la ventana es estrecha; el texto sigue siendo cierto y **no se tocó**. **3)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `8809c35` a **`322d80a`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-28 |

## 1.a.0 Relevo anterior — el dinero de cada boleta se ve en la lista (2026-08-27)

| Campo | Estado |
|---|---|
| Resultado | **Para saber cuánto le faltaba por cobrar a una boleta había que abrirla.** Ya no (D-130). Las dos pantallas que listan boletas enseñan **abonado, falta y avance** en la propia fila, con su barra y su porcentaje. Son **dos diseños distintos a propósito**: «Mis boletas» sigue siendo densa —fila de 57 px, cifras de 14 px— y «Boletas de este cliente» pasa a tener **su propia lista**, con cifras grandes y el «de $120.000» debajo. Los dos números se funden en **una** columna, «Boleta», con la leyenda «Diario · Semanal» debajo, que es lo que paga el ancho de las tres columnas nuevas. **Ya en producción** (`6ff1a8f` y `599a3b6`, 2026-08-27) |
| Archivos | **Sin migración.** Nuevos: `features/tickets/financials.ts`, `features/tickets/components/TicketNumbers.tsx`, `ClientTicketsList.tsx`, `ClientTicketsTable.tsx`, `ClientTicketCardList.tsx`, `components/data/PaymentProgressBar.tsx`, `components/data/RowChevron.tsx`, `tests/unit/ticket-financials.test.ts` (11) y `tests/e2e/boletas-financiero.spec.ts` (7). Tocados: `components/data/DataTable.tsx` (`meta.showFrom`), `features/tickets/components/TicketsTable.tsx`, `TicketCardList.tsx`, `TicketsList.tsx`, `TicketPaymentSummary.tsx`, y los dos `clients/[clientId]/page.tsx`. Pruebas ajustadas: `boletas-movil.spec.ts` (+1 y dos topes), `back-navigation`, `boleta-cliente`, `owner-responsive`, `seleccion-multiple`, `seller-tickets`. Documentación: `DECISIONS` (**D-130**), `ARCHITECTURE` §8.9 y §8.14.b, `UX_COPY_GUIDELINES` anexos A y B, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una consulta nueva y ni una regla de dinero nueva.** `listTickets` ya devolvía `sale_price` y `paid_amount`; `paid_amount` lo mantiene la base al registrar o anular un pago (BR-F08). `ticketFinancials()` **reutiliza `calculateCollectionSummary`**, la del panel, y pasa a ser la fuente de **las cuatro** presentaciones con dinero de una boleta —incluido `TicketPaymentSummary`, que antes hacía la división por su cuenta—. Se comparten además `PaymentStatusBadge`, `formatCOP`, `row-activation.ts` y `useLongPress`; lo nuevo es la barra lineal (`PaymentProgressBar`, hermana de `ProgressRing`) y la celda de los dos números |
| Decisiones | **D-130.** Lo no evidente: **(a)** dos pantallas, **dos** componentes de fila: un componente único obligaría a elegir una densidad y estropear la otra; **(b)** `meta.showFrom` **manda sobre** `hideOnMobile` —juntos se pisaban y una columna no desaparecía nunca—; **(c)** las columnas de dinero se ordenan por la **cifra** (`accessorFn`), no por el texto formateado, o «$1.000.000» quedaría antes que «$90.000»; **(d)** el nombre del cliente se **recorta** en la tabla: las celdas llevan `whitespace-nowrap` y uno largo se llevaba 409 px de ancho mínimo (la trampa de D-125); **(e)** una boleta sin vender escribe **«—»**, no «$0» |
| Verificación | **Medido en el navegador, no estimado**, con la aplicación corriendo contra la base local y en seis anchos (375, 768, 900, 1280, 1440 y 1600 px): a 1.280 px la tabla mide **959 px en 959 de hueco** en los dos portales, sin desbordar. **11** pruebas unitarias nuevas de `ticketFinancials` y **7** E2E nuevas que comparan la MISMA boleta en las dos pantallas. `typecheck` ✅ · `lint` 0 errores (los 2 avisos de siempre) · `build` ✅ · unitarias **420/420** · `test:db` **552/552** · **E2E 305/305** con base sembrada limpia. **Tres errores míos encontrados y corregidos** —la tabla desbordaba 261 px porque un nombre de cliente largo se llevaba 409 px (la trampa de D-125); `showFrom` y `hideOnMobile` se pisaban y «Rifa» no desaparecía nunca; y `getByRole('columnheader', { name: 'Boleta' })` sin `exact` encontraba tres encabezados— y **dos pruebas ajenas ajustadas**: `filas-seleccionables` pulsaba el número semanal como texto suelto, y `reports` se quedaba sin su pago anulado entre los cinco recientes. Todo en `TEST_RESULTS` |
| Advertencias | **1)** Se **eliminó** la prop `showClient` de `TicketsList`, `TicketsTable` y `TicketCardList`: era el interruptor con el que la ficha del cliente reutilizaba la lista larga, y esa ficha ahora tiene la suya. **2)** La tarjeta del teléfono de «Mis boletas» pasó de ~115 px a **166 px** cuando la boleta está vendida; los topes de `boletas-movil.spec.ts` suben de 130 a **180** y de 400 a **560**. Es la densidad que cuesta el pie financiero, y está decidido a propósito. **3)** Si añades una columna a `TicketsTable`, **mide el ancho**: a 1.280 px la tabla está exactamente en el límite, y el siguiente sobrante tendrá que ganarse su `showFrom`. **4)** No toques las reglas de qué abono cuenta: eso lo decide SQL y esta capa solo lo pinta |
| Publicación | **Desplegado el 2026-08-27 con autorización expresa.** **Sin migración**: cero cambios bajo `supabase/`, así que la reversión es un Instant Rollback sin nada que deshacer en la base — y `verify:remote` **14/14** lo confirma después del despliegue. Vercel `READY` sobre **`6ff1a8f`** (`dpl_3tho7E21GFLiSzG82mLoiKATQD3C`), build de **31 s**, alias `gestion-rifas.vercel.app`. **Que el código servido es este commit** quedó probado con el método de I-069: el identificador de versión `93deb8b4a32d` —sha256 del commit recortado a 12 hex— aparece en 1 de los 15 fragmentos servidos. En vivo: las **6** cabeceras de seguridad en `/login` (200), **4** rutas protegidas en 307 y **0** claves de servicio en los 15 fragmentos. **Dos ajustes posteriores, pedidos al verlo en producción y desplegados el mismo día** (`599a3b6`): el pie de la tarjeta pasa a una rejilla para que «Falta» arranque siempre en el mismo punto —con anchos por contenido bailaba unos 20 px entre tarjetas—, y «Progreso» se centra en su columna con `px-2` propio, que sube su separación con «Falta» de 16 a 31 px. Lo paga la barra, que baja a 56 px hasta `2xl` porque a 1.280 px la tabla del portal administrativo no tenía un píxel de sobra. |
| Pendiente | **1)** Verificación visual con sesión real en producción, que un agente no hace: entrar como vendedor y mirar «Mis boletas» y la ficha de un cliente. **2)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `b85dbf1` a **`599a3b6`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-27 |
## 1.a.0 Relevo anterior — la columna «Abono» del importador (2026-08-27)

| Campo | Estado |
|---|---|
| Resultado | **La columna «Abono» del importador, que llevaba seis relevos aplazada, está hecha** (BR-N14, D-129). Una fila del CSV o del JSON puede traer lo ya cobrado de esa boleta —«20», «20.000», «20000» o **«Cancelado»**— y al confirmar queda registrado como un **abono de verdad**: fila en `payments`, fila en `payment_allocations`, saldo y estado derivados por la base de datos. **Además**, el JSON pasa a aceptar las claves escritas como los encabezados del CSV («Premio semanal», «Nombre», «Abono»), que es como las escribe el dueño. **Ya en producción** (`7509f3e`, 2026-08-27) |
| Archivos | Migración **`0033_ticket_import_abono.sql`**. Nuevos: `features/tickets/import/abono.ts` y `tests/unit/ticket-import-abono.test.ts` (33). Tocados: en `features/tickets/import/` → `columns.ts`, `rows.ts`, `json.ts` (reescrito), `review.ts`, `schemas.ts`, `actions.ts`, `sample.ts` y los cuatro componentes; `features/tickets/bulk/components/BulkTicketCreator.tsx`, `features/tickets/seller/components/SellerTicketForm.tsx` y sus dos `page.tsx`. Pruebas: `tests/db/ticket-import.test.ts` (+7), `tests/e2e/importar-boletas.spec.ts` (+1), `tests/unit/ticket-import.test.ts` (una firma). Documentación: `BUSINESS_RULES` (BR-N14 y BR-N12 actualizada), `DECISIONS` (**D-129**), `UX_COPY_GUIDELINES` anexos A y B, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni una regla de dinero nueva.** El abono lo registra **`create_payment`**, la misma función del formulario manual, llamada desde dentro de `import_tickets_with_clients` igual que ya se llamaba a `assign_ticket_row`. De ahí salen solos el recálculo de `paid_amount`, el estado de pago (BR-F07), el tope de sobrepago (BR-F12), la comisión y la bitácora. La RPC es un **`create or replace` de la misma firma**: no hay contrato nuevo. El JSON **perdió** su lista de alias paralela y usa la del CSV (`matchJsonKey`) |
| Decisiones | **D-129.** Lo no evidente: **(a)** el corte entre «miles» y «pesos» es **`ticket_price / 1000` calculado**, no un 120 escrito, y hay una prueba con cada precio ($120.000 y $50.000) para que atarlo otra vez a una cifra falle; **(b)** **un pago por fila**, no uno por cliente: el historial es lo que el vendedor le enseña al cliente cuando reclama; **(c)** sin precio conocido **no se inventa** uno —nada de caer en `DEFAULT_TICKET_PRICE`—, se marca la fila; **(d)** los `case` de la validación SQL **no son adorno**: PostgreSQL no garantiza el orden de evaluación de un `and`, y un `::numeric` sin proteger revienta con «cannot cast jsonb string» ante un «Abono: hola» (hay una prueba que lo fija) |
| Verificación | **552/552** de base de datos (+7) · **409/409** unitarias (+33) · `typecheck` ✅ · `lint` **0 errores** (los 2 avisos de siempre) · `build` ✅ · **E2E completa con base sembrada limpia**, incluida una prueba nueva de extremo a extremo que comprueba el estado de las tres boletas **y** que existen los dos pagos con su asignación. Las 33 pruebas del importador anterior **pasan sin tocarse**, que es la red que demuestra que el formato viejo no cambió. Un error encontrado y corregido, en `TEST_RESULTS` |
| Advertencias | **1) `0033` debe ir ANTES que el frontend.** Sin ella la clave `abono` se ignora **en silencio** y las boletas entran sin sus pagos, que es la peor de las dos formas de fallar. **2) Lo que NO se cambió, a propósito:** un cliente que ya existe sigue exigiendo **nombre + celular** para reutilizarse (D-087) —el encargo pedía a la vez «reutilízalo» y «no sobrescribas su nombre», y con el celular igual y el nombre distinto no se pueden cumplir las dos—; y los números siguen siendo de **1 a 4 dígitos**, no de exactamente 4 (BR-N02, `CLAUDE.md` §13, y hay boletas vivas con «46»). **3) Caso límite real:** entre el corte (120) y la primera cifra realista en pesos (20.000) un número se lee literalmente — «500» son quinientos pesos. Es la regla del encargo tal cual, y lo atrapa la vista previa, que enseña el importe ya convertido. **4)** El abono va en la **misma vuelta del bucle** que la asignación: no lo separes, o se podrá cobrar una boleta que no se asignó |
| Publicación | **Desplegado el 2026-08-27 con autorización expresa, en el orden correcto: migración primero, frontend después.** Respaldo previo en `Rifas-backups/2026-08-27-pre-0033/` (13 tablas, **0** `auth`, **0** credenciales); `db push --dry-run` solo `0033`; `db push --yes`; `verify:remote` **14/14**. **Comprobado que NO movió dinero**, leyendo la misma sonda antes y después: 121 boletas, 58 vendidas, 46 clientes, 3 pagos por $320.000 y 608 filas de bitácora, **idénticos**; lo único que cambió es la huella de la función (`9727c72d` → `6c2c499c`). **10 sondas de comportamiento en verde** sobre el proyecto real, asumiendo el rol `authenticated` con `request.jwt.claims` y **dentro de una transacción revertida**: el abono queda como pago + asignación con método «Efectivo» y su nota, los tres estados salen `partial`/`paid`/`unpaid`, la cancelada queda a saldo cero, y los cuatro rechazos llegan redactados —incluido el abono **como texto**, que no revienta el cast—. Se releyó la sonda de datos después: **nada quedó escrito**. CI **2/2** (incluida «migraciones desde cero»). Vercel `READY` sobre **`7509f3ec`** (`dpl_27XFZL3pkEASQrJQ42jp7vCoFDuF`), alias `gestion-rifas.vercel.app`, build de 30 s; en vivo las **6** cabeceras, 4 rutas protegidas en 307, **0** claves de servicio en 15 fragmentos y el **identificador de versión** `097588a4cf29` encontrado en 1 de ellos (método de I-069) |
| Pendiente | **1)** Verificación visual con sesión real en producción, que un agente no hace: subir un archivo con la columna «Abono» y mirar la vista previa. **2)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `66d1b50` a **`7509f3e`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-27 |

## 1.a.0 Relevo anterior — I-078: las funciones internas dejan de ser ejecutables desde una sesión (2026-08-27)

| Campo | Estado |
|---|---|
| Resultado | **Cerrado I-078, que resultó ser más grande y más viejo de lo que parecía al abrirlo.** No eran las seis funciones del motor de comisión: eran **34** —los 23 disparadores, el motor entero y ayudantes como `write_audit_log` y `notify_profiles`—, y no vivían desde `0024` sino desde la **Fase 2**. **La causa no es de las comisiones, es del privilegio POR DEFECTO**: los defaults de `postgres` para las funciones de `public` difieren entre entornos (local `{postgres=X/postgres}`, producción `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`), y `0015` revocó `anon` y `public` del default pero nunca `authenticated`. **⚠️ `0032` NO desplegada** |
| Archivos | Migración **`0032_internal_function_grants.sql`**; `scripts/verify-remote.ts` (comprobación nueva), `tests/db/catalog.test.ts` (invariante gemela, +1 prueba). Documentación: `DECISIONS` (**D-128**), `SECURITY` §4.5, `KNOWN_ISSUES` (I-078 cerrado), `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | Ni una función nueva. La comprobación de `verify-remote.ts` es la **gemela** de la que ya existía para `anon` (la que destapó I-020), con la misma forma y la misma exclusión de funciones de extensión; la de `catalog.test.ts`, igual |
| Decisiones | **D-128.** Lo no evidente: **(a)** se arregla **el default** además de las 34, porque sin eso la próxima migración recrea el problema; **(b)** `service_role` conserva todo, también en el default —es el rol de la reparación operativa que `0024` habilita a propósito—; **(c)** las 34 van **una por una con su firma**, nunca `revoke … on all functions`: un `revoke` no distingue de dónde vino el privilegio y se habría llevado los `grant` explícitos de las 26 RPC, dejando producción en «permission denied» |
| Verificación | **Por experimento, porque una prueba local que pasa no demuestra nada aquí:** se **reprodujo la condición de producción** en local, la prueba nueva **falló listando exactamente las 34**, se aplicó `0032` y el default volvió a `{postgres=X/postgres}`. Sobre ese estado: **545/545** de base de datos (+1). Pasada definitiva con base sembrada limpia: **E2E 296/296** en 14,8 min y `verify` en verde, todas con sesiones reales. Comprobado antes de escribir que la divergencia es de **34 funciones en un solo sentido, cero en el contrario**, y que las **26 RPC** del código no aparecen en la lista (intersección vacía). **Tres fallos E2E en la primera pasada, ninguno de este cambio** y todos diagnosticados uno a uno en `TEST_RESULTS`: uno de contaminación de datos (`test:db` tres veces sin resembrar) y dos de **I-075** |
| Advertencias | **1) La prueba de `catalog.test.ts` PASARÍA IGUAL SI EL PROBLEMA VOLVIERA**, y está escrito en su cabecera: en local la condición no se da. **La que cierra esto de verdad es la de `verify-remote.ts`**, porque es la única que mira el proyecto real. Si tocas la lista blanca, tócala en **los dos sitios**. **2) REGLA NUEVA:** una función que la aplicación deba poder llamar necesita su `grant execute … to authenticated` **explícito** (`SECURITY.md` §4.5). Ya era así en local; tras desplegar, también en producción. **3)** No revoques `service_role`: `0024` se apoya en él para poder recalcular una comisión a mano. **4)** Las funciones de **disparador no necesitan `EXECUTE`** para dispararse —PostgreSQL comprueba el permiso sobre la tabla—; lo demuestra local, donde llevan así desde el principio |
| Publicación | **Desplegado el 2026-08-27 con autorización expresa.** Respaldo en `Rifas-backups/2026-08-27-pre-0032/` (13 tablas, **0** `auth`, **0** credenciales); `db push --dry-run` solo `0032`; `db push --yes`; **`verify:remote` 14/14** con la comprobación nueva. En el proyecto real: el default pasó de `{…,authenticated=X/postgres,service_role=…}` a `{postgres=X/postgres,service_role=X/postgres}`, y las funciones internas expuestas de **34 a 0**, con las 26 RPC, las 7 de políticas y las de columnas generadas **intactas**. **Y se comprobó que la aplicación sigue funcionando**, no solo el catálogo: asumiendo el rol `authenticated` con `request.jwt.claims` como hace PostgREST, con **dos usuarios reales** y en **transacciones revertidas** — los `select` con RLS y las seis RPC de lectura en verde, y `write_audit_log` y `recalc_seller_commission` respondiendo ya «permission denied for function». El commit no toca ni una línea de la aplicación (solo `scripts/`, `tests/` y `docs/`) |
| Pendiente | Nada de este trabajo. Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `0891edc` a **`f23a50c`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-27 |

## 1.a.0 Relevo anterior — el equipo reparte una sola mitad (2026-08-27)

| Campo | Estado |
|---|---|
| Resultado | **Dos reglas, y la segunda solo existe por la primera.** (a) **El vendedor padre cobra por las ventas de su equipo** (BR-G20): cada boleta cobrada deja a la empresa la mitad de su precio, la venda quien la venda, y la otra mitad se reparte —el integrante toma su tarifa y el padre se queda con el resto—. Antes el padre ganaba **$0** por su equipo y esa ganancia salía de la empresa. (b) **El padre elige cómo pagarle a cada integrante**: por tramos (lo de siempre, y el valor por defecto) o una **cifra fija por boleta**, topada en la mitad del precio porque sale de su propio bolsillo (BR-G23, BR-G24). **⚠️ NO desplegado: cambia lo que se le debe a la gente** |
| Archivos | Migración **`0031_team_commission.sql`**. Nuevos: `features/team/components/CommissionModelField.tsx`, `TeamCommissionDialog.tsx`, `TeamCommissionCard.tsx`, y **`tests/db/team-commission.test.ts` (26, E10-01..E10-26)**. Tocados: `features/commissions/queries.ts`, `features/team/{actions,schemas,queries}.ts`, `features/users/{invite,queries}.ts` y `components/UserDialog.tsx`, `features/dashboard/components/SellerKpis.tsx`, `lib/constants.ts`, las tres pantallas del vendedor (panel, «Mi equipo» y la ficha del integrante), `types/database.types.ts`, `tests/db/sale-discount.test.ts`. Documentación: `BUSINESS_RULES` (BR-G20..BR-G26, y BR-G13/G18/G19 actualizadas), `DECISIONS` (**D-127**), `DATA_MODEL`, `TESTING` §4.3, `TEST_RESULTS`, `UX_COPY_GUIDELINES` anexos A y B, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **El motor no cambió de principio** (D-094): sigue siendo `n × tarifa` **recontado**, nunca una suma de eventos, así que la idempotencia y el recálculo retroactivo salen gratis para el bloque nuevo igual que para el viejo. La autorización es **`team_member_guard`** (0026) sin tocar: la misma puerta que corregir y eliminar a un integrante. El formulario de alta es **el mismo** `UserDialog` con una sección opcional, no uno nuevo. El campo de dinero es `MoneyInput`, y los estados visuales de las tarjetas copian la regla de `OptionList` (excluyentes, nunca acumulables) |
| Decisiones | **D-127**, y su parte importante **la decidió el dueño a mitad del encargo**: el archivo pedía solo elegir el modelo, y al preguntar de qué bolsillo salía el dinero del integrante contestó «del vendedor padre». Eso convirtió un ajuste de formulario en un cambio del reparto. El tope (la mitad del precio) también se preguntó y se eligió sobre otras dos opciones |
| Verificación | **544/544** de base de datos (+26) · **376/376** unitarias · `typecheck` ✅ · `lint` **0 errores** · `build` ✅ · **Verificado en el navegador con sesión real**: tarjetas con los tramos leídos de `commission_tiers`, tope «$60.000» correcto, `ArrowUp` cambia la selección y oculta el campo, diálogo de 326×694 sin desbordamiento a 375 px, el tope del servidor llega redactado, la bitácora guarda modelo e importe anterior y nuevo, y el intento rechazado **no deja fila** (la transacción revierte). **Tres errores** encontrados, dos de ellos reales, en `TEST_RESULTS.md` |
| Advertencias | **1) `0031` NO está en producción, y desplegarla MUEVE DINERO**: su bucle final recalcula y a partir de ahí cada vendedor padre cobra por su equipo. Necesita autorización, respaldo y su ventana. **2) La ganancia del padre BAJA cuando su integrante sube de tramo**, y no es un error: el tramo es retroactivo, así que `mitad − tarifa` cae en **todas** las boletas a la vez (E10-04, E10-07). **3) Un `CHECK` se cumple cuando su resultado es NULL.** `fixed_commission_amount > 0` con la columna nula vale NULL, no falso: por eso la restricción lleva un `is not null` que **parece** redundante y no lo es. **4) `team_movement` y `from_seller_id` son dos columnas a propósito**: marcar el movimiento de equipo solo con la segunda deja sin marcar el caso en que cambian todos los integrantes a la vez (un cambio de precio), y esas filas se cuentan como propias. **5) No conviertas la cascada en un bucle sobre los integrantes**: el motor se llama a sí mismo sobre el vendedor padre al final, con `p_team_source` de freno, y así ningún camino puede olvidarse de actualizarlo. El orden de los cerrojos es **siempre integrante antes que padre**. **6) `commission_summary` gana `pay_model` con tres valores**: `by_tiers` se conserva porque es la condición que habilita hablar de niveles, y ahora es verdadero **solo** con `tiered` |
| Publicación | **Desplegado el 2026-08-27 con autorización expresa.** Respaldo previo en `Rifas-backups/2026-08-27-pre-0031/` (13 tablas, **0** `auth`, **0** credenciales); `db push --dry-run` solo `0031`; `db push --yes`; `verify:remote` **13/13**. **Comprobado que NO movió dinero**, leyendo la misma sonda antes y después: Jaydin Fernando sigue con 1 boleta / $60.000 / ledger de 1 fila, y los 3 pagos por $320.000 intactos. **Y se supo por qué antes de aplicar**: el único equipo de producción —Juan Hernandez bajo Armando Gordillo— **no tiene ni una boleta cobrada**, así que `team_earned` nació en cero para todos. 11 sondas de comportamiento en verde, incluidas las 7 membresías en `tiered` sin importe, el tope real ($60.000 y $25.000) y la invariante por partes. Vercel `READY` sobre **`6596b637`** (`dpl_8AJKwGrp4G6sx3hVNBGLVpnBseST`), alias `gestion-rifas.vercel.app`, build de 39 s; en vivo las 6 cabeceras, 4 rutas protegidas en 307 y **0** claves de servicio |
| Pendiente | **1)** **I-078, abierto durante este despliegue**: las funciones internas del motor de comisiones son ejecutables por `authenticated` y `0024` decía que no. **Es preexistente desde el 2026-08-13**, no lo introdujo `0031`. Pide una `0032` que las revoque y **ampliar `verify-remote.ts`**, que hoy solo mira `anon`. **2)** **No hay E2E nuevas**: el flujo se verificó a mano y las reglas de dinero están en las 26 pruebas de base de datos. **3)** El portal administrativo **no** ofrece esta opción: el encargo la pedía para el vendedor padre y solo para él (la RPC ya existe si hace falta). **4)** Verificación visual con sesión real, que un agente no hace en producción (I-066). **5)** Lo de siempre: I-077, I-072, I-074, I-075, I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `f3cef05` a **`6596b637`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-27 |

## 1.a.0 Relevo anterior — «Demo» fuera, la flecha a plomo con su título y el encabezado de una boleta simplificado (2026-08-27)

| Campo | Estado |
|---|---|
| Resultado | **Tres ajustes de presentación, uno de ellos sin código.** (a) **«Rifas Demo» no estaba en el código**: era el nombre de la **organización** en la base de datos, que `AppShell` pinta en la barra lateral y en el encabezado del móvil. Renombrada a **«Rifas»** en el proyecto real con autorización expresa; **ningún archivo cambia**. (b) La **flecha de volver** caía **6 px** por debajo de su título en las **once** pantallas que la tienen: corregido en `PageHeader`, con la caja pulsable intacta en 44 × 44. (c) El encabezado del **detalle de una boleta** decía «4593 / 8868 · R001 — Rifa Navidad 2026» y ahora dice **«Detalle boleta»**; la rifa **baja al contenido**, no se pierde. `Query changes: None` · `Business logic changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None` (D-126) |
| Archivos | **Tocados, cuatro de código**: `src/components/data/PageHeader.tsx` (la alineación, en un solo sitio), `src/components/data/BackButton.tsx` (**solo** gana un `className`), y los dos `tickets/[ticketId]/page.tsx` de los dos portales. **Dos pruebas E2E ajustadas**: `boleta-cliente.spec.ts` y `filas-seleccionables.spec.ts`, las únicas que fijaban el encabezado viejo. **Ninguna prueba nueva.** Documentación: `DECISIONS` (D-126), `UX_COPY_GUIDELINES` anexos A y B, `KNOWN_ISSUES` (**I-077 nuevo**), `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ni un componente nuevo.** La flecha se arregla **una vez** en `PageHeader`, que es de donde salen las once pantallas; `BackButton` conserva su comportamiento (historial real → `fallbackHref`, D-089) y **no decide su propia colocación**. La rifa que baja al contenido usa los patrones que ya había en cada pantalla: `DetailLine` en el portal del vendedor, `Field` en el administrativo |
| Decisiones | **D-126.** Lo no evidente: **(a)** el desajuste era **aritmético** —título `text-2xl` = línea de 32 px, botón de 44 por la diana de D-085, alineados por arriba: 22 px contra 16—; `-my-1.5` saca del flujo los 6 px sobrantes de cada lado y **no encoge el elemento**, así que la diana sigue siendo 44 × 44. **(b)** Se alinea con la **primera línea** del título, no con el centro del bloque: ese bloque crece con la descripción y con títulos de dos líneas. **(c)** `-ms-3` porque el icono de 20 px se pinta 12 por dentro del botón, y sin eso la flecha no estaba a plomo con las tarjetas de abajo. **(d)** «Detalle boleta» **no contradice BR-N11**: una boleta se sigue nombrando por sus dos números donde hace falta nombrarla; esto es un título de pantalla. **(e)** El seed **conserva** su «Rifas Demo»: `tests/db/helpers.ts` y `tests/e2e/db-setup.ts` buscan la organización por ese nombre exacto |
| Verificación | `typecheck` ✅ · `lint` **0 errores** (los 2 avisos de siempre) · **376/376** unitarias · `build` ✅ · **E2E 296/296** en 14,7 min y `test:db` **518/518**, las dos con `db:reset` + `seed:local` antes · **Medido con sesión real** en las once pantallas con flecha, a **1280, 768 y 320 px**, y en los dos portales: separación vertical entre el centro del icono y el de la primera línea del título = **0** en todas (antes **+6**), caja del botón **44 × 44** en todas, punta de la flecha **a plomo** con el margen de las tarjetas (antes +12 px), hueco flecha→texto **16 px**, **cero desbordamiento** horizontal · Probado con título **corto** («Detalle boleta»), **largo** («Editar Abonador de cien mil mtaqm917421»), **nombre de cliente que ocupa dos líneas** a 320 px —el icono queda sobre la **primera**— y con **insignia** de estado al lado del nombre · El renombrado se comprobó leyendo la fila antes y después: `default_ticket_price` (120000), `currency`, `timezone`, `raffle_counter` e `is_active` **intactos** |
| Advertencias | **1) El renombrado YA ESTÁ EN PRODUCCIÓN; el código NO.** Son dos cosas distintas: la organización se llama «Rifas» desde ahora mismo —se ve en la siguiente carga, porque `getActiveMembership` usa `cache()` de React, que memoriza **por petición**—, mientras que los cambios de (b) y (c) **esperan autorización para desplegarse**. **2) Se abre I-077, y es lo más importante que salió de este encargo**: producción **sigue siendo el seed entero**. Hay una segunda organización, «Rifas Control», y **cuatro cuentas `@demo.test` que pueden iniciar sesión**, una de ellas de dueño; sus clientes, boletas y pagos son datos de prueba. Renombrar la organización **no retira nada de eso**, y un vendedor real verá a «Julian Vargas» y «Laura Moreno» en los reportes. Limpiarlo o arrancar en una organización nueva (`npm run create-org`) es **decisión del dueño sobre datos de producción**. **3)** El encargo daba por hecho que la rifa ya aparecía dentro del detalle de la boleta y **no aparecía**: el encabezado era el único sitio. Se movió al contenido en vez de borrarla; si algún día se quita de ahí, se pierde de verdad. **4)** `-my-1.5` y `-ms-3` **dependen del tamaño del título**: si `text-2xl` cambia en `PageHeader`, hay que rehacer los dos números, y por eso viven en ese archivo y no dentro de `BackButton`. **5)** La primera pasada E2E dio **5 fallos en `importar-boletas.spec.ts` que no eran del cambio**: la base local arrastraba **10 rifas** de pasadas anteriores —marcas de tiempo previas a esta sesión— y la importación caía en una rifa distinta de la del seed. `/owner/tickets/bulk` monta su `PageHeader` **sin `backHref`**, así que ahí la corrección ni siquiera se ejecuta. Con la base sembrada limpia: **296/296**. Lo de siempre: **siembra antes de una pasada completa** |
| Publicación | **Desplegado el 2026-08-27 con autorización expresa.** Vercel `READY` sobre **`c9dc8b7`** (`dpl_DDCfg5iTLTbJsEH2kzJGMDWT3FpY`), alias `gestion-rifas.vercel.app`, región `iad1`, build de **30 s**. CI **2/2**, incluido el job de migraciones desde cero. **Sin migraciones**: cero cambios bajo `supabase/`, así que la reversión es un Instant Rollback sin nada que deshacer en la base. En vivo: las **6** cabeceras, las **4** rutas protegidas en 307, las **7** públicas en 200 con su tipo correcto, **0** claves de servicio en el HTML y en los 26 recursos (**1.542 KB**), y **199 / 156 / 152 ms** de tiempo de servidor contra los 137 del control por CDN — sin arranque en frío. **El código servido es este commit**: `e576fc3de08d` en 2 de los 26 recursos. **Y la corrección concreta está servida**: la CSS de producción trae `.-my-1\.5` y `.-ms-3`, las **dos** clases que en toda la aplicación genera **solo** este cambio —una sola aparición cada una, en `PageHeader`—, así que con el build anterior las dos darían cero |
| Pendiente | Decidir **I-077** (qué se hace con el seed en producción antes de que entren vendedores reales) — es lo único que corre prisa. Lo que un agente **no** puede comprobar: «Detalle boleta», la flecha alineada y el nombre «Rifas» en la barra lateral viven **tras el inicio de sesión**, y automatizar ese acceso con cuentas reales es lo que provocó **I-066**; **no se intentó**. Queda para el dueño mirarlo, mejor desde un teléfono. Lo de siempre: I-072, I-074, I-075, I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `0cc2789` a **`c9dc8b7`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-27 |

## 1.a.0 Relevo anterior — el dinero sale de dentro de los anillos, y I-076 corregido (2026-08-26)

| Campo | Estado |
|---|---|
| Resultado | **Dos cosas.** (a) Los **dos gráficos circulares** dejan de llevar importes en el centro: ahí va **solo el porcentaje**, y el dinero se lee **fuera**, donde puede crecer. Afecta al **«Resumen de pago» de una boleta** —estados arriba, cobro debajo, con «Abonado $20.000 · de $120.000» y su pendiente— y al **«Resumen financiero» del panel del vendedor** —anillo con «26 % recaudado», **«Total vendido»** al lado y el reparto en tres partes debajo— (D-124). (b) **I-076 corregido**: el detalle de una boleta desbordaba a 320 px cuando el cliente tenía el nombre largo, en los **dos** portales (D-125). Todo es **visual y de rótulo**: `Query changes: None` · `Business logic changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None` |
| Archivos | **Tocados, siete**: `src/components/data/{ProgressRing,DonutChart}.tsx`, `src/features/tickets/components/TicketPaymentSummary.tsx`, `src/features/dashboard/components/FinancialSummaryCard.tsx`, `src/features/tour/{tours.ts,use-tour.ts}` y los dos `tickets/[ticketId]/page.tsx` (**una clase cada uno**). **Nuevo**: `tests/e2e/boleta-estrecha-movil.spec.ts`. **Ninguna prueba existente modificada.** Documentación: `DECISIONS` (D-124, D-125), `ARCHITECTURE` §8.2, §8.7 y §8.13, `UX_COPY_GUIDELINES` anexos A y B, `TESTING`, `KNOWN_ISSUES` (I-076 cerrado), `TEST_RESULTS`, `HANDOFF` |
| Reutilización | **Cero cálculos nuevos.** El porcentaje de la boleta sigue saliendo de `calculateCollectionSummary()` y el del panel de `percentageOf(cobrado, totalSold)`, que es **la misma definición** que ya alimenta el indicador «Cobranza»: las dos cifras no pueden discrepar. El reparto es `buildCollectionBreakdown()` y los colores, `tones.ts`. Sigue sin haber librería de gráficas: los dos anillos son SVG dibujado en el servidor, sin un byte de JavaScript |
| Decisiones | **D-124** y **D-125**. Lo no evidente: **(a)** el texto del centro se mide en **`cqw` contra el propio anillo** —que se declara `@container`—, así que «100 %» no se sale mida el anillo 80 px o 160, y quien cambia el tamaño no tiene que acordarse de ajustar la letra. **(b)** «Total a cobrar» pasa a **«Total vendido»**, que es lo que ya decían las **otras diez** pantallas; solo cambia el rótulo. **(c)** Los rótulos siguen en **VERSALITAS**, apartándose de la imagen de referencia, porque es el patrón de toda la ficha de la boleta. **(d)** Un segmento del 1 % conserva un **arco mínimo**: una parte que vale dinero no puede ser invisible. **(e)** I-076 se arregla con **`grid-cols-1`**, no dentro de `ClientLinkCard`: un texto con `nowrap` **no puede** rebajar su propio mínimo desde dentro, tiene que acotarlo el contenedor |
| Verificación | `npm run verify` **en verde**: `typecheck` ✅, `lint` **0 errores** (los 2 avisos de siempre), **376/376** unitarias y `build` ✅ · `test:db` **518/518** · **E2E 296/296** en 14,3 min, con `db:reset` + `seed:local` antes y **sin modificar una sola prueba existente** (las 2 nuevas son las de I-076, y se comprobó que **fallan sin el arreglo**: 288 y 294 px de desbordamiento) · Medido con sesión real a **1280, 820, 412 y 320 px**: **cero desbordamiento** en los dos componentes y en sus columnas, con importes de `$960.000` a `$1.200.000.000` · Casos límite: boleta al **0 %** y al **100 %**, boleta **sin vender** (no se dibuja el anillo), panel **sin ventas** (estado vacío), reparto **1 % / 1 % / 98 %** y los cinco porcentajes dentro del anillo más pequeño del proyecto |
| Advertencias | **1) Se encontró y se corrigió un fallo del recorrido guiado que no era nuevo.** La tarjeta del panel creció de 314 a 390 px y el globo del paso «Cómo va tu cobranza» se salió de la pantalla a 1280 × 720, con su botón «Siguiente» dentro. Medido: **con la tarjeta anterior el globo ya sobresalía 7 px**; solo se salvaba porque el botón no llega al borde. La causa es `block: 'center'` en `use-tour.ts`, que al centrar un elemento alto parte el hueco libre en dos mitades donde el globo no cabe. Ahora un elemento que pasa de **un tercio** del alto de la ventana se lleva **arriba**. **Cualquier elemento alto tenía el mismo problema esperando** —una tabla de veinticinco filas también lo es—, así que si tocas el alto de una tarjeta que sea diana del recorrido, vuelve a medir el globo. **2) El desbordamiento a 320 px del detalle de boleta (I-076) está corregido, y la causa NO era la que parecía.** Se culpó a la tarjeta de los **dos números** por ser el primer elemento desbordado; su mínimo son **12 px**, era la víctima. Quien fijaba la columna en 341 px era la **tarjeta del cliente**: su nombre lleva `truncate`, o sea `nowrap`, y un texto que no se puede partir tiene por mínimo la frase entera. **Atribuir un desbordamiento al primer elemento desbordado es el error a no repetir**: mide el mínimo de cada hermano. La regla que queda: **una rejilla que declara columnas solo desde `sm:` está declarando `auto` en el teléfono**, y una columna `auto` no baja del mínimo de su contenido; si alguno de sus elementos lleva `truncate`, ahí se rompe. **3)** La primera pasada E2E dio **6 fallos que no eran del código**: base sucia de tres pasadas encadenadas, y encima reformateé dos archivos **con la suite corriendo**. Siembra limpio y no toques fuentes durante la pasada. **4)** `prettier --write` puede decir «unchanged» y `--check` marcar el mismo archivo: es `prettier-plugin-tailwindcss` ordenando clases. Ejecútalo dos veces antes de investigar |
| Publicación | **Desplegado el 2026-08-26 con autorización expresa.** Vercel `READY` sobre **`a031ae1`** (`dpl_5LEiRyfxufAXerFkEgb3dTzNwExa`), alias `gestion-rifas.vercel.app`, región `iad1`, build de **36 s**. CI **2/2**. **Sin migraciones.** En vivo: las 6 cabeceras, las 4 rutas protegidas en 307, las 6 públicas en 200, **0** claves de servicio en el HTML y en los 15 fragmentos (941 KB), y 155–161 ms sin arranque en frío. **El código servido es este commit**: `94f2b9706c14` en 1 de los 15 fragmentos. **Y el rediseño concreto está servido**: la CSS de producción trae las **cuatro** reglas `font-size` que en toda la aplicación solo genera D-124 —`23cqw`, `26cqw` y los dos `max(.6875rem, Ncqw)`— más el único `container-type`; antes de este cambio nadie usaba unidades de contenedor, así que con el build anterior las cuatro darían cero |
| Pendiente | **I-076 queda cerrado**, y con él la respuesta a lo que preguntaba: **320 px sí es un ancho soportado**. Lo que un agente **no** puede comprobar: las dos tarjetas viven tras el inicio de sesión y automatizar ese acceso con cuentas reales es lo que provocó **I-066**; **no se intentó**. Queda para el dueño mirarlas en producción, mejor desde un teléfono. Lo de siempre: I-071, I-072, I-074, I-075, I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `bb48fd1` a **`a031ae1`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-26 |

## 1.a.0 Relevo anterior — la aplicación se puede instalar (2026-08-26)

| Campo | Estado |
|---|---|
| Resultado | **PWA instalable en Android, iPhone y escritorio**, con service worker propio, manifiesto, iconos, pantalla sin conexión, aviso de versión nueva y ofrecimiento de instalación. Además, tres mejoras de rendimiento medidas: se retiró **`Geist_Mono`**, que se precargaba en todas las páginas sin que la usara nadie (11 → **5** archivos `.woff2`, 51,2 → **29,3 KB** precargados); se desinstalaron **`date-fns` y `@date-fns/tz`**, sin una sola aparición en todo el repositorio; y el **recorrido guiado** y los **cinco diálogos de acción masiva** pasaron a `next/dynamic`. `Migrations: None` · `Business logic changes: None` · `Route changes: +1 (/offline)` · `Dependencies: −2, +0` (D-115 a D-120) |
| Archivos | **Nuevos**: `public/sw.js`, `public/icons/` (2 SVG + 5 PNG), `src/app/favicon.ico`, `src/app/manifest.ts`, `src/app/offline/page.tsx`, `src/lib/pwa.ts`, `src/features/pwa/` (3 componentes + `install-state.ts`), `src/features/tour/components/TourRunner.tsx`, `tests/unit/pwa-install-state.test.ts`. **Tocados**: `next.config.ts` (versión de build), `src/app/layout.tsx` (metadatos, viewport, `−Geist_Mono`), `src/app/globals.css` (`--safe-left/right`), `src/app/(public)/layout.tsx`, `src/components/layout/{AppShell,BottomNav}.tsx`, `src/lib/security-headers.ts` (`worker-src`), `src/lib/supabase/proxy.ts` (`/offline` pública), `src/proxy.ts` (matcher), `src/features/tour/components/TourProvider.tsx`, `src/features/tickets/selection/components/TicketSelectionToolbar.tsx`, `tests/unit/security-headers.test.ts`, `package.json` |
| Reutilización | **Cero componentes nuevos de interfaz genérica.** El aviso de versión es el `toast` de `sonner` que ya existe; la tarjeta de instalación usa `Card`/`Button`; la pantalla sin conexión sigue el molde de `/denied`; la detección de entorno usa **`useSyncExternalStore`**, el mismo recurso de `src/lib/use-media-query.ts`, en vez de un efecto con `setState`; las áreas seguras extienden la variable que D-106 ya había dejado preparada en `globals.css`. `TourRunner` se movió **sin tocar una línea de su cuerpo** |
| Decisiones | **D-115** (worker a mano: `@serwist/next` depende de `@serwist/webpack-plugin` y Next 16 construye con **Turbopack**) · **D-116** (no se guarda **ninguna** respuesta autenticada: «solo red» + pantalla de reserva, en vez del *Network First* que pedía el encargo, porque aquí el HTML **es** el dato) · **D-117** (dónde y cuándo se ofrece instalar; iOS se explica, no se promete) · **D-118** (`Geist_Mono` y las dos dependencias muertas) · **D-119** (`viewport-fit=cover` y áreas seguras) · **D-120** (`next/dynamic`) |
| Verificación | `npm run verify` **en verde**: `typecheck` ✅, `lint` **0 errores** (los 2 avisos de siempre), **374/374** unitarias (**+15** nuevas) y `build` ✅ · Comprobado **a mano contra `next start`** (build de producción): worker activo en el alcance `/`, **cero errores de consola**, manifiesto en `application/manifest+json`, las **dos** cachés con **20 entradas** de las que **todas** son `/_next/static/…` salvo `/offline` y el manifiesto, un `?_rsc=` pedido a mano **no** quedó guardado · **Sin conexión**: se paró el servidor y `/seller/tickets?q=1234` sirvió la pantalla de reserva **conservando la dirección original** y con React hidratado · **Actualización**: se cambió el worker, apareció el aviso, la página **no** se recargó sola, y al pulsar «Actualizar» se activó, recargó y borró la caché anterior · **Sin desbordamiento horizontal** a 320, 375, 430 y 1.366 px |
| Advertencias | **1) Las tres suites están en verde** (374 / 518 / 294, 2026-08-26). Si una pasada E2E te da «293 passed, 1 failed» en `back-navigation.spec.ts:25`, **no es tu cambio**: es `.next/dev` frío (**I-075**). Repite con la caché caliente antes de investigar nada. **2)** Se encontró y **se corrigió** un fallo grave y anterior a este trabajo: `/forgot-password` no ejecutaba nada de su JavaScript en producción desde la Fase 7 (**I-070**, D-121). **Lo que sigue abierto es por qué nadie lo vio**: la suite E2E arranca en modo desarrollo, donde Next renderiza todo por petición, así que **no puede detectar ningún fallo de prerenderizado** (**I-074**). Cualquier cambio que dependa del modo de renderizado se comprueba a mano sobre `npm run build && npm start`. **3)** Los iconos son un **marcador de posición**, no la marca del negocio (**I-071**). **4)** Al registrar el worker en local hay que usar **`npm run build && npm start`**: en `next dev` se desregistra a propósito, porque Turbopack sirve fragmentos **sin huella** y guardarlos dejaría a quien programa mirando código viejo. **5)** Nunca añadas al matcher de `src/proxy.ts` nada que no sea un archivo estático y público: lo que entra ahí se queda sin comprobación de sesión |
| Pendiente | Decidir **I-071** (el logo), **I-072** (si `font-mono` debía ser Geist Mono), **I-074** (si se añade un proyecto de Playwright contra el build de producción) e **I-075** (si se calienta el compilador antes de la suite). **No se ha desplegado**: requiere autorización expresa. Lo de siempre: I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `c2a519c` a **`cc64a99`**, empujado a `origin/main` y **desplegado a producción** el 2026-08-26 |

## 1.a.0 Relevo anterior — la ficha del cliente, rediseñada (2026-08-25)

| Campo | Estado |
|---|---|
| Resultado | El **detalle del cliente** se reorganizó en los **dos** portales: el nombre lleva su estado al lado, **«Registrar abono» sube al encabezado** como única acción de color, la información general pasa a una **cuadrícula** con icono —2 × 2 en el teléfono, una fila en escritorio, de 262 px a **167**—, las cuatro cifras usan la tarjeta del panel (`KpiCard`) y los dos listados van dentro de **tarjetas con título** (`TableSection`). Se retira la columna «Cliente» de las dos tablas y, solo en el portal del vendedor, «Rifa» (D-088). Es un cambio **visual**: `Query changes: None` · `Business logic changes: None` · `Route changes: None` · `Migrations: None` · `New dependencies: None` (D-113) |
| Archivos | **Nuevos**: `src/components/data/TableSection.tsx`, `src/features/clients/components/{ClientInfoCard,ClientTotals}.tsx`. **Tocados**: los dos `clients/[clientId]/page.tsx` (reescritos), `components/data/{PageHeader,DataTable,StatusBadge}.tsx` (aditivo), `features/tickets/components/{TicketsList,TicketsTable,TicketCardList}.tsx` (aditivo), `features/payments/components/PaymentsTable.tsx` (aditivo), `features/clients/components/ClientArchiveButton.tsx`, `features/dashboard/components/KpiCard.tsx` (solo el comentario), `lib/constants.ts` (`CLIENT_STATUS_LABELS`). **Sin pruebas nuevas**: no hay lógica nueva. Documentación: `DECISIONS` (D-113), `ARCHITECTURE` §8.2, §8.3 y **§8.14**, `UX_COPY_GUIDELINES` anexos A y B, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ningún componente duplicado.** Se reutilizaron `PageHeader`, `DataTable`, `TicketsList`, `PaymentsTable`, `Card`, `Badge`, `ClientArchiveButton`, `formatCOP` y `formatDateEs`, y las cifras usan **`KpiCard`**, la tarjeta del panel del vendedor (D-112). `MetricCard` **no se tocó**: la comparten ocho pantallas. Los separadores verticales siguen el patrón de la ficha de boleta (`lg:border-l`) |
| Decisiones | **D-113**. Lo no evidente: **(a)** solo se oculta lo **constante por construcción** —el cliente, porque la lista va filtrada por `clientId`—; «Rifa» y «Vendedor» se quedan en el portal administrativo porque **pueden variar**. **(b)** `titleBadge` va **junto** al `h1`, no dentro: el nombre accesible del encabezado tiene que seguir siendo el nombre. **(c)** La tabla dentro de una tarjeta se aplana con `SECTION_TABLE_CLASSES`, y el relleno está calculado para que la primera columna quede alineada con el título. **(d)** El botón «Ver» del historial y su columna sin rótulo **se dejaron como estaban** aunque el diseño mostrara «Acción» + icono: esa tabla la comparten tres pantallas |
| Verificación | `typecheck`, `lint` (0 errores, los 2 avisos de siempre), `test` **359/359**, `test:db` **518/518** y `build` ✅ · E2E **escritorio 243/243** y **móvil 51/51**, con `db:reset` + `seed:local` antes · capturas reales a **320, 360, 390 y 1.280 px** en los dos portales, desbordamiento horizontal **0** · seis estados probados: con datos, sin boletas, sin abonos, sin correo, **archivado** y nombre largo · aritmética contra la pantalla: 2 × $120.000 = $240.000, abono activo $40.000, **anulado $20.000 que no cuenta**, saldo $200.000 |
| Advertencias | **1)** La primera pasada E2E completa dio **6 fallos que no eran del cambio**: la base venía de tres pasadas encadenadas. **Siembra limpio antes de culpar a tu código.** **2)** `showClient={false}` solo vale donde la lista está filtrada por ese cliente. **3)** El `className` de `DataTable` es para **aplanar** dentro de una tarjeta; no lo uses para maquillar tablas sueltas. **4)** `KpiCard` ya la usan **dos** pantallas. **5)** Tras `db:reset`, `docker restart supabase_kong_Rifas` si todo devuelve 502. **6)** **`fill()` de Playwright no es de fiar sobre un campo que ya tiene texto**: los formularios son controlados (react-hook-form) y lo que queda es el valor viejo menos un carácter. Para editar un valor existente: clic, `Ctrl+A` y escribir encima. Escribiendo con el teclado el formulario funciona bien —comprobado—, así que **no es un fallo del producto** (`TEST_RESULTS`) |
| Publicación | **Desplegado el 2026-08-25 con autorización expresa.** Vercel `READY` sobre **`18ad9bd`** (`dpl_EEBWxXrw4zSeU4NMTdAFA6RooM5h`), alias `gestion-rifas.vercel.app`. CI **2/2**. `/login` en 200 con sus seis cabeceras, las cuatro rutas protegidas en 307, y **ninguna clave de servicio** en el HTML ni en los **16** recursos servidos. Que el código nuevo está servido de verdad: la CSS de producción trae `.lg\:pl-6`, `.lg\:gap-0`, `.sm\:grow-0` y `.sm\:pb-4` —las cuatro solo las genera este cambio— más `.lg\:grid-cols-5` de la tira del portal administrativo. Tiempo de **servidor**: 528 ms el primer ciclo (primera petición sobre un despliegue recién creado) y **139–241 ms** en los cinco siguientes, con `/denied` por CDN en 132–147. **Sin migraciones**. **Segunda promoción** el mismo día sobre **`9e72fca`** (`dpl_CQV5dU8HJnKYHgjoMt2XRdM7PwPC`), con la cuadrícula del teléfono: CI 2/2, mismas comprobaciones en verde, 140–236 ms, y una añadida que conviene repetir —**las huellas CSS del build anterior (`.lg\:pl-6`, `.lg\:gap-0`) desaparecieron**, que es como se comprueba que no queda una hoja cacheada (`PHASE_STATUS` §7.b) |
| Pendiente | Que el dueño lo mire en **un teléfono real** y diga si quiere las dos diferencias deliberadas con el diseño de referencia: «Acción» + icono de ojo en el historial, y «Núm. diario» en vez de «Número diario». Lo de siempre: I-068, I-066, I-062, I-063 |
| Git | Rama `main`, de `3136c9d` a **`9e72fca`** (rediseño, registro del despliegue y la cuadrícula del teléfono), empujado a `origin/main` |

## 1.a.0 Relevo anterior — el panel del vendedor, rediseñado (2026-08-25)

| Campo | Estado |
|---|---|
| Resultado | El panel del vendedor pasó de **once bloques apilados** a **siete piezas**: cuatro indicadores, «Resumen financiero» con un anillo, «Cobranza», «Mis boletas», «Tendencia de recaudado», «Actividad reciente» y «Accesos rápidos». Aparecen dos cosas nuevas —un **selector de período** (7 días, 30 días, este mes, mes pasado) y un **gráfico de recaudo diario**— y desaparecen la tarjeta «Tu ganancia», «Resumen de cobranza», las cinco tarjetas de inventario y **dos** de las tres listas. El período manda sobre lo recaudado y su tendencia; el inventario y la cobranza siguen siendo la foto de hoy. `Migrations: None` · `Business logic changes: None` · `Route changes: None` · `New dependencies: None` (D-112) |
| Archivos | **Nuevos**: `src/features/dashboard/{date-range,collection-breakdown,tones}.ts`, `src/features/dashboard/components/` (8 piezas), `src/components/data/{DonutChart,TrendChart}.tsx`. **Tocados**: el `page.tsx` del panel (reescrito), `features/dashboard/seller-queries.ts` (2 lecturas nuevas, 3 retiradas), `lib/{constants,dates,money}.ts` (aditivo), `features/tour/tours.ts` (2 textos), `features/commissions/components/CommissionCard.tsx` (nota: queda sin montar). Pruebas: 2 archivos unitarios nuevos, **7** E2E ajustados (incluida la medición del globo del recorrido en `tour-responsive.spec.ts`). Documentación: `DECISIONS` (D-112), `ARCHITECTURE` §8.2 y **§8.13**, `UX_COPY_GUIDELINES` anexos A y B, `KNOWN_ISSUES` (**I-068**), `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | Se reutilizó **todo lo que ya calculaba dinero**: `v_seller_summary`, `commission_summary` y las funciones `report_payments_by_day` / `report_payment_totals` de la migración `0013`, que ya alimentaban el reporte de recaudo. `MetricCard` **no se tocó** —la comparten ocho pantallas— y el indicador del panel es un componente propio. Los gráficos siguen el patrón de `ProgressRing`: SVG en el servidor, sin librería. Las etiquetas en plural se suman a `constants.ts`, donde ya viven las de estado; el `contents` de la rejilla es el recurso de D-110 |
| Decisiones | **D-112**. Lo no evidente: **(a)** **no hizo falta migración** porque el reparto del dinero por estado de pago se **deduce** de una sola cifra —lo abonado sobre las boletas a medias—; una migración habría que promoverla al proyecto real antes de desplegar el código. **(b)** El período **no** manda sobre el inventario ni sobre la cobranza: la base guarda el estado actual de cada boleta, no el de hace siete días, así que «Por cobrar» tampoco lleva comparación. **(c)** El «95 %» del diseño de referencia era 95 % *pendiente*, no cobrado, y no se copió. **(d)** Estas tarjetas responden al ancho de **su tarjeta** (container queries), no al de la ventana. **(e)** «Registrar abono», no «Registrar pago». **(f)** El gráfico no lleva su propio selector de días: ya hay uno arriba |
| Verificación | **359/359** unitarias (34 nuevas) · **518/518** de base de datos · `typecheck`, `lint` y `build` ✅ (los 2 avisos de siempre) · E2E **escritorio 243/243 y móvil 51/51**, con `db:reset` + `seed:local` antes · aritmética comprobada contra la pantalla real (las tres partes del anillo y los tres importes de «Cobranza» suman el total) · medido a **320, 375, 393, 768, 1.024 y 1.280 px**, con desbordamiento horizontal **0** en todos · vendedor sin ventas: estados vacíos limpios, cero `NaN`, y el precio leído de **su** rifa ($50.000, no $120.000) · recorrido guiado completo, 7 pasos |
| Advertencias | **1)** **`getSellerDashboard` ya no trae clientes ni ventas recientes**; si una pantalla los necesita, se piden aparte. **2)** **`CommissionCard` está sin montar a propósito** (I-068): no la borres sin que el dueño confirme. **3)** **No uses `sm:` dentro de estas tarjetas**: en escritorio ocupan media pantalla y el ancho de la ventana no dice nada del que tienen dentro. **4)** La prueba unitaria del reparto comprueba que las tres partes suman el total: **no la relajes**, es lo único que impide que el anillo y «Cobranza» se contradigan. **5)** La suite E2E **no aguanta pasadas seguidas**: `equipo.spec.ts` crea vendedores y el panel administrativo crece, lo que tumba dos pruebas del recorrido guiado. Siembra limpio antes de una pasada completa. **6)** Tras `db:reset`, **Kong se queda con la IP vieja del contenedor de auth** y todo devuelve 502: `docker restart supabase_kong_Rifas` lo arregla |
| Publicación | **Desplegado el 2026-08-25 con autorización expresa.** Vercel `READY` sobre **`96827dc`** (`dpl_G1ULMPZxjm83GLDyRtsTqYbcS1Xv`), alias `gestion-rifas.vercel.app`. CI **2/2**. `/login` en 200 con sus seis cabeceras, las cuatro rutas protegidas en 307, y **ninguna clave de servicio** en el HTML ni en los **16** recursos servidos. Que el código nuevo está servido de verdad: la CSS de producción trae las **tres** reglas `@container` que solo genera este panel —`(min-width:400px)`, `tickets (min-width:400px)` y `(min-width:560px)`—, más `.fill-emerald-500/10` del gráfico de tendencia y `.stroke-blue-600` del anillo. Tiempo de **servidor** en 3 ciclos: **170–240 ms**. **Sin migraciones** |
| Pendiente | **I-068** espera una decisión del dueño. Lo de siempre: I-066, I-062, I-063 y la columna «Abono» del importador. Falta que el dueño lo mire en **un teléfono real** |
| Git | Rama `main`, de `c1fa849` a **`96827dc`**, empujado a `origin/main` |

## 1.a.0 Relevo anterior — la paginación en el teléfono (2026-08-24)

| Campo | Estado |
|---|---|
| Resultado | La paginación de los **ocho** listados se rediseñó para el móvil, **sin tocar el paginado**: el recuento dice qué cuenta —«1–25 de 118 **boletas**»—, los dos botones suben a **44 px** y se van a los márgenes, y el indicador dice «1 de 5» centrado entre ellos, sin borde ni fondo. En los extremos los botones **se deshabilitan, no desaparecen**, y conservan sus coordenadas. En escritorio solo cambian dos textos (el recuento y la tilde de «Página»); las medidas son idénticas. `Query changes: None` · `New API calls: None` · `Business logic changes: None` · `New dependencies: None` (D-111) |
| Archivos | `src/components/data/DataTablePagination.tsx` (el rediseño entero) · `src/lib/constants.ts` (**`LIST_ITEM_LABELS`**) · los **seis** `page.tsx` que listan y `features/reports/components/ReportsView.tsx` (una palabra cada uno: `items`). Pruebas: `tests/e2e/boletas-movil.spec.ts` (**1 nueva**). Documentación: `DECISIONS` (D-111), `ARCHITECTURE` §8.2 y **§8.12**, `UX_COPY_GUIDELINES` anexos A y B, `KNOWN_ISSUES` (I-064, la cita), `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | **Ningún componente nuevo y ninguno duplicado.** Ya existía uno común y se quedó como el único: los ocho listados siguen llamándolo. Los nombres se suman a `constants.ts`, donde ya viven las etiquetas de estado. El alto táctil usa el patrón de D-108/D-109 (`h-11 … md:h-8`) |
| Decisiones | **D-111**. Lo no evidente: **(a)** el reporte de recaudo pagina **días**, no pagos —por eso `items` es obligatorio y no tiene valor por defecto—. **(b)** 12 px de aire lateral y no 16: con 16, a 320 px «1 de 257» se parte en dos líneas. **(c)** El corte pasa de `sm` a `md`, que es donde la aplicación entera se vuelve teléfono; el tope `max-w-md` evita que entre 448 y 768 px los botones se separen a los extremos. **(d)** «Página» se queda en `sr-only` bajo `md`: no cabe, pero «1 de 5» a secas no dice de qué |
| Verificación | **325/325** unitarias · `typecheck`, `lint` y `build` ✅ (los 2 avisos de siempre) · E2E **móvil 51/51** (1 nueva) y **escritorio 242/242**, con `db:reset` + `seed:local` antes · medido a **320, 375, 700 y 1.280 px** con 257 páginas: botones de 44 px, indicador en **una** línea, `scrollWidth == clientWidth`, separaciones 24 / 16 / 23 px, y en escritorio los mismos 32 px de alto, 10 px de aire y 314 px de fila · comprobado el recuento de las **cinco** listas, incluido el singular «1–1 de 1 día» · la prueba nueva **falla con el componente anterior** |
| Advertencias | **1)** **`items` es obligatorio**: una lista nueva tiene que decir qué muestra, y el nombre sale de `LIST_ITEM_LABELS`. **2)** **Comprueba qué pagina de verdad la lista**: el reporte de recaudo parecía paginar pagos. **3)** No devuelvas el corte a `sm`. **4)** El paginador de `ImportPreview` queda **fuera a propósito**: es estado local sobre un archivo ya leído, sin URL ni servidor. **5)** `npm run format:check` señala **34 archivos** que nadie ha tocado en este trabajo (finales de línea del árbol local); los 16 de este cambio pasan |
| Publicación | **Desplegado el 2026-08-24 con autorización expresa.** Vercel `READY` sobre **`7d7cf18`** (`dpl_3fLMzy1uxwJYN9gfMrba7i6GQuUs`), alias `gestion-rifas.vercel.app`. CI **2/2**. `/login` en 200 con sus seis cabeceras, las cuatro rutas protegidas en 307, y **ninguna clave de servicio** en el HTML ni en los **27** recursos servidos. Que el código nuevo está servido: la CSS de producción trae, dentro de `@media (min-width:48rem)`, `.md:not-sr-only`, `.md:has-[>svg]:px-2.5`, `.md:max-w-none` y `.md:flex-none` — las cuatro solo las genera este componente. Tiempo de **servidor** en 3 ciclos: **149–186 ms**. **Sin migraciones** |
| Pendiente | Lo de siempre (I-066, I-062, I-063, columna «Abono» del importador). De este trabajo: **nada bloqueante**. Falta que el dueño lo mire en **un teléfono real**: entrar exige una contraseña, y eso no lo maneja un agente |
| Git | Rama `main`, de `7706378` a **`7d7cf18`**, empujado a `origin/main` |

## 1.a.0 Relevo anterior — el hueco de la barra de selección múltiple (2026-08-24)

| Campo | Estado |
|---|---|
| Resultado | Marcar una boleta abría **80 px en blanco** entre el recuento y la lista, dejaba una **rendija** entre la barra de acciones y la de navegación, y **tapaba la paginación**. Las tres eran el mismo error: la barra es un elemento `fixed` escrito en medio del contenido. Ahora **el hueco se pide, no se dibuja** —`data-selection-bar` → `--selection-bar-space` → `padding` de `AppShell`, junto al de la barra inferior— y la barra va envuelta en `display: contents` para que no le toque el margen del `space-y-6`. **Escritorio no cambia**: la variable vale 0. `Query changes: None` · `New API calls: None` · `Business logic changes: None` · `New dependencies: None` (D-110) |
| Archivos | `src/app/globals.css` (`--selection-bar-height`, `--selection-bar-space`) · `components/layout/AppShell.tsx` (el `padding` pasa a sumar dos barras) · `features/tickets/selection/components/TicketSelectionToolbar.tsx` (fuera el `h-20`; la barra se marca y se envuelve). Pruebas: `tests/e2e/seleccion-movil.spec.ts` (**1 nueva**). Documentación: `DECISIONS` (D-110), `ARCHITECTURE` **§8.8**, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF` |
| Reutilización | Ningún componente nuevo. Se **extendió** el mecanismo de D-106: la misma idea de «una variable, y `AppShell` reserva el hueco una sola vez», ahora con dos sumandos. Ninguna pantalla añade margen por su cuenta |
| Decisiones | **D-110**. Lo no evidente: **(a)** un elemento en flujo **no puede** reservar sitio al final de una página en la que está escrito por el medio; por eso el `h-20` fallaba en los dos sentidos a la vez. **(b)** El margen de un `space-y-*` **mueve** un elemento fijo colocado por `bottom`: ahí estaban los 24 px de rendija. **(c)** Se descartó un portal a `document.body` —sacaría la barra del orden de lectura y tabulación— y un `!important`, que dependería del orden de emisión de Tailwind |
| Verificación | **325/325** unitarias · **518/518** de base de datos · `typecheck`, `lint` y `build` ✅ (los 2 avisos de siempre) · E2E **móvil 50/50** (1 nueva) y **escritorio 61/61** en los cuatro archivos de selección y listas de boletas · medido a 375 px: recuento → lista **128 → 24 px**, rendija **24 → 0**, paginación **−9 → +15 px**; a 1.280 y 1.440 px, `--selection-bar-space: 0px` y separaciones idénticas · **la prueba nueva se verificó al revés**: falla midiendo 113 px con el `h-20` de vuelta, y falla por la paginación sin el sumando en `AppShell` |
| Advertencias | **1)** **No reserves hueco con un div vacío** para una barra fija: ánclalo a `--selection-bar-space`, como ya hacía la navegación con `--bottom-nav-space`. **2)** Un elemento `fixed` dentro de un `space-y-*` **se desplaza** por el margen que hereda; si añades otra barra, envuélvela igual. **3)** El bloque de 80 px **no era exclusivo del móvil**: aparecía en cualquier ventana de menos de 768 px, también en escritorio. **4)** La suite E2E de escritorio se corrió **parcial** a propósito (61 de 242); si se promueve, CI corre las dos completas |
| Publicación | **Desplegado el 2026-08-24 con autorización expresa.** Vercel `READY` sobre **`ef6bcb2`** (`dpl_KkU3vKAFr169yzRhfA5VBrPpxB7A`), alias `gestion-rifas.vercel.app`. CI **2/2**. `/login` en 200 con sus seis cabeceras, las cuatro rutas protegidas en 307, y **ninguna clave de servicio** en el HTML ni en los **27** recursos servidos. Que el código nuevo está servido: la CSS de producción trae `body:has([data-selection-bar]){--selection-bar-space:var(--selection-bar-height)}`, el `padding-bottom:calc(1rem + var(--bottom-nav-space) + var(--selection-bar-space))` y el único `display:contents` de la aplicación. Tiempo de **servidor** en 3 ciclos: **150–202 ms**. **Sin migraciones** |
| Pendiente | Lo de siempre (I-066, I-062, I-063, columna «Abono» del importador). De este trabajo: **nada bloqueante**. Falta que el dueño lo mire en **un teléfono real**: entrar exige una contraseña, y eso no lo maneja un agente |
| Git | Rama `main`, de `fb91ac1` a **`ef6bcb2`**, empujado a `origin/main` |

## 1.a.0 Relevo anterior — la misma cabecera en el portal administrativo (2026-08-24)

| Campo | Estado |
|---|---|
| Resultado | `/owner/tickets` recibe el bloque de D-108, con **una diferencia obligada**: tiene **dos** acciones y no caben junto al título, así que **bajan juntas a una fila propia de 44 px** que va de lado a lado, igual que la de «Filtros» justo debajo. El resto de la sección ya lo tenía desde D-108, porque sale de `TicketFilters`, que las dos pantallas comparten. **Escritorio no cambia**: los botones vuelven a 36 px y a su ancho, a la derecha del título. `Query changes: None` · `New API calls: None` · `Business logic changes: None` · `New dependencies: None` (D-109) |
| Archivos | `src/app/(protected)/owner/tickets/page.tsx` (constante `HEADER_ACTION_CLASS` y las dos clases) · `components/data/PageHeader.tsx` (**solo un comentario**, sin cambio de comportamiento). Documentación: `DECISIONS` (D-109), `ARCHITECTURE` §8.2 y **§8.11**, `TEST_RESULTS`, `PHASE_STATUS`, `HANDOFF`. **Ninguna prueba tocada** |
| Reutilización | Nada nuevo. `h-11 grow md:h-9 md:grow-0` es el mismo patrón de `SearchInput` (`touchSize`) y de la fila de «Filtros». `TicketFilters` ya servía a esta pantalla desde D-108 y no se tocó |
| Decisiones | **D-109**, y **la disposición la eligió el dueño** entre tres opciones planteadas con sus consecuencias. Lo no evidente: **(a)** las dos acciones miden 272 px y el título 79; a 320 px suman 363 sobre los 288 disponibles, y a 390 quedan 267 para 272 — solo entran a partir de 430. **(b)** Se descartó esconder «Crear en lote» tras un menú «···»: es la acción con la que se cargan las boletas de una rifa entera. **(c)** Las clases van en los botones y **no** en una segunda bandera de `PageHeader`, que comparten 27 pantallas |
| Verificación | **325/325** unitarias · `typecheck`, `lint` y `build` ✅ (los 2 avisos de siempre) · E2E **móvil 49/49** y **escritorio 242/242**, con `db:reset` + `seed:local` antes · medido a **320 px** (139 + 8 + 141 = 288, de lado a lado, 44 px de alto), **390 px** (174 + 8 + 176 = 358) y **1.280 px** (131 y 133 px, alto 36, x = 969) · `scrollWidth == clientWidth` en móvil |
| Advertencias | **1)** **`PageHeader` no impone tamaño a sus acciones y no debe empezar a hacerlo**: lo comparten 27 pantallas. **2)** Las dos pantallas de boletas tienen encabezados **distintos a propósito**; no las «unifiques» sin releer §8.11. **3)** ⚠️ **Al medir en el navegador tras cambiar clases, navega limpio (`?v=n`), no con `location.reload()`.** En este trabajo un árbol cacheado por el servidor de desarrollo dio dos veces medidas imposibles y llevó a escribir dos comentarios con una causa falsa —el orden de emisión del CSS— que hubo que corregir. La comprobación que lo delata: un clon del elemento, con el mismo `className`, mide distinto que el original |
| Publicación | **Desplegado el 2026-08-24 con autorización expresa.** Vercel `READY` sobre **`f9d5b20`** (`dpl_5jH2fZ1PhLmCX9Gr2wzX65HbcHUT`), alias `gestion-rifas.vercel.app`. CI **2/2**. `/login` en 200 con sus seis cabeceras, las cuatro rutas protegidas en 307, y **ninguna clave de servicio** en el HTML ni en los 16 recursos servidos. Que el código nuevo está servido: la CSS de producción trae **`md:grow-0`**, que solo genera la fila de acciones de esta pantalla, y conserva las cuatro huellas de D-108. Tiempo de **servidor** en 3 ciclos: **185–208 ms**. **Sin migraciones** |
| Pendiente | Lo de siempre (I-066, I-062, I-063, columna «Abono» del importador). De este trabajo: **nada bloqueante**. Falta que el dueño lo mire en **un teléfono real**: entrar exige una contraseña, y eso no lo maneja un agente |
| Git | Rama `main`, de `ab2cb07` a **`f9d5b20`**, empujado a `origin/main` |

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
               │                parent_seller_id → equipos, 0022;
               │                commission_model, fixed_commission_amount → 0031)
               ├─ notifications (recipient_profile_id, kind, data, read_at; 0023)
               ├─ commission_tiers    (min_tickets, rate; 0024)
               ├─ seller_commissions  (raffle_id, seller_id, tickets_paid, rate, earned,
               │                       team_tickets_paid, team_earned → 0031)
               └─ commission_ledger   (movement, amount, tickets_paid, rate,
                                       team_movement, from_seller_id → 0031; solo anexado)
               ├─ raffles     (short_code, name, ticket_price, status, allow_seller_ticket_creation)
               ├─ clients     (seller_id, name, phone, archived_at)
               ├─ tickets     (raffle_id, seller_id, client_id, internal_code,
               │               daily_number, weekly_number, sale_price, base_price,
               │               paid_amount, inventory_status, payment_status)
               ├─ payments    (seller_id, client_id, total_amount, payment_date, voided_at)
               └─ audit_logs  (actor_profile_id, action, entity_type, entity_id, old/new_values)

lottery_draw_schedules (nacional: lottery_code, draw_number, reference_date,
                        original/official_scheduled_at, schedule_status)
  └─ lottery_results (winning_number texto 4 dígitos, series, validation_status)
       └─ lottery_ticket_matches (org, rifa, vendedor, fotografía inmutable)

lottery_sync_runs (proceso interno; sin SELECT para authenticated)

payments 1─N payment_allocations N─1 tickets   (amount; SUM = payments.total_amount)
profiles 1─1 auth.users
```

**Enums:** `app_role` owner|admin|seller · `raffle_status` draft|active|closed|cancelled ·
`ticket_inventory_status` draft|pending_approval|available|assigned|cancelled ·
`ticket_payment_status` unpaid|partial|paid · `payment_method` cash|transfer|other ·
`lottery_code` cundinamarca|cruz_roja|meta|bogota|medellin|boyaca (`0036`)

**Invariantes que la BD ya garantiza — no las reimplementes en la aplicación:**
- Combinación `(org, rifa, daily, weekly)` única, incluso entre vendedores y con boletas anuladas.
- Números como texto, 1–4 dígitos, ceros iniciales conservados. El número mayor de lotería son
  **cuatro** dígitos y se compara igual: `0046` ≠ `46` (BR-L06).
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
`assign_ticket` · `create_payment` · `void_payment` · `update_payment_allocation` · `update_ticket_sale_price` · `match_lottery_result` (solo `service_role`) · `bulk_create_tickets` · `approve_tickets` ·
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
                    PageHeader (backHref = flecha de volver, D-089; compactAction = CTA
                    de la cabecera contextual, D-150) · BackButton · MetricCard
lib/navigation-history.ts  detecta si hay historial real en esta pestaña, para
                    BackButton. Contador de modulo, no sessionStorage (D-089)
components/layout/  AppShell · CompactHeader (cabecera contextual, D-150): el cruce
                    lo decide IntersectionObserver; el CTA se marca con
                    CompactActionSlot y se mueve con un portal. NavLinks (lateral,
                    escritorio) · BottomNav (barra
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
features/tickets/components/EditSalePriceDialog  corregir el precio de una boleta
                    asignada (D-137). Un dialogo, dos portales. TicketSalePrice pinta el
                    valor y el icono. La RPC es `update_ticket_sale_price`; el recálculo
                    no se reimplementa
features/tickets/financials.ts  ticketFinancials(): abonado, falta y porcentaje de UNA
                    boleta (D-130). Es la fuente de las CUATRO pantallas que enseñan
                    dinero de una boleta. Reutiliza calculateCollectionSummary. Si vas
                    a restar sale_price - paid_amount en algun sitio, para: ya esta hecho
components/data/PaymentProgressBar  la barra lineal de 4 px, hermana de ProgressRing
                    (que es para donde hay alto). Publica role="progressbar" y va
                    SIEMPRE con su porcentaje escrito y su insignia (D-130)
features/tickets/components/TicketsList  la lista LARGA de boletas: UNA consulta, DOS
                    presentaciones (D-107). Escritorio -> TicketsTable; telefono ->
                    TicketCardList. Lo elige Tailwind, no JavaScript, y las dos reciben
                    el mismo TicketListItem[]. TicketsTable ya no se llama desde ninguna
                    pantalla. La densidad es su razon de ser: no la engordes
features/clients/components/ClientsList  la lista de clientes: UNA consulta, DOS
                    presentaciones (D-136). Escritorio -> ClientsTable; telefono ->
                    ClientCardList. Lo elige Tailwind, no JavaScript. ClientsTable ya
                    no se llama desde ninguna pantalla. Cada cliente es una tarjeta
                    suelta, no una fila de una lista continua: no las fusiones con
                    TicketCardList
features/payments/components/PaymentForm  el formulario de abono. En el telefono las
                    boletas son PaymentAllocationCards; en escritorio, la tabla.
                    Lo elige Tailwind (D-138). El cliente vive en PaymentClientBanner,
                    no en el titulo. Los botones van al fondo con flex/min-h, no
                    `fixed`: un bloque fijo tapaba Fecha en pantallas bajas
features/tickets/components/ClientTicketsList  la OTRA lista de boletas, la de la ficha
                    de un cliente (D-130). Mismo dato y mismas piezas pequeñas, otra
                    disposicion: alli se miran tres boletas, no trescientas. No las
                    fusiones
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
features/lottery/  constantes (BR-L01) + adaptadores (Etapa 2) + sync.ts /
                    publication.ts (Etapa 3) + dashboard.ts/queries.ts y
                    LotteryResultsCard (Etapa 4) + auth/job/cron-plan (Etapa 5).
                    El matching vive en PostgreSQL.
                    El Panel NO importa fetch/sync/adapters/job (D-147, BR-L20).
                    vercel.json NO declara crons (D-148). No anadas exceljs ni
                    cheerio (D-144). tickets_select no se toca (D-092, D-141)
features/notifications/  avisos (D-093): campanita en el armazon, tabla escrita
                    por triggers o por las RPC internas de loteria, y el TEXTO
                    en text.ts —nunca en la base de datos, para no repetir I-030—
features/search/    busqueda hibrida (D-078/D-079): useUrlSearch (listas paginadas en
                    servidor) · useRemoteSearch (dialogos) · SearchInput · hints.ts,
                    donde viven TODAS las pistas de los buscadores. El termino se
                    normaliza en lib/search.ts, que tiene que seguir coincidiendo con
                    search_normalize() de la migracion 0017
features/clients/components/ClientLinkCard  el cliente como fila pulsable entera, con
                    su avatar, su telefono y su flecha, hacia la ficha de cliente QUE YA
                    EXISTE (D-101). Un solo componente para los dos portales; el href es
                    lo unico que cambia. ClientEmptyCard es el mismo hueco sin enlace.
                    NO es la lista de «Mis clientes» (D-136): esa es `ClientsList`
components/data/ProgressRing  anillo de progreso accesible, sin librerias (D-105).
                    Antes de dibujar otro porcentaje, mira este y la barra de
                    CollectionSummaryCard: el porcentaje SIEMPRE va escrito, no solo
                    en el color. DENTRO DEL ANILLO SOLO VA EL PORCENTAJE: el dinero
                    se escribe fuera, al lado (D-124). Igual en DonutChart
features/tickets/components/TicketPaymentSummary  estado, estado de pago, anillo,
                    abonado y pendiente de UNA boleta (D-105). No calcula: pide el
                    porcentaje a calculateCollectionSummary, la cuenta del panel
features/payments/components/TicketPaymentsCard  los abonos de UNA boleta, en los dos
                    portales: apilados en el telefono, en columnas desde lg. Un solo
                    arbol de HTML, no una tabla escondida y otra visible. Desde D-134
                    cada abono vigente lleva «Editar»
features/payments/components/EditPaymentDialog  corregir el valor de UN abono (D-134).
                    Lo montan el historial de la boleta y el detalle de un pago.
                    No calcula saldo: llama a `updatePaymentAllocation`
features/payments/return-to.ts  destino de «Registrar abono» (D-133, D-135). Pura:
                    `from` es allowlist (`ticket` · `client` · `payments` ·
                    `dashboard`); `ticketId` solo cuenta si esta entre las
                    boletas pagables. Un valor ajeno cae en «Mis pagos».
                    `paymentNewHref` arma el enlace; no interpoles la URL a mano
features/payments/components/PaymentForm  UN formulario para todos los origenes.
                    `returnTo` y `originTicketId` los calcula la pagina, no el
                    formulario. Despues de guardar siempre `replace`. No le
                    anadas un almacén global ni un `returnTo` arbitrario
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
`TicketsList` y `ClientsList` reciben `basePath` / `showSeller` (y, las boletas, `showRaffle`) y se
los pasan a su tabla y a su lista de tarjetas. `TicketsTable` y `ClientsTable` ya no se llaman desde
ninguna pantalla: solo desde esos envoltorios (D-107, D-136). `PaymentsTable` recibe
`clientBasePath` / `showSeller` / `canVoid`; `TicketFilters`, `ClientFilters` y `PaymentFilters`
ocultan los selectores que no se les pasan.

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
| Fecha de «Registrar abono» se monta encima de Método en el teléfono, y al estrechar el navegador de escritorio no se ve | El `input type=date` nativo de iOS/Android es un `menulist-button` cuyo ancho mínimo ignora `width: 100 %`. Chromium de escritorio y el Pixel 7 de Playwright sí lo respetan. No apiles los campos ni subas el corte: el arreglo es `appearance: none` en `globals.css` | D-139 · I-079 |
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
| Una prueba de comisiones falla con un total que no cuadra | Comprueba primero la invariante, que desde `0031` va **por partes**: `SUM(amount WHERE NOT team_movement) = earned` y `SUM(amount WHERE team_movement) = team_earned`. Si las dos cuadran, el error está en la expectativa de la prueba, no en el motor | BR-G10, BR-G22 |
| Una cifra de comisión sube cuando esperabas que bajara (o al revés) en un equipo | Recuerda que los tramos son **retroactivos** y que el vendedor padre recibe `mitad − tarifa` **por cada** boleta: cuando su integrante sube de tramo, el padre cobra MENOS aunque el equipo haya vendido más. No es un error, es BR-G20 + BR-G02 (lo comprueba `E10-07`) | BR-G20 |
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
