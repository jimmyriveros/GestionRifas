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
| Los dos, en **la columna de una tabla o en una tarjeta**, donde se escriben juntos | **Boleta**, con la leyenda **«Diario · Semanal»** debajo (D-130) | Dos columnas separadas; «Núm. diario» y «Núm. semanal», que ya no existen |
| Lo abonado de una boleta | **Abonado** | Pagado, recaudado, cobrado |
| Lo que falta por cobrar de una boleta, **en la columna de una tabla larga** | **Falta** (D-130) | Debe, pendiente, restante |
| Lo mismo, donde sí cabe el término entero: la ficha del cliente y el detalle | **Saldo pendiente**, o **Saldo** en una tarjeta de teléfono | Deuda, mora, pasivo |
| Qué parte del precio lleva abonada una boleta | **Progreso**, y el texto **«58 % abonado»** (D-130) | Avance, completitud, cumplimiento |
| Columna que contiene lo que se puede hacer con la fila | **Acción** si hay una sola; **Acciones** si abre un menú (D-114) | Dejar la columna sin encabezado |
| Identificador que genera el sistema | **Código interno** | ID, código de barras |
| Persona que compra | **Cliente** | Comprador, usuario, participante |
| Persona que vende | **Vendedor** | Colaborador, usuario, asesor |
| Persona dueña de la organización | **Dueño** | Owner, propietario, titular |
| Persona con permisos administrativos | **Administrador** | Admin, gestor, supervisor |
| Empresa que opera las rifas | **Organización** | Cuenta, tenant, empresa |
| Pago parcial de una boleta | **Abono** | Cuota, adelanto, parcialidad |
| Que una boleta ya se pagó entera, escrito en la columna «Abono» de un archivo | **Cancelado** (D-129) | Completa, Completo, Pagada, Total, Saldada |
| Dinero que falta por cobrar | **Saldo pendiente** | Deuda, mora, pasivo |
| Valor de todas las boletas ya vendidas | **Total vendido** | Total a cobrar, total facturado, cartera |
| Lo que se vendió en unas fechas, mirado por fecha de venta | **Ventas por fecha** | Ventas del día, informe de ventas, cierre diario |
| Lo que llevan pagado **hoy** esas boletas | **Abonado** | Recaudado, cobrado, ingresos |
| Precio que la rifa fija para todas sus boletas | **Precio de la rifa** | Precio oficial, precio base, tarifa |
| Lo que debe el cliente por UNA boleta | **Precio de venta** | Precio personalizado, override, tarifa |
| Vender una boleta por debajo de ese precio | **Rebajar** el precio; la **rebaja** | Descuento, promoción, oferta, rebajar la boleta |
| Lo que gana el vendedor por cada boleta cobrada | **Ganancia** | Comisión, participación, utilidad |
| Que la ganancia suba según cuántas boletas lleve cobradas | **Ganancia por tramos**; cada escalón es un **tramo** | Comisión escalonada, niveles, rangos |
| Una cantidad igual por cada boleta, sin escalones | **Ganancia fija por boleta** | Tarifa plana, monto fijo, cuota |
| Volver a calcular lo ya cobrado con la ganancia nueva | **Recalcular** | Reprocesar, actualizar, recomputar |
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
| Dejar el menú lateral en solo iconos, y devolverlo a su sitio | **Cerrar el menú** y **Abrir el menú** | Contraer, expandir, colapsar, plegar, minimizar |
| Poner la aplicación en la pantalla de inicio del teléfono | **Instalar** | Descargar, bajar la app, añadir acceso directo |
| El nombre bajo el icono, donde solo caben ~12 caracteres | **Rifas** | «Gestión de…», que es como quedaría el nombre completo |
| Resultado publicado por una lotería colombiana | **Resultado** (oficial) | Premio, ganador, extracto |
| Sitio que republica resultados sin ser la autoridad | **Fuente** (a secas, o «otra fuente») | Agregador, espejo, tercero |
| Que dos de esas fuentes digan el mismo número | **Verificado por 2 fuentes** | Consenso, validado, corroborado |
| El primer premio de esa lotería, cuatro dígitos | **Número mayor** | Combinación ganadora, primer premio, hit |
| Que una boleta tenga ese mismo número | **Coincidencia** | Ganador, premio ganado, acierto oficial |
| La serie que a veces publica la lotería | **Serie informativa** | Serie ganadora |
| Sorteo de esa lotería, distinto de la rifa | **Sorteo** de la lotería X | No usar «sorteo» para la rifa |
| Que aún no hay hora oficial | **Horario por confirmar** | Pendiente de scrape, sin schedule |
| Estar sin internet | **Sin conexión** | Offline, desconectado, sin red |
| Código nuevo servido tras un despliegue | **Versión** | Build, actualización del sistema, parche |
| Página pública con los números de un vendedor | **Catálogo** | Vitrina, tienda, landing, micrositio |
| Su dirección, que el vendedor reparte | **Enlace** (público) | Link, URL, slug |
| Crear un enlace nuevo que rompe el anterior | **Generar un enlace nuevo** | Regenerar, rotar, refrescar |
| Encender o apagar el catálogo | **Publicar** / **dejar de publicar** | Activar, desactivar, habilitar |
| Que una boleta del catálogo ya la tiene alguien | **Tomado**, y **solo en las cifras**: «29 de 68 ya fueron tomados». Desde D-164 no existe como etiqueta, porque una boleta tomada no se publica | Vendido, ocupado, no disponible |
| La parte del catálogo que ya tiene dueño, en porcentaje | **Reservado** — es la palabra del porcentaje, **no un estado**: nada se aparta (D-164) | Vendido, apartado, comprometido |
| Pedirle una boleta al vendedor por WhatsApp | **Solicitar** | Reservar, apartar, comprar |
| Que el catálogo de un vendedor abre de verdad | **Activo** / **Inactivo** | Publicado, encendido, habilitado, en línea |
| Mandar el enlace por el menú del teléfono | **Compartir** | Enviar, difundir, propagar |
| Abrir la página pública para verla uno mismo | **Ver catálogo** | Previsualizar, ir al catálogo, abrir |

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

> El ejemplo de «Núm. diario» es **histórico**: esa columna dejó de existir en D-130, donde los dos
> números se juntaron en una sola llamada «Boleta» —que cabe entera— con la leyenda «Diario ·
> Semanal» debajo. La regla sigue vigente tal cual, y la paginación la sigue aplicando con «1 de 5».

**Cómo se nombra una boleta en pantalla:** por sus **dos números**, «1234 / 5678» (BR-N11). El
**código interno** es información administrativa: aparece solo dentro del detalle de la boleta y
nunca se ofrece como forma de buscar. Un texto que diga «busca por código» está mal.

**Nombrar una boleta y titular una pantalla no son lo mismo** (D-126). El encabezado del detalle de
una boleta dice **«Detalle boleta»**, a secas, en los dos portales. Decía «4593 / 8868» con
«R001 — Rifa Navidad 2026» debajo, y las tres cosas volvían a salir a un dedo de distancia: los dos
números, en las cajas grandes de la tarjeta siguiente. Un título repite dónde estás; no hace falta
que además identifique el registro que ya se está mirando. Los números siguen nombrando la boleta
**donde sí hace falta nombrarla** —el listado, el diálogo de venta, el aviso de éxito, la etiqueta
del enlace que la abre—, así que BR-N11 no se toca. La **rifa** bajó al contenido: al vendedor, en
«Detalles de la boleta»; al portal administrativo, junto a «Vendedor», que es donde sí distingue
algo.

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

**«Cerrar el menú», no «Contraer»** (D-131). El botón de la barra lateral hace algo que se ve al
instante —los nombres se van, quedan los iconos—, así que el texto no tiene que describir la mecánica,
solo nombrar la acción. *Contraer*, *colapsar* y *plegar* son palabras de programa de diseño; abrir y
cerrar las usa todo el mundo. El mismo botón dice lo contrario según cómo esté, nunca las dos cosas a
la vez.

**Dos textos, y el botón siempre hace algo** (D-132). Cuando la ventana es tan estrecha que el menú no
cabe abierto, el botón **lo abre encima del contenido**, flotando; ya no se queda inerte con un globo
que se disculpa. Y el texto no cambia por eso: la acción es la misma —abrir el menú— y se llama igual
empuje el contenido o flote sobre él. Un tercer texto obligaría a la persona a entender una diferencia
que la pantalla ya le está enseñando.

> Hasta el 2026-08-28 el globo decía «No hay espacio para abrir el menú. Amplía la ventana.» **Ese
> texto ya no existe**, porque tampoco existe el comportamiento que describía. Se conserva la nota
> como aviso: si vuelve a aparecer en algún sitio, sobra.

**Con el menú cerrado, cada icono dice su nombre.** No se inventa una abreviatura ni se recorta el
término: el nombre entero viaja en el globo, y sigue estando en el HTML para quien escucha la pantalla
(es `sr-only`, no desaparece). Son los mismos nombres del menú abierto —«Mis boletas», «Vendedores»,
«Administradores»—, sin cambiar ni una palabra.

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

**La ganancia del integrante sale del bolsillo de su vendedor padre, y eso se dice** (D-127). Es lo
único de esa pantalla que quien elige no puede deducir mirándola, así que acompaña siempre a las dos
tarjetas: «Su ganancia sale de la tuya: de cada boleta que cobre tu equipo, tú recibes lo que quede
después de pagarle.» De ahí sale también el tope, y se explica con la misma cifra en vez de con una
regla abstracta: «Puedes darle hasta $60.000, que es lo que ganas tú por boleta». Cuando la base de
datos lo rechaza dice lo mismo con otras palabras —«No puedes pagarle más de $60.000 por boleta: es
lo que ganas tú por cada boleta y de ahí sale su ganancia»—, nunca «valor fuera de rango».

**Cambiar la ganancia se anuncia antes de guardar, no después** (D-127). El aviso aparece **en el
momento** en que la elección deja de ser la que estaba guardada —igual que el del cambio de correo—,
y dice las dos consecuencias, incluida la que afecta a quien está decidiendo: «Al guardar, volvemos a
calcular las boletas que [nombre] ya cobró con esta nueva ganancia. Lo que lleva acumulado puede
subir o bajar, y lo tuyo también.» El botón dice **«Guardar y recalcular»**, no «Guardar»: es lo que
convierte el aviso en algo que no se puede saltar sin leerlo. No hay un segundo diálogo de
confirmación encima, porque taparía la cifra que se acaba de escribir.

**«Cambiar», no «Editar», para la ganancia.** «Editar datos» ya existe en esa misma pantalla y es
otra cosa —corregir un teléfono no recalcula nada—. Dos botones «Editar» a un centímetro que hacen
cosas de gravedad distinta se tocan por error.

**Nadie es un «sub-vendedor» en pantalla.** Dentro del código existe `parent_seller_id` y la
documentación habla de jerarquía, pero para el usuario todos son **vendedores**: unos tienen equipo y
otros no (BR-E01). Cuando haga falta distinguirlo, se dice **«los vendedores de tu equipo»** o
**«integrantes»**, nunca «sub-vendedor», «hijo» ni «subordinado». En el portal del vendedor la
pantalla se llama **«Mi equipo»**, en la misma familia que «Mis boletas», «Mis clientes» y «Mis
pagos»; el verbo para incorporar a alguien es **agregar**, y el del portal administrativo para dar de
alta a un vendedor de la organización sigue siendo **invitar** o **nuevo vendedor**: son dos acciones
distintas hechas por personas distintas, y por eso conservan verbos distintos.

**Sin conexión no se promete lo que no hay** (D-116). El ejemplo del encargo decía «puedes revisar
algunas partes de Rifas»; aquí eso sería mentira, porque el service worker **no guarda ni una boleta
ni un pago** en el teléfono, a propósito. La pantalla dice lo que pasa y qué hacer: «Estás sin
conexión · Necesitas internet para ver tus boletas y para registrar ventas o abonos. Vuelve a
intentarlo cuando tengas señal.» El botón es **«Reintentar»**, la misma palabra que ya usa la
pantalla de error, no «Intentar nuevamente».

**Nunca se dice que algo se guardó si no llegó al servidor.** Es la regla que ordena todo lo
anterior: sin conexión no hay ventas ni abonos guardados «para después», y por tanto ningún texto
puede sugerirlo.

**El aviso de versión nueva no da una orden, da permiso para esperar** (D-116). «Hay una nueva
versión de Rifas · Actualiza cuando termines lo que estás haciendo. · [Actualizar]». La segunda frase
es la importante: actualizar recarga la pantalla, y quien esté a mitad de un abono tiene que poder
terminarlo. Nunca se recarga sola.

**Un hueco de espera dice qué está pasando, no «Cargando…»** (D-155). Mientras llega el recuadro
de resultados oficiales, la tarjeta conserva su **título de verdad** —«Resultados oficiales»— y las
barras grises van acompañadas de un texto que solo oye quien escucha la pantalla: **«Buscando los
resultados oficiales…»**. Es la misma regla de «Abriendo…» en el menú (D-104): las barras son
decoración y no dicen nada por sí solas, así que el aviso viaja en un `sr-only` con `aria-busy`
sobre la tarjeta. No se escribe «Cargando», que nombra lo que hace la máquina, ni «Espere», que da
una orden por algo que dura décimas de segundo.

**Poner un abono en $0 se explica antes, no después** (D-158). Bajo el campo de «Editar abono» va
siempre la misma línea: **«Con $0 el abono deja de contar en la boleta. Queda en el historial.»** Son
las dos cosas que la pantalla no enseña —la consecuencia y la garantía—, y de paso es lo que hace
**descubrible** la salida: sin ese texto, quien aplicó un abono a la boleta equivocada vuelve a
escribir $1, que es exactamente el problema que originó el cambio. Cuando se conoce el tope, la línea
lo dice primero: «Puedes poner como máximo $120.000. Con $0 el abono deja de contar en la boleta.
Queda en el historial.»

Y el campo vacío dice **«Escribe el valor»**, no «$0»: ahora que el cero es un valor real, un «$0»
gris de texto de ejemplo haría creer que ya está escrito cuando el botón está desactivado.

**Corregir a $0 no es anular, y los textos no pueden mezclarlos** (D-158, y la misma familia que
BR-B05). *Anular* un pago lo retira de las cuentas para siempre, lo hace el personal y exige un
motivo; un abono corregido a **$0** lo puede hacer el vendedor, se queda vigente en el historial y se
puede volver a subir. Ningún texto de la corrección debe decir «anular», «eliminar» ni «borrar», y el
aviso de anulación —«Anular es definitivo: el pago no se puede reactivar»— no se toca.

**«Cancelado» es la palabra del archivo, y no significa «anulado»** (D-129). Es la única
excepción tolerada a «un término, un nombre», y existe porque **ya la escribe el usuario en su
Excel**: en su cuaderno una boleta «cancelada» es una boleta que el cliente terminó de pagar. En
la aplicación, en cambio, *anular* es retirar de circulación (Anexo A), así que las dos palabras no
pueden acercarse: «Cancelado» **solo** se acepta dentro de la columna «Abono» de un archivo, nunca
aparece como etiqueta, ni como botón, ni como estado en pantalla. Ahí la boleta queda **Pagada**,
que es su etiqueta de siempre.

Por eso «Completa» **no** vale, aunque suene bien: si valieran las dos, cada archivo traería una
distinta y el importador tendría que adivinar. Cuando alguien la escribe, el mensaje no se limita a
rechazarla — dice cuál es la buena: «Para dar la boleta por pagada escribe «Cancelado».»

**Los abonos del importador se dicen en pesos, no en lo que traía el archivo** (D-129). Quien
escribió «20» quiso decir veinte mil, y la vista previa lo enseña como **$20.000**: es la única
forma de que vea un dedazo antes de guardar. La misma regla ordena los errores, que citan las dos
cifras en vez de hablar en abstracto: «El abono de $150.000 supera el precio de la boleta
($120.000).»

**En la vista previa del importador conviven dos «estados», y por eso uno se llama «Resultado»**
(D-129). La columna **«Estado»** dice cómo quedará la boleta —Sin pagar, Abonada, Pagada—, y
**«Resultado»**, si la fila sirve o no. Dos columnas tituladas «Estado» a un centímetro se leen una
por la otra.

**«Falta» y «Saldo pendiente» son la misma cifra con dos nombres, y no es un descuido** (D-130).
El término del glosario es **saldo pendiente**, y se escribe entero dondequiera que quepa: la
ficha del cliente, el detalle de la boleta, las tarjetas de resumen. En la tabla de «Mis boletas»
no cabe —son doce columnas— y ahí se llama **«Falta»**, que es lo que un vendedor dice en voz
alta. Lo que NUNCA se hace es abreviarlo a «Saldo pdte.» ni inventar un tercer nombre.

**El dinero se lee en la lista; el color solo lo subraya** (D-130). Cada boleta vendida dice, sin
abrirla, cuánto lleva abonado, cuánto falta y qué parte del precio es eso. La barra y su
porcentaje van siempre **juntos** —«[▓▓░░] 42 %»— y siempre al lado de la insignia de estado: el
verde, el ámbar y el gris repiten lo que ya dicen «Pagada», «Abonada» y «Sin pagar», nunca lo
sustituyen (CLAUDE.md §27). Una boleta que todavía no se ha vendido escribe **«—»**, no «$0»:
cero significaría «vendida y sin abonar», que es otra cosa.

**«Sin cliente» también en la tabla** (D-130). La columna «Cliente» pintaba una raya cuando la
boleta no se había vendido, y una raya no dice que esa boleta se puede vender. Es el mismo texto
que la tarjeta del teléfono ya usaba desde D-107.

**«Abonado» y «Recaudado» no son la misma cifra, y por eso el reporte lo escribe** (D-151, BR-T06).
En **«Ventas por fecha»**, «Abonado» es lo que llevan pagado **hoy** las boletas vendidas en esas
fechas. En **«Pagos por fecha»**, «Recaudado» es el dinero que **entró** en esas fechas. Son
distintos en cuanto un cliente abona un día después de comprar, o sea casi siempre, y quien mira la
pantalla no tiene forma de deducir cuál está viendo. Por eso el reporte lo dice con palabras, debajo
de los indicadores y con un ejemplo: «una boleta vendida el lunes y abonada el martes suma en las
ventas del lunes». Es la misma regla de siempre —explicar lo único que la pantalla no enseña— y no
se quita por parecer larga.

Lo que **no** se hace es renombrar ninguna de las dos para diferenciarlas: «Abonado» es el término
del glosario para lo abonado de una boleta y «Recaudado» el de dinero recibido. Cambiarlos aquí
rompería los otros diez sitios donde ya significan eso.

**El período se dice con fechas, no con el nombre de la opción** (misma regla que D-112). La tarjeta
«Boletas vendidas» lleva debajo el día —«31 ago 2026»— o el rango —«Del 1 al 15 de ago de 2026»—,
porque «hoy» no responde a la pregunta que uno se hace al mirar una cifra dentro de tres días.

**Un rango al revés se avisa, no se corrige solo** (D-151). Con «Desde» posterior a «Hasta» la
pantalla dice **«Las fechas están al revés»** y explica cómo salir: «"Desde" es posterior a "Hasta".
Cambia una de las dos para ver las ventas de ese período.» Los dos campos conservan lo que la persona
escribió. Dar la vuelta al rango en silencio enseñaría datos que nadie pidió; vaciar la tabla sin
explicación parecería que no vendió nada.

**En una tabla de doce columnas se acorta lo visible, no el término** (D-130, D-114). «Ventas por
fecha» escribe **«Precio»** y **«Falta»** en los encabezados —igual que «Mis boletas»— y **«Precio de
venta»** y **«Saldo pendiente»** en el CSV, donde el ancho no es un problema. Y lo abonado, cuya
columna se retira en el teléfono, **no desaparece**: baja a una línea dentro de la celda de «Falta»,
«Abonado $40.000 de $120.000».

**El catálogo público le habla a alguien que no usa la aplicación** (D-159, D-160). Es la única
pantalla que lee una persona ajena a la organización: llegó por un enlace de WhatsApp, no tiene
sesión y no sabe qué es una rifa de esta empresa. De ahí tres reglas propias:

* **No se nombra nada interno.** Ni cliente, ni código interno, ni estado de pago, ni vendedor de
  otro. No es que no se muestre: es que el dato no llega a esa pantalla (BR-K07). Un texto que hable
  de «el código interno» —como sí hace la pista del buscador de «Boletas»— está mal aquí.
* **«Solicitar» no promete nada.** Tocarlo no aparta la boleta, y el aviso al pie lo dice con
  palabras: «Tocar «Solicitar» no aparta el número. {Nombre} te confirmará por WhatsApp si sigue
  disponible.» Es la misma familia que la regla de sin conexión (D-116): nunca se dice que algo quedó
  guardado o reservado si no ocurrió.
* **Una boleta se nombra por sus DOS números, también en WhatsApp.** El mensaje dice «la boleta con
  diario 1234 y semanal 5678», no «el número 1234»: el par es lo único que la identifica (BR-N04,
  BR-N11), y un mensaje ambiguo devuelve al vendedor el trabajo que el catálogo venía a quitarle.

**Y el título de la página sale del nombre de la rifa**, en mayúsculas: «NÚMEROS DISPONIBLES
{RIFA}». No se escribe el nombre comercial en el código —habría que desplegar cada vez que cambie el
premio, y mentiría en cuanto hubiera una segunda rifa—; se escribe en el nombre de la rifa.

**La etiqueta del catálogo dice «CATÁLOGO PÚBLICO», y no «sorteo»** (D-163). El diseño de referencia
del rediseño escribía «SORTEO PÚBLICO», pero **sorteo** está reservado en el Anexo A para el sorteo
de una lotería y expresamente prohibido para la rifa. **Catálogo** es además el término que el
vendedor ya lee en su propio panel —«Mi catálogo público»— y el que describe lo que el visitante
tiene delante. Es la regla §35.2.4 de `CLAUDE.md` aplicada: manda la comprensión, se señala la
contradicción y se sigue.

**El botón del encabezado dice «Escríbenos», con «por WhatsApp» detrás** (D-163). Es el único
contacto que **no nombra ninguna boleta**: se toca antes de elegir, y por eso su mensaje tampoco
cita un número —citarlo haría que el vendedor recibiera solicitudes que nadie pidió—. Bajo `sm` no
cabe la frase entera, así que se abrevia **lo visible** y «por WhatsApp» viaja en un `sr-only`, que
sigue contando para el nombre accesible (D-114). El plural es el de siempre en esta pantalla: el
texto de introducción ya dice «para escribirnos por WhatsApp».

**El resumen dice de qué son sus cifras** (D-163). Las dos tarjetas —«Números disponibles» y
«Números tomados»— cuentan **las boletas que se están viendo**, no el inventario, porque el catálogo
no lo cuenta a propósito (BR-K11). Por eso llevan debajo su alcance: **«En esta página»** cuando hay
más de una, **«En tu búsqueda»** cuando se ha buscado, y su significado —«Puedes elegir el tuyo»,
«Ya tienen dueño»— cuando lo que se ve **es** el catálogo entero. Una cifra sin alcance es una cifra
que el visitante lee como total sin serlo.

Lo que **no** se escribe ahí: ni «Premio principal» ni «Sorteo semanal», las otras dos tarjetas de la
referencia. El premio y la frecuencia **no son datos de este sistema**, y rellenarlos con el nombre
de la rifa o con «Todos los sábados» sería inventarlos.

**Ya no se habla de «números en gris», porque no hay ninguno** (D-164). El texto de introducción es
exactamente **«Elige el número que más te guste y toca 'Solicitar' para escribirnos por WhatsApp.»**
y se acabó: la frase «Los números en gris ya están tomados» describía una pantalla que dejó de
existir cuando las boletas vendidas dejaron de publicarse. Un texto que promete algo que no está
deja a quien lee buscándolo. Por lo mismo desapareció la etiqueta **«Tomado»**: ya no hay nada que
etiquetar así.

**Las tres cifras dicen de qué son sin decir «en esta página»** (D-164). Se leen **«39 · números
disponibles»**, **«29 de 68 · ya fueron tomados»** y **«43 % · reservado»**, y son del catálogo
entero. Antes llevaban debajo «En esta página» porque contaban las boletas de la página; ese rótulo
se retira **porque se retira el motivo**, no por ahorrar una línea. **«Reservado» es solo la palabra
del porcentaje**: no existe ningún estado de reserva, y tocar «Solicitar» sigue sin apartar nada
—eso lo sigue diciendo el aviso del pie, que no se toca—.

**«¡Quedan pocos números!» solo se escribe cuando quedan pocos** (D-164). El encargo lo pedía
siempre; con el 10 % vendido sería falso, y esta es la única pantalla que lee alguien de fuera de la
organización, que no tiene forma de contrastarlo. Aparece a partir del **70 % reservado** y calla
por debajo. Es la §7 de esta guía aplicada tal cual: la aplicación no dice cosas que no son ciertas,
y la urgencia no es una excepción.

**Los estados vacíos distinguen «no queda ninguno» de «ese no existe»** (D-164). Sin búsqueda:
**«Por ahora no quedan números disponibles»**, con la salida de escribirle al vendedor por si
publica más. Con búsqueda: **«No encontramos ese número entre los disponibles»** —«entre los
disponibles» no sobra: sin esa coletilla, quien busca una boleta que alguien acaba de comprar cree
que se equivocó de número—.

**El encabezado ya no ofrece WhatsApp** (D-164). Se retiró «Escríbenos por WhatsApp»: era el único
camino a WhatsApp que **no nombraba ninguna boleta**, y un mensaje así devuelve al vendedor la
pregunta que el catálogo venía a quitarle. Queda «Solicitar», que nombra los dos números.

**Al bajar, el encabezado dice la rifa en lugar de «Vendedor oficial»** (D-164). Sustituye, no
añade: son las mismas dos líneas, así que el encabezado no crece y el nombre de la rifa nunca se lee
dos veces a la vez. Es texto secundario y truncado, **no un segundo `h1`**.

**El vendedor reparte su catálogo desde el panel, y ahí se dice lo justo** (D-161). Los tres botones
—**Compartir**, **Copiar enlace** y **Ver catálogo**— llevan **texto visible junto al icono**: un
icono solo obliga a adivinar, y esta tarjeta la usa gente que no vive en aplicaciones. Las reglas
propias de esos textos:

* **«Activo» / «Inactivo» describen el ENLACE, no a la persona.** Inactivo aquí significa que la
  dirección no abre —apagada, sin generar, o con la rifa cerrada—, y nunca que a alguien le hayan
  quitado el acceso, que es lo que significa «Inactivo» en una cuenta (BR-E14). Lo desambigua el
  título de la tarjeta, «Mi catálogo público». Son las mismas dos palabras en los **dos** portales:
  antes la ficha del vendedor decía «Publicado»/«Sin publicar» y se unificó, porque es el mismo
  estado y un término tiene un solo nombre.
* **Sin enlace no se ofrece ningún botón.** Se dice qué pasa y a quién pedírselo: «Tu enlace todavía
  no está disponible. Pídele a quien administra la rifa que publique tu catálogo.» Un botón que
  lleva a un «no encontrado» es peor que no tener botón.
* **Nunca se dice que se copió algo que no se copió.** Si el portapapeles falla, el aviso lo dice y
  manda copiar a mano. Es la misma regla que la de sin conexión (D-116).
* **Cancelar el menú de compartir no produce ningún mensaje.** Quien lo cierra a propósito no ha
  sufrido un error, y avisarle —o copiarle algo que no pidió— convierte una decisión suya en un
  incidente.
* **El mensaje que se comparte habla en primera persona**: «Consulta **mis** números disponibles».
  Lo envía el vendedor a un chat personal; un texto corporativo ahí suena a reenvío.


**Un número que no viene de la lotería no se presenta como si viniera** (D-162, BR-L26). Cuando la
página oficial no puede entregar un sorteo, la aplicación lo confirma con **dos fuentes distintas**,
y el recuadro lo dice con esas palabras: **«Verificado por 2 fuentes»**, con el número real de
fuentes, donde en otro caso diría **«Fuente oficial»**. No es un matiz técnico: quien va a pagar un
premio necesita saber si el número lo publicó la lotería o lo publicaron dos sitios que la copian.

Lo que **no** se hace: llamarlas «oficiales», poner la lista de direcciones en pantalla —la evidencia
completa es operativa, no contenido para un vendedor— ni presentar como confirmado un sorteo que
solo tiene una fuente. Si las fuentes se contradicen, la pantalla **no enseña ningún número**.

El título del recuadro sigue siendo **«Resultados oficiales»**: describe de qué van esos sorteos —los
de las loterías oficiales—, y quien lee la línea de procedencia ya sabe de dónde salió cada número.
Cambiarlo a «Resultados de loterías» se evaluó y se descartó: la palabra que importa está donde se
mira la cifra, no en el título.

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

**Dentro de un anillo solo va un porcentaje** (D-124). Ni un importe, ni un nombre largo: el hueco
central mide una proporción fija del dibujo, así que solo cabe con seguridad un texto de largo
acotado, y un porcentaje siempre mide entre dos y cuatro caracteres. El dinero se escribe **fuera**,
al lado, donde puede crecer. La consecuencia práctica: si un texto nuevo no cabe en el centro de un
anillo, la respuesta nunca es encoger la letra ni agrandar el gráfico, es sacarlo.

**«Total vendido» y «Por cobrar» no son la misma cifra, y por eso no se parecen** (D-124). *Total
vendido* es lo que valen las boletas ya vendidas; *por cobrar*, lo que falta de ellas. El centro del
anillo del panel llamaba «Total a cobrar» a la primera, y era el único sitio de la aplicación que lo
hacía: las otras diez pantallas ya decían «Total vendido». Dos rótulos casi iguales para dos cifras
distintas se leen uno por el otro.

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
| Rótulos del resumen de pago de una boleta («Abonado», «Pendiente», «de $120.000») | `src/features/tickets/components/TicketPaymentSummary.tsx` (D-124) |
| Lo que va dentro de un anillo: el pie bajo el porcentaje | Lo pasa quien lo usa, en `caption` / `centerCaption` (D-124) |
| Nombres del menú (lateral, barra inferior y menú de usuario) | El `layout.tsx` de cada portal: `label` y, para la barra inferior, `shortLabel` (D-106) |
| «Cerrar el menú» y «Abrir el menú», los **dos únicos** textos de ese botón | `src/components/layout/AppSidebar.tsx` (D-131, D-132) |
| Leyendas de la tarjeta de boleta del teléfono | `src/features/tickets/components/TicketCardList.tsx` (D-107) |
| Rótulos de la tarjeta de cliente del teléfono («Boletas», «Saldo») | `src/features/clients/components/ClientCardList.tsx` (D-136) |
| La leyenda «Diario · Semanal» y el enlace que nombra la boleta, para las cuatro listas | `src/features/tickets/components/TicketNumbers.tsx` (D-130) |
| Encabezados y rótulos del dinero de «Mis boletas» («Abonado», «Falta», «Progreso») | `src/features/tickets/components/TicketsTable.tsx` y `TicketCardList.tsx` (D-130) |
| Encabezados y rótulos del dinero de «Boletas de este cliente» («Saldo pendiente», «Saldo», «de $120.000», «58 % abonado») | `src/features/tickets/components/ClientTicketsTable.tsx` y `ClientTicketCardList.tsx` (D-130) |
| Lo que anuncia una barra de cobro a quien no la ve (`aria-label`) | Lo pasa quien la usa, en `label`; la redacción vigente es «42 % abonado» (D-130) |
| «Seleccionar varias» y su «Cancelar» | `src/features/tickets/selection/components/TicketSelectionModeButton.tsx` (D-108) |
| Nombres de las dos formas de pagar a un integrante | `src/lib/constants.ts` (`COMMISSION_MODEL_LABELS`, D-127) |
| Textos de las dos tarjetas de elección, el tope y el campo de la cifra | `src/features/team/components/CommissionModelField.tsx` (D-127) |
| Aviso de recálculo y «Guardar y recalcular» | `src/features/team/components/TeamCommissionDialog.tsx` (D-127) |
| Rótulos de la tarjeta «Cuánto gana» de la ficha del integrante | `src/features/team/components/TeamCommissionCard.tsx` (D-127) |
| Errores de validación de formularios | `schemas.ts` de cada módulo de `src/features/` (mensajes de Zod) |
| Errores devueltos por el servidor | `src/lib/errors.ts` (`mapPgError`) y los `RAISE` de las migraciones |
| Nombre y descripción de cada reporte | `src/features/reports/schemas.ts` (`REPORT_LABELS`, `REPORT_DESCRIPTIONS`) |
| Textos de «Ventas por fecha»: nota del «Abonado», estado vacío, rango al revés, encabezados | `SalesByDateReport`, dentro de `src/features/reports/components/ReportsView.tsx` (D-151) |
| Encabezados del CSV de «Ventas por fecha» | `src/features/reports/export.ts` (`salesByDateColumns`, D-151) |
| Títulos y descripciones de pantalla | `PageHeader` de cada `page.tsx` |
| Nombre de la **organización** que se lee en la barra lateral y en el encabezado del móvil | **No es un texto: es el dato `organizations.name`** de la base de datos (D-126). No se busca en el código |
| Estados vacíos | `EmptyState` (`src/components/data/`) |
| Pistas y avisos de los buscadores | `src/features/search/hints.ts`, **todos juntos** |
| Mensajes de la columna «Abono» de un archivo (qué se entiende y qué no) | `src/features/tickets/import/abono.ts`, **todos juntos** (D-129) |
| Lo que explica el importador antes de elegir el archivo | `src/features/tickets/import/components/ImportDropzone.tsx` |
| Encabezados y resumen de la vista previa del importador | `src/features/tickets/import/components/ImportPreview.tsx` |
| Confirmaciones de acciones sensibles | `ConfirmDialog` (`src/components/feedback/`) |
| La marca de la boleta desde la que se abrió el formulario de abono | `src/features/payments/components/PaymentForm.tsx` — «La que estabas viendo» (D-133) |
| Título, rótulos y botones de corregir un abono | `src/features/payments/components/EditPaymentDialog.tsx` — «Editar abono», «Valor actual», «Nuevo valor», «Guardar cambios» (D-134); el aviso del tope y del cero, y el texto de ejemplo «Escribe el valor» (D-158) |
| Título, rótulos y botones de corregir el precio de una boleta | `src/features/tickets/components/EditSalePriceDialog.tsx` — «Editar precio de venta», «Precio de venta actual», «Nuevo precio», «Guardar cambios» (D-137) |
| Quién recibe el abono, debajo del título | `src/features/payments/components/PaymentClientBanner.tsx` — «Abono para», **Cambiar** (el nombre accesible sigue siendo «Cambiar de cliente», D-138) |
| Rótulos de cada boleta en el teléfono al repartir un abono | `src/features/payments/components/PaymentAllocationCards.tsx` — «Boleta», «Debe», «Abonar ahora», «Saldo después del abono», «Quedará» (D-138) |
| Mensajes de éxito | El `toast` de cada Server Action, en su componente cliente |
| Pasos del recorrido guiado (título y explicación) | `src/features/tour/tours.ts`, **todos juntos** |
| Texto de los avisos de la campanita | `src/features/notifications/text.ts`, **todos juntos** (D-093) |
| «Fuente oficial» y «Verificado por N fuentes», la línea de procedencia | `src/features/lottery/dashboard.ts` (`LOTTERY_DASHBOARD_COPY`) y `LotteryResultsCard.tsx` (D-162) |
| Textos del recuadro de resultados oficiales del Panel | `src/features/lottery/dashboard.ts` (`LOTTERY_DASHBOARD_COPY`) y `LotteryResultsCard.tsx` (D-147). Los avisos de programación reutilizan `notificationMessage` |
| Lo que anuncia el hueco del recuadro mientras llega — «Buscando los resultados oficiales…» | `LOTTERY_DASHBOARD_COPY.loading`, y lo pinta `LotteryResultsSection.tsx` (D-155) |
| Nombre de la aplicación instalada y su descripción | `src/lib/pwa.ts` (D-115) |
| Ofrecimiento de instalar, y las instrucciones de iPhone | `src/features/pwa/copy.ts`, **todos juntos** — los leen la tarjeta del panel y la opción del menú de usuario (D-123) |
| Aviso de versión nueva | `src/features/pwa/components/ServiceWorkerManager.tsx` (D-116) |
| Pantalla sin conexión | `src/app/offline/page.tsx` y `components/OfflineRetry.tsx` (D-116) |
| Textos del catálogo público: título, introducción, aviso de que no se aparta | `src/app/(catalogo)/catalogo/[slug]/page.tsx` (D-159) |
| Los dos estados de una boleta pública y el rótulo «Semanal» | `src/features/catalog/components/CatalogTicketCard.tsx` (D-160) |
| El mensaje que llega escrito a WhatsApp, y el saludo | `src/features/catalog/whatsapp.ts`, **todo junto** (D-160) |
| Pista y estado vacío del buscador del catálogo | `src/features/search/hints.ts` (`catalogSearchHint`, `CATALOG_SEARCH_EMPTY_DESCRIPTION`, D-160) |
| «Este enlace ya no está disponible» | `src/app/(catalogo)/catalogo/[slug]/not-found.tsx` (BR-K10) |
| Textos de configurar el catálogo, y «Publicado» / «Sin publicar» | `src/features/catalog/components/CatalogSettingsCard.tsx` y `CatalogSettingsDialog.tsx` (D-160) |
| Rótulos del enlace que se copia en la ficha del vendedor | `src/features/catalog/components/CatalogLinkField.tsx` (BR-K12) |
| Textos de «Mi catálogo público»: estado, aviso sin enlace y los tres botones | `src/features/catalog/components/SellerCatalogCard.tsx` (D-161) |
| Los tres avisos de copiar y compartir | `SellerCatalogCard.tsx`, en las constantes `COPIADO`, `COPY_FAILED` y `SHARE_AND_COPY_FAILED` (D-161) |
| El mensaje que se comparte: encabezado, invitación y cómo se reparte en `title`/`text`/`url` | `src/features/catalog/share.ts`, **todo junto** (D-161) |
| «Escríbenos por WhatsApp», «Vendedor oficial» y las iniciales del encabezado público | `src/features/catalog/components/CatalogHeader.tsx` (D-163) |
| El mensaje de contacto que NO nombra ninguna boleta | `src/features/catalog/whatsapp.ts` (`catalogContactMessage`, D-163) |
| La etiqueta «Catálogo público» y el título de dos líneas del hero | `src/features/catalog/components/CatalogHero.tsx` (D-163) |
| Rótulos de las tres cifras públicas («números disponibles», «ya fueron tomados», «reservado») y el aviso de que quedan pocos | `src/features/catalog/components/CatalogSummary.tsx` (D-164) |
| El nombre de la rifa que recoge el encabezado al bajar, y «Vendedor oficial» | `src/features/catalog/components/CatalogHeader.tsx` (D-164) |
| Los dos estados vacíos del catálogo público | `src/app/(catalogo)/catalogo/[slug]/page.tsx` (D-164) |

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
