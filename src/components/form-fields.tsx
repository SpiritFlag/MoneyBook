import type { ReactNode } from "react";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={`grid min-w-0 content-start gap-2 text-sm ${className}`}><span className="font-medium">{label}</span>{children}{hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}</label>;
}
export function FormSection({ number, title, description, children }: { number: string; title: string; description?: string; children: ReactNode }) {
  return <section className="book-sheet rounded-3xl bg-card p-5 sm:p-7">
    <div className="mb-5 flex items-center gap-3"><span className="text-xs font-semibold tracking-widest text-primary/55">{number}</span><h2 className="text-lg font-semibold">{title}</h2></div>
    {description ? <p className="-mt-2 mb-5 text-sm leading-6 text-muted-foreground">{description}</p> : null}
    {children}
  </section>;
}
