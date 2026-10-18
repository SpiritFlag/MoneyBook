import Image from "next/image";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { categories, dayTime, formatMoney, formatMinor, ownMinor, type Expense } from "@/lib/expense";

export function TransactionList({ transactions, date }: { transactions: readonly Expense[]; date: string }) {
  if (!transactions.length) {
    return <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-5 rounded-full bg-secondary p-4 text-primary"><BookOpen size={27} /></div>
      <h3 className="font-semibold">기록된 내역이 없는 날이에요</h3>
      <p className="mt-2 text-sm text-muted-foreground">다른 날짜의 내역을 살펴보세요.</p>
    </div>;
  }
  return <ul className="space-y-1 py-3 sm:py-4">
    {transactions.map((transaction) => {
      const category = categories[transaction.category];
      const shared = transaction.shared;
      return <li key={transaction.id} className="px-2 sm:px-3">
        <Link href={`/transactions/${transaction.id}?from=${date}`} aria-label={`${transaction.title} 상세 보기`} className="transaction-link group flex items-center gap-3 rounded-2xl px-2 py-5 focus-visible:outline-offset-0 sm:gap-5 sm:px-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
          <Image src={category.image} alt="" width={80} height={80} className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-muted-foreground">{category.label}<span className="mx-2" aria-hidden="true">·</span>{transaction.useKind === "once" && transaction.useDate === date ? "이용 " : "결제 "}{dayTime(transaction, date) ?? "시각 미확인"}</p>
          <h3 className="text-sm font-semibold sm:text-base">{transaction.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{transaction.paymentMethod}</p>
          {transaction.useKind === "period" ? <p className="mt-1 text-xs text-primary">기간형 결제 · 월간 반영</p> : transaction.useDate !== date ? <p className="mt-1 text-xs text-primary">결제 기록 · 소비는 {transaction.useDate}</p> : null}
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-base font-semibold sm:text-lg">{formatMinor(ownMinor(transaction), transaction.currency)}</p>
          {shared ? <><p className="mt-1 text-xs font-medium text-primary">본인 소비</p><p className="mt-1 text-xs text-muted-foreground">결제 {formatMoney(transaction.paidAmount, transaction.currency)}</p></> : null}
        </div>
        <ChevronRight aria-hidden="true" size={16} className="hidden shrink-0 text-primary/35 transition-colors group-hover:text-primary sm:block" />
        </Link>
      </li>;
    })}
  </ul>;
}
