"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, Plus, Wallet } from "lucide-react";
export function BookNav() {
  const pathname = usePathname();
  return <nav aria-label="주 메뉴" className="grid grid-cols-2 gap-2 px-4 pb-4 md:mt-10 md:block md:space-y-2 md:px-5">{[{ href: "/", label: "일일 내역", icon: BookOpen }, { href: "/month", label: "월간 소비", icon: CalendarDays }, { href: "/assets", label: "자산 현황", icon: Wallet }, { href: "/transactions/new", label: "지출 기록", icon: Plus }].map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={(pathname === href || (href === "/assets" && pathname.startsWith("/assets/"))) ? "page" : undefined} className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-3 text-xs sm:text-sm md:justify-start transition-colors hover:bg-white/80 md:gap-3 md:px-4 ${(pathname === href || (href === "/assets" && pathname.startsWith("/assets/"))) ? "bg-white/65 font-semibold text-primary shadow-sm" : "text-muted-foreground"}`}><Icon size={18} className="shrink-0" />{label}</Link>)}</nav>;
}
