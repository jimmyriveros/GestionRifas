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
| Identificador que genera el sistema | **Código interno** | ID, código de barras |
| Persona que compra | **Cliente** | Comprador, usuario, participante |
| Persona que vende | **Vendedor** | Colaborador, usuario, asesor |
| Persona dueña de la organización | **Dueño** | Owner, propietario, titular |
| Persona con permisos administrativos | **Administrador** | Admin, gestor, supervisor |
| Empresa que opera las rifas | **Organización** | Cuenta, tenant, empresa |
| Pago parcial de una boleta | **Abono** | Cuota, adelanto, parcialidad |
| Dinero que falta por cobrar | **Saldo pendiente** | Deuda, mora, pasivo |
| Conjunto de vendedores a cargo de otro vendedor | **Equipo** | Red, grupo, downline, sucursal |
| Vendedor que pertenece al equipo de otro | **Vendedor** (a secas), o **integrante** del equipo | Sub-vendedor, hijo, subordinado, mini admin |
| Incorporar un vendedor a tu equipo | **Agregar vendedor** | Crear sub-vendedor, reclutar, vincular |
| Entregar boletas a un vendedor o a un cliente | **Asignar** | Adjudicar, vincular, ligar |
| Quitar de circulación una boleta o un pago | **Anular** | Eliminar, borrar, cancelar |
| Borrar para siempre una boleta cargada por error, que nunca se vendió | **Eliminar** | Anular, cancelar, quitar |
| Marcar varias boletas para trabajar con todas a la vez | **Seleccionar** | Marcar, elegir, tildar |
| Quitar el acceso a una persona | **Desactivar** | Eliminar, borrar, dar de baja |
| Sacar un cliente del listado sin perder su historial | **Archivar** | Eliminar, ocultar, borrar |

**Cómo se nombra una boleta en pantalla:** por sus **dos números**, «1234 / 5678» (BR-N11). El
**código interno** es información administrativa: aparece solo dentro del detalle de la boleta y
nunca se ofrece como forma de buscar. Un texto que diga «busca por código» está mal.

**Anular no es eliminar, y los textos no pueden mezclarlos** (BR-B05, D-084). **Anular** retira de
circulación una boleta que existió: se queda en la lista, marcada como Anulada, y su combinación de
números no vuelve a estar libre. **Eliminar** borra una boleta que nunca debió existir —una
importación equivocada, números tecleados por error— y libera sus números. Solo se puede eliminar lo
que todavía no se vendió ni tiene abonos; en cuanto una boleta entra en la operación, la única salida
es anularla. Un texto que ofrezca «eliminar» donde lo correcto es anular está mal, y al revés
también.

**Roles en el habla del usuario:** dentro del código y de la documentación técnica se usan `owner`,
`admin` y `seller`. En pantalla son siempre **Dueño**, **Administrador** y **Vendedor**.

**Nadie es un «sub-vendedor» en pantalla.** Dentro del código existe `parent_seller_id` y la
documentación habla de jerarquía, pero para el usuario todos son **vendedores**: unos tienen equipo y
otros no (BR-E01). Cuando haga falta distinguirlo, se dice **«los vendedores de tu equipo»** o
**«integrantes»**, nunca «sub-vendedor», «hijo» ni «subordinado». En el portal del vendedor la
pantalla se llama **«Mi equipo»**, en la misma familia que «Mis boletas», «Mis clientes» y «Mis
pagos»; el verbo para incorporar a alguien es **agregar**, y el del portal administrativo para dar de
alta a un vendedor de la organización sigue siendo **invitar** o **nuevo vendedor**: son dos acciones
distintas hechas por personas distintas, y por eso conservan verbos distintos.

**Etiquetas de estado:** su redacción está fijada y **no se improvisa** — Borrador · Pendiente de
aprobación · Disponible · Asignada · Anulada · Sin pagar · Abonada · Pagada · Activa · Cerrada.
Fuente única: `src/lib/constants.ts` (`docs/ARCHITECTURE.md` §8.3). Cambiar una etiqueta significa
cambiar ese archivo, nunca escribirla suelta en una pantalla.

## Anexo B — Dónde vive cada texto

| Tipo de texto | Dónde se escribe |
|---|---|
| Etiquetas de estado, roles y métodos de pago | `src/lib/constants.ts` |
| Errores de validación de formularios | `schemas.ts` de cada módulo de `src/features/` (mensajes de Zod) |
| Errores devueltos por el servidor | `src/lib/errors.ts` (`mapPgError`) y los `RAISE` de las migraciones |
| Títulos y descripciones de pantalla | `PageHeader` de cada `page.tsx` |
| Estados vacíos | `EmptyState` (`src/components/data/`) |
| Pistas y avisos de los buscadores | `src/features/search/hints.ts`, **todos juntos** |
| Confirmaciones de acciones sensibles | `ConfirmDialog` (`src/components/feedback/`) |
| Mensajes de éxito | El `toast` de cada Server Action, en su componente cliente |
| Pasos del recorrido guiado (título y explicación) | `src/features/tour/tours.ts`, **todos juntos** |

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
