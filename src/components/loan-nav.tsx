import Link from "next/link";

export function LoanNav({ active }: { active: "loans" | "repayments" }) {
  return <nav aria-label="대출 메뉴" className="mb-6 flex flex-wrap gap-2">
    {[{ href: "/loans", label: "대출 현황", id: "loans" }, { href: "/loans/repayments", label: "원리금 납입", id: "repayments" }].map(item => <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined} className={`rounded-xl px-5 py-3 text-sm font-medium transition-colors ${active === item.id ? "bg-primary text-primary-foreground" : "bg-card text-primary hover:bg-secondary"}`}>{item.label}</Link>)}
  </nav>;
}
