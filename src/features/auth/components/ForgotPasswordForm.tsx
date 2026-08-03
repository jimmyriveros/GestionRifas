'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { requestPasswordReset } from '@/features/auth/actions'
import { forgotPasswordSchema } from '@/features/auth/schemas'
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

type FormValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      await requestPasswordReset(values)
      setSent(true)
    })
  }

  if (sent) {
    return (
      <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
        Si el correo esta registrado, te enviamos un enlace para restablecer tu contrasena.
      </p>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Enviando...' : 'Enviar enlace de recuperacion'}
        </Button>
      </form>
    </Form>
  )
}
