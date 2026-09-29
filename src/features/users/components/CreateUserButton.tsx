'use client'

import { PlusIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import type { ManageableRole } from '../schemas'
import { UserDialog, type CommissionOptions } from './UserDialog'

/**
 * Alta del personal. Con `commission` el formulario lleva «Cómo le vas a
 * pagar» (D-237): un vendedor nace con su acuerdo. Un administrador no vende y
 * no la lleva.
 */
export function CreateUserButton({
  role,
  label,
  commission,
}: {
  role: ManageableRole
  label: string
  commission?: CommissionOptions
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" aria-hidden />
        {label}
      </Button>
      <UserDialog open={open} onOpenChange={setOpen} role={role} commission={commission} />
    </>
  )
}
