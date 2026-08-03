'use client'

import { MenuIcon } from 'lucide-react'
import { useState } from 'react'

import { NavLinks } from '@/components/layout/NavLinks'
import type { NavItem } from '@/components/layout/nav-items'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

type MobileNavProps = {
  orgName: string
  items: NavItem[]
}

export function MobileNav({ orgName, items }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <MenuIcon />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate">{orgName}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
