import type { Metadata } from "next";
import Image from "next/image";
import { BookNav, BookSectionNav, RecordAction } from "@/components/book-nav";
import Link from "next/link";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { AuthenticatedBook } from "@/components/authenticated-book";

export const metadata: Metadata = {
  title: "머니북",
  icons: { icon: { url: "/icon.png", type: "image/png" }, apple: "/moneybook-mascot.png" },
  description: "하루하루 차곡차곡, 내가 쓴 돈과 거래의 맥락을 기록하는 머니북.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><ClerkProvider appearance={{ variables: { colorPrimary: "#537761", borderRadius: "1rem" } }}><AuthenticatedBook>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">본문으로 건너뛰기</a>
    <div className="book-workspace">
      <aside className="book-sidebar">
        <Link href="/" className="book-brand">
          <Image src="/moneybook-mascot.png" alt="" width={52} height={52} priority className="rounded-2xl" />
          <div><p className="text-xl font-bold tracking-tight">머니북</p><p className="mt-0.5 text-xs text-muted-foreground">나의 일상을 담은 장부</p></div>
        </Link>
        <div className="book-record-entry"><RecordAction /></div>
        <BookNav />
        <p className="book-sidebar-footer">하루하루, 차곡차곡.</p>
      </aside>
      <main id="main" className="book-main"><div className="mx-auto max-w-5xl"><BookSectionNav />{children}</div></main>
    </div>
  </AuthenticatedBook></ClerkProvider></body></html>;
}
