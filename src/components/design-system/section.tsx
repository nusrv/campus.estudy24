import type { ReactNode } from "react";

export function Section({ id, number, title, english, description, children }: { id: string; number: string; title: string; english: string; description: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-28 border-t border-border pt-9"><div className="mb-6 flex items-start justify-between gap-5"><div><div className="flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-lg border border-border bg-white text-[11px] text-secondary-foreground">{number}</span><h2 className="text-xl font-medium">{title}</h2></div><p className="mt-2.5 text-sm leading-7 text-secondary-foreground">{description}</p></div><span lang="en" className="pt-1.5 text-[11px] tracking-wide text-[#98a2b3] max-sm:hidden">{english}</span></div>{children}</section>;
}
