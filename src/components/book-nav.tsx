"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { features } from "@/lib/features";
import { BookOpen, CalendarDays, Plus, Wallet, ArrowLeftRight, CreditCard, HandCoins, Bus, Bookmark, CircleArrowDown, Landmark, MessageCircle, Trash2 } from "lucide-react";
const links = [
  { href: "/", label: "일일 내역", icon: BookOpen }, { href: "/month", label: "월간 소비", icon: CalendarDays },
  ...(features.buddyReviews ? [{ href: "/buddy", label: "버디의 평가", icon: MessageCircle }] : []),
  { href: "/transactions/new", label: "지출 기록", icon: Plus }, { href: "/recurring", label: "반복 거래 관리", icon: CalendarDays }, { href: "/assets", label: "자산 현황", icon: Wallet },
  { href: "/loans", label: "대출 노트", icon: Landmark },
  { href: "/income", label: "수입·입금", icon: CircleArrowDown }, { href: "/transfers", label: "이동·충전", icon: ArrowLeftRight },
  { href: "/cards", label: "카드 관리", icon: CreditCard }, { href: "/settlements", label: "정산·보험", icon: HandCoins },
  { href: "/transport", label: "교통·하이패스", icon: Bus }, { href: "/templates", label: "자주 쓰는 거래", icon: Bookmark },
  { href: "/trash", label: "휴지통", icon: Trash2 },
];
export function BookNav() {
 const pathname = usePathname();
 const content = links.map(({ href, label, icon: Icon }) => {
  const active = pathname === href || (["/assets", "/loans"].includes(href) && pathname.startsWith(`${href}/`));
  return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={"flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-colors hover:bg-white/80 " + (active ? "bg-white/65 font-semibold text-primary shadow-sm" : "text-muted-foreground")}><Icon size={17} className="shrink-0" />{label}</Link>;
 });
 return <><nav aria-label="주 메뉴" className="hidden space-y-1 px-5 pb-5 md:mt-5 md:block">{content}</nav><details className="px-4 pb-4 md:hidden"><summary className="rounded-xl bg-white/60 px-4 py-3 text-sm font-medium text-primary">{links.find((l) => l.href === pathname || (l.href !== "/" && pathname.startsWith(`${l.href}/`)))?.label ?? "머니북"} · 전체 메뉴</summary><nav aria-label="모바일 주 메뉴" className="mt-2 grid grid-cols-2 gap-1">{content}</nav></details></>;
}
