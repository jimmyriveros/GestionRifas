'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import Link from 'next/link'
import { useLayoutEffect, useRef, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { login } from '@/features/auth/actions'
import { AuthSubmitButton } from '@/features/auth/components/AuthSubmitButton'
import { loginSchema } from '@/features/auth/schemas'
import { useHydrated } from '@/components/form/HydratedSubmitButton'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const formSchema = loginSchema.omit({ next: true })
type FormValues = z.infer<typeof formSchema>

type LoginFormProps = {
  next?: string
  initialError?: string | null
}

export function LoginForm({ next, initialError }: LoginFormProps) {
  const [serverError, setServerError] = useState<string | null>(initialError ?? null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isPending, startTransition] = useTransition()
  const hydrated = useHydrated()
  const passwordRef = useRef<HTMLInputElement | null>(null)
  /** Dónde estaba el cursor al pulsar el ojo. */
  const caretRef = useRef<[number, number] | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  // Al cambiar el `type` con un clic, Chrome lleva el cursor al principio y lo siguiente que se
  // escribiera quedaría delante. Se devuelve a su sitio antes de pintar (D-255). Medir la caja
  // obliga a Chrome a rehacer el campo primero: sin eso, el cursor devuelto se pierde igual.
  useLayoutEffect(() => {
    const input = passwordRef.current
    const caret = caretRef.current
    caretRef.current = null
    if (!input || !caret) return
    input.getBoundingClientRect()
    input.setSelectionRange(caret[0], caret[1])
  }, [passwordVisible])

  function togglePasswordVisible() {
    const input = passwordRef.current
    // Solo con el foco en el campo, que el toque no le quita: fuera de él, mover la selección
    // puede darle el foco en algunos navegadores y abrir el teclado del teléfono.
    caretRef.current =
      input &&
      document.activeElement === input &&
      input.selectionStart !== null &&
      input.selectionEnd !== null
        ? [input.selectionStart, input.selectionEnd]
        : null
    setPasswordVisible((visible) => !visible)
  }

  function onSubmit(values: FormValues) {
    // Se envía siempre con el campo oculto: la contraseña no queda a la vista tras ingresar o
    // fallar, y el gestor de contraseñas la encuentra como contraseña (D-255).
    setPasswordVisible(false)
    setServerError(null)
    startTransition(async () => {
      const result = await login({ ...values, next })
      if (result && 'error' in result) {
        setServerError(result.error)
      }
    })
  }

  return (
    <Form {...form}>
      {/* `method="post"`: antes de hidratar, nada de lo escrito puede ir en la URL (I-204). */}
      <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {serverError}
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo electrónico</FormLabel>
              <FormControl>
                <Input
                  size="touch"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field: { ref, ...field } }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Contraseña</FormLabel>
                <Link
                  href="/forgot-password"
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              {/*
                El ojo (D-255). Es el MISMO `<input>` con otro `type`: nada se remonta, y el valor
                sigue viviendo solo en react-hook-form. El hueco de la derecha mide lo que el botón,
                que mide lo que el campo (`touch`), así que el texto nunca queda debajo.

                · `spellCheck`, `autoCorrect` y `autoCapitalize`: visible, el campo es de texto, y
                  el corrector del navegador o del teclado podría leerla, cambiarla o aprenderla.
                · `::-ms-reveal`: Edge pinta su propio ojo en los campos de contraseña; dos ojos
                  que hacen lo mismo sobran, como la «x» nativa que `SearchInput` ya quita.
                · `onMouseDown`: el toque no le quita el foco al campo, así que el teclado del
                  teléfono no se cierra y se sigue escribiendo donde estaba el cursor
                  (`togglePasswordVisible`). Con el teclado, el botón recibe el foco por
                  tabulación como cualquier otro.
              */}
              <div className="relative">
                <FormControl>
                  <Input
                    size="touch"
                    type={passwordVisible ? 'text' : 'password'}
                    autoComplete="current-password"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    className="pr-11 sm:pr-9 [&::-ms-reveal]:hidden"
                    disabled={isPending}
                    {...field}
                    ref={(element) => {
                      ref(element)
                      passwordRef.current = element
                    }}
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 hover:bg-transparent dark:hover:bg-transparent"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={togglePasswordVisible}
                  disabled={isPending || !hydrated}
                >
                  {passwordVisible ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
                  {/*
                    Texto `sr-only` y no `aria-label` (D-114): `getByLabel('Contraseña')` también
                    lee los `aria-label`, y encontraría el campo y este botón a la vez.
                  */}
                  <span className="sr-only">
                    {passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  </span>
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <AuthSubmitButton pending={isPending} pendingLabel="Ingresando..." className="w-full">
          Ingresar
        </AuthSubmitButton>
      </form>
    </Form>
  )
}
