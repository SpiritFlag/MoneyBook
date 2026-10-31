"use client";
import { ExpenseForm } from "./expense-form";
import { LedgerState } from "./ledger-state";
import { useBook } from "@/lib/use-operations";
import { newExpense } from "@/lib/expense";
import { shiftDate } from "@/lib/date";
import Link from "next/link";
import { recurringDraft } from "@/lib/recurring";
import type { ExpenseInput } from "@/lib/expense";
export function ExpenseCreate({ date, assetId, templateId, cardId, recurringId, recurringMonth }: { date: string; assetId?: string; templateId?: string; cardId?: string; recurringId?: string; recurringMonth?: string }) {
  const { data: book, error, retry } = useBook();
  const data = book?.assets;
  if (!book || error) return <LedgerState error={error} retry={retry} />;
  if (recurringId) {
    const source = book.expenses.find(entry => entry.id === recurringId);
    let recurring: ExpenseInput | undefined;
    try { if (source && recurringMonth) recurring = recurringDraft(source, recurringMonth); } catch { /* Show a recoverable missing-source state. */ }
    if (!recurring) return <div className="rounded-3xl bg-card p-8"><p>지난달 반복 거래를 불러올 수 없어요. 원래 거래의 반복 설정과 조회 월을 확인해 주세요.</p><Link href="/recurring" className="mt-4 inline-block text-primary">반복 거래 관리로</Link></div>;
    return <><div className="mb-5 rounded-2xl bg-secondary p-4 text-sm leading-6"><Link href={`/recurring?month=${recurringMonth}`} className="font-medium text-primary">반복 거래 관리</Link><p>{source!.paymentDate} 내역의 상품·할인·메모를 불러왔어요. 날짜는 한 달 옮겼고 시각은 미확인이에요. 금액·결제수단{recurring.topup ? "·연결 충전" : ""}을 확인한 뒤 저장해 주세요.{recurring.currency !== "KRW" ? " 원화 청구액은 이번 결제 기준으로 확인해 주세요." : ""}</p></div><ExpenseForm key={`${recurringId}:${recurringMonth}`} date={recurring.paymentDate} initialDraft={recurring} /></>;
  }
  const asset = data?.find((entry) => entry.id === assetId);
  if (assetId && !asset) return <div className="rounded-3xl bg-card p-10"><p>선택한 자산을 찾을 수 없어요.</p><Link href="/assets">자산 현황으로</Link></div>;
  const card = book.cards?.find(c => c.id === cardId);
  if (cardId && !card) return <p>등록한 신용카드를 찾을 수 없어요.</p>;
  const template = book.operations.find((o) => o.id === templateId && o.kind === "template")?.template;
  if (templateId && !template) return <p>저장한 거래를 찾을 수 없어요.</p>;
  const days = template?.useEnd ? Math.round((Date.parse(template.useEnd) - Date.parse(template.useDate)) / 86400000) : 0;
  const account = card?.kind === "debit" ? book.assets.find(a => a.id === card.assetId) : undefined;
  const draft = template ? { ...template, paymentDate: date, useDate: date, useDateFollowsPayment: true, useEnd: template.useEnd ? shiftDate(date, days) : null, time: null, useTime: null, topup: null, sortOrder: 0, orderReference: null } : card ? { ...newExpense(date), paymentMethod: card.name, ...(card.kind === "debit" ? { paymentKind: "debit" as const, debitCardId: card.id, assetId: card.assetId, currency: account?.currency ?? "KRW", receiptCurrency: account?.currency ?? "KRW" } : {}) } : undefined;
  return <ExpenseForm key={templateId ?? assetId ?? cardId ?? "new"} date={date} initialAsset={asset} initialDraft={draft} />;
}
