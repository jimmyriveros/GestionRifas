'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { NavItem } from '@/components/layout/nav-items'
import { cn } from '@/lib/utils'

type NavLinksProps = {
  items: NavItem[]
  onNavigate?: () => void
}

export function NavLinks({ items, onNavigate }: NavLinksProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
