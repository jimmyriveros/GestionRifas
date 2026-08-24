'use client'

import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react'
import { useId, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Campo de busqueda compartido por todo el proyecto.
 *
 * Es solo la presentacion: el comportamiento —debounce, minimo de caracteres,
 * cancelacion— lo ponen `useUrlSearch` o `useRemoteSearch`. Separarlos permite
 * que el mismo campo sirva para una lista paginada en servidor y para un
 * dialogo, que no buscan igual.
 *
 * Detalles que parecen menores y sostienen la sensacion de fluidez:
 *
 * - El campo nunca se deshabilita mientras se busca. Deshabilitarlo le quita el
 *   foco a quien esta escribiendo y le come las teclas siguientes.
 * - El indicador de carga ocupa un hueco reservado dentro del campo, asi que
 *   aparecer y desaparecer no mueve nada de sitio.
 * - `aria-live="polite"` anuncia el resultado cuando termina, no en cada tecla.
 */

type SearchInputProps = {
  /** Nombre accesible. Se muestra salvo que `hideLabel` diga lo contrario. */
  label: string
  value: string
  onChange: (value: string) => void
  /** `Enter` y el boton de buscar. */
  onSubmit: () => void
  onClear: () => void
  placeholder?: string
  id?: string
  /** Pista bajo el campo: cuantos faltan, cuantos hay, que fallo. */
  hint?: string
  /** Muestra el indicador de carga. Lo decide el hook, no el componente. */
  loading?: boolean
  /** Un boton «Buscar» explicito junto al campo. */
  showSubmitButton?: boolean
  /** Oculta la etiqueta visualmente. Sigue existiendo para lectores de pantalla. */
  hideLabel?: boolean
  /**
   * Alto tactil en el telefono: 44 px para el campo y para el boton de buscar,
   * en vez de los 36 de siempre (D-108). En escritorio vuelve al alto normal,
   * asi que activarlo no cambia ninguna pantalla ancha.
   *
   * Lo pide la lista de boletas, que es la pantalla que un vendedor usa de pie,
   * con una mano y con el pulgar. En un dialogo, donde el campo se toca sentado
   * y con calma, no hace falta.
   */
  touchSize?: boolean
  className?: string
}

export function SearchInput({
  label,
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder,
  id,
  hint,
  loading = false,
  showSubmitButton = false,
  hideLabel = false,
  touchSize = false,
  className,
}: SearchInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      // El campo puede estar dentro de un formulario o de un dialogo: sin esto,
      // `Enter` enviaria el formulario o cerraria el dialogo.
      event.preventDefault()
      onSubmit()
      return
    }
    if (event.key === 'Escape' && value !== '') {
      // Solo limpia si hay algo que limpiar; con el campo vacio, `Escape` sigue
      // sirviendo para cerrar el dialogo que lo contenga.
      event.preventDefault()
      event.stopPropagation()
      onClear()
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={inputId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </Label>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={inputId}
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            inputMode="search"
            autoComplete="off"
            // El navegador ya dibuja su propia «x» en `type="search"`; se quita
            // para no tener dos botones de limpiar que hacen lo mismo.
            className={cn(
              'pr-10 [&::-webkit-search-cancel-button]:appearance-none',
              touchSize && 'h-11 md:h-9',
            )}
            aria-describedby={hint ? hintId : undefined}
            aria-busy={loading}
          />

          {/*
            Hueco fijo a la derecha del campo: dentro se turnan el indicador de
            carga y el boton de limpiar, y como el hueco no cambia de tamano, el
            texto escrito nunca se desplaza.
          */}
          <div className="absolute inset-y-0 right-0 flex w-10 items-center justify-center">
            {loading ? (
              <Loader2Icon
                className="text-muted-foreground size-4 animate-spin"
                aria-hidden
                data-testid="search-spinner"
              />
            ) : value !== '' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onClear}
                // Nombre propio y corto. Componerlo con la etiqueta del campo
                // producia frases que no son espanol («Limpiar buscar por
                // codigo o numero») y ademas hacia que el boton respondiera a
                // busquedas por el nombre del campo.
                aria-label="Limpiar búsqueda"
              >
                <XIcon className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>

        {showSubmitButton ? (
          <Button
            type="button"
            variant="secondary"
            className={touchSize ? 'h-11 md:h-9' : undefined}
            onClick={onSubmit}
          >
            <SearchIcon className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Buscar</span>
          </Button>
        ) : null}
      </div>

      {/*
        El hueco de la pista existe siempre (`min-h`), aunque este vacia: si
        apareciera y desapareciera, empujaria la lista arriba y abajo.
      */}
      <p id={hintId} aria-live="polite" className="text-muted-foreground min-h-4 text-xs">
        {hint}
      </p>
    </div>
  )
}
