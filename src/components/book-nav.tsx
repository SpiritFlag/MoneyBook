"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, Search, Wallet, Landmark, ListChecks, Repeat2, Trash2, MessageCircle, Plus, ChevronDown, ArrowLeftRight, CircleArrowDown, Bus } from "lucide-react";
import { bookSections, bookSectionFor, matchesBookPath } from "@/lib/book-navigation";
import { features } from "@/lib/features";

const icons = { daily: BookOpen, month: CalendarDays, search: Search, assets: Wallet, loans: Landmark, review: ListChecks, recurring: Repeat2 };

export function RecordAction() {
  const pathname = usePathname();
  return <div className="record-action">
    <Link href="/transactions/new"><Plus size={18} aria-hidden="true" />기록하기</Link>
    <details key={pathname} onKeyDown={event => {
      if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
    }}>
      <summary aria-label="다른 종류 기록하기"><ChevronDown size={17} aria-hidden="true" /></summary>
      <div className="record-options" onClick={event => {
        if ((event.target as HTMLElement).closest("a")) event.currentTarget.closest("details")?.removeAttribute("open");
      }}>
        <Link href="/transactions/new"><Plus size={16} aria-hidden="true" />지출 기록</Link>
        <Link href="/records/new?kind=income"><CircleArrowDown size={16} aria-hidden="true" />수입·입금 기록</Link>
        <Link href="/records/new?kind=transfer"><ArrowLeftRight size={16} aria-hidden="true" />이동·충전 기록</Link>
        <Link href="/records/new?kind=transit"><Bus size={16} aria-hidden="true" />교통 기록</Link>
        <Link href="/templates"><Repeat2 size={16} aria-hidden="true" />자주 쓰는 거래 불러오기</Link>
      </div>
    </details>
  </div>;
}

export function BookNav() {
  const pathname = usePathname();
  const current = bookSectionFor(pathname);
  const groups = ["나의 장부", "돈의 흐름", "기록 정리"];
  const content = <>
    {groups.map(group => <div key={group} className="book-nav-group">
      <p className="book-nav-label">{group}</p>
      {bookSections.filter(section => section.group === group).map(section => {
        const Icon = icons[section.id];
        return <Link key={section.id} href={section.href} aria-current={current?.id === section.id ? "page" : undefined} className="book-nav-link"><Icon size={18} aria-hidden="true" /><span>{section.label}</span></Link>;
      })}
    </div>)}
    <div className="book-nav-tools">
      {features.buddyReviews ? <Link className="book-nav-link" href="/buddy" aria-current={pathname === "/buddy" ? "page" : undefined}><MessageCircle size={17} aria-hidden="true" />버디의 평가</Link> : null}
      <Link className="book-nav-link" href="/trash" aria-current={pathname === "/trash" ? "page" : undefined}><Trash2 size={17} aria-hidden="true" />휴지통</Link>
    </div>
  </>;
  return <>
    <nav aria-label="주 메뉴" className="desktop-book-nav">{content}</nav>
    <details className="mobile-book-nav" key={pathname}>
      <summary>{current?.label ?? (pathname === "/trash" ? "휴지통" : "머니북")}<span>전체 메뉴 <ChevronDown size={14} aria-hidden="true" /></span></summary>
      <nav aria-label="모바일 주 메뉴">{content}</nav>
    </details>
  </>;
}

export function BookSectionNav() {
  const pathname = usePathname();
  const section = bookSectionFor(pathname);
  if (!section?.pages.length || !section.pages.some(page => page.href === pathname)) return null;
  return <nav className="book-section-nav" aria-label={`${section.label} 하위 메뉴`}>
    {section.pages.map(page => <Link key={page.href} href={page.href} aria-current={matchesBookPath(pathname, page.href) ? "page" : undefined}>{page.label}</Link>)}
  </nav>;
}
