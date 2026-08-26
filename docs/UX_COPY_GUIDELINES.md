# Guía de UX Writing y lenguaje de la aplicación

**Fuente única de verdad para todo texto visible por un usuario.** Claude Code la importa desde
`CLAUDE.md` §35 y Codex la recibe como lectura obligatoria desde `AGENTS.md`; ambos deben releerla
antes de escribir o cambiar textos.

Las secciones 1 a 14 son la guía normativa. Los **anexos** del final son la aplicación concreta de
esa guía a este proyecto: glosario, dónde vive cada texto y las contradicciones ya detectadas.

---

## 1. Objetivo

Todos los textos visibles para los usuarios deben ser fáciles de entender, cálidos, directos y útiles.

La aplicación está dirigida a dueños de rifas y vendedores que pueden tener poca experiencia utilizando aplicaciones o herramientas digitales. Por esta razón, la interfaz nunca debe asumir conocimientos técnicos.

El objetivo no es hacer que el lenguaje suene infantil, sino lograr que cualquier persona pueda entender qué está viendo, qué puede hacer y qué ocurrirá después.

## 2. Usuarios principales

La aplicación tiene principalmente dos tipos de usuario:

### Owner o administrador

Es la persona encargada de crear la rifa, configurar sus condiciones, registrar vendedores, asignar boletas y revisar las ventas.

### Vendedor

Es la persona encargada de consultar sus boletas asignadas, registrar compradores, confirmar ventas y revisar su progreso.

El texto debe adaptarse al contexto y a las acciones disponibles para cada tipo de usuario.

## 3. Tono de comunicación

La redacción debe ser:

* Clara.
* Cálida.
* Cercana.
* Paciente.
* Respetuosa.
* Directa.
* Tranquilizadora cuando ocurre un error.

La aplicación debe hablarle al usuario de "tú".

No debe sonar:

* Técnica.
* Robótica.
* Fría.
* Infantil.
* Condescendiente.
* Excesivamente formal.
* Culpabilizadora.

## 4. Principios generales

### Usar palabras comunes

Preferir palabras que las personas usan normalmente.

Usar:

* "Boletas asignadas".
* "Guardar cambios".
* "Registrar venta".
* "Elige un vendedor".

Evitar:

* "Gestión de asignaciones".
* "Ejecutar transacción".
* "Persistir información".
* "Seleccionar entidad".

### Explicar una idea a la vez

Cada popup, tooltip o mensaje debe comunicar una sola acción o idea principal.

No mezclar instrucciones, advertencias y explicaciones extensas en un mismo mensaje.

### Usar frases cortas

Los textos deben ser fáciles de leer rápidamente.

Evitar párrafos largos, especialmente dentro de popups, tooltips, alertas y pantallas móviles.

### Comenzar con la acción

Cuando el usuario deba hacer algo, utilizar verbos claros:

* Selecciona.
* Escribe.
* Revisa.
* Guarda.
* Asigna.
* Confirma.
* Continúa.
* Registra.

### Explicar qué ocurrirá

Cuando una acción tenga una consecuencia importante, explicarla antes de que el usuario confirme.

Ejemplo:

"Estas boletas quedarán asignadas a este vendedor y no podrán entregarse a otro."

### No asumir conocimientos previos

Cuando aparezca un concepto que pueda ser desconocido, debe explicarse con palabras sencillas y dentro del contexto.

### Mantener los mismos términos

Una misma función debe conservar siempre el mismo nombre.

Por ejemplo, no alternar entre:

* Boleta, ticket y número.
* Vendedor, colaborador y usuario.
* Rifa, campaña y sorteo.

Antes de crear nuevos textos, cualquier agente debe revisar los términos ya utilizados en el proyecto y mantener consistencia. El glosario canónico está en el **Anexo A**.

## 5. Product tours, popups y tooltips

Cada paso del recorrido guiado debe tener:

1. Un título corto.
2. Una explicación de una o dos frases.
3. Una indicación clara de lo que el usuario puede hacer.

Ejemplo correcto:

**Asigna las boletas**

Selecciona las boletas que quieres entregar a este vendedor. Una vez asignadas, ningún otro vendedor podrá usar esos mismos números.

Ejemplo incorrecto:

**Gestión de asignaciones**

Ejecute la asignación de combinaciones disponibles al usuario seleccionado dentro del módulo administrativo.

Los pasos del recorrido deben seguir el orden real en el que el usuario utilizará la pantalla.

No explicar elementos que no estén visibles o que todavía no puedan utilizarse.

## 6. Botones

Los botones deben indicar claramente la acción que ejecutan.

Usar:

* Guardar cambios.
* Crear vendedor.
* Asignar boletas.
* Registrar venta.
* Confirmar pago.
* Volver.

Evitar botones genéricos cuando pueda existir confusión:

* Aceptar.
* Listo.
* Enviar.
* Continuar.

"Continuar" puede utilizarse cuando el siguiente paso sea evidente.

## 7. Mensajes de error

Los mensajes de error deben incluir:

1. Qué ocurrió.
2. Cómo puede solucionarlo el usuario.
3. Qué información se conservará, cuando sea importante.

Nunca culpar al usuario.

Usar:

"No pudimos guardar la venta. Revisa la conexión e inténtalo nuevamente. La información que escribiste seguirá aquí."

Evitar:

"Error 500."

"Operación inválida."

"Has ingresado datos incorrectos."

Cuando sea útil para soporte técnico, el código del error puede aparecer de forma secundaria, pero nunca debe reemplazar la explicación sencilla.

## 8. Confirmaciones y advertencias

Las confirmaciones deben explicar claramente la consecuencia de la acción.

Ejemplo:

**¿Quieres eliminar este vendedor?**

Ya no podrá ingresar a la aplicación. Las ventas que registró permanecerán guardadas.

Botones:

* Cancelar.
* Eliminar vendedor.

Evitar títulos genéricos como:

* ¿Estás seguro?
* Advertencia.
* Confirmar acción.

> **En este proyecto no se elimina nada.** El ejemplo de arriba ilustra la *estructura* correcta
> (título con la acción concreta + consecuencia + botones explícitos), no el verbo. Aquí el vendedor
> se **desactiva**, el cliente se **archiva** y el pago o la boleta se **anulan**. Ver Anexo C.

## 9. Estados vacíos

Una pantalla vacía debe explicar:

1. Qué aparecerá en ese lugar.
2. Por qué todavía no hay información.
3. Qué puede hacer el usuario.

Ejemplo:

**Aún no tienes vendedores**

Crea tu primer vendedor para comenzar a asignarle boletas.

Botón:

**Crear vendedor**

Evitar:

"No hay datos."

"Sin resultados."

## 10. Mensajes exitosos

Los mensajes de éxito deben confirmar claramente qué se completó.

Usar:

* "Vendedor creado correctamente."
* "Las boletas fueron asignadas."
* "La venta quedó registrada."
* "Los cambios fueron guardados."

Evitar:

* "Operación exitosa."
* "Proceso completado."
* "Éxito."

## 11. Formularios

Las etiquetas deben indicar exactamente qué información se necesita.

Cuando sea necesario, incluir un ejemplo breve.

Ejemplo:

**Nombre del comprador**

Ejemplo: María González

No utilizar el texto de ejemplo como reemplazo de la etiqueta del campo.

Cuando un dato sea obligatorio, indicarlo de manera consistente en toda la aplicación.

> En este proyecto la persona que compra se llama **cliente** en toda la interfaz, no «comprador»
> (Anexo A). El ejemplo de arriba enseña la regla de etiqueta frente a texto de ejemplo, no el
> término.

## 12. Textos relacionados con las boletas

Cuando se explique la asignación de boletas, debe aclararse que:

* Cada combinación es única.
* Una combinación asignada no puede asignarse a otro vendedor.
* El vendedor solo puede administrar las boletas que le fueron entregadas.
* Las acciones que no puedan deshacerse deben advertirse antes de confirmarlas.

Estas reglas deben explicarse únicamente cuando sean relevantes para la acción actual. No sobrecargar todas las pantallas con la misma información.

## 13. Longitud recomendada

Como referencia general:

* Títulos: entre 2 y 7 palabras.
* Botones: entre 1 y 4 palabras.
* Tooltips: una frase corta.
* Pasos del product tour: máximo dos frases.
* Errores: máximo tres frases breves.
* Confirmaciones: título, consecuencia y botones claros.

La claridad tiene prioridad sobre cumplir estrictamente un número de palabras.

## 14. Revisión obligatoria

Antes de finalizar cualquier cambio que incluya textos visibles, el agente debe comprobar:

* ¿Una persona con poca experiencia tecnológica puede entenderlo?
* ¿Explica claramente qué debe hacer?
* ¿Utiliza palabras comunes?
* ¿Mantiene un tono cálido y respetuoso?
* ¿Evita términos técnicos?
* ¿Conserva los nombres utilizados en otras pantallas?
* ¿Explica las consecuencias importantes?
* ¿El botón indica la acción real?
* ¿El mensaje ayuda al usuario a continuar?
* ¿El texto cabe correctamente en móvil?

Si alguna respuesta es "no", el texto debe corregirse antes de considerar terminada la tarea.

---

# Anexos del proyecto

Aplicación concreta de la guía a esta base de código. Añadidos al crear el documento (D-072); no
forman parte del texto normativo de las secciones 1 a 14, pero **son obligatorios igual**.

## Anexo A — Glosario canónico

Una función, un nombre. Si un texto nuevo necesita otro término, primero se cambia aquí.

| Concepto | Término en pantalla | Nunca usar |
|---|---|---|
| Sorteo que agrupa las boletas | **Rifa** | Sorteo, campaña, evento |
| Unidad que se vende | **Boleta** | Ticket, número, cupón |
| Sus dos números | **Número diario** y **número semanal** | Combinación diaria/semanal, cifra |
| Esos dos, en el **encabezado de una tabla**, donde no cabe la palabra entera | **Núm. diario** / **Núm. semanal**, con «Número» en `sr-only` (D-114) | «Núm.» en etiquetas de formulario o en la ficha de la boleta, donde sí cabe |
| Columna que contiene lo que se puede hacer con la fila | **Acción** si hay una sola; **Acciones** si abre un menú (D-114) | Dejar la columna sin encabezado |
| Identificador que genera el sistema | **Código interno** | ID, código de barras |
| Persona que compra | **Cliente** | Comprador, usuario, participante |
| Persona que vende | **Vendedor** | Colaborador, usuario, asesor |
| Persona dueña de la organización | **Dueño** | Owner, propietario, titular |
| Persona con permisos administrativos | **Administrador** | Admin, gestor, supervisor |
| Empresa que opera las rifas | **Organización** | Cuenta, tenant, empresa |
| Pago parcial de una boleta | **Abono** | Cuota, adelanto, parcialidad |
| Dinero que falta por cobrar | **Saldo pendiente** | Deuda, mora, pasivo |
| Precio que la rifa fija para todas sus boletas | **Precio de la rifa** | Precio oficial, precio base, tarifa |
| Vender una boleta por debajo de ese precio | **Rebajar** el precio; la **rebaja** | Descuento, promoción, oferta, rebajar la boleta |
| Lo que gana el vendedor por cada boleta cobrada | **Ganancia** | Comisión, participación, utilidad |
| Conjunto de vendedores a cargo de otro vendedor | **Equipo** | Red, grupo, downline, sucursal |
| Vendedor que pertenece al equipo de otro | **Vendedor** (a secas), o **integrante** del equipo | Sub-vendedor, hijo, subordinado, mini admin |
| Incorporar un vendedor a tu equipo | **Agregar vendedor** | Crear sub-vendedor, reclutar, vincular |
| Entregar boletas a un vendedor o a un cliente | **Asignar** | Adjudicar, vincular, ligar |
| Quitar de circulación una boleta o un pago | **Anular** | Eliminar, borrar, cancelar |
| Borrar para siempre una boleta cargada por error, que nunca se vendió | **Eliminar** | Anular, cancelar, quitar |
| Marcar varias boletas para trabajar con todas a la vez | **Seleccionar** (el botón que lo enciende dice **«Seleccionar varias»**) | Marcar, elegir, tildar |
| Quitar el acceso a una persona | **Desactivar** | Eliminar, borrar, dar de baja |
| Sacar un cliente del listado sin perder su historial | **Archivar** | Eliminar, ocultar, borrar |
| Cuenta creada a la que su dueña todavía no ha entrado | **Invitación pendiente** | Pendiente de activación, sin confirmar, inactivo |
| Cuenta cuya dueña ya configuró su contraseña | **Cuenta activa** | Activado, confirmado, verificado |
| Correo con el enlace para crear la contraseña | **Invitación** | Enlace mágico, token, activación |

**«Rebaja», no «descuento» (D-099).** Un vendedor puede vender una boleta más barata, y en pantalla
eso se llama **rebajar**: «Puedes rebajarlo hasta $60.000», «rebaja de $20.000». *Descuento* se evita
porque en una rifa suena a promoción del negocio —algo que la empresa ofrece a todo el mundo— y esto
es exactamente lo contrario: un trato que hace **una** persona con **un** cliente y que **paga de su
propia ganancia**. Esa consecuencia se dice siempre que aparezca la casilla; es lo único que quien la
usa no puede deducir mirando la pantalla. Y una venta al precio normal **no** menciona la rebaja:
anunciar «rebaja de $0» es ruido en la pantalla que más se usa.

**Lo que se ve corto puede oírse entero** (D-114, y antes D-111). Cuando una palabra no cabe —«Núm.
diario» en el encabezado de una tabla, «1 de 5» en la paginación—, se abrevia **lo visible** y la
palabra completa viaja en un `sr-only`, que sí cuenta para el nombre accesible. Nunca se resuelve
recortando el término para todo el mundo: quien escucha la pantalla oiría «num punto diario» en cada
una de las veinticinco filas.

**Cómo se nombra una boleta en pantalla:** por sus **dos números**, «1234 / 5678» (BR-N11). El
**código interno** es información administrativa: aparece solo dentro del detalle de la boleta y
nunca se ofrece como forma de buscar. Un texto que diga «busca por código» está mal.

**En «Boletas» hay UN buscador, y encuentra dos cosas** (BR-N13, D-100). Desde el 2026-08-21 el mismo
campo acepta el número de la boleta **o** el nombre del cliente que la tiene. Los textos que lo
rodean tienen que nombrar las dos, siempre en este orden —primero la boleta, porque seguimos en
«Boletas»—: «Número de boleta o cliente». Lo que **no** se debe escribir es un texto que obligue a
elegir («¿buscar por boleta o por cliente?»): la aplicación lo distingue sola, y hacer esa pregunta
devuelve al usuario justo el trabajo que se le quitó. Tampoco se anuncia que se busca «por cliente»
como si fuera otro modo: es el mismo buscador.

Si alguien escribe **más de cuatro cifras** —normalmente, copiando un código interno—, se le dice lo
que de verdad está pasando: «Los números de una boleta tienen 4 cifras como máximo. Con más cifras
buscamos el teléfono del cliente». Un resultado que la persona no sabe explicar parece un fallo.

**Anular no es eliminar, y los textos no pueden mezclarlos** (BR-B05, D-084). **Anular** retira de
circulación una boleta que existió: se queda en la lista, marcada como Anulada, y su combinación de
números no vuelve a estar libre. **Eliminar** borra una boleta que nunca debió existir —una
importación equivocada, números tecleados por error— y libera sus números. Solo se puede eliminar lo
que todavía no se vendió ni tiene abonos; en cuanto una boleta entra en la operación, la única salida
es anularla. Un texto que ofrezca «eliminar» donde lo correcto es anular está mal, y al revés
también.

**Roles en el habla del usuario:** dentro del código y de la documentación técnica se usan `owner`,
`admin` y `seller`. En pantalla son siempre **Dueño**, **Administrador** y **Vendedor**.

**En el teléfono cada boleta es una tarjeta, y ahí se dicen dos cosas más** (D-107). La lista
del móvil dejó de ser una tabla encogida, así que perdió los encabezados de columna que decían cuál
número era cuál. En su lugar, bajo los dos números va la leyenda **«Diario · Semanal»**: son los
términos del glosario, en el mismo orden en que aparecen las cifras, y solo se escribe cuando la
boleta tiene los dos. La otra es **«Sin cliente»**, para una boleta que todavía nadie compró: la
tabla ahí pintaba una raya, y una raya no dice que esa boleta se puede vender. El precio, en cambio,
**se calla** cuando no hay venta: la insignia «Disponible» ya lo explica, y un «—» en el sitio más
visible de la tarjeta es ruido.

**«Filtros», y entre paréntesis cuántos hay puestos** (D-107). En el teléfono los desplegables viven
detrás de ese botón, que dice **«Filtros»** cuando no hay ninguno y **«Filtros (2)»** cuando hay dos.
Se cuentan los filtros, **nunca la búsqueda**: lo que se escribió se está viendo en su campo, justo
encima, y sumarlo al paréntesis haría que el número no cuadrara con lo que hay dentro de la hoja.
Dentro, además de los filtros, hay dos salidas: **«Limpiar filtros»**, que los quita y cierra —quien
vacía quiere ver la lista entera—, y **«Ver las boletas»**, que solo cierra. Ninguna de las dos dice
«Aceptar» ni «Listo» (§6).

**El botón que enciende la selección dice «Seleccionar varias»** (D-108). No «Seleccionar», que
suena a marcar *esta* boleta, ni «Seleccionar boletas», que nombra lo que ya se está mirando: estamos
en «Boletas» y esa palabra no añade nada. Lo que hay que decir es que a partir de ese toque se pueden
marcar **varias** para actuar sobre todas a la vez. Cuando el modo está encendido, el mismo botón
dice **«Cancelar»** —salir descarta lo marcado— y no debe confundirse con **«Limpiar selección»**,
que vacía lo marcado **sin** salir del modo.

**En la barra inferior del teléfono cae el posesivo, y solo ahí** (D-106). El menú lateral y el
título de la pantalla siguen diciendo **«Mis boletas»**, **«Mis clientes»** y **«Mis pagos»**; la
barra de abajo dice **«Boletas»**, **«Clientes»** y **«Pagos»**, porque a 320 px cada opción dispone
de unos 72 px. No es un término nuevo —boleta, cliente y pago son los del glosario—, es la misma
palabra sin el «Mis» que ahí no cabe. Se escribe en el `shortLabel` de esa entrada, nunca inventando
una etiqueta suelta dentro de la barra. Y al revés: **no se le quita el posesivo al título de la
pantalla** para que «coincida» con la barra; el título dice de quién son las boletas, que es
justamente lo que un vendedor necesita leer al entrar.

**La barra de abajo dice dónde estás, no dónde estuviste.** En una pantalla que no está entre las
cuatro —Mi equipo, Rifas, Reportes— **no se enciende ninguna opción**. Dejar «Panel» encendido
mientras se lee un reporte sería más cómodo de mirar y falso.

**Nadie es un «sub-vendedor» en pantalla.** Dentro del código existe `parent_seller_id` y la
documentación habla de jerarquía, pero para el usuario todos son **vendedores**: unos tienen equipo y
otros no (BR-E01). Cuando haga falta distinguirlo, se dice **«los vendedores de tu equipo»** o
**«integrantes»**, nunca «sub-vendedor», «hijo» ni «subordinado». En el portal del vendedor la
pantalla se llama **«Mi equipo»**, en la misma familia que «Mis boletas», «Mis clientes» y «Mis
pagos»; el verbo para incorporar a alguien es **agregar**, y el del portal administrativo para dar de
alta a un vendedor de la organización sigue siendo **invitar** o **nuevo vendedor**: son dos acciones
distintas hechas por personas distintas, y por eso conservan verbos distintos.

**Etiquetas de estado:** su redacción está fijada y **no se improvisa** — Borrador · Pendiente de
aprobación · Disponible · Asignada · Anulada · Sin pagar · Abonada · Pagada · Activa · Cerrada, más
las tres de una persona: **Invitación pendiente · Cuenta activa · Inactivo**, y las dos de un
cliente: **Activo · Archivado** (`CLIENT_STATUS_LABELS`, D-113). Fuente única:
`src/lib/constants.ts` (`docs/ARCHITECTURE.md` §8.3). Cambiar una etiqueta significa cambiar ese
archivo, nunca escribirla suelta en una pantalla.

**El estado del cliente se dice arriba, junto al nombre** (D-113). «Archivado» decide lo que se
puede hacer en toda la pantalla —a ese cliente no se le asignan boletas—, así que va en el título y
no en la cuarta casilla de una tarjeta. La insignia dice **qué** pasa; el aviso ámbar de debajo, **qué
implica**, y por eso siguen estando los dos: «Este cliente está archivado: no aparece al asignar
boletas. Su historial se conserva.»

**La paginación dice qué está contando** (D-111). No «Mostrando 1–25 de 118», que deja al lector
adivinando de qué son esos 118, sino **«1–25 de 118 boletas»**, con el término del glosario que
corresponda a la lista: boletas, clientes, pagos. En el teléfono, además, el indicador central dice
**«1 de 5»** y no «Página 1 de 5» —no hay ancho para la palabra—, pero la palabra sigue estando para
quien escucha la pantalla. Los nombres se escriben una sola vez, en `LIST_ITEM_LABELS`, con su
singular y su plural: «1–1 de 1 boleta», nunca «1 boletas».

**Cuando la etiqueta encabeza un grupo, va en plural** (D-112). «Abonadas 9», no «Abonada 9». No es
una etiqueta nueva —esas no se improvisan—, es el plural de las de siempre, y vive donde viven ellas:
`TICKET_PAYMENT_STATUS_PLURAL_LABELS` en `src/lib/constants.ts`. Se usa cuando el texto acompaña a un
recuento; para el estado de **una** boleta se sigue usando el singular.

**El período del panel del vendedor manda sobre lo que pasó, no sobre lo que hay** (D-112). El
selector de arriba a la derecha dice **qué fechas** —«11 a 17 de ago de 2026»— y no el nombre de la
opción, porque «Últimos 7 días» no responde a la pregunta que uno se hace al mirar una cifra. Lo que
cambia con él es el dinero **recaudado** y su tendencia; el inventario y la cobranza son la foto de
hoy y no se mueven. La comparación con el período anterior lo nombra por su duración real —«vs. los 7
días anteriores»—, y si en ese período no entró nada se dice tal cual: **un aumento desde cero no
tiene porcentaje** y escribir «+100 %» sería inventarlo.

**«Registrar abono», también en los accesos rápidos** (D-112). El diseño de referencia decía
«Registrar pago»; la aplicación entera dice **abono** desde el principio y ahí no se cambia. Un
término, un nombre.

**Rojo y gris no dicen lo mismo** (D-112). Rojo es «Sin pagar»: boletas de las que no ha entrado
nada, que es lo que pide atención. El «Por cobrar» del anillo del resumen financiero es **gris**,
porque ahí significa «todavía no»; pintar de rojo la mitad de un gráfico normal convierte una rifa
que va bien en una alarma. Verde es dinero cobrado y azul, abonos.

**«Invitación pendiente» no es «Inactivo», y la diferencia importa** (BR-E14). *Inactivo* significa
que alguien le quitó el acceso a esa persona; *invitación pendiente*, que todavía no ha entrado
ninguna vez. Se ven parecidos en pantalla y no lo son: mientras la invitación esté pendiente, quien
la agregó puede corregirle el correo o eliminar el alta, y en cuanto entra ya no. Llamar «Inactivo» a
un integrante recién agregado —que es lo que hacía la aplicación antes de 2026-08-14— sugería un
castigo donde solo había una espera.

## Anexo B — Dónde vive cada texto

| Tipo de texto | Dónde se escribe |
|---|---|
| Etiquetas de estado, roles y métodos de pago | `src/lib/constants.ts` |
| Nombre de lo que cuenta cada listado en su paginación | `src/lib/constants.ts` (`LIST_ITEM_LABELS`, D-111) |
| Etiquetas de estado de pago en plural, para encabezar grupos | `src/lib/constants.ts` (`TICKET_PAYMENT_STATUS_PLURAL_LABELS`, D-112) |
| Nombres de los períodos del panel del vendedor | `src/features/dashboard/date-range.ts` (`DASHBOARD_RANGE_LABELS`, D-112) |
| Textos de las siete piezas del panel del vendedor | `src/features/dashboard/components/`, una por pieza (D-112) |
| Etiquetas de estado de un cliente («Activo», «Archivado») | `src/lib/constants.ts` (`CLIENT_STATUS_LABELS`, D-113) |
| Encabezados de columna | El `header` de cada columna, en el `*Table.tsx` de su módulo (D-114) |
| Rótulos y textos de la ficha del cliente | `src/features/clients/components/ClientInfoCard.tsx` y `ClientTotals.tsx` (D-113) |
| Nombres del menú (lateral, barra inferior y menú de usuario) | El `layout.tsx` de cada portal: `label` y, para la barra inferior, `shortLabel` (D-106) |
| Leyendas de la tarjeta de boleta del teléfono | `src/features/tickets/components/TicketCardList.tsx` (D-107) |
| «Seleccionar varias» y su «Cancelar» | `src/features/tickets/selection/components/TicketSelectionModeButton.tsx` (D-108) |
| Errores de validación de formularios | `schemas.ts` de cada módulo de `src/features/` (mensajes de Zod) |
| Errores devueltos por el servidor | `src/lib/errors.ts` (`mapPgError`) y los `RAISE` de las migraciones |
| Títulos y descripciones de pantalla | `PageHeader` de cada `page.tsx` |
| Estados vacíos | `EmptyState` (`src/components/data/`) |
| Pistas y avisos de los buscadores | `src/features/search/hints.ts`, **todos juntos** |
| Confirmaciones de acciones sensibles | `ConfirmDialog` (`src/components/feedback/`) |
| Mensajes de éxito | El `toast` de cada Server Action, en su componente cliente |
| Pasos del recorrido guiado (título y explicación) | `src/features/tour/tours.ts`, **todos juntos** |
| Texto de los avisos de la campanita | `src/features/notifications/text.ts`, **todos juntos** (D-093) |

Un mismo mensaje no se escribe dos veces: si dos pantallas lo necesitan, se extrae.

## Anexo C — Contradicciones detectadas y cómo se resuelven

| Contradicción | Resolución |
|---|---|
| La guía §8 propone «Eliminar vendedor», pero **personas, clientes y pagos no se borran nunca** (ni política ni privilegio de `DELETE` en ninguna tabla — D-038) | Se conserva la **estructura** del ejemplo y se cambia el verbo: **Desactivar vendedor**, **Archivar cliente**, **Anular pago**. La consecuencia se explica igual: «Ya no podrá ingresar a la aplicación. Las ventas que registró permanecerán guardadas.» |
| Desde 2026-08-08 **sí** existe «Eliminar», pero solo para boletas cargadas por error (BR-B05, D-084) | Es un término del glosario con significado acotado, no un sinónimo de anular. Sigue prohibido llamar «eliminar» a desactivar, archivar o anular. El borrado sigue sin existir como privilegio: ocurre dentro de una función `SECURITY DEFINER` y solo sobre boletas sin cliente, sin venta y sin abonos |
| La guía §11 usa «comprador» y §2 «Owner»; la aplicación dice **cliente** y **dueño** | Manda el Anexo A. Los ejemplos de la guía enseñan la regla, no el término. |
| `CLAUDE.md` §27 fija las etiquetas de estado; la guía §4 pide términos consistentes | No hay conflicto real: §27 y `constants.ts` son la fuente de esas ocho etiquetas; esta guía manda en todo lo demás. |
| La guía §6 desaconseja «Continuar» y «Aceptar»; algunos diálogos necesitan un botón de cierre | «Continuar» solo cuando el siguiente paso sea evidente; para cerrar sin actuar, **Cancelar** o **Volver**, nunca «Aceptar». |

## Anexo D — Estado de aplicación

La guía se creó **después** de terminar las nueve fases del producto (2026-08-05) y ese mismo día se
aplicó a los textos existentes (D-073). Estado real:

| Capa | Estado |
|---|---|
| Interfaz (`src/`): pantallas, botones, formularios, estados vacíos, confirmaciones, toasts | ✅ Revisada. **302 correcciones en 89 archivos**, más 18 archivos de pruebas ajustados |
| Etiquetas de estado y roles (`src/lib/constants.ts`) | ✅ «Dueño», «Pendiente de aprobación» |
| Errores de validación (Zod) y errores traducidos (`src/lib/errors.ts`) | ✅ Revisados |
| **Mensajes que lanza la base de datos** (`raise exception` en migraciones aplicadas) | ❌ Persisten textos sin tildes. Cambiarlos exige una migración nueva y aplicarla al proyecto real — `I-030` |
| Tono: tuteo de §3 | ✅ Ya se cumplía; no hizo falta rehacerlo |

**Lo que no se cambió, a propósito:** «solo» adverbio no lleva tilde (norma actual de la RAE);
«este/esta/aquel» como demostrativos tampoco; los comentarios del código se dejan como están porque
no los lee ningún usuario; y los títulos de confirmación siguen en forma de acción («Anular boleta»,
«Archivar cliente») en vez de pregunta, que es igual de válido bajo §8 y evita un cambio masivo sin
beneficio.
