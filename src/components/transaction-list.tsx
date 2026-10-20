"use client";
import { useCurrencies } from "@/lib/use-currencies";
import { dailyRecords } from "@/lib/daily-records";
import { type Asset } from "@/lib/asset";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { incomeCategories, netConsumption, cancelled, insuranceRecovered, expenseHref, type Operation } from "@/lib/operations";
import { dominantCategory, categories, dailyExpensePresentation, ownMinor, type Expense } from "@/lib/expense";

function stamp(date: string, time: string | null) {
  return `${date.replaceAll("-", ".")}${time ? ` ${time}` : ""}`;
}

export function TransactionList({ transactions, date, operations = [], assets = [] }: { transactions: readonly Expense[]; date: string; operations?: readonly Operation[]; assets?: readonly Asset[] }) {
  const { formatMoney, formatMinor } = useCurrencies();
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
      if (row.transfer) return null;
      if (row.income) {
        const income = row.income;
        const category = incomeCategories[income.incomeCategory ?? "other"];
        return <li key={income.id} className="px-2 sm:px-3"><Link href={`/records/${income.id}?from=${date}`} aria-label={`${income.title} 상세 보기`} className="transaction-link group flex items-center gap-3 rounded-2xl px-2 py-5 focus-visible:outline-offset-0 sm:gap-5 sm:px-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20"><Image src={category.image} alt="" width={80} height={80} className="h-16 w-16 object-contain sm:h-20 sm:w-20" /></div><div className="min-w-0 flex-1"><p className="mb-1 text-xs text-muted-foreground">{category.label} · 입금 {income.date} {income.time ?? "시각 미확인"}</p><h3 className="text-sm font-semibold sm:text-base">{income.title}</h3><p className="mt-1 text-xs text-muted-foreground sm:text-sm">{assets.find(a => a.id === income.assetId)?.name ?? "입금 자산"}</p></div><p className="shrink-0 text-right text-base font-semibold text-primary tabular-nums sm:text-lg">+{formatMoney(income.amount, income.currency)}</p><ChevronRight aria-hidden="true" size={16} className="hidden shrink-0 text-primary/35 transition-colors group-hover:text-primary sm:block" /></Link></li>;
      }
      const transaction = row.expense;
      const category = { ...categories[dominantCategory(transaction)], label: categories[transaction.category].label };
      const shared = transaction.shared;
      const won = netConsumption(transaction, operations);
      const display = dailyExpensePresentation(transaction, date);
      return <li key={transaction.id} className="px-2 sm:px-3">
        <Link href={`${expenseHref(transaction.id)}?from=${date}`} aria-label={`${transaction.title} 상세 보기`} className={`transaction-link transaction-${display.kind} group flex items-center gap-3 rounded-2xl px-2 py-5 focus-visible:outline-offset-0 sm:gap-5 sm:px-4`}>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
          <Image src={category.image} alt="" width={80} height={80} className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold sm:text-base">{transaction.title}</h3>
          <p className="mt-2 text-xs leading-6 text-muted-foreground"><span className="tabular-nums">{stamp(display.date, display.time)}</span><span className="mx-2" aria-hidden="true">·</span>{transaction.paymentMethod}<span className="mx-2" aria-hidden="true">·</span>{category.label}</p>
          {display.kind !== "normal" ? <p className="transaction-context mt-2 inline-block max-w-full rounded-lg px-3 py-2 text-xs leading-5">{display.kind === "recurring" ? `정기결제　이용 ${transaction.useDate.replaceAll("-", ".")} → ${transaction.useEnd?.replaceAll("-", ".") ?? "종료일 미확인"}` : display.kind === "usage-only" ? `결제 ${stamp(transaction.paymentDate, transaction.time)}` : `이용 ${stamp(transaction.useDate, transaction.useTime)}`}</p> : null}
          {cancelled(transaction.id, operations) ? <p className="mt-1 text-xs text-amber-800">전액 취소</p> : insuranceRecovered(transaction.id, operations) > 0 ? <p className="mt-1 text-xs text-primary">보험금 반영</p> : null}
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-base font-semibold sm:text-lg">{cancelled(transaction.id, operations) ? formatMinor(0, transaction.currency) : insuranceRecovered(transaction.id, operations) > 0 ? formatMinor(netConsumption(transaction, operations) ?? 0, "KRW") : formatMinor(ownMinor(transaction), transaction.currency)}</p>
          {transaction.currency !== "KRW" ? <p className="mt-1 text-sm text-primary">{won === null ? "원화 미확정" : `원화 ${formatMinor(won, "KRW")}`}</p> : null}
          {shared ? <><p className="mt-1 text-xs font-medium text-primary">본인 소비</p><p className="mt-1 text-xs text-muted-foreground">결제 {formatMoney(transaction.paidAmount, transaction.currency)}</p></> : null}
        </div>
        <ChevronRight aria-hidden="true" size={16} className="hidden shrink-0 text-primary/35 transition-colors group-hover:text-primary sm:block" />
        </Link>
      </li>;
    })}
  </ul>;
}
