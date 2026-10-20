"use client";
import { useCurrencies } from "@/lib/use-currencies";
import { Check, CircleHelp, TriangleAlert } from "lucide-react";
import { receiptSummary, type ExpenseInput } from "@/lib/expense";

export function ReceiptSummary({ expense, compact = false }: { expense: ExpenseInput; compact?: boolean }) {
  const { formatMinor } = useCurrencies();
  const result = receiptSummary(expense);
  const matched = result.status === "matched";
  if (compact && matched) return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-primary/20 pt-4 text-xs text-muted-foreground" aria-live="polite"><span className="inline-flex items-center gap-2"><Check size={14} className="text-primary" />명세 합계 · 총액과 일치해요</span><span className="tabular-nums">{formatMinor(result.sum, expense.receiptCurrency)}</span></div>;
  return <div className={`rounded-2xl px-4 py-4 text-sm ${matched ? "bg-secondary/60 text-primary" : result.status === "over" ? "bg-amber-50 text-amber-900" : "bg-[#f7f5ed] text-muted-foreground"}`} aria-live="polite">
    <div className="flex items-center justify-between gap-3"><span>확인한 명세 합계</span><strong className="tabular-nums">{formatMinor(result.sum, expense.receiptCurrency)}</strong></div>
    <p className="mt-3 flex items-center gap-2 font-medium">{matched ? <Check size={16} /> : result.status === "over" ? <TriangleAlert size={16} /> : <CircleHelp size={16} />}
      {result.status === "pending" ? "명세 대조 보류" : matched ? "총액과 일치해요" : result.status === "over" ? `검산 필요 · ${formatMinor(-(result.difference ?? 0), expense.receiptCurrency)} 초과` : `세부내역 미상 · ${formatMinor(result.difference ?? 0, expense.receiptCurrency)}`}
    </p>
    {result.status === "over" ? <p className="mt-2 text-xs leading-5">실제 결제 총액으로 저장해요. 명세는 나중에 수정할 수 있어요.</p> : result.status === "pending" ? <p className="mt-2 text-xs leading-5">{expense.currency === expense.receiptCurrency ? "실제 결제 총액을 입력하면 검산할 수 있어요." : "결제와 명세의 단위가 달라요. 명세 통화의 대조 총액을 입력하면 검산할 수 있어요."}</p> : null}
  </div>;
}
