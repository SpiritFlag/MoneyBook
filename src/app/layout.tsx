import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Leaf } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "일일 내역 · 머니북",
  description: "하루하루 차곡차곡, 내가 쓴 돈과 거래의 맥락을 기록하는 머니북.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">본문으로 건너뛰기</a>
    <div className="min-h-screen md:flex">
      <aside className="border-b bg-card md:fixed md:inset-y-0 md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-5 py-5 md:px-7 md:pt-9">
          <Image src="/moneybook-mascot.png" alt="" width={52} height={52} priority className="rounded-2xl" />
          <div><p className="text-xl font-bold tracking-tight">머니북</p><p className="mt-0.5 text-xs text-muted-foreground">나의 일상을 담은 장부</p></div>
        </div>
        <nav aria-label="주 메뉴" className="px-4 pb-4 md:mt-10 md:px-5">
          <p className="mb-3 hidden px-3 text-xs text-muted-foreground md:block">나의 기록</p>
          <Link href="/" aria-current="page" className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-primary"><BookOpen size={19} />일일 내역</Link>
        </nav>
        <div className="absolute bottom-8 hidden px-8 text-xs leading-6 text-muted-foreground md:block"><Leaf className="mb-3 text-primary" size={20} /><p>작은 기록이 모여<br />나의 생활이 보이도록.</p></div>
      </aside>
      <main id="main" className="min-w-0 flex-1 px-4 py-7 md:ml-60 md:px-10 md:py-12 lg:px-14"><div className="mx-auto max-w-5xl">{children}</div></main>
    </div>
  </body></html>;
}
