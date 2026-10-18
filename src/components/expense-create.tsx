"use client";
import { ExpenseForm } from "./expense-form";
import { LedgerState } from "./ledger-state";
import { useBook } from "@/lib/use-operations";
import { shiftDate } from "@/lib/date";
import Link from "next/link";
export function ExpenseCreate({ date, assetId, templateId }: { date: string; assetId?: string; templateId?: string }) {
  const { data: book, error, retry } = useBook();
  const data = book?.assets;
  if (!book || error) return <LedgerState error={error} retry={retry} />;
  const asset = data?.find((entry) => entry.id === assetId);
  if (assetId && !asset) return <div className="rounded-3xl bg-card p-10"><p>선택한 자산을 찾을 수 없어요.</p><Link href="/assets">자산 현황으로</Link></div>;
  const template = book.operations.find((o) => o.id === templateId && o.kind === "template")?.template;
  if (templateId && !template) return <p>저장한 거래를 찾을 수 없어요.</p>;
  const days = template?.useEnd ? Math.round((Date.parse(template.useEnd) - Date.parse(template.useDate)) / 86400000) : 0;
  const draft = template ? { ...template, paymentDate: date, useDate: date, useEnd: template.useEnd ? shiftDate(date, days) : null, time: null, useTime: null, topup: null, sortOrder: 0, orderReference: null } : undefined;
  return <ExpenseForm key={templateId ?? assetId ?? "new"} date={date} initialAsset={asset} initialDraft={draft} />;
}
