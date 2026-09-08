import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Los 14 roles tipograficos del sistema de diseno (Fase 12, Wave 2).
 *
 * ES LA MISMA LISTA que declara `src/app/globals.css` como `--text-<rol>` dentro
 * de su `@theme`, y no puede separarse de ella: hay una prueba
 * (`tests/unit/cn.test.ts`) que lee ese archivo y falla si aparece un rol nuevo
 * sin anadirlo aqui. No es una lista adivinada ni una copia decorativa.
 *
 * Se escribe a mano porque `cn` corre en cada render, tambien en el servidor:
 * leer y analizar la hoja de estilos en tiempo de ejecucion costaria mas que
 * todo lo que hace esta funcion.
 */
export const TYPOGRAPHY_ROLES = [
  'display-hero',
  'display-large',
  'heading-h1',
  'heading-h2',
  'heading-h3',
  'heading-h4',
  'body-large',
  'body-medium',
  'body-small',
  'label-medium',
  'label-small',
  'caption-regular',
  'metric-large',
  'metric-x-large',
] as const

/**
 * `tailwind-merge`, ensenado a distinguir un ROL TIPOGRAFICO de un COLOR (I-099).
 *
 * EL DEFECTO QUE ARREGLA. `tailwind-merge` resuelve `text-*` mirando su escala:
 * si el valor pertenece al tema `text` es un tamano de letra, y si no, lo da por
 * un color. Los roles de este proyecto —`text-heading-h3`, `text-metric-large`,
 * `text-label-small`…— son extensiones de tema declaradas en `globals.css`, no
 * utilidades de Tailwind, asi que caian del lado de los colores. Consecuencia:
 * un rol y un color en la misma lista se tomaban por lo mismo y **se descartaba
 * el primero, en silencio**. Sin error, sin aviso y sin fallo de tipos.
 *
 * NO ERA TEORICO. Medido en la aplicacion antes de arreglarlo: los `Button`
 * perdian `text-label-medium` y salian a 16 px/400 en vez de 14 px/500; los
 * `Badge` perdian `text-label-small`; y al reves —cuando el rol iba primero— se
 * perdia el COLOR: los mensajes de error de formulario se quedaban sin
 * `text-destructive` y **no salian en rojo**, y las descripciones de tarjetas,
 * dialogos y tablas se quedaban sin `text-muted-foreground`.
 *
 * LA CORRECCION, y por que es esta y no otra. Los roles se declaran como
 * `--text-<rol>` en `@theme`, o sea que **son** valores de la escala `text` de
 * Tailwind v4; decirselo a `tailwind-merge` con `theme.text` es describir lo que
 * ya son, no inventar una categoria. Ese es ademas el unico grupo que consume
 * ese tema —comprobado sobre `getDefaultConfig()`—, de modo que el cambio no
 * alcanza a nada mas. Con ello:
 *
 *   · un rol y un color CONVIVEN     -> `text-heading-h3 text-data-paid-foreground`
 *   · dos roles se resuelven         -> gana el ultimo, como dos tamanos
 *   · un rol y un tamano nativo      -> gana el ultimo, que antes no ocurria
 *   · el resto de Tailwind no cambia -> `p-2 p-4`, `text-sm text-lg`, `hidden block`
 *
 * LO QUE NO SE HIZO. No se tocan los tokens, ni los nombres de los roles, ni el
 * tema de Tailwind, ni la API de ningun componente: el defecto estaba en el
 * ayudante compartido y ahi se corrige. Tampoco se declara que un rol choque con
 * `font-weight` o `tracking`: obligaria a redefinir el grupo `font-size` entero
 * y `text-lg font-bold` dejaria de comportarse como se comporta hoy en todo el
 * producto. Lo que si hereda del grupo `font-size` es su choque con `leading-*`,
 * y es correcto —un rol fija su interlineado (`globals.css`)—: por eso un
 * `leading-*` **anterior** a un rol desaparece. Los dos sitios del producto que
 * combinan las dos cosas ponen el `leading` DESPUES, que es donde sobrevive.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: [...TYPOGRAPHY_ROLES] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
