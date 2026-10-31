"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw } from "lucide-react";
import { useSWRConfig } from "swr";
import { changeTrash, useTrash, trashAffectedKeys } from "@/lib/use-trash";
import { trashExpiresAt } from "@/lib/trash";
import type { TrashEntry } from "@/lib/trash";
import { operationLabels } from "@/lib/operations";
import { useCurrencies } from "@/lib/use-currencies";
import { LedgerState } from "./ledger-state";
import { Button } from "./ui/button";

const dateTime = (date: Date) => date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
export function TrashBook() {
  const { data, error, mutate } = useTrash();
  const { mutate: refresh } = useSWRConfig();
  const { formatMoney } = useCurrencies();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  async function restore(entry: TrashEntry) {
    setBusy(entry.id); setFailure("");
    try {
      await changeTrash("POST", { id: entry.id });
      await Promise.allSettled(trashAffectedKeys.map(key => refresh(key)));
      await refresh(key => typeof key === "string" && key.startsWith("/api/loans/"));
      const expense = entry.expenses[0];
      router.push(expense ? `/transactions/${expense.id}` : `/records/${entry.operations[0].id}`);
    } catch (error) { setFailure(error instanceof Error ? error.message : "복원하지 못했어요."); }
    finally { setBusy(null); }
  }
  if (!data || error) return <LedgerState error={error} retry={() => { void mutate(); }} />;
  return <>
    <header className="mb-7"><p className="mb-2 text-xs font-semibold tracking-widest text-primary">다시 꺼낼 수 있는 기록</p><h1 className="flex items-center gap-3 text-3xl font-bold"><Trash2 />휴지통</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">삭제한 거래는 목록과 집계에서 빠져요. 삭제 시점부터 30일 동안 복원할 수 있고, 보관 기간이 끝나면 자동으로 완전히 삭제돼요.</p></header>
    {failure ? <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{failure}</p> : null}
    {!data.length ? <div className="book-sheet rounded-3xl bg-card p-10 text-center text-muted-foreground">휴지통이 비어 있어요.</div> : <ul className="space-y-4">{[...data].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).map(entry => {
      const expense = entry.expenses[0], operation = entry.operations[0];
      return <li key={entry.id} className="book-sheet flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-card p-6">
        <div className="min-w-0"><p className="text-xs text-muted-foreground">{expense ? "지출" : operationLabels[operation.kind]} · {expense?.paymentDate ?? operation.date}</p><h2 className="mt-2 break-words text-lg font-semibold">{expense?.title ?? operation.title}</h2>{expense ? <p className="mt-1 text-primary">{formatMoney(expense.paidAmount, expense.currency)}</p> : null}<p className="mt-3 text-xs leading-6 text-muted-foreground">삭제 {dateTime(new Date(entry.deletedAt))}<br />{dateTime(trashExpiresAt(entry))}부터 복원 불가 · 이후 자동 제거</p>{expense && entry.operations.length ? <p className="mt-1 text-xs text-muted-foreground">연결 충전 {entry.operations.length}건도 함께 복원해요.</p> : null}</div>
        <Button variant="secondary" disabled={busy !== null} onClick={() => restore(entry)}><RotateCcw size={16} />{busy === entry.id ? "복원 중…" : "복원하기"}</Button>
      </li>;
    })}</ul>}
  </>;
}
