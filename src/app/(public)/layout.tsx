export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
