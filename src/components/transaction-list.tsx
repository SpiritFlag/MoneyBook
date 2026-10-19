import { bookDate } from "@/lib/date";
import { dailyRecords } from "@/lib/daily-records";
import { type Asset } from "@/lib/asset";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { incomeCategories, netConsumption, cancelled, insuranceRecovered, expenseHref, type Operation } from "@/lib/operations";
import { categories, dayTime, formatMoney, formatMinor, ownMinor, type Expense } from "@/lib/expense";

export function TransactionList({ transactions, date, operations = [], assets = [] }: { transactions: readonly Expense[]; date: string; operations?: readonly Operation[]; assets?: readonly Asset[] }) {
  const rows = dailyRecords(transactions, operations, date);
  if (!rows.length) {
    return <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-5 rounded-full bg-secondary p-4 text-primary"><BookOpen size={27} /></div>
      <h3 className="font-semibold">기록된 내역이 없는 날이에요</h3>
      <p className="mt-2 text-sm text-muted-foreground">다른 날짜의 내역을 살펴보세요.</p>
    </div>;
  }
  return <ul className="space-y-1 py-3 sm:py-4">
    {rows.map((row) => {
      if (row.income) {
        const income = row.income;
        const category = incomeCategories[income.incomeCategory ?? "other"];
        return <li key={income.id} className="px-2 sm:px-3"><Link href={`/records/${income.id}?from=${date}`} aria-label={`${income.title} 상세 보기`} className="transaction-link group flex items-center gap-3 rounded-2xl px-2 py-5 focus-visible:outline-offset-0 sm:gap-5 sm:px-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20"><Image src={category.image} alt="" width={80} height={80} className="h-16 w-16 object-contain sm:h-20 sm:w-20" /></div><div className="min-w-0 flex-1"><p className="mb-1 text-xs text-muted-foreground">{category.label} · 입금 {income.date} {income.time ?? "시각 미확인"}</p><h3 className="text-sm font-semibold sm:text-base">{income.title}</h3><p className="mt-1 text-xs text-muted-foreground sm:text-sm">{assets.find(a => a.id === income.assetId)?.name ?? "입금 자산"}</p></div><p className="shrink-0 text-right text-base font-semibold text-primary tabular-nums sm:text-lg">+{formatMoney(income.amount, income.currency)}</p><ChevronRight aria-hidden="true" size={16} className="hidden shrink-0 text-primary/35 transition-colors group-hover:text-primary sm:block" /></Link></li>;
      }
      const transaction = row.expense;
      const category = categories[transaction.category];
      const shared = transaction.shared;
      const paymentOnly = transaction.useKind === "period" || bookDate(transaction.useDate, transaction.useTime) !== date;
      return <li key={transaction.id} className="px-2 sm:px-3">
        <Link href={`${expenseHref(transaction.id)}?from=${date}`} aria-label={`${transaction.title} 상세 보기`} className={`transaction-link ${paymentOnly ? "transaction-payment-only" : ""} group flex items-center gap-3 rounded-2xl px-2 py-5 focus-visible:outline-offset-0 sm:gap-5 sm:px-4`}>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
          <Image src={category.image} alt="" width={80} height={80} className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-muted-foreground">{category.label}<span className="mx-2" aria-hidden="true">·</span>{transaction.useKind === "once" && bookDate(transaction.useDate, transaction.useTime) === date ? "이용 " : "결제 "}{transaction.useKind === "once" && bookDate(transaction.useDate, transaction.useTime) === date ? transaction.useDate : transaction.paymentDate} {dayTime(transaction, date) ?? "시각 미확인"}</p>
          <h3 className="text-sm font-semibold sm:text-base">{transaction.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{transaction.paymentMethod}</p>{cancelled(transaction.id, operations) ? <p className="mt-1 text-xs text-amber-800">전액 취소 · 원거래 보존</p> : insuranceRecovered(transaction.id, operations) > 0 ? <p className="mt-1 text-xs text-primary">보험금 반영 후 본인 소비</p> : null}
          {paymentOnly ? <div className="mt-2 space-y-1 text-xs leading-5 text-[#70528b]"><p className="font-medium">{transaction.useKind === "period" ? "기간형 결제 · 이날 소비 제외" : "결제 기록 · 이날 소비 제외"}</p><p>이용 {transaction.useDate}{transaction.useKind === "period" ? ` → ${transaction.useEnd ?? "종료일 미확인"}` : transaction.useTime ? ` ${transaction.useTime}` : ""}</p>{transaction.useKind === "period" ? <p>{transaction.allocation === "annual" ? "시작월부터 12개월 배분" : "이용 시작월의 정기지출에 반영"}</p> : <p>{bookDate(transaction.useDate, transaction.useTime)} 하루 소비에 반영</p>}</div> : null}
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-base font-semibold sm:text-lg">{cancelled(transaction.id, operations) ? formatMinor(0, transaction.currency) : insuranceRecovered(transaction.id, operations) > 0 ? formatMinor(netConsumption(transaction, operations) ?? 0, "KRW") : formatMinor(ownMinor(transaction), transaction.currency)}</p>
          {shared ? <><p className="mt-1 text-xs font-medium text-primary">본인 소비</p><p className="mt-1 text-xs text-muted-foreground">결제 {formatMoney(transaction.paidAmount, transaction.currency)}</p></> : null}
        </div>
        <ChevronRight aria-hidden="true" size={16} className="hidden shrink-0 text-primary/35 transition-colors group-hover:text-primary sm:block" />
        </Link>
      </li>;
    })}
  </ul>;
}
