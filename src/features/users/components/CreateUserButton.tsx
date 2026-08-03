'use client'

import { PlusIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import type { ManageableRole } from '../schemas'
import { UserDialog } from './UserDialog'

export function CreateUserButton({ role, label }: { role: ManageableRole; label: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" aria-hidden />
        {label}
      </Button>
      <UserDialog open={open} onOpenChange={setOpen} role={role} />
    </>
  )
}
