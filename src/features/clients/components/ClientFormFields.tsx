'use client'

import type { UseFormReturn } from 'react-hook-form'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import type { ClientFormInput } from '../schemas'

/**
 * Campos del cliente, compartidos por la pagina de alta/edicion y por el
 * dialogo de «crear cliente mientras asigno una boleta». Un solo sitio donde
 * cambiar etiquetas o el orden de los campos.
 */
export function ClientFormFields({
  form,
  disabled,
  compact = false,
}: {
  form: UseFormReturn<ClientFormInput>
  disabled?: boolean
  /** Oculta las notas: en el dialogo de asignacion sobran. */
  compact?: boolean
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre</FormLabel>
            <FormControl>
              <Input autoComplete="name" disabled={disabled} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="phone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Teléfono</FormLabel>
            <FormControl>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="3001234567"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="alias"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Alias (opcional)</FormLabel>
            <FormControl>
              <Input disabled={disabled} {...field} />
            </FormControl>
            <FormDescription>Como lo tienes anotado: apodo, negocio, barrio.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Correo (opcional)</FormLabel>
            <FormControl>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {compact ? null : (
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas (opcional)</FormLabel>
              <FormControl>
                <Textarea rows={3} disabled={disabled} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  )
}
