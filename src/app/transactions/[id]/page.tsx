import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { categories, formatWon, getTransaction } from "@/lib/demo-transactions";
import { displayDate } from "@/lib/date";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const transaction = getTransaction((await params).id);
  return { title: `${transaction?.title ?? "거래를 찾을 수 없어요"} · 머니북` };
}

export default async function TransactionPage({ params }: Props) {
  // [id] 폴더가 /transactions/demo-1의 demo-1을 전달합니다.
  const transaction = getTransaction((await params).id);
  if (!transaction) notFound();

  const category = categories[transaction.category];
  const shared = transaction.paidAmount !== transaction.personalAmount;

  return <>
    <header className="mb-6 flex items-center justify-between gap-3">
      <Link href={`/?date=${transaction.date}`} className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/70 hover:text-primary"><ArrowLeft size={16} />일일 내역으로</Link>
      <span className="shrink-0 rounded-full bg-[#eee6d5] px-3 py-1.5 text-xs text-[#776442]">가상 데이터</span>
    </header>
    <article aria-labelledby="transaction-title" className="book-sheet overflow-hidden rounded-3xl bg-card">
      <header className="daily-summary relative flex items-center gap-4 px-5 py-7 sm:gap-6 sm:px-8 sm:py-8">
        <span aria-hidden="true" className="absolute top-0 left-8 h-1 w-10 rounded-b-full bg-primary/45" />
        <Image src={category.image} alt="" width={100} height={100} priority className="h-20 w-20 shrink-0 object-contain sm:h-25 sm:w-25" />
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-primary">{category.label} · 거래 상세</p>
          <h1 id="transaction-title" className="text-xl font-bold tracking-tight sm:text-3xl">{transaction.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{transaction.date.slice(0, 4)}년 {displayDate(transaction.date)}</p>
        </div>
      </header>
      <div className="px-5 py-7 sm:px-8 sm:py-8">
        <dl className="grid gap-7 sm:grid-cols-2">
          <div><dt className="mb-2 text-sm text-muted-foreground">전체 결제</dt><dd className="text-3xl font-semibold tracking-tight tabular-nums">{formatWon(transaction.paidAmount)}</dd></div>
          <div><dt className="mb-2 text-sm text-primary">내 소비</dt><dd className="text-3xl font-bold tracking-tight text-primary tabular-nums">{formatWon(transaction.personalAmount)}</dd></div>
        </dl>
        <p className="mt-6 rounded-xl bg-[#f7f5ed] px-4 py-3 text-sm leading-6 text-muted-foreground">{shared ? "함께 결제한 거래예요. 일일 소비에는 내 부담액만 반영돼요." : "전체 결제액이 내 소비에 반영된 거래예요."}</p>
        <dl className="mt-7 grid gap-5 sm:grid-cols-2">
          <div><dt className="mb-1 text-xs text-muted-foreground">결제수단</dt><dd className="text-sm font-medium">{transaction.paymentMethod}</dd></div>
          <div><dt className="mb-1 text-xs text-muted-foreground">기록된 시각</dt><dd className="text-sm font-medium">{transaction.time ?? "시각 미확인"}</dd></div>
        </dl>
      </div>
    </article>
    <p className="mt-5 px-1 text-xs leading-6 text-muted-foreground">가상 내역을 확인하는 화면이에요. 실제 장부에 저장되지 않아요.</p>
  </>;
}
