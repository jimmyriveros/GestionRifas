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
| La sección del panel del vendedor donde vive todo su dinero | **Estado de cobro** (D-171) | Resumen financiero, Cobranza, Finanzas |
| Las boletas que el vendedor puede vender o ya vendió | **Boletas activas** (D-172) | Total, boletas en total, inventario |
| Todas las boletas a su nombre, incluidas borradores, pendientes y anuladas | **Registradas** (D-172) | Total, histórico, acumuladas |
| Lo mismo en el panel administrativo, contando las de toda la organización | **Registradas** (D-182) | **Total de boletas**, que era su nombre y no sumaba con «Disponibles» y «Asignadas» |
| La sección del panel administrativo donde vive el dinero de la organización | **Resumen de cobranza** (D-090) | Estado de cobro, que es la del vendedor y es otra cifra: la suya |
| El reparto de las boletas vendidas por lo que llevan pagado, en **cualquiera de los dos** paneles | **Boletas vendidas según su pago** (D-171, D-182) | Cobranza, que además está prohibido como rótulo |
| Ahí, el grupo de boletas de las que NO ha entrado nada | **Sin pagos**, y su dinero **Deben** (D-171) | Sin pagar como rótulo de una cifra de dinero |
| Ahí, el grupo de boletas que ya abonaron una parte | **Con abonos**, y sus dos cifras **Todavía deben** y **Ya abonaron** (D-171) | Abonadas como rótulo de una cifra de dinero |
| Ahí, el dinero ya recibido y el que falta | **Ya cobraste** y **Falta cobrar** (D-171) | Recaudado, Por cobrar, Cartera |
| Ahí, qué parte del total vendido se lleva cobrada | **Avance del cobro** (D-171) | Cobranza, % recaudado, cumplimiento |
| Columna que contiene lo que se puede hacer con la fila | **Acción** si hay una sola; **Acciones** si abre un menú (D-114) | Dejar la columna sin encabezado |
| Identificador que genera el sistema | **Código interno** | ID, código de barras |
| La etiqueta del campo donde se escribe ese número | **Teléfono** | Móvil, contacto, número de contacto |
| Cómo se escribe un teléfono en un campo, y cómo se pone de ejemplo | **`300 123 4567`**, y **`+57 300 123 4567`** cuando el campo pide indicativo (D-184) | `3001234567` y `573001234567`, que era como se veían hasta el 2026-09-09 |
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
| Poner a otro cliente una boleta que se vendió a la persona equivocada | **Cambiar cliente** | Reasignar, transferir, reubicar, mover |
| El motivo que se escribe al hacerlo | **Motivo de la corrección** | Justificación, razón, observación |
| Deshacer la venta de una boleta que el cliente ya no quiere, y devolverla al inventario | **Liberar** la boleta; la **liberación** | Desasignar, devolver, revertir, cancelar la venta |
| Desprendible que la boleta trae para el cliente | **Paz y salvo** | Recibo, comprobante, talón, colilla, ticket |
| Que el vendedor ya se lo dio en mano | **Paz y salvo entregado**; en una tabla o tarjeta estrecha, **Entregado** | Recibido, firmado, cerrado |
| Que todavía no | **Paz y salvo por entregar**; donde no cabe, **Por entregar** | Pendiente, sin entregar, debe |
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
| La tarjeta del panel desde la que el vendedor lo reparte | **Comparte tu catálogo** (D-180) | «Mi catálogo público», que fue su título hasta el 2026-09-09 |
| La sección del panel del vendedor con las loterías | **Loterías** (D-180) | «Resultados y próxima lotería», que es el título del recuadro **completo** y sigue siéndolo |
| Ahí, el sorteo que va a jugarse y el que ya jugó | **Próxima** y **Último resultado** (D-180) | Próximo sorteo, Resultado más reciente |
| Ahí, cuántas boletas del vendedor salieron con ese número | **Sin coincidencias**, **1 boleta coincidió**, **N boletas coincidieron** (D-180) | Aciertos, ganadoras, premiadas |
| Desplegar dentro de una tarjeta lo que no cabe en ella | **Ver detalle**, y **Ocultar detalle** cuando está abierto (D-180) | Ver más, Expandir, Mostrar todo |
| Conversación de WhatsApp donde el vendedor reúne a sus clientes | **Grupo de WhatsApp**, o **tu grupo** (D-176) | Comunidad, canal, chat, lista de difusión |
| Su dirección de invitación, que el vendedor pega en la configuración | **Enlace del grupo de WhatsApp** | **Link**, que este mismo anexo ya prohíbe; URL, invitación |
| Pasarle ese enlace a un cliente recién registrado | **Invitar al grupo**; la **invitación** | Agregar al grupo, añadir, meter, vincular |
| El texto que acompaña al enlace | **Mensaje de invitación** | Plantilla, template, copy |
| El que trae la aplicación, y usa casi todo el mundo | **Mensaje predeterminado** | Mensaje por defecto, estándar, del sistema |
| El que escribe el propio vendedor | **Mi propio mensaje** (el interruptor dice «Usar mi propio mensaje») | Mensaje personalizado, custom |
| La pantalla del vendedor donde vive todo eso | **Configuración** | Ajustes, preferencias, settings |
| Dónde le consignan sus clientes a un vendedor | **Cuenta para recibir pagos**, y **cuenta** a secas cuando ya se está dentro de esa sección (D-188) | Cuenta de cobro, medio de pago, método de pago, datos bancarios |
| La pregunta que elige entre las tres formas | **¿Dónde recibes el pago?** | «Tipo de cuenta», que en Colombia significa otra cosa: ahorros o corriente |
| Las tres formas que existen hoy | **Nequi** · **Daviplata** · **Cuenta bancaria** | Billetera, transferencia, banco a secas, plataforma |
| Ahorros o corriente | **Tipo de cuenta** | Clase, modalidad, naturaleza |
| A nombre de quién está la cuenta | **Titular** | Propietario, beneficiario, «Dueño», que es un rol |
| El nombre que el vendedor le pone para distinguirla de otra suya | **Nombre para reconocerla** | Etiqueta, alias, apodo, descripción |
| Sacar una cuenta del listado sin perderla | **Archivar** (el mismo verbo que un cliente) | Eliminar, borrar, desactivar, quitar |
| Devolver al listado una cuenta archivada | **Volver a usar** | Restaurar, reactivar, recuperar, desarchivar |
| Cambiar en qué orden salen las cuentas en el mensaje | **Subir** y **Bajar** | Reordenar, mover, arrastrar, priorizar |
| Mensaje semanal de cobro que la aplicación prepara a una hora elegida | **Recordatorio de pago**, o **recordatorio** | Alarma, aviso, notificación, programación |
| Que un recordatorio está sonando, que no, o que se guardó | **Activo** · **Pausado** · **Archivado** (`PAYMENT_REMINDER_STATUS_LABELS`, D-188) | Encendido, apagado, suspendido, detenido |
| Dejar de recibir un recordatorio sin perderlo, y volver | **Pausar** y **Reanudar** | Desactivar/activar, detener, apagar/encender |
| Cuándo suena | **Día** y **Hora** | Frecuencia, periodicidad, programación, horario |
| El bloque que la aplicación añade sola al final del mensaje. **Lo lee el CLIENTE**, así que le habla a él | **«Puedes pagar aquí:»** | «Tus cuentas», que dentro del mensaje el cliente leería como las suyas; y cualquier marcador tipo `{{cuentas}}`, prohibidos (BR-S07) |
| Ese mismo bloque, cuando se le explica al VENDEDOR qué se le va a añadir | **tus cuentas** | «El bloque», «la sección de cuentas» |
| Un recordatorio que ya venció y está esperando a que lo peguen en el grupo | **Para enviar ahora** (D-189) | Pendientes, cola, bandeja, tareas |
| Poner ese mensaje en el portapapeles del teléfono | **Copiar mensaje**; hecho, **«Mensaje copiado»** | Copiar al portapapeles, duplicar |
| Abrir el grupo de WhatsApp desde ahí | **Abrir grupo** | Ir a WhatsApp, enviar, compartir |
| Que el vendedor diga que ya lo mandó | **Marcar como atendido** | **Enviado**, **Entregado**, Completado, Listo — la aplicación no manda nada y no puede decir que sí (BR-S14, BR-W08) |
| Cuándo le tocaba a ese mensaje | **«Era para el …»** | Vencido, atrasado, caducado |

**«Rebaja», no «descuento» (D-099).** Un vendedor puede vender una boleta más barata, y en pantalla
eso se llama **rebajar**: «Puedes rebajarlo hasta $60.000», «rebaja de $20.000». *Descuento* se evita
porque en una rifa suena a promoción del negocio —algo que la empresa ofrece a todo el mundo— y esto
es exactamente lo contrario: un trato que hace **una** persona con **un** cliente y que **paga de su
propia ganancia**. Esa consecuencia se dice siempre que aparezca la casilla; es lo único que quien la
usa no puede deducir mirando la pantalla. Y una venta al precio normal **no** menciona la rebaja:
anunciar «rebaja de $0» es ruido en la pantalla que más se usa.

**Un teléfono se escribe con separadores, y el ejemplo del campo también** (D-184). Los tres campos
de teléfono muestran **`300 123 4567`** mientras se escribe, y **`+57 300 123 4567`** cuando lleva
indicativo. Eso cambia dos cosas de redacción y ninguna más:

* el **texto de ejemplo** es ese mismo formato —`3001234567` ya no se escribe en ninguna parte—, y
  vive una sola vez, en `lib/phone.ts`, para que las tres pantallas no lo copien;
* la etiqueta sigue siendo **«Teléfono»**, y la explicación del WhatsApp del catálogo sigue diciendo
  lo mismo, porque sigue siendo verdad: con diez cifras se le añade el 57.

**Donde el teléfono se LEE no cambia nada** —la tabla de clientes, la ficha, el CSV, el catálogo—:
ahí se muestra el dato guardado tal como está. Un texto que prometa que todos los teléfonos se ven
con separadores estaría mintiendo: en la base conviven los formatos de antes.

**Y ningún texto puede sugerir que ver un teléfono lo cambia.** No lo cambia: abrir un formulario,
cerrarlo o corregir el alias dejan el teléfono exactamente como estaba. Solo se guarda la forma nueva
cuando la persona edita el campo.

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
de resultados oficiales, la tarjeta conserva su **título de verdad** —hoy «Resultados y próxima
lotería», y en D-155 era «Resultados oficiales» (D-167)— y las
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

**«Cambiar cliente» dice lo único que la pantalla no enseña: que no cambia nada más** (D-168). El
botón vive bajo la tarjeta del cliente, en el detalle de la boleta, y su diálogo abre con la frase
que quita el miedo: «Elige el cliente correcto. Solo cambia el cliente: el precio, la fecha de venta
y los números de la boleta siguen igual.» Es la §5 de esta guía —explicar qué ocurrirá— aplicada a
una acción que **parece** una venta nueva y no lo es. Arriba, «Ahora la tiene» con el nombre y el
teléfono: quien abre el diálogo no tiene por qué recordar de memoria a quién se la puso por error.

**Cambiar, no reasignar.** *Reasignar* es la palabra del código (`bulk_change_ticket_seller`) y de la
documentación, y además nombra otra cosa —cambiar el **vendedor** de una boleta, que sigue siendo
imposible (BR-G07)—. En pantalla se cambia el **cliente**, con el verbo que usa todo el mundo. El
botón dice **«Cambiar cliente»**, no «Cambiar de cliente»: ese nombre accesible ya existe en el
formulario de abono (D-138) y es otra acción, en otra pantalla.

**Donde no se puede, se explica; no se ofrece un botón que va a fallar** (D-168). Una boleta con
abonos en su historial dice «Esta boleta tiene abonos en su historial: ya no puede cambiar de cliente
ni liberarse.» Una que ya salió en un sorteo dice «Esta boleta ya hace parte de un resultado
registrado: no puede cambiar de cliente ni liberarse.» Los dos textos se quedan en **qué pasa**, sin
ofrecer una salida falsa: anular los abonos **no** desbloquea nada, porque la fila se queda en el
historial, y prometerlo mandaría a alguien a hacer un trámite irreversible para nada. Y una boleta
que todavía no se ha vendido **no dice ninguna de las dos cosas**: no hay nada que corregir, y
explicar por qué no se puede corregir algo que no existe es ruido.

> **Ensanchadas el 2026-09-05 (D-169).** Las dos frases decían «y ya no puede cambiar de cliente» a
> secas, cuando esa era la única acción de la tarjeta. Desde que también se puede **liberar**, esas
> dos causas cierran las **dos** puertas, y escribir una frase por acción pondría dos avisos casi
> idénticos uno encima del otro. Se explica la **causa** una vez, con sus dos consecuencias.

**El motivo se pide, y se dice para qué sirve.** «Motivo de la corrección», con «Queda guardado en el
historial de la boleta.» debajo. No se pide «por control»: se pide porque es lo único que la bitácora
no puede deducir sola, y quien lo escribe merece saber dónde acaba.

**«Liberar boleta» dice lo único que la pantalla no enseña: que la venta se borra entera** (D-169).
El botón vive junto a «Cambiar cliente», bajo la tarjeta del cliente, y su diálogo abre con: «Dejará
de estar asignada a {nombre} y volverá a quedar disponible para venderla otra vez. Se borran el
precio y la fecha de esta venta; los números, el vendedor y la rifa no cambian.» La segunda frase es
la importante: quien libera puede creer que la venta se guarda en algún sitio, y no. Debajo, los
**dos números** y el **cliente actual**, porque quien confirma no tiene por qué recordarlos de
memoria (BR-N11).

**Liberar no es anular, y los textos no pueden mezclarlos.** *Anular* retira la boleta de circulación
para siempre y **su combinación de números no vuelve a estar libre**; *liberar* la devuelve al
inventario **con sus mismos números**, lista para otra persona. Por eso el diálogo de liberar no dice
«definitiva» ni se pinta en rojo, y el de anular —«La boleta deja de ser utilizable y su combinación
de números no podrá reutilizarse en esta rifa. Es una acción definitiva.»— no se toca. Y **no se
ofrece anular como salida** cuando no se puede liberar: anular es del personal (BR-I10), y a un
vendedor lo mandaría a hacer algo que su pantalla no le deja.

**El motivo, otra vez, con su nombre propio.** «Motivo de la liberación», con la misma línea de
siempre debajo: «Queda guardado en el historial de la boleta.» El botón dice **«Confirmar
liberación»** y, mientras trabaja, **«Liberando...»** —no «Procesando...», que no dice qué se está
haciendo—. Al terminar, el aviso nombra la boleta por sus dos números: «La boleta 1234 / 5678 quedó
disponible.»

**Y la rifa cerrada tiene su propia frase, porque afecta a una sola acción** (D-169). «La rifa ya no
está activa: esta boleta no se puede liberar.» Ahí «Cambiar cliente» **sí** se puede (D-168), así que
el aviso convive con su botón y no lo menciona: nombrar una acción que está justo al lado, disponible,
haría dudar de si funciona.

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

**Un total que se enseña tiene que ser el de las cifras que están a su lado** (D-172). La insignia de
«Estado de cobro» decía «21 boletas en total» junto a «10 disponibles · 6 vendidas», y las cinco que
faltaban no se explicaban en ninguna parte de la pantalla —eran borradores, pendientes de aprobación
y anuladas—. Ahora dice **«16 boletas activas»**, que es exactamente lo que suman las dos. La regla
es general: **si un rótulo presenta un total, el desglose que tiene debajo lo suma; si no lo suma, el
rótulo está mal, no el desglose.**

Y como esa cifra completa **sí** existe y sigue haciendo falta, conserva su sitio con **su propio
nombre**: «Mis boletas» dice **«Registradas»** donde decía «Total». Dos números distintos no pueden
llamarse igual en la misma pantalla. Lo que **no** se hace es esconder los estados que quedan fuera:
las **pendientes de aprobación** ya las nombra y las cuenta el aviso ámbar de arriba, que además dice
qué pasa con ellas; repetirlas en el desglose sería contarlas dos veces.

**En «Estado de cobro», una etiqueta de estado NO puede rotular una cifra de dinero** (D-171). Es la
regla que ordena toda esa sección del panel del vendedor, y nació de un error real: «Abonadas
$15.640.000» se leía como *dinero abonado* y era el **valor de venta** de esas boletas. Por eso ahí
los grupos se llaman **«Sin pagos»** y **«Con abonos»** —describen al conjunto de boletas, no su
estado— y cada importe lleva su propio rótulo: **«Deben»**, **«Todavía deben»**, **«Ya abonaron»**,
**«Cobrado»**. El valor de venta de las boletas a medias **no se escribe en ninguna parte**: nadie
que cobre se hace esa pregunta.

Y el **estado de una boleta sigue diciéndose con las etiquetas de siempre**: la insignia dice
«Abonada» en las cuatro listas y en el detalle, `TICKET_PAYMENT_STATUS_LABELS` no se toca, y estos
cuatro rótulos **solo valen dentro de esa sección**. Es la excepción acotada que ya existe con
«Cancelado» en la columna «Abono» de un archivo (D-129), no una puerta abierta a renombrar estados.

**Desde D-182 «esa sección» son DOS, y los rótulos no cambian.** El panel administrativo monta el
mismo reparto dentro de «Resumen de cobranza», con los mismos «Deben», «Todavía deben», «Ya abonaron»
y «Cobrado». No es ampliar la excepción por comodidad: esos cuatro describen lo que hacen los
**clientes** —quién debe, quién abonó—, no quién mira la pantalla, así que valen igual para el
vendedor que cobra y para quien administra la organización. Lo que sigue acotado a esas dos secciones
es la regla, no el vocabulario: **ahí una etiqueta de estado no puede rotular una cifra de dinero.**

**Lo que sí cambia entre portales es el posesivo** (D-182). El vendedor lee «Ya cobraste», porque ese
dinero es suyo; el panel administrativo dice **«Falta cobrar»**, sin «te», porque quien lo lee
administra la organización y ese dinero no es suyo. Decía «Te falta cobrar» desde D-090 y era el
único texto del portal que tuteaba sobre dinero ajeno.

**Ahí «Deben» sí se puede escribir, y es la única parte de la aplicación donde se puede.** El Anexo A
lo prohíbe para la columna «Falta» de una tabla, y esa prohibición sigue en pie: allí compite con
«Falta» por el mismo hueco. Aquí no compite con nada —encabeza un importe dentro de un bloque que ya
se llama «Sin pagos»— y es lo que un vendedor dice en voz alta.

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

**Y en el panel del vendedor, «Recaudado» convive con «Ya cobraste»** (D-175). Son la misma familia de
problema y se resuelve igual: la tarjeta se titula **«Recaudado»** —el término del glosario, el mismo
que llevaba el indicador que sustituye— y debajo dice **«Lo que entró en estas fechas»**, que es lo
único que la pantalla no enseña. «Ya cobraste», en «Estado de cobro», es lo acumulado de hoy y no
depende del período. La otra mitad de la desambiguación es el **selector de fechas**, que desde D-175
vive dentro de esa misma tarjeta: el período se dice con fechas, y estando al lado del título no hay
que adivinar de qué habla la cifra.

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
vendedor ya lee en su propio panel —«Comparte tu catálogo»— y el que describe lo que el visitante
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

**En una tarjeta estrecha, «Disponible» se dice con un punto — pero se sigue diciendo** (D-166). A
375 px o menos la insignia se convierte en un punto verde en la esquina, y la palabra pasa a
`sr-only`. **No desaparece:** un punto de color es color a secas, y aquí ningún significado se fía
solo al color (`CLAUDE.md` §27). Es la misma regla de siempre —se abrevia lo visible, nunca el
término— aplicada al extremo: lo que se retira es el píxel, no la palabra.

**Ninguna etiqueta del resumen se recorta, aunque tenga que ocupar dos líneas** (D-165). En el
teléfono salía «números dis…», «29 de 68 · ya fueron to…» y «43 % · reserv…»: una cifra sin su
nombre entero deja de ser un dato y pasa a ser un acertijo. Ahora **«números disponibles» es la
métrica principal** —fila entera, cifra más grande, el verde de disponibilidad— y debajo van las dos
secundarias a mitad y mitad. Los tres textos son los mismos de siempre; lo que cambia es que caben.

**En el encabezado, el buscador dice «Buscar» a secas** (D-165). En la fila del encabezado no cabe
«Buscar número» sin partirse a media palabra, y un texto de ejemplo cortado se lee como un fallo. Se
abrevia **lo visible**: el nombre accesible sigue siendo «Buscar número de boleta», que es lo que se
anuncia y por lo que se encuentra el campo (D-114). En el hero, donde sí cabe, se conserva entero.

**Y ahí la pista deja de verse, aunque se siga anunciando** (D-165). Bajo el campo del hero, la línea
de ayuda —«Los números tienen 4 cifras como máximo»— reserva su hueco siempre, que es lo que evita
que la lista salte. Dentro del encabezado ese mismo hueco haría crecer y encoger una barra que está
en pantalla todo el rato, así que ahí la pista viaja en un `sr-only`: se sigue leyendo en voz alta y
sigue asociada al campo, pero no se pinta. Lo que queda a la vista es el estado vacío, que ya explica
qué hacer.

**Al bajar, el encabezado dice la rifa en lugar de «Vendedor oficial»** (D-164). Sustituye, no
añade: son las mismas dos líneas, así que el encabezado no crece y el nombre de la rifa nunca se lee
dos veces a la vez. Es texto secundario y truncado, **no un segundo `h1`**.

**El vendedor reparte su catálogo desde el panel, y ahí se dice lo justo** (D-161, D-180). Los tres
botones —**Compartir**, **Copiar enlace** y **Ver catálogo**— llevan **texto visible junto al icono**:
un icono solo obliga a adivinar, y esta tarjeta la usa gente que no vive en aplicaciones. Las reglas
propias de esos textos:

* **«Activo» / «Inactivo» describen el ENLACE, no a la persona.** Inactivo aquí significa que la
  dirección no abre —apagada, sin generar, o con la rifa cerrada—, y nunca que a alguien le hayan
  quitado el acceso, que es lo que significa «Inactivo» en una cuenta (BR-E14). Lo desambigua el
  título de la tarjeta, «Comparte tu catálogo». Son las mismas dos palabras en los **dos** portales:
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

**La dirección ya no se escribe en esa tarjeta, y en su sitio va lo que sí se mira** (D-180). El
enlace **no se lee: se comparte o se copia**, y ocupaba la línea más visible del panel con un texto
que además había que recortar con puntos suspensivos. Sigue entero donde de verdad se usa —el `href`
de «Ver catálogo», el portapapeles y el menú del sistema—, así que ninguna acción pierde nada.

En su lugar va **«N boletas disponibles»**, con su singular, y es **la cifra del catálogo**, no la
del panel: el catálogo publica **una** rifa y «Mis boletas» las suma todas. Escribir ahí el total del
panel daría dos números distintos para lo mismo —«52 boletas disponibles» en el panel, «39 números
disponibles» en el propio catálogo—, que es el error que D-172 corrigió en «Mis boletas». Con el
catálogo apagado **no se dice ninguna cifra**: contar boletas de un catálogo que no abre no ayuda a
nadie.

Y el título de la tarjeta es **«Comparte tu catálogo»**, que empieza por la acción (§4) y dice lo que
se viene a hacer. Se llamó «Mi catálogo público» hasta el 2026-09-09; el término del glosario sigue
siendo **catálogo**, así que no hay nombre nuevo, solo un título que ya no describe un archivo sino
una acción.

**«Loterías» titula el recuadro compacto del vendedor** (D-180). Debajo van dos filas rotuladas
**«Próxima»** y **«Último resultado»**, que es literalmente lo que decía el título largo
—«Resultados y próxima lotería»—, y un título que repite las dos etiquetas que tiene a un centímetro
no dice nada nuevo (misma regla que D-126). El título largo **no se toca**: lo sigue usando el
recuadro completo del portal administrativo, y ahí sí es lo único que nombra el contenido.

**Lo que se guarda detrás de «Ver detalle» sigue estando, y el nombre lo dice entero.** Se escribe
**«Ver detalle»**, y **«Ocultar detalle»** cuando está abierto —nunca las dos a la vez, como el botón
del menú lateral (D-131)—. El nombre accesible añade **«de las loterías»** en un `sr-only`: en esa
misma pantalla hay un «Ver detalle de cobranza», y quien recorre los controles a ciegas no tiene la
tarjeta delante para distinguirlos (D-114).

**Y vive ARRIBA A LA DERECHA, no al pie** (D-181). Es donde se busca la acción de una tarjeta, y su
sitio deja de depender de cuánto mida el contenido. Cabe con las dos palabras enteras hasta en 320 px
—el encabezado mide lo mismo abierto que cerrado— porque ahí se retiró el **icono decorativo** del
título: las dos filas ya llevan el suyo, y ese ancho lo usa ahora una acción de verdad. Es la regla
de siempre —se recorta el píxel, nunca el término (D-114)— aplicada a lo que no dice nada.

**Dos avisos NO se esconden ahí dentro**, y son los únicos: el **conflicto** —«La fuente oficial
publicó otro número. Requiere verificación.»— porque la fila de al lado acaba de escribir ese número
como si fuera el resultado, y los **cambios de programación** de los dos sorteos que se enseñan. Son
lo único de ese recuadro que puede obligar a hacer algo.

**Y la hora nunca se parte entre «p.» y «m.».** «Bogotá · mañana, 10:30 p. m.» cabe entera o baja
entera a la línea siguiente; partida se lee como una errata. Lo mismo que ya hacía el recuadro
completo separando la cifra de su sufijo (D-167), resuelto aquí sin cambiar el texto.


**Un número que no viene de la lotería no se presenta como si viniera** (D-162, BR-L26). Cuando la
página oficial no puede entregar un sorteo, la aplicación lo confirma con **dos fuentes distintas**,
y el recuadro lo dice con esas palabras: **«Verificado por 2 fuentes»**, con el número real de
fuentes, donde en otro caso diría **«Fuente oficial»**. No es un matiz técnico: quien va a pagar un
premio necesita saber si el número lo publicó la lotería o lo publicaron dos sitios que la copian.

Lo que **no** se hace: llamarlas «oficiales», poner la lista de direcciones en pantalla —la evidencia
completa es operativa, no contenido para un vendedor— ni presentar como confirmado un sorteo que
solo tiene una fuente. Si las fuentes se contradicen, la pantalla **no enseña ningún número**.

El título del recuadro fue **«Resultados oficiales»** hasta el 2026-09-03, y esta regla nació
defendiéndolo: cambiarlo a «Resultados de loterías» se evaluó y se descartó porque la palabra que
importa está donde se mira la cifra, no en el título. **Hoy dice «Resultados y próxima lotería»**
(D-167), y eso no la contradice: describe las **dos** cosas que hay dentro —lo que ya salió y lo que
va a jugarse—, que es lo que el recuadro pasó a enseñar. La línea de procedencia sigue exactamente
donde estaba, al pie del número.

**El número mayor se llama «Número mayor», también aquí** (D-167). El encargo del rediseño escribía
«Número ganador», y es el término prohibido del Anexo A y de BR-L15: la aplicación detecta una
**coincidencia numérica** y no certifica ningún premio oficial. Lo usan además los avisos y el
detalle de la boleta, y hay una prueba que falla si cualquier texto de este recuadro dice «ganador».
Es la §35.2.4 de `CLAUDE.md` aplicada, igual que «SORTEO PÚBLICO» en D-163: se señala y se sigue.

**«Hoy» y «Ayer» se calculan, no se escriben fijos** (D-167). Cada tarjeta lleva el día en un rótulo
—«Hoy», «Ayer», «Mañana» o el día de la semana— comparado contra el día de Bogotá, porque el último
resultado puede ser de hace tres días y el próximo sorteo, del martes que viene. Escribir «Ayer» a
mano mentiría el primer día que una lotería no publicara a tiempo. Debajo va siempre la fecha
completa, que es lo que desambigua un «Martes» a secas.

**Y la hora grande solo se escribe si el sorteo todavía no ha jugado** (D-167). «Juega hoy a las
11:15 p. m.» es una promesa: pasada esa hora, la tarjeta dice **«Resultado pendiente»** y calla la
hora. Nunca se convierte en «jugó a las», que sería un dato nuevo que nadie pidió, ni se deja la
hora futura escrita cuando ya es pasado.

**La hora de la última verificación no se pinta** (D-167). Era un dato técnico —«Última verificación:
03 sept 2026, 11:40 p. m.»— compitiendo con el número. En su lugar, al pie del recuadro va una sola
línea discreta: **«Actualizado automáticamente cada día»**. Lo que **no** se retiró es la línea de
procedencia de arriba: esa distingue quién publicó el número y sigue siendo obligatoria.

**«Paz y salvo» dice lo único que la pantalla no enseña: que no cambia el dinero** (D-170). Bajo
el interruptor va siempre la misma línea: **«Solo registra la entrega física. No cambia abonos,
saldo ni estado de pago.»** Es la §5 de esta guía aplicada a un control que vive a dos centímetros
del precio y del estado de pago, en una pantalla donde todo lo demás **sí** es dinero: sin esa
frase, quien lo ve por primera vez tiene motivos para temer que mueva algo. El título es
**«Entrega del paz y salvo»** y es además la etiqueta del interruptor, no un texto oculto que
repita la frase.

**Se dice «paz y salvo», nunca «ticket» ni «recibo».** Es la palabra que ya usa el negocio para
ese desprendible. *Ticket* está además prohibido en el Anexo A para la boleta, y tenerlo aquí
para otra cosa sería peor que no tenerlo.

**Una carga inicial no inventa una fecha** (D-170). Las boletas que ya estaban vendidas cuando se
estrenó la función se dieron por entregadas, y su fecha es la del día en que se activó, no la de
ninguna entrega. Así que **no** se escribe «Entregado el {esa fecha}», ni la fecha de asignación,
ni una fecha calculada: se dice **«Marcado como entregado al activar esta función. La fecha real
de entrega no estaba registrada.»** Es la misma regla de siempre —la aplicación no dice cosas que
no sabe— y es lo único que impide que un dato técnico se lea como un hecho.

Un registro **manual** sí tiene fecha, y la escribe entera: **«Entregado el 05 sept 2026, 3:04
p. m.»** en hora de Bogotá, con los ayudantes de siempre.

**Mientras guarda dice «Guardando…», y nunca una hora inventada.** El interruptor responde al
instante —se ve encendido— pero la fecha **no** se adivina en el navegador: se sustituye por
«Guardando…» hasta que el servidor dice la suya. Escribir una hora que después cambie sería peor
que no escribir ninguna, y es la misma familia que la regla de sin conexión (D-116): nunca se
dice que algo quedó guardado como si ya estuviera.

**Donde no cabe la frase, se abrevia lo VISIBLE.** En la tabla de escritorio solo se ve el icono,
y «Paz y salvo entregado» viaja en un `sr-only` y en el `title` del icono; en la tarjeta del teléfono se
ve **«Entregado»** o **«Por entregar»** y el término completo va, otra vez, en el `sr-only`. Es
D-114 tal cual: se recorta el píxel, nunca el término. Y una boleta **sin vender no dice nada**:
no hay entrega de la que hablar, y escribir «por entregar» ahí inventaría una tarea.

**«Enlace», nunca «link», también aquí** (D-176). El encargo de esta función escribía «Link del grupo
de WhatsApp», y se corrigió: *link* está prohibido en el Anexo A para la dirección de una página, y
tenerlo para una cosa y «enlace» para otra sería peor que no tener glosario. Es la §35.2.4 de
`CLAUDE.md` aplicada igual que con «SORTEO PÚBLICO» (D-163) y «Número ganador» (D-167): se señala la
contradicción, manda la guía y se sigue.

**El vendedor escribe su mensaje SIN el enlace, y eso se dice una vez y se demuestra** (BR-W04,
D-176). Bajo el área de texto va **«Escribe solo tu mensaje. El enlace de tu grupo se agrega al
final, siempre.»** — la consecuencia que la pantalla no puede enseñar—. Y debajo va lo que sí la
enseña: **«Así lo recibirá tu cliente»**, con el mensaje completo y el enlace ya puesto. Esa vista
previa no es un adorno: es lo que convierte la promesa en algo comprobable, y lo que hace que quien
pegue el enlace a mano lo vea duplicado ahí mismo y lo quite. **No se escribe ninguna instrucción
sobre marcadores** —`{{whatsapp_group_link}}` no existe—, porque explicar una sintaxis es
exactamente el trabajo que esta decisión venía a quitar.

**El diálogo de éxito dice lo que pasó, y solo lo que pasó** (BR-W06). Desde una boleta: **«¡Boleta
asignada!»** y «{nombre} quedó registrado y la boleta 1234 / 5678 es suya.», con los **dos** números
(BR-N11); con varias, «y 6 boletas son suyas», porque una lista de veinte pares no se lee. Desde «Mis
clientes»: **«¡Cliente creado!»** y «{nombre} quedó registrado en tus clientes.», **sin mencionar
ninguna boleta**, porque no hubo ninguna. Los botones son **«Cerrar»** e **«Invitar al grupo»**;
nunca «Aceptar» ni «Listo» (§6).

**Cuando no se puede invitar, se cambia la acción — no se ofrece una que va a fallar** (BR-W05). Sin
grupo configurado, el botón dice **«Configurar WhatsApp»** y lleva a la pantalla, con la frase
«Configura tu grupo de WhatsApp para poder invitar a tus clientes nuevos.» Con un teléfono que no
sirve, se explica y **no hay segundo botón**: «El teléfono de este cliente no sirve para WhatsApp.
Corrígelo en su ficha y podrás invitarlo.» Son **una frase por causa**, no una por pantalla, y cada
una nombra la salida que esa persona puede tomar desde donde está. Y ninguna de las dos aparece
cuando todo está en orden: explicar por qué no se puede algo que sí se puede es ruido.

**Nunca se dice que el cliente entró al grupo, ni que el mensaje se envió** (BR-W08). La aplicación
abre WhatsApp con el texto escrito y ahí termina: el vendedor pulsa Enviar, y si el cliente se une o
no, **no lo sabemos**. Están prohibidos «Cliente agregado al grupo», «aceptó» y «se unió». Si el
navegador bloquea la ventana se dice tal cual —«Tu navegador no dejó abrir WhatsApp. Permítelo y
vuelve a tocar «Invitar al grupo».»— en vez de darla por abierta: es la misma regla de sin conexión
(D-116).

**«Configuración» son tres secciones y un resumen que no carga ninguna** (D-188). La pantalla que
D-176 dejó «pensada para crecer» creció: `/seller/settings` enseña **tres tarjetas con su estado en
una línea** —«3 cuentas activas», «Grupo configurado», «2 recordatorios activos»— y cada una lleva a
su propia pantalla. El resumen **no pinta ningún formulario**, así que ninguna de las tres carga sus
datos hasta que se entra. Los títulos son los del glosario y **se repiten igual** en la tarjeta y en
la pantalla: quien toca «Cuentas para recibir pagos» tiene que llegar a algo que se llame así.

**Una cuenta se escribe como se dicta por teléfono** (D-188). Ese es el criterio para el orden y para
lo que se enseña junto: **Nequi · 300 123 4567 · Ana Torres**, y **Bancolombia · Ahorros ·
123-456-789 · Ana Torres**. Primero dónde, después el número, después de quién es — que es como lo
dice cualquiera en voz alta y como el cliente lo va a teclear en su banco. El **nombre para
reconocerla** es del vendedor y **no viaja al mensaje**: sirve para distinguir «el Nequi de mi
esposa» del suyo en una lista de cinco, y ponerlo en el mensaje del cliente sería contarle algo que
no le importa.

**El recordatorio NO nombra a ningún cliente, no dice ningún saldo y no dice ningún importe**
(BR-S09). Va a un grupo donde están **todos** los clientes del vendedor: escribir ahí quién debe
cuánto es publicar la deuda de una persona delante de las demás. Es el mismo cuidado que impide
guardar el HTML de una pantalla en el teléfono (D-116), aplicado a un texto que se pega en un chat.

**La vista previa enseña el mensaje completo, con las cuentas ya puestas** (BR-S07, y es la misma
decisión que BR-W04). El vendedor escribe **solo prosa**; la aplicación añade al final
**«Puedes pagar aquí:»** con las cuentas activas, en su orden. Ese encabezado **le habla al cliente**,
que es quien lo va a leer: escribir ahí «tus cuentas» haría que el cliente entendiera las suyas. Bajo
el área de texto va la línea que se lo dice al vendedor antes de que ocurra: **«Escribe solo tu
mensaje. Tus cuentas se agregan al final, siempre.»** — y debajo, el mensaje entero, que es lo que
convierte la promesa en algo comprobable.
**No se explica ninguna sintaxis y no existe ningún marcador**: `{{cuentas}}` no se escribe en
ningún sitio, porque no hay nada que conservar y por tanto nada que romper.

**Sin cuentas, el mensaje lo dice en vez de fingir** (D-188). Si el vendedor no tiene ninguna cuenta
activa, la vista previa no inventa un bloque vacío: enseña la prosa a secas y, **fuera del mensaje**,
un aviso que explica lo que pasa y da la salida — «Todavía no tienes cuentas para recibir pagos, así
que el mensaje sale sin ellas.» con el enlace a esa sección. La regla de siempre: la aplicación no
promete lo que no hay (D-116).

**«Pausar» no es «archivar», y los textos no pueden mezclarlos** (D-188). *Pausar* deja de mandar el
recordatorio y **lo conserva tal cual**: se reanuda de un toque y vuelve a sonar el mismo día a la
misma hora. *Archivar* lo saca del listado. Ninguno de los dos borra nada —aquí no se borra (D-038)—,
pero ofrecer «archivar» donde lo que se quiere es callarlo una semana manda a alguien a rehacer su
configuración. El botón de un recordatorio pausado dice **«Reanudar»**, nunca «Activar»: *activar* es
lo que se le hace a una cuenta de persona (BR-E14) y son cosas distintas.

**El tope se dice cuando estorba, no antes** (D-188). Con menos de cinco cuentas o menos de catorce
recordatorios **no se escribe ningún contador**: un «3 de 5» permanente convierte un límite que nadie
va a tocar en una preocupación. Al llegar al tope, el botón de crear se desactiva y **dice por qué**:
«Ya tienes 5 cuentas activas. Archiva una para agregar otra.» Es la misma frase que responde la base
de datos, a propósito: quien la vea dos veces no tiene que entender que son dos sistemas distintos.

**Copiar, abrir y atender describen ACTOS LOCALES, y ninguno es una confirmación de envío** (BR-S14,
D-189). Es la regla que ordena toda la sección «Para enviar ahora», y no es un matiz:

| Lo que dice la pantalla | Lo que de verdad pasó |
|---|---|
| «Mensaje copiado» | El texto está en el portapapeles de **este** teléfono |
| Se abrió el grupo | Se abrió `https://chat.whatsapp.com/…` |
| «Quedó marcado como atendido» | **El vendedor** dijo que ya lo hizo |

Ninguna de las tres sabe si el mensaje salió, si llegó o si alguien lo leyó: **Rifas no envía nada a
WhatsApp** y no va a hacerlo (BR-W08). Están prohibidos «Enviado», «Entregado», «Se envió» y
«Mensaje enviado», y hay una prueba —unitaria y de navegador— que falla si alguno aparece. Por eso la
sección lo dice en su descripción, antes de que nadie toque un botón: **«Copia el mensaje, abre tu
grupo y pégalo. Rifas no lo envía por ti.»** Es la misma familia que la regla de sin conexión (D-116)
y la de «cliente agregado al grupo» (BR-W08).

**Y si el portapapeles o la ventana fallan, se dice.** «No pudimos copiar el mensaje. Selecciónalo y
cópialo a mano.» y «Tu navegador no dejó abrir WhatsApp. Permítelo y vuelve a tocar «Abrir grupo».»
Nunca se da por copiado ni por abierto lo que no ocurrió.

**Sin grupo configurado se cambia la ACCIÓN, no se ofrece una que va a fallar** (BR-W05, D-189). Ahí
el botón dice **«Configurar WhatsApp»** y lleva a su pantalla, con la causa debajo: «Todavía no has
configurado tu grupo de WhatsApp.» Es exactamente lo que ya hacía el diálogo de invitación, aplicado
a este flujo.

**La ocurrencia dice cuándo le tocaba, no cuándo se procesó** (D-189). «Era para el 12 de sept de
2026, 7:00 p. m.»: es lo único que la tarjeta no puede enseñar sola, y responde la pregunta que se
hace quien la ve al día siguiente. Lo que **no** se escribe es cuánto lleva de retraso —un «hace 3
horas» convierte un mensaje útil en un reproche— ni la fecha del **próximo** envío, que la aplicación
sí conoce pero que se mueve por debajo al pausar, al cambiar la hora o al procesar.

**El aviso de la campana dice cuál de los recordatorios es, y qué hacer** (BR-V01, D-189). «Es hora
de tu recordatorio del martes a las 7:00 p. m. Copia el mensaje y pégalo en tu grupo.» El día va en
**minúsculas** porque va dentro de una frase, y la hora se escribe con `formatClockEs`, que ya
termina en punto: **no se le añade otro**, o se lee «7:00 p. m..». Un vendedor puede tener catorce
recordatorios, así que un aviso que no diga cuál es no ayuda.

**Etiquetas de estado:** su redacción está fijada y **no se improvisa** — Borrador · Pendiente de
aprobación · Disponible · Asignada · Anulada · Sin pagar · Abonada · Pagada · Activa · Cerrada, más
las tres de una persona: **Invitación pendiente · Cuenta activa · Inactivo**, las dos de un
cliente: **Activo · Archivado** (`CLIENT_STATUS_LABELS`, D-113), y las tres de un recordatorio de
pago: **Activo · Pausado · Archivado** (`PAYMENT_REMINDER_STATUS_LABELS`, D-188). Fuente única:
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
| Los dos textos de ejemplo de un campo de teléfono | `src/lib/phone.ts` (`PHONE_PLACEHOLDER`, `PHONE_WITH_CODE_PLACEHOLDER`, D-184). **Ninguna pantalla los escribe**: los pone `PhoneInput` |
| Nombre de lo que cuenta cada listado en su paginación | `src/lib/constants.ts` (`LIST_ITEM_LABELS`, D-111) |
| Etiquetas de estado de pago en plural, para encabezar grupos | `src/lib/constants.ts` (`TICKET_PAYMENT_STATUS_PLURAL_LABELS`, D-112) |
| Nombres de los períodos del panel del vendedor | `src/features/dashboard/date-range.ts` (`DASHBOARD_RANGE_LABELS`, D-112) |
| Textos de las piezas del panel del vendedor | `src/features/dashboard/components/`, una por pieza (D-112, D-171, D-175) |
| «Recaudado», «Lo que entró en estas fechas» y la comparación con el período anterior | `src/features/dashboard/components/CollectionTrendCard.tsx`, **todos juntos** (D-175) |
| «Ganancia por boleta» y sus tres líneas de apoyo | `src/features/dashboard/components/SellerEarningsCard.tsx` (D-175) |
| Los textos de «Estado de cobro» propios del vendedor: título, inventario del encabezado y las cuatro cifras | `src/features/dashboard/components/CollectionStateCard.tsx` (D-171, D-172) |
| El reparto por estado de pago —«Boletas vendidas según su pago», los tres grupos, «Deben», «Todavía deben», «Ya abonaron», «Cobrado» y la frase de la igualdad—, que usan **los dos portales** | `src/features/dashboard/components/CollectionBreakdownSection.tsx`, **todos juntos** (D-171, extraído en D-182). Lo único que cambia entre portales es a qué listado enlaza |
| Textos del panel administrativo: «Resumen de cobranza», «Recaudado de … vendidos», «Falta cobrar» —sin posesivo— y «% recaudado · N boletas por cobrar» | `src/components/data/CollectionSummaryCard.tsx` (D-090, D-182) |
| Rótulos del inventario del panel administrativo, «Registradas» incluido, y el aviso de que la tabla de vendedores está acotada | `src/app/(protected)/owner/dashboard/page.tsx` (D-182, D-183) |
| Los seis rótulos de «Mis boletas», «Registradas» incluido | `src/features/dashboard/components/TicketsOverviewCard.tsx` (D-172) |
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
| Título, rótulos y botones de cambiar el cliente de una boleta | `src/features/tickets/components/ReassignTicketClientDialog.tsx` — «Cambiar cliente», «Ahora la tiene», «Motivo de la corrección», «Crear cliente y cambiar» (D-168) |
| Los dos avisos de por qué una boleta ya no puede cambiar de cliente **ni liberarse** | `src/features/tickets/reassign-client.ts`, **los dos juntos** (D-168, ensanchados en D-169) |
| El aviso de la rifa cerrada, y quién de los tres se pinta | `src/features/tickets/release-ticket.ts` (`ticketClientNotice`, D-169) |
| Todos los textos del paz y salvo: título, ayuda, los dos estados, su forma corta, la nota de la carga inicial y «Guardando…» | `src/features/tickets/clearance-receipt.ts` (`CLEARANCE_COPY`), **todos juntos** (D-170) |
| Título, aviso, rótulos y botones de liberar una boleta | `src/features/tickets/components/ReleaseTicketDialog.tsx` — «Liberar boleta», «Número diario», «Número semanal», «Cliente actual», «Motivo de la liberación», «Confirmar liberación», «Liberando...» (D-169) |
| Estado vacío del buscador de clientes al cambiar el cliente | El `emptyMessage` que le pasa `ReassignTicketClientDialog` a `ClientOptionsPicker` (D-168) |
| Quién recibe el abono, debajo del título | `src/features/payments/components/PaymentClientBanner.tsx` — «Abono para», **Cambiar** (el nombre accesible sigue siendo «Cambiar de cliente», D-138) |
| Rótulos de cada boleta en el teléfono al repartir un abono | `src/features/payments/components/PaymentAllocationCards.tsx` — «Boleta», «Debe», «Abonar ahora», «Saldo después del abono», «Quedará» (D-138) |
| Mensajes de éxito | El `toast` de cada Server Action, en su componente cliente |
| Pasos del recorrido guiado (título y explicación) | `src/features/tour/tours.ts`, **todos juntos** |
| Texto de los avisos de la campanita | `src/features/notifications/text.ts`, **todos juntos** (D-093) |
| «Fuente oficial» y «Verificado por N fuentes», la línea de procedencia | `src/features/lottery/dashboard.ts` (`LOTTERY_DASHBOARD_COPY`) y `LotteryResultsCard.tsx` (D-162) |
| Textos del recuadro de resultados oficiales del Panel | `src/features/lottery/dashboard.ts` (`LOTTERY_DASHBOARD_COPY`) y `LotteryResultsCard.tsx` (D-147). Los avisos de programación reutilizan `notificationMessage` |
| Rótulo del día de cada tarjeta («Hoy», «Ayer», «Mañana» o el día de la semana) | `relativeDayLabel`, en `src/features/lottery/dashboard.ts` — se **calcula**, no se escribe suelto en la pantalla (D-167) |
| Encabezado de la hora («Juega hoy a las», «Juega mañana a las», «Juega el jueves a las») | `LOTTERY_DASHBOARD_COPY.playsToday` / `playsTomorrow` / `playsOn` (D-167) |
| «Sorteo 2862» y «Correspondiente al …» | `LOTTERY_DASHBOARD_COPY.drawNumber` y `referenceDay` (D-167) |
| «Actualizado automáticamente cada día», al pie del recuadro | `LOTTERY_DASHBOARD_COPY.autoUpdate` (D-167) |
| Los textos de la forma compacta: «Loterías», «Próxima», «Último resultado», «Ver detalle», «Ocultar detalle» y «de las loterías» | `src/features/lottery/dashboard.ts` (`compactTitle`, `upcomingRow`, `lastResultRow`, `showDetail`, `hideDetail`, `detailSubject`, D-180). Los **pinta** `LotteryCompactCard.tsx`, que los recibe como props: los textos no se escriben dentro del componente cliente (D-181) |
| El recuento corto de coincidencias | `compactMatchText`, en ese mismo archivo — se **calcula**, no se escribe suelto en la pantalla (D-180) |
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
| Textos de «Comparte tu catálogo»: título, estado, «N boletas disponibles», aviso sin enlace y los tres botones | `src/features/catalog/components/SellerCatalogCard.tsx` (D-161, D-180) |
| Los tres avisos de copiar y compartir | `SellerCatalogCard.tsx`, en las constantes `COPIADO`, `COPY_FAILED` y `SHARE_AND_COPY_FAILED` (D-161) |
| El mensaje que se comparte: encabezado, invitación y cómo se reparte en `title`/`text`/`url` | `src/features/catalog/share.ts`, **todo junto** (D-161) |
| «Escríbenos por WhatsApp», «Vendedor oficial» y las iniciales del encabezado público | `src/features/catalog/components/CatalogHeader.tsx` (D-163) |
| El mensaje de contacto que NO nombra ninguna boleta | `src/features/catalog/whatsapp.ts` (`catalogContactMessage`, D-163) |
| La etiqueta «Catálogo público» y el título de dos líneas del hero | `src/features/catalog/components/CatalogHero.tsx` (D-163) |
| Rótulos de las tres cifras públicas («números disponibles», «ya fueron tomados», «reservado») y el aviso de que quedan pocos | `src/features/catalog/components/CatalogSummary.tsx` (D-164) |
| El texto de ejemplo del buscador, entero en el hero y corto en el encabezado | `src/features/catalog/components/CatalogSearch.tsx` (D-165) |
| El nombre de la rifa que recoge el encabezado al bajar, y «Vendedor oficial» | `src/features/catalog/components/CatalogHeader.tsx` (D-164) |
| Los dos estados vacíos del catálogo público | `src/app/(catalogo)/catalogo/[slug]/page.tsx` (D-164) |
| Todos los textos de la invitación al grupo de WhatsApp: la sección de «Configuración», el campo del enlace, el interruptor, la vista previa y los dos diálogos de éxito | `src/features/whatsapp/invite.ts` (`WHATSAPP_COPY` e `INVITE_DIALOG_COPY`), **todos juntos** (D-176) |
| El mensaje predeterminado que reciben los clientes | `DEFAULT_INVITE_MESSAGE`, en ese mismo archivo — **nunca** en la base de datos, para no repetir I-030 ni acabar con un texto distinto por vendedor (BR-W02) |
| La frase que explica por qué hoy no se puede invitar | `INVITE_DIALOG_COPY.blocked`, una por **causa** —sin grupo, teléfono que no sirve— y no una por pantalla (D-176) |
| Nombres de las tres formas de recibir un pago, del tipo de cuenta bancaria y de los estados de un recordatorio | `src/lib/constants.ts` (`PAYMENT_ACCOUNT_KIND_LABELS`, `BANK_ACCOUNT_TYPE_LABELS`, `PAYMENT_REMINDER_STATUS_LABELS`, D-188) |
| Nombres de los días de la semana | `src/lib/constants.ts` (`WEEKDAY_LABELS`, D-188). **Una sola lista**: `notifications/text.ts` la usa en minúsculas en vez de tener la suya |
| Todos los textos de las cuentas para recibir pagos: título, campos, ayudas, botones, avisos del tope y cómo se escribe una cuenta en el mensaje | `src/features/payment-accounts/accounts.ts` (`ACCOUNT_COPY`), **todos juntos** (D-188) |
| Todos los textos de los recordatorios: título, campos, la línea de «se agregan al final», la vista previa, el aviso sin cuentas y los botones | `src/features/payment-reminders/reminders.ts` (`REMINDER_COPY`), **todos juntos** (D-188) |
| Los del flujo copiar → abrir → atender: «Para enviar ahora», «Era para el …», los tres botones, los dos fallos y el aviso sin grupo | `REMINDER_COPY.due`, en ese mismo archivo (D-189) |
| «N para enviar», la línea que el resumen añade cuando hay algo esperando | `REMINDER_COPY.summary.pending` (D-189) |
| El aviso de la campana cuando vence un recordatorio | `src/features/notifications/text.ts`, con los demás avisos (D-093, D-189). **El texto no vive en la base** (I-030) |
| A dónde lleva un aviso de la campana, cuando lleva a algún sitio | `notificationHref`, en ese mismo archivo — hoy **solo** el recordatorio de pago (D-189) |
| El mensaje predeterminado de un recordatorio | `DEFAULT_REMINDER_MESSAGE`, en ese mismo archivo — **nunca** en la base de datos, por lo mismo que `DEFAULT_INVITE_MESSAGE` (BR-S06, BR-W02) |
| Los títulos y las líneas de estado de las tres tarjetas del resumen de «Configuración» | `src/app/(protected)/seller/settings/page.tsx` (D-188) |

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
