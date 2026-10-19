"use client";
import { ExpenseForm } from "./expense-form";
import { LedgerState } from "./ledger-state";
import { useBook } from "@/lib/use-operations";
import { newExpense } from "@/lib/expense";
import { shiftDate } from "@/lib/date";
import Link from "next/link";
export function ExpenseCreate({ date, assetId, templateId, cardId }: { date: string; assetId?: string; templateId?: string; cardId?: string }) {
  const { data: book, error, retry } = useBook();
  const data = book?.assets;
  if (!book || error) return <LedgerState error={error} retry={retry} />;
  const asset = data?.find((entry) => entry.id === assetId);
  if (assetId && !asset) return <div className="rounded-3xl bg-card p-10"><p>선택한 자산을 찾을 수 없어요.</p><Link href="/assets">자산 현황으로</Link></div>;
  const card = book.cards?.find(c => c.id === cardId);
  if (cardId && !card) return <p>등록한 신용카드를 찾을 수 없어요.</p>;
  const template = book.operations.find((o) => o.id === templateId && o.kind === "template")?.template;
  if (templateId && !template) return <p>저장한 거래를 찾을 수 없어요.</p>;
  const days = template?.useEnd ? Math.round((Date.parse(template.useEnd) - Date.parse(template.useDate)) / 86400000) : 0;
  const draft = template ? { ...template, paymentDate: date, useDate: date, useDateFollowsPayment: true, useEnd: template.useEnd ? shiftDate(date, days) : null, time: null, useTime: null, topup: null, sortOrder: 0, orderReference: null } : card ? { ...newExpense(date), paymentMethod: card.name } : undefined;
  return <ExpenseForm key={templateId ?? assetId ?? cardId ?? "new"} date={date} initialAsset={asset} initialDraft={draft} />;
}
