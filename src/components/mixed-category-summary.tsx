"use client";
import Image from "next/image";
import { categories, receiptCategoryAmounts, dominantCategory, type ExpenseInput } from "@/lib/expense";
import { useCurrencies } from "@/lib/use-currencies";

export function MixedCategorySummary({ expense }: { expense: ExpenseInput }) {
  const { formatMinor } = useCurrencies();
  if (expense.category !== "mixed" || !expense.items.length) return null;
  const icon = categories[dominantCategory(expense)];
  const amounts = receiptCategoryAmounts(expense);
  return <section aria-label="혼합 카테고리 소계" className="rounded-2xl bg-secondary/40 p-4">
    <div className="flex items-center gap-3"><Image src={icon.image} width={56} height={56} alt="" /><div><h3 className="text-sm font-semibold">카테고리별 명세 금액</h3><p className="mt-1 text-xs text-muted-foreground">대표 아이콘 · {icon.label} · 상품 할인 후 소계 기준</p></div></div>
    <dl className="mt-3 space-y-2 text-sm">{amounts.map(row => <div key={row.category} className="flex justify-between gap-3"><dt>{categories[row.category].label}{row.category === "loan" ? " · 소비 제외" : ""}</dt><dd className="font-medium tabular-nums">{formatMinor(row.amount ?? 0, expense.receiptCurrency)}</dd></div>)}</dl>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">전체 할인·가산은 상품 소계 비율로 배분해요. 소비 통계에는 본인 부담액과 확정 원화액을 같은 비율로 반영하되, 대출 원금은 제외해요.</p>
  </section>;
}
