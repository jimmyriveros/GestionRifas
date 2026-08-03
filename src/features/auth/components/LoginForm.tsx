'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { login } from '@/features/auth/actions'
import { loginSchema } from '@/features/auth/schemas'
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
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  function onSubmit(values: FormValues) {
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
              <FormLabel>Correo electronico</FormLabel>
              <FormControl>
                <Input
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
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Contrasena</FormLabel>
                <Link
                  href="/forgot-password"
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  Olvidaste tu contrasena?
                </Link>
              </div>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Ingresando...' : 'Ingresar'}
        </Button>
      </form>
    </Form>
  )
}
