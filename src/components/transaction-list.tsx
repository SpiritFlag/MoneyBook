import Image from "next/image";
import { BookOpen } from "lucide-react";
import { categories, formatWon, type Transaction } from "@/lib/demo-transactions";

export function TransactionList({ transactions }: { transactions: readonly Transaction[] }) {
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
      const shared = transaction.personalAmount !== transaction.paidAmount;
      return <li key={transaction.id} className="flex items-center gap-3 px-4 py-5 sm:gap-5 sm:px-7">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
          <Image src={category.image} alt="" width={80} height={80} className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-muted-foreground">{category.label}<span className="mx-2" aria-hidden="true">·</span>{transaction.time ?? "시각 미확인"}</p>
          <h3 className="text-sm font-semibold sm:text-base">{transaction.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{transaction.paymentMethod}</p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-base font-semibold sm:text-lg">{formatWon(transaction.personalAmount)}</p>
          {shared ? <><p className="mt-1 text-xs font-medium text-primary">본인 소비</p><p className="mt-1 text-xs text-muted-foreground">결제 {formatWon(transaction.paidAmount)}</p></> : null}
        </div>
      </li>;
    })}
  </ul>;
}
