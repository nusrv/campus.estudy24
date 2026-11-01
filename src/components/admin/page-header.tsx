export function AdminPageHeader({ title, count, children }: { title: string; count?: string; children?: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-baseline gap-3"><h1 className="text-2xl font-medium">{title}</h1>{count && <span className="text-sm text-secondary-foreground">{count}</span>}</div>{children}</div>;
}
